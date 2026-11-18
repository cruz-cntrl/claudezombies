import * as THREE from 'three';
import { compose, rbox, box, cyl, sphere, M, tube, lathe } from '../render/geometryKit';
import { MatLib } from '../render/matLib';
import { getSurface } from '../render/proceduralTextures';

/**
 * Instanced articulated rigs. Each body part is one InstancedMesh shared by every creature
 * of that rig type; per-creature bone matrices are written each frame. Per-instance colour
 * (instanceColor) gives skin/clothing variety and per-instance `instBake` gives local light.
 */
export type HumanPart =
  | 'pelvis' | 'torso' | 'head' | 'uArmL' | 'uArmR' | 'lArmL' | 'lArmR' | 'uLegL' | 'uLegR' | 'lLegL' | 'lLegR' | 'chip' | 'glow' | 'cage'
  | 'helmet' | 'coat' | 'cap' | 'apron' | 'bandage' | 'straps';
/** Parts packed into their own instance slots (only creatures that wear them pay for them). */
export const PACKED_PARTS = ['cage', 'helmet', 'coat', 'cap', 'apron', 'bandage', 'straps'] as const;
export type HoundPart = 'hBody' | 'hHead' | 'hLegFL' | 'hLegFR' | 'hLegBL' | 'hLegBR' | 'hLowFL' | 'hLowFR' | 'hLowBL' | 'hLowBR' | 'hTail' | 'chip' | 'glow';

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const SKIN = 0xffffff;

function humanGeometry(part: HumanPart): THREE.BufferGeometry {
  // lathe profile helper: [radius, y] pairs, flattened front-to-back
  const body = (pts: [number, number][], seg: number, flat: number) => {
    const g = lathe(pts, seg);
    g.scale(1, 1, flat);
    return g;
  };
  /** Ragged skirt: open cylinder whose bottom edge is torn to random lengths. */
  const rag = (rTop: number, rBot: number, len: number, seg: number, seed: number) => {
    const g = new THREE.CylinderGeometry(rTop, rBot, len, seg, 2, true);
    const pos = g.attributes.position;
    for (let i = 0; i < pos.count; i++) {
      if (pos.getY(i) < -len / 2 + 1e-3) pos.setY(i, pos.getY(i) + (Math.sin(i * 12.9898 + seed) * 0.5 + 0.5) * len * 0.55);
    }
    g.translate(0, -len / 2, 0);
    g.computeVertexNormals();
    return g;
  };
  const capsule = (r: number, len: number) => { const g = new THREE.CapsuleGeometry(r, len, 2, 6); g.translate(0, -len / 2 - r * 0.6, 0); return g; };
  switch (part) {
    case 'pelvis': return compose([
      [body([[0.0, -0.1], [0.15, -0.09], [0.17, 0.0], [0.15, 0.1], [0.0, 0.11]], 8, 0.7), M(0, 0, 0)],
      [rag(0.18, 0.21, 0.42, 10, 3), M(0, 0.05, 0, 0, 0, 0, 1, 1, 0.78), 0xd8d8d0],
      [box(0.09, 0.06, 0.004), M(0.08, -0.05, 0.13), 0x5a1410],
    ]);
    case 'torso': return compose([
      // hunched, narrow-waisted, uneven ribcage
      [body([[0.0, 0.0], [0.15, 0.0], [0.17, 0.15], [0.2, 0.32], [0.21, 0.44], [0.16, 0.52], [0.07, 0.56], [0.0, 0.57]], 9, 0.66), M(0, 0, 0)],
      // shoulder knobs (one higher, set per instance by the rig)
      [sphere(0.075, 6, 5), M(-0.2, 0.47, 0), 0xd0d0c8],
      [sphere(0.075, 6, 5), M(0.2, 0.47, 0), 0xd0d0c8],
      // torn gown flap + exposed ribs + stains
      [box(0.13, 0.12, 0.01), M(0.07, 0.3, 0.13, 0, 0.1, 0.25), 0x5a2018],
      ...[0, 1, 2].map((k) => [box(0.11, 0.012, 0.02), M(0.07, 0.25 + k * 0.035, 0.137, 0, 0, 0.2), 0xb0a090] as [THREE.BufferGeometry, THREE.Matrix4, number]),
      [box(0.16, 0.22, 0.004), M(-0.08, 0.2, 0.14, 0, 0.05, -0.1), 0x4a1410],
      [box(0.05, 0.07, 0.004), M(-0.12, 0.4, 0.14), 0xd8d4c0],
      // neck + exposed wiring
      [cyl(0.05, 0.062, 0.13, 7), M(0, 0.6, 0.0), 0xb8a8a0],
      [tube([V(0.04, 0.5, 0.06), V(0.07, 0.58, 0.05), V(0.05, 0.66, 0.0)], 0.008, 6, 4), null, 0x1a1a1a],
      [tube([V(-0.04, 0.49, 0.05), V(-0.06, 0.59, 0.02), V(-0.03, 0.65, -0.02)], 0.007, 6, 4), null, 0x8a3a10],
    ]);
    case 'head': return compose([
      [sphere(0.112, 10, 8), M(0, 0.13, -0.005, 0, 0, 0, 0.9, 1.1, 1.0)],
      // brow ridge, sunken cheeks, hanging jaw
      [box(0.15, 0.03, 0.05), M(0, 0.165, 0.075, 0, 0.15), 0xc8c0b0],
      [rbox(0.11, 0.055, 0.1, 0.02), M(0, 0.0, 0.05, 0, 0.42)],
      [box(0.08, 0.008, 0.06), M(0, 0.03, 0.08, 0, 0.35), 0xa09a80],
      [sphere(0.03, 6, 5), M(-0.04, 0.13, 0.09), 0x140404],
      [sphere(0.03, 6, 5), M(0.042, 0.125, 0.09), 0x140404],
      [sphere(0.008, 4, 3), M(-0.04, 0.13, 0.108), 0xc0b080],
      [sphere(0.008, 4, 3), M(0.042, 0.125, 0.108), 0xc0b080],
      [box(0.07, 0.03, 0.04), M(0, 0.055, 0.095), 0x200404],
      // surgical scar & staples around the chip site
      [box(0.012, 0.012, 0.13), M(0.03, 0.22, -0.02, 0, 0, 0.4), 0x5a1a14],
      ...[0, 1, 2, 3].map((k) => [box(0.03, 0.006, 0.006), M(0.025 + k * 0.004, 0.225, -0.07 + k * 0.035, 0, 0, 0.4), 0x9a9a9a] as [THREE.BufferGeometry, THREE.Matrix4, number]),
    ]);
    case 'uArmL': case 'uArmR': return compose([[capsule(0.045, 0.32), M(0, 0.02, 0)], [rag(0.06, 0.065, 0.16, 6, 7), M(0, 0.0, 0), 0xd0d0c8]]);
    case 'lArmL': case 'lArmR': return compose([
      [capsule(0.036, 0.32), M(0, 0.015, 0)],
      [rbox(0.08, 0.1, 0.035, 0.015), M(0, -0.4, 0.0)],
      [box(0.012, 0.1, 0.012), M(-0.025, -0.48, 0.015, 0, 0.35), 0x8a7a6a],
      [box(0.012, 0.11, 0.012), M(0.0, -0.49, 0.015, 0, 0.4), 0x8a7a6a],
      [box(0.012, 0.1, 0.012), M(0.025, -0.48, 0.015, 0, 0.35), 0x8a7a6a],
    ]);
    case 'uLegL': case 'uLegR': return compose([[capsule(0.06, 0.36), M(0, 0.03, 0)]]);
    case 'lLegL': case 'lLegR': return compose([
      [capsule(0.048, 0.34), M(0, 0.02, 0)],
      [rbox(0.1, 0.07, 0.22, 0.03), M(0, -0.42, 0.05), 0x3a3028],
    ]);
    case 'chip': return compose([
      // copper housing stapled into the skull, glass vacuum tube, frayed wires
      [rbox(0.075, 0.045, 0.06, 0.008), M(0, 0, 0), 0xb06a30],
      [cyl(0.009, 0.009, 0.05, 6), M(-0.02, 0.03, 0.0), 0x6a6a6a],
      [box(0.08, 0.008, 0.012), M(0, -0.022, 0.02), 0x888888],
      [box(0.08, 0.008, 0.012), M(0, -0.022, -0.02), 0x888888],
      [tube([V(0.03, 0, 0.02), V(0.07, -0.03, 0.04), V(0.06, -0.08, 0.02)], 0.004, 5, 3), null, 0x222222],
      [tube([V(-0.03, 0, -0.02), V(-0.06, -0.04, -0.05), V(-0.04, -0.09, -0.04)], 0.004, 5, 3), null, 0xa04010],
    ]);
    case 'glow': return compose([
      [lathe([[0, 0], [0.016, 0.004], [0.017, 0.035], [0.008, 0.05], [0, 0.052]], 8), M(0.015, 0.02, 0)],
      [box(0.05, 0.01, 0.035), M(-0.005, 0.024, 0)],
    ]);
    case 'cage': {
      const parts: [THREE.BufferGeometry, THREE.Matrix4 | null, number?][] = [];
      for (let i = 0; i < 7; i++) {
        const a = (i / 7) * Math.PI;
        parts.push([box(0.022, 0.022, 0.32), M(0, 0.13, 0, 0, 0, a - Math.PI / 2 + Math.PI / 2 * 0), 0x6a6460]);
        parts.push([tube([V(-0.15, 0.02, Math.cos(a) * 0.14), V(0, 0.28, Math.cos(a) * 0.15), V(0.15, 0.02, Math.cos(a) * 0.14)], 0.012, 8, 4), null, 0x6a6460]);
      }
      parts.push([rbox(0.32, 0.04, 0.32, 0.015), M(0, 0.02, 0), 0x5a5450]);
      parts.push([rbox(0.12, 0.06, 0.12, 0.02), M(0, 0.3, 0), 0x8a3a20]);
      return compose(parts);
    }
    // ---- outfit accessories (local to their parent bone; tinted per instance)
    case 'helmet': return compose([
      // dented steel helmet knocked back on the skull (the chip stays exposed)
      [new THREE.SphereGeometry(0.14, 10, 5, 0, Math.PI * 2, 0, Math.PI / 2), M(0, 0, 0, 0, 0, 0, 1, 0.8, 1.05)],
      [cyl(0.165, 0.17, 0.012, 12), M(0, 0.005, 0)],
      [box(0.012, 0.11, 0.012), M(0.12, -0.05, 0.02, 0, 0, 0.2), 0x2a2018],
      [box(0.05, 0.03, 0.02), M(-0.06, 0.09, 0.1, 0, 0.3, 0.2), 0x2a2a24],
    ]);
    case 'coat': return compose([
      // long coat / dress skirt hanging from the waist, split at the front
      ...[0, 1, 2, 3, 4, 5, 6, 7].map((k) => {
        const a = (k / 8) * Math.PI * 2 + 0.4;
        if (k === 2) return null;
        const len = 0.58 + ((k * 37) % 5) * 0.03;
        return [box(0.15, len, 0.012), M(Math.sin(a) * 0.19, -len / 2 + 0.05, Math.cos(a) * 0.15, a, -0.08, 0)] as [THREE.BufferGeometry, THREE.Matrix4, number?];
      }).filter((x): x is [THREE.BufferGeometry, THREE.Matrix4, number?] => !!x),
      [box(0.4, 0.05, 0.26), M(0, 0.04, 0), 0x1a1a18],
    ]);
    case 'cap': return compose([
      [cyl(0.1, 0.115, 0.05, 10), M(0, 0.025, 0)],
      [cyl(0.125, 0.13, 0.015, 12), M(0, 0.055, 0)],
      [box(0.14, 0.012, 0.07), M(0, 0.01, 0.12, 0, 0.15), 0x1a1a18],
    ]);
    case 'apron': return compose([
      [box(0.3, 0.72, 0.015), M(0, -0.12, 0)],
      [box(0.16, 0.2, 0.004), M(0.04, -0.05, 0.01, 0, 0, 0.2), 0x5a1410],
      [box(0.1, 0.12, 0.004), M(-0.08, -0.3, 0.01, 0, 0, -0.4), 0x4a1410],
      [box(0.012, 0.36, 0.012), M(-0.13, 0.36, -0.04, 0, -0.2, 0.2), 0x6a5a4a],
      [box(0.012, 0.36, 0.012), M(0.13, 0.36, -0.04, 0, -0.2, -0.2), 0x6a5a4a],
    ]);
    case 'bandage': return compose([
      [new THREE.TorusGeometry(0.104, 0.022, 4, 14), M(0, 0.15, 0, 0, Math.PI / 2 - 0.15, 0, 1, 1, 0.92)],
      [new THREE.TorusGeometry(0.1, 0.018, 4, 12), M(0, 0.13, 0, 0.8, Math.PI / 2 + 0.5, 0, 1, 1, 0.9)],
      [box(0.04, 0.03, 0.004), M(-0.06, 0.15, 0.1), 0x7a2018],
    ]);
    case 'straps': return compose([
      [box(0.04, 0.6, 0.012), M(0.02, 0.28, 0.135, 0, 0, 0.5)],
      [box(0.04, 0.6, 0.012), M(-0.02, 0.28, 0.135, 0, 0, -0.5)],
      [box(0.36, 0.05, 0.27), M(0, 0.04, 0)],
      [box(0.07, 0.08, 0.05), M(0.12, 0.05, 0.13), 0x4a4030],
      [box(0.07, 0.08, 0.05), M(-0.12, 0.05, 0.13), 0x4a4030],
    ]);
  }
}

function houndGeometry(part: HoundPart): THREE.BufferGeometry {
  switch (part) {
    case 'hBody': return compose([
      [rbox(0.26, 0.26, 0.7, 0.1), M(0, 0, 0)],
      [rbox(0.28, 0.3, 0.3, 0.1), M(0, 0.03, 0.2)],
      // exposed ribs
      ...[0, 1, 2, 3].map((i) => [box(0.27, 0.025, 0.02), M(0, -0.04, 0.05 - i * 0.07, 0, 0, 0), 0xc8b8a0] as [THREE.BufferGeometry, THREE.Matrix4, number]),
      [rbox(0.1, 0.12, 0.2, 0.04), M(0, 0.17, 0.38, 0, 0.6), SKIN],
    ]);
    case 'hHead': return compose([
      [rbox(0.16, 0.15, 0.2, 0.05), M(0, 0, 0)],
      [rbox(0.1, 0.08, 0.2, 0.03), M(0, -0.03, 0.16)],
      [box(0.09, 0.02, 0.17), M(0, -0.075, 0.16), 0x2a0606],
      [box(0.02, 0.03, 0.01), M(-0.035, -0.06, 0.24), 0xd0c8a0],
      [box(0.02, 0.03, 0.01), M(0.035, -0.06, 0.24), 0xd0c8a0],
      [sphere(0.02, 6, 4), M(-0.05, 0.03, 0.08), 0xc04010],
      [sphere(0.02, 6, 4), M(0.05, 0.03, 0.08), 0xc04010],
      [box(0.03, 0.08, 0.05), M(-0.06, 0.1, -0.04, 0, -0.3), SKIN],
      [box(0.03, 0.08, 0.05), M(0.06, 0.1, -0.04, 0, -0.3), SKIN],
    ]);
    case 'hLegFL': case 'hLegFR': case 'hLegBL': case 'hLegBR':
      return compose([[rbox(0.07, 0.28, 0.08, 0.03), M(0, -0.13, 0)]]);
    case 'hLowFL': case 'hLowFR': case 'hLowBL': case 'hLowBR':
      return compose([[rbox(0.05, 0.28, 0.05, 0.02), M(0, -0.13, 0)], [rbox(0.06, 0.04, 0.09, 0.015), M(0, -0.28, 0.03), 0x2a2420]]);
    case 'hTail': return compose([[cyl(0.02, 0.008, 0.3, 5), M(0, -0.14, 0)]]);
    case 'chip': return humanGeometry('chip');
    case 'glow': return humanGeometry('glow');
  }
}

export class RigMeshes<P extends string> {
  readonly meshes = {} as Record<P, THREE.InstancedMesh>;
  readonly bake: Record<string, THREE.InstancedBufferAttribute> = {};
  readonly group = new THREE.Group();

  constructor(parts: P[], geo: (p: P) => THREE.BufferGeometry, count: number, skinMat: THREE.Material, glowMat: THREE.Material, chipMat: THREE.Material) {
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (const p of parts) {
      const g = geo(p);
      const mat = p === 'glow' ? glowMat : p === 'chip' || p === 'cage' ? chipMat : skinMat;
      if (p !== 'glow') {
        const attr = new THREE.InstancedBufferAttribute(new Float32Array(count * 3).fill(0.1), 3);
        attr.setUsage(THREE.DynamicDrawUsage);
        g.setAttribute('instBake', attr);
        this.bake[p] = attr;
      }
      const m = new THREE.InstancedMesh(g, mat, count);
      m.instanceMatrix.setUsage(THREE.DynamicDrawUsage);
      for (let i = 0; i < count; i++) { m.setMatrixAt(i, zero); m.setColorAt(i, new THREE.Color(1, 1, 1)); }
      m.frustumCulled = false;
      m.count = count;
      this.meshes[p] = m;
      this.group.add(m);
    }
  }
}

function skinTexture(): THREE.CanvasTexture {
  const S = 256;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  g.fillStyle = '#b8b0a0'; g.fillRect(0, 0, S, S);
  // mottling
  for (let i = 0; i < 900; i++) {
    const x = Math.random() * S, y = Math.random() * S, r = 2 + Math.random() * 10;
    g.fillStyle = `rgba(${60 + Math.random() * 60},${50 + Math.random() * 40},${40 + Math.random() * 30},${0.05 + Math.random() * 0.12})`;
    g.beginPath(); g.arc(x, y, r, 0, 6.3); g.fill();
  }
  // veins
  g.strokeStyle = 'rgba(60,40,70,0.25)'; g.lineWidth = 1.2;
  for (let i = 0; i < 40; i++) {
    let x = Math.random() * S, y = Math.random() * S;
    g.beginPath(); g.moveTo(x, y);
    for (let k = 0; k < 6; k++) { x += (Math.random() - 0.5) * 30; y += Math.random() * 20; g.lineTo(x, y); }
    g.stroke();
  }
  // dried blood & grime
  for (let i = 0; i < 70; i++) {
    const x = Math.random() * S, y = Math.random() * S;
    g.fillStyle = `rgba(${70 + Math.random() * 40},10,8,${0.2 + Math.random() * 0.4})`;
    g.beginPath(); g.ellipse(x, y, 2 + Math.random() * 9, 2 + Math.random() * 14, Math.random() * 3, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export function createMaterials() {
  const tex = getSurface('concrete');
  const skin = MatLib.instanced({ vertexColors: true, roughness: 0.75, metalness: 0, map: skinTexture(), normalMap: tex.normalMap, normalScale: new THREE.Vector2(0.6, 0.6) });
  const chip = MatLib.instanced({ vertexColors: true, roughness: 0.35, metalness: 0.8 });
  const glow = new THREE.MeshBasicMaterial({ color: 0xffffff, fog: false });
  return { skin, chip, glow };
}

export const HUMAN_PARTS: HumanPart[] = ['pelvis', 'torso', 'head', 'uArmL', 'uArmR', 'lArmL', 'lArmR', 'uLegL', 'uLegR', 'lLegL', 'lLegR', 'chip', 'glow', 'cage', 'helmet', 'coat', 'cap', 'apron', 'bandage', 'straps'];
export const HOUND_PARTS: HoundPart[] = ['hBody', 'hHead', 'hLegFL', 'hLegFR', 'hLegBL', 'hLegBR', 'hLowFL', 'hLowFR', 'hLowBL', 'hLowBR', 'hTail', 'chip', 'glow'];
export { humanGeometry, houndGeometry };

/** Small matrix stack helper for posing (no allocations). */
export class Poser {
  private e = new THREE.Euler();
  private q = new THREE.Quaternion();
  private p = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);
  private l = new THREE.Matrix4();
  /** out = parent * T(x,y,z) * R(rx,ry,rz) * S */
  local(out: THREE.Matrix4, parent: THREE.Matrix4, x: number, y: number, z: number, rx: number, ry: number, rz: number, sx = 1, sy = sx, sz = sx) {
    this.e.set(rx, ry, rz, 'YXZ');
    this.q.setFromEuler(this.e);
    this.p.set(x, y, z);
    this.s.set(sx, sy, sz);
    this.l.compose(this.p, this.q, this.s);
    out.multiplyMatrices(parent, this.l);
    return out;
  }
}
