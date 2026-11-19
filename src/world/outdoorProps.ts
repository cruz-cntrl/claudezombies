import * as THREE from 'three';
import { GeoBatch, M, box, rbox, cyl, sphere, lathe, cone, tube } from '../render/geometryKit';
import type { RNG } from '../core/math';

/**
 * Outdoor prop library for the Ravenmoor Grounds: graves, hedges, trees, farm clutter.
 * Same conventions as props.ts — local space faces +Z, centred on the footprint, `base` places it.
 */
export type Build = (b: GeoBatch, base: THREE.Matrix4, r: RNG) => void;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (base: THREE.Matrix4, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, s = 1) => base.clone().multiply(M(x, y, z, ry, rx, rz, s));
const pickC = (r: RNG, arr: number[]) => arr[Math.floor(r() * arr.length)];

const STONE = [0x8a8a84, 0x9a968c, 0x7a7a76, 0xa8a49a, 0x6e6c66];
const LEAF = [0x2e3a24, 0x34402a, 0x283420, 0x3a4630];

export const gravestone: Build = (b, base, r) => {
  const tint = pickC(r, STONE);
  const lean = (r() - 0.5) * 0.22, twist = (r() - 0.5) * 0.3;
  const kind = Math.floor(r() * 5);
  const g = at(base, (r() - 0.5) * 0.2, 0, (r() - 0.5) * 0.2, twist, lean * 0.4, lean);
  if (kind === 0) {
    // rounded-top slab
    b.add('surf:stone', rbox(0.62, 0.9, 0.14, 0.03), at(g, 0, 0.45, 0), tint);
    b.add('surf:stone', cyl(0.31, 0.31, 0.14, 12, false), at(g, 0, 0.9, 0, 0, Math.PI / 2), tint);
  } else if (kind === 1) {
    // cross
    b.add('surf:stone', box(0.14, 1.25, 0.14), at(g, 0, 0.62, 0), tint);
    b.add('surf:stone', box(0.62, 0.14, 0.14), at(g, 0, 0.95, 0), tint);
    b.add('surf:stone', rbox(0.45, 0.22, 0.35, 0.03), at(g, 0, 0.11, 0), tint);
  } else if (kind === 2) {
    // obelisk
    b.add('surf:stone', rbox(0.5, 0.35, 0.5, 0.02), at(g, 0, 0.17, 0), tint);
    b.add('surf:stone', cyl(0.12, 0.2, 1.5, 4), at(g, 0, 1.1, 0, Math.PI / 4), tint);
    b.add('surf:stone', cone(0.13, 0.22, 4), at(g, 0, 1.96, 0, Math.PI / 4), tint);
  } else if (kind === 3) {
    // squat headstone + kerb surround
    b.add('surf:stone', rbox(0.7, 0.7, 0.16, 0.05), at(g, 0, 0.35, -0.4), tint);
    for (const sx of [-0.4, 0.4]) b.add('surf:stone', box(0.08, 0.12, 1.1), at(base, sx, 0.06, 0.1), tint);
    b.add('plain:dirt', box(0.72, 0.08, 1.0), at(base, 0, 0.04, 0.1), 0x3a3024);
  } else {
    // broken slab, fallen half on the ground
    b.add('surf:stone', rbox(0.6, 0.5, 0.13, 0.02), at(g, 0, 0.25, 0), tint);
    b.add('surf:stone', rbox(0.6, 0.45, 0.13, 0.02), at(base, 0.1, 0.07, 0.45, 0.3, Math.PI / 2 - 0.08), tint);
  }
};

/** Open grave: a dug-out pit with the spoil heaped beside it (the Tethered climb out of these). */
export const openGrave: Build = (b, base, r) => {
  b.add('plain:dirt', box(0.85, 0.02, 1.7), at(base, 0, 0.01, 0), 0x0c0a08);
  for (let i = 0; i < 4; i++) b.add('plain:dirt', sphere(0.45 + r() * 0.2, 8, 6), at(base, 0.75 + r() * 0.1, -0.12, -0.6 + i * 0.4, 0, 0, 0, 1), 0x4a3a28);
  b.add('surf:stone', rbox(0.6, 0.85, 0.13, 0.03), at(base, 0, 0.42, -1.0, 0, 0, (r() - 0.5) * 0.3), pickC(r, STONE));
  if (r() > 0.4) b.add('surf:wood', box(0.05, 0.05, 1.4), at(base, -0.55, 0.3, 0.3, 0.2, 0.9), 0x6a5034); // spade
};

export const hedge: Build = (b, base, r) => {
  b.add('plain:leaf', rbox(1.02, 1.5 + r() * 0.15, 1.0, 0.18, 2), at(base, 0, 0.78, 0), pickC(r, LEAF));
};

export const conifer: Build = (b, base, r) => {
  const s = 0.8 + r() * 0.6;
  b.add('surf:wood', cyl(0.12 * s, 0.18 * s, 1.4 * s, 6), at(base, 0, 0.7 * s, 0), 0x3a2a1e);
  const tint = pickC(r, LEAF);
  for (let i = 0; i < 4; i++) b.add('plain:leaf', cone((1.5 - i * 0.3) * s, (1.7 - i * 0.15) * s, 7), at(base, 0, (1.4 + i * 1.0) * s, 0, r() * 2), tint);
};

/** Bare winter oak (early March: no leaves yet) — wider and taller than props.deadTree. */
export const bareOak: Build = (b, base, r) => {
  const s = 1.1 + r() * 0.6;
  const trunk = 0x3a3028;
  b.add('surf:wood', cyl(0.18 * s, 0.34 * s, 3.2 * s, 8), at(base, 0, 1.6 * s, 0, 0, 0.04), trunk);
  const branch = (o: THREE.Vector3, len: number, ang: number, tilt: number, depth: number) => {
    const e = V(o.x + Math.sin(ang) * Math.sin(tilt) * len, o.y + Math.cos(tilt) * len, o.z + Math.cos(ang) * Math.sin(tilt) * len);
    const mid = o.clone().lerp(e, 0.5).add(V((r() - 0.5) * 0.3, 0, (r() - 0.5) * 0.3));
    b.add('surf:wood', tube([o, mid, e], 0.055 * depth * s, 3, 5), base, trunk);
    if (depth > 1) for (let i = 0; i < 3; i++) branch(e, len * 0.62, ang + (r() - 0.5) * 2.0, tilt + 0.15, depth - 1);
  };
  for (let i = 0; i < 5; i++) branch(V(0, (2.2 + i * 0.4) * s, 0), (1.5 + r() * 0.8) * s, r() * Math.PI * 2, 0.6 + r() * 0.5, 2);
};

export const haybale: Build = (b, base, r) => {
  b.add('plain:straw', cyl(0.62, 0.62, 1.1, 12), at(base, 0, 0.62, 0, r() * 0.4, 0, Math.PI / 2), 0xa08a50);
  if (r() > 0.6) b.add('plain:straw', cyl(0.6, 0.6, 1.05, 12), at(base, 0.1, 1.7, 0.05, 0.9, 0, Math.PI / 2), 0x968048);
};

export const wheelbarrow: Build = (b, base, r) => {
  b.add('surf:wood', box(0.6, 0.3, 0.9), at(base, 0, 0.55, 0, 0, -0.1), 0x6a5038);
  b.add('plain:rubber', cyl(0.2, 0.2, 0.08, 12), at(base, 0, 0.2, 0.55, 0, 0, Math.PI / 2), 0x1a1a1a);
  for (const sx of [-0.25, 0.25]) b.add('surf:wood', box(0.05, 0.05, 1.3), at(base, sx, 0.45, -0.3, 0, -0.25), 0x5a4030);
  if (r() > 0.5) b.add('plain:dirt', sphere(0.3, 8, 6), at(base, 0, 0.7, 0, 0, 0, 0, 1), 0x4a3a28);
};

export const woodpile: Build = (b, base, r) => {
  for (let row = 0; row < 4; row++) for (let i = 0; i < 4 - row; i++) {
    b.add('surf:wood', cyl(0.12, 0.12, 1.0, 7), at(base, -0.36 + i * 0.24 + row * 0.12, 0.12 + row * 0.21, 0, r() * 0.1, Math.PI / 2), 0x7a5a3a);
  }
};

export const rock: Build = (b, base, r) => {
  const s = 0.4 + r() * 0.5;
  b.add('surf:stone', new THREE.IcosahedronGeometry(s, 0), at(base, 0, s * 0.4, 0, r() * 3, r(), r(), 1), pickC(r, STONE));
  if (r() > 0.5) b.add('surf:stone', new THREE.IcosahedronGeometry(s * 0.5, 0), at(base, s * 0.9, s * 0.15, 0.2, r() * 3), pickC(r, STONE));
};

export const stump: Build = (b, base, r) => {
  b.add('surf:wood', cyl(0.32, 0.4, 0.5, 9), at(base, 0, 0.25, 0), 0x4a3a2a);
  if (r() > 0.4) b.add('surf:wood', box(0.08, 0.6, 0.08), at(base, 0.1, 0.65, 0, 0, 0.3, 0.2), 0x6a5034); // axe handle
};

/** Mourning statue on a plinth (a robed figure, head bowed). */
export const statue: Build = (b, base, r) => {
  const tint = 0xa09c92;
  b.add('surf:stone', rbox(0.9, 0.9, 0.9, 0.03), at(base, 0, 0.45, 0), 0x8a8880);
  b.add('surf:stone', lathe([[0, 0], [0.34, 0], [0.3, 0.6], [0.22, 1.2], [0.16, 1.45], [0, 1.5]], 10), at(base, 0, 0.9, 0), tint);
  b.add('surf:stone', sphere(0.14, 8, 6), at(base, 0, 2.5, 0.05), tint);
  for (const s of [-1, 1]) b.add('surf:stone', box(0.08, 0.9, 0.5), at(base, s * 0.25, 2.0, -0.2, s * 0.5, 0.2), tint); // folded wings
  void r;
};

export const crossMarker: Build = (b, base, r) => {
  const tint = pickC(r, [0x5a4632, 0x4a3a2a]);
  b.add('surf:wood', box(0.08, 1.1, 0.06), at(base, 0, 0.5, 0, 0, 0, (r() - 0.5) * 0.3), tint);
  b.add('surf:wood', box(0.5, 0.07, 0.06), at(base, 0, 0.8, 0, 0, 0, (r() - 0.5) * 0.3), tint);
};

export const barbedWire: Build = (b, base, r) => {
  for (const sx of [-0.45, 0.45]) {
    b.add('surf:wood', box(0.07, 0.9, 0.07), at(base, sx, 0.4, 0, 0, 0, (r() - 0.5) * 0.4), 0x5a4a38);
  }
  for (const y of [0.3, 0.55, 0.8]) b.add('plain:iron', box(1.0, 0.012, 0.012), at(base, 0, y, 0, 0, 0, (r() - 0.5) * 0.1), 0x3a3a38);
};

export const signpost: Build = (b, base) => {
  b.add('surf:wood', box(0.1, 2.0, 0.1), at(base, 0, 1.0, 0), 0x5a4632);
  b.add('surf:wood', box(0.9, 0.22, 0.04), at(base, 0.35, 1.7, 0, 0, 0, 0.05), 0x8a7050);
  b.add('surf:wood', box(0.8, 0.2, 0.04), at(base, -0.3, 1.4, 0, Math.PI, 0, -0.08), 0x7a6040);
};

// ---------------------------------------------------------------- fences
export type FenceStyle = 'iron' | 'hedge' | 'stone' | 'picket';

/**
 * One cell of fence. `ax` = runs along X (else along Z). Iron railings and pickets are see-
 * through; hedges and dry-stone walls stay low enough (≤1.2 m) to see over.
 */
export function fenceCell(b: GeoBatch, x: number, z: number, ax: boolean, style: FenceStyle, r: RNG) {
  const yaw = ax ? 0 : Math.PI / 2;
  const base = M(x, 0, z, yaw);
  if (style === 'hedge') {
    b.add('plain:leaf', rbox(1.04, 1.15 + r() * 0.1, 0.8, 0.16, 2), at(base, 0, 0.58, 0), pickC(r, LEAF));
  } else if (style === 'stone') {
    b.add('surf:stone', rbox(1.02, 0.95, 0.55, 0.06), at(base, 0, 0.47, 0), pickC(r, STONE));
    b.add('surf:stone', rbox(1.04, 0.12, 0.62, 0.03), at(base, 0, 0.98, 0), 0x7a7870);
  } else if (style === 'picket') {
    for (const y of [0.35, 0.85]) b.add('surf:wood', box(1.0, 0.07, 0.03), at(base, 0, y, -0.03), 0x8a7a64);
    for (let i = 0; i < 5; i++) if (r() > 0.12) b.add('surf:wood', box(0.1, 1.05, 0.025), at(base, -0.4 + i * 0.2, 0.52, 0, 0, 0, (r() - 0.5) * 0.12), 0xa89a80);
  } else {
    b.add('surf:stone', box(1.0, 0.3, 0.32), at(base, 0, 0.15, 0), 0x7a7870);
    for (const y of [0.42, 1.3]) b.add('plain:iron', box(1.0, 0.035, 0.035), at(base, 0, y, 0), 0x262624);
    for (let i = 0; i < 6; i++) {
      const bx = -0.42 + i * 0.168;
      b.add('plain:iron', box(0.022, 1.2, 0.022), at(base, bx, 0.9, 0), 0x262624);
      b.add('plain:iron', cone(0.03, 0.09, 4), at(base, bx, 1.54, 0, Math.PI / 4), 0x262624);
    }
  }
}

/** A stone gate pier (placed where fence lines end or turn). */
export function pier(b: GeoBatch, x: number, z: number, h = 1.7) {
  b.add('surf:stone', rbox(0.5, h, 0.5, 0.03), M(x, h / 2, z), 0x8a8880);
  b.add('surf:stone', rbox(0.62, 0.12, 0.62, 0.02), M(x, h + 0.06, z), 0x7a7870);
  b.add('surf:stone', sphere(0.17, 8, 6), M(x, h + 0.26, z), 0x8a8880);
}
