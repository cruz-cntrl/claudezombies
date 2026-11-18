import * as THREE from 'three';
import { K, type Grid } from '../world/grid';
import { LIGHTING } from '../config/lighting';

export interface BakeLight {
  x: number; y: number; z: number;
  r: number; g: number; b: number; // colour * intensity (linear)
  radius: number;
  /** ignore grid occlusion (e.g. sky light) */
  noShadow?: boolean;
}

/**
 * Load-time lighting bake. Computes per-vertex irradiance (lambert-ish lights with grid
 * occlusion + ambient * AO) for static geometry, and a per-cell light-probe grid that
 * dynamic objects (zombies, viewmodel) sample each frame.
 */
export class LightBaker {
  private buckets = new Map<number, number[]>();
  private readonly B = 4; // bucket size in cells
  probes: Float32Array;

  constructor(
    private grid: Grid,
    private lights: BakeLight[],
    private ambientAt: (x: number, z: number, out: THREE.Color) => void,
    private ceilingAt: (x: number, z: number) => number, // Infinity for open sky
  ) {
    lights.forEach((l, idx) => {
      const r = Math.ceil(l.radius / this.B);
      const bx = Math.floor(l.x / this.B), bz = Math.floor(l.z / this.B);
      for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
        const key = (bz + dz) * 1000 + (bx + dx);
        let arr = this.buckets.get(key);
        if (!arr) { arr = []; this.buckets.set(key, arr); }
        arr.push(idx);
      }
    });
    this.probes = new Float32Array(grid.w * grid.h * 3);
  }

  private occluder = (i: number, j: number) => {
    const k = this.grid.kindAt(i, j);
    return k === K.WALL || k === K.VOID || k === K.DOOR;
  };

  /** Does this point sit in solid space (for AO)? */
  private solidAt(x: number, y: number, z: number): boolean {
    if (y < 0) return true;
    const i = Math.floor(x), j = Math.floor(z);
    const k = this.grid.kindAt(i, j);
    if (k === K.WALL || k === K.VOID) {
      // window openings are open in the middle band
      return true;
    }
    if (k === K.WINDOW) return y < 0.95 || y > 2.15;
    if (k === K.DOOR) return true;
    if ((k === K.PROP || k === K.MACHINE) && y < 0.6) return true;
    if (y > this.ceilingAt(x, z)) return true;
    return false;
  }

  private static DIRS: number[][] = (() => {
    const d: number[][] = [];
    for (let x = -1; x <= 1; x++) for (let y = -1; y <= 1; y++) for (let z = -1; z <= 1; z++) {
      if (!x && !y && !z) continue;
      const l = Math.hypot(x, y, z);
      d.push([x / l, y / l, z / l]);
    }
    return d;
  })();

  private _c = new THREE.Color();

  /** Irradiance at a point with normal (nx,ny,nz). Writes into out[0..2]. */
  irradiance(px: number, py: number, pz: number, nx: number, ny: number, nz: number, out: Float32Array | number[], o: number, withAO = true) {
    // AO
    let ao = 1;
    if (withAO) {
      let occ = 0, tot = 0;
      for (const d of LightBaker.DIRS) {
        const dn = d[0] * nx + d[1] * ny + d[2] * nz;
        if (dn < 0.3) continue;
        tot += 2 * dn;
        if (this.solidAt(px + nx * 0.03 + d[0] * 0.3, py + ny * 0.03 + d[1] * 0.3, pz + nz * 0.03 + d[2] * 0.3)) occ += dn;
        if (this.solidAt(px + nx * 0.03 + d[0] * 0.8, py + ny * 0.03 + d[1] * 0.8, pz + nz * 0.03 + d[2] * 0.8)) occ += dn * 0.7;
      }
      ao = 1 - 0.75 * (tot > 0 ? Math.min(1, occ / tot) : 0);
    }
    const sx = px + nx * 0.12, sz = pz + nz * 0.12;
    this.ambientAt(sx, sz, this._c);
    let r = this._c.r * ao, g = this._c.g * ao, b = this._c.b * ao;
    const key = Math.floor(sz / this.B) * 1000 + Math.floor(sx / this.B);
    const list = this.buckets.get(key);
    if (list) {
      for (const li of list) {
        const L = this.lights[li];
        let lx = L.x - px, ly = L.y - py, lz = L.z - pz;
        const d2 = lx * lx + ly * ly + lz * lz;
        if (d2 > L.radius * L.radius) continue;
        const d = Math.sqrt(d2) || 1e-3;
        lx /= d; ly /= d; lz /= d;
        let ndl = nx * lx + ny * ly + nz * lz;
        ndl = (ndl + 0.2) / 1.2;
        if (ndl <= 0) continue;
        if (!L.noShadow) {
          const hd = Math.hypot(L.x - sx, L.z - sz);
          if (hd > 0.05 && this.grid.raycast(sx, sz, L.x - sx, L.z - sz, hd, undefined, this.occluder) < hd - 0.05) continue;
        }
        const f = 1 - d2 / (L.radius * L.radius);
        const att = (f * f) / (1 + d2 * 0.25);
        const k = ndl * att * (0.55 + 0.45 * ao);
        r += L.r * k; g += L.g * k; b += L.b * k;
      }
    }
    out[o] = r; out[o + 1] = g; out[o + 2] = b;
  }

  bakeGeometry(geo: THREE.BufferGeometry, emissiveBoost = 0) {
    const pos = geo.attributes.position.array as Float32Array;
    const nor = geo.attributes.normal.array as Float32Array;
    const n = geo.attributes.position.count;
    const bake = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      this.irradiance(pos[i * 3], pos[i * 3 + 1], pos[i * 3 + 2], nor[i * 3], nor[i * 3 + 1], nor[i * 3 + 2], bake, i * 3);
      if (emissiveBoost) { bake[i * 3] += emissiveBoost; bake[i * 3 + 1] += emissiveBoost; bake[i * 3 + 2] += emissiveBoost; }
    }
    geo.setAttribute('bake', new THREE.BufferAttribute(bake, 3));
  }

  /** Per-cell probe at chest height (average of 4 horizontal normals + up). */
  buildProbes() {
    const g = this.grid;
    const tmp = [0, 0, 0];
    const normals = [[1, 0, 0], [-1, 0, 0], [0, 0, 1], [0, 0, -1], [0, 1, 0]];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const o = (j * g.w + i) * 3;
      let r = 0, gg = 0, b = 0;
      for (const nn of normals) {
        this.irradiance(i + 0.5, 1.2, j + 0.5, nn[0], nn[1], nn[2], tmp, 0, false);
        r += tmp[0]; gg += tmp[1]; b += tmp[2];
      }
      this.probes[o] = r / 5; this.probes[o + 1] = gg / 5; this.probes[o + 2] = b / 5;
    }
  }

  /** Bilinear probe sample. */
  sample(x: number, z: number, out: { r: number; g: number; b: number }) {
    this.sampleRaw(x, z, out);
    out.r *= LIGHTING.probeScale; out.g *= LIGHTING.probeScale; out.b *= LIGHTING.probeScale;
  }

  private sampleRaw(x: number, z: number, out: { r: number; g: number; b: number }) {
    const g = this.grid;
    const fx = x - 0.5, fz = z - 0.5;
    const i0 = Math.max(0, Math.min(g.w - 1, Math.floor(fx))), j0 = Math.max(0, Math.min(g.h - 1, Math.floor(fz)));
    const i1 = Math.min(g.w - 1, i0 + 1), j1 = Math.min(g.h - 1, j0 + 1);
    const tx = Math.max(0, Math.min(1, fx - i0)), tz = Math.max(0, Math.min(1, fz - j0));
    const p = this.probes;
    const a = (j0 * g.w + i0) * 3, b = (j0 * g.w + i1) * 3, c = (j1 * g.w + i0) * 3, d = (j1 * g.w + i1) * 3;
    out.r = (p[a] * (1 - tx) + p[b] * tx) * (1 - tz) + (p[c] * (1 - tx) + p[d] * tx) * tz;
    out.g = (p[a + 1] * (1 - tx) + p[b + 1] * tx) * (1 - tz) + (p[c + 1] * (1 - tx) + p[d + 1] * tx) * tz;
    out.b = (p[a + 2] * (1 - tx) + p[b + 2] * tx) * (1 - tz) + (p[c + 2] * (1 - tx) + p[d + 2] * tx) * tz;
  }
}
