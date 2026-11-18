import * as THREE from 'three';
import { RoundedBoxGeometry } from 'three/examples/jsm/geometries/RoundedBoxGeometry.js';
import { mergeGeometries } from 'three/examples/jsm/utils/BufferGeometryUtils.js';

/**
 * Geometry batching: props and architecture are composed from primitives, transformed,
 * tinted (vertex colour), box-UV projected in world space (consistent texel density), and
 * finally merged per material key to keep draw calls low.
 */
const _m = new THREE.Matrix4();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _p = new THREE.Vector3();
const _s = new THREE.Vector3();

export function M(x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx): THREE.Matrix4 {
  _e.set(rx, ry, rz, 'YXZ');
  _q.setFromEuler(_e);
  _p.set(x, y, z);
  _s.set(sx, sy, sz);
  return new THREE.Matrix4().compose(_p, _q, _s);
}

export const box = (w: number, h: number, d: number) => new THREE.BoxGeometry(w, h, d);
export const rbox = (w: number, h: number, d: number, r = 0.03, seg = 2) =>
  new RoundedBoxGeometry(w, h, d, seg, Math.min(r, w / 2 - 1e-3, h / 2 - 1e-3, d / 2 - 1e-3));
export const cyl = (rt: number, rb: number, h: number, seg = 10, open = false) =>
  new THREE.CylinderGeometry(rt, rb, h, seg, 1, open);
export const sphere = (r: number, ws = 10, hs = 8) => new THREE.SphereGeometry(r, ws, hs);
export const torus = (r: number, t: number, rs = 6, ts = 12, arc = Math.PI * 2) => new THREE.TorusGeometry(r, t, rs, ts, arc);
export const tube = (pts: THREE.Vector3[], r: number, seg = 16, rs = 6) =>
  new THREE.TubeGeometry(new THREE.CatmullRomCurve3(pts), seg, r, rs, false);
export const lathe = (pts: [number, number][], seg = 12) =>
  new THREE.LatheGeometry(pts.map(([x, y]) => new THREE.Vector2(x, y)), seg);
export const cone = (r: number, h: number, seg = 8) => new THREE.ConeGeometry(r, h, seg);

/** Ensure a geometry has index, normal, uv and a colour attribute (needed to merge). */
export function normalizeGeo(g: THREE.BufferGeometry): THREE.BufferGeometry {
  if (!g.index) {
    const n = g.attributes.position.count;
    const idx = new (n > 65535 ? Uint32Array : Uint16Array)(n);
    for (let i = 0; i < n; i++) idx[i] = i;
    g.setIndex(new THREE.BufferAttribute(idx, 1));
  }
  if (!g.attributes.normal) g.computeVertexNormals();
  if (!g.attributes.uv) g.setAttribute('uv', new THREE.BufferAttribute(new Float32Array(g.attributes.position.count * 2), 2));
  for (const k of Object.keys(g.attributes)) {
    if (k !== 'position' && k !== 'normal' && k !== 'uv' && k !== 'color') g.deleteAttribute(k);
  }
  g.morphAttributes = {};
  return g;
}

export class GeoBatch {
  readonly groups = new Map<string, THREE.BufferGeometry[]>();
  /** uv projection scale (metres per texture repeat) per material key */
  uvScale: Record<string, number> = {};

  /**
   * Add a geometry. `uv`: 'box' re-projects UVs from world position (default),
   * 'keep' keeps the primitive's own UVs (scaled by uvMul).
   */
  add(key: string, geo: THREE.BufferGeometry, matrix?: THREE.Matrix4, tint: number | THREE.Color = 0xffffff,
    uv: 'box' | 'keep' = 'box', uvMul = 1) {
    const g = normalizeGeo(geo.index ? geo : geo);
    if (matrix) g.applyMatrix4(matrix);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = tint instanceof THREE.Color ? tint : new THREE.Color(tint);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    if (uv === 'box') {
      const s = 1 / (this.uvScale[key] ?? 2);
      const pos = g.attributes.position.array as Float32Array;
      const nor = g.attributes.normal.array as Float32Array;
      const uva = g.attributes.uv.array as Float32Array;
      for (let i = 0; i < n; i++) {
        const x = pos[i * 3], y = pos[i * 3 + 1], z = pos[i * 3 + 2];
        const ax = Math.abs(nor[i * 3]), ay = Math.abs(nor[i * 3 + 1]), az = Math.abs(nor[i * 3 + 2]);
        if (ay >= ax && ay >= az) { uva[i * 2] = x * s; uva[i * 2 + 1] = z * s; }
        else if (ax >= az) { uva[i * 2] = z * s; uva[i * 2 + 1] = y * s; }
        else { uva[i * 2] = x * s; uva[i * 2 + 1] = y * s; }
      }
    } else if (uvMul !== 1) {
      const uva = g.attributes.uv.array as Float32Array;
      for (let i = 0; i < uva.length; i++) uva[i] *= uvMul;
    }
    let list = this.groups.get(key);
    if (!list) { list = []; this.groups.set(key, list); }
    list.push(g);
  }

  /** Merge each group into one geometry. */
  finalize(): Map<string, THREE.BufferGeometry> {
    const out = new Map<string, THREE.BufferGeometry>();
    for (const [k, list] of this.groups) {
      if (!list.length) continue;
      // merge in chunks to keep index type sane
      const merged = mergeGeometries(list, false);
      if (merged) {
        merged.computeBoundingSphere();
        merged.computeBoundingBox();
        out.set(k, merged);
      }
      for (const g of list) g.dispose();
    }
    this.groups.clear();
    return out;
  }
}

/** Build a standalone merged geometry from (geometry, matrix, tint) parts — used for dynamic models. */
export function compose(parts: [THREE.BufferGeometry, THREE.Matrix4 | null, number?][]): THREE.BufferGeometry {
  const list: THREE.BufferGeometry[] = [];
  for (const [g0, m, tint] of parts) {
    const g = normalizeGeo(g0);
    if (m) g.applyMatrix4(m);
    const n = g.attributes.position.count;
    const col = new Float32Array(n * 3);
    const c = new THREE.Color(tint ?? 0xffffff);
    for (let i = 0; i < n; i++) { col[i * 3] = c.r; col[i * 3 + 1] = c.g; col[i * 3 + 2] = c.b; }
    g.setAttribute('color', new THREE.BufferAttribute(col, 3));
    list.push(g);
  }
  const merged = mergeGeometries(list, false)!;
  for (const g of list) g.dispose();
  merged.computeBoundingSphere();
  return merged;
}

export { _m as tmpMatrix };
