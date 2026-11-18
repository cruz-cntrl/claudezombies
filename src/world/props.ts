import * as THREE from 'three';
import { GeoBatch, M, box, rbox, cyl, sphere, torus, tube, lathe } from '../render/geometryKit';
import type { RNG } from '../core/math';
import type { PropTheme } from './mapTypes';

/**
 * Procedural prop library. Every prop is built in local space facing +Z, centred on its
 * footprint, and transformed by `base` (cell placement + yaw). Materials are MatLib keys.
 */
type Build = (b: GeoBatch, base: THREE.Matrix4, r: RNG) => void;
const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (base: THREE.Matrix4, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => base.clone().multiply(M(x, y, z, ry, rx, rz));
const pickC = (r: RNG, arr: number[]) => arr[Math.floor(r() * arr.length)];

const PAINT_OLIVE = 0x4c5434, PAINT_GREY = 0x596061, PAINT_WHITE = 0x9fa596, PAINT_GREEN = 0x3c5446, PAINT_RED = 0x5e1c17;

export const crate: Build = (b, base, r) => {
  const s = 0.75 + r() * 0.2;
  const tint = pickC(r, [0xffffff, 0xd8c8b0, 0xb8a890]);
  b.add('surf:wood', rbox(s, s, s, 0.02), at(base, 0, s / 2, 0, r() * 0.3 - 0.15), tint);
  // frame slats
  for (const sx of [-1, 1]) for (const sz of [-1, 1]) {
    b.add('surf:wood', box(0.07, s + 0.02, 0.07), at(base, sx * (s / 2 - 0.02), s / 2, sz * (s / 2 - 0.02)), 0x8a7058);
  }
  b.add('surf:wood', box(s + 0.02, 0.06, 0.06), at(base, 0, s * 0.5, s / 2 + 0.01, 0, 0, 0.75), 0x8a7058);
  if (r() > 0.5) {
    const s2 = s * 0.7;
    b.add('surf:wood', rbox(s2, s2, s2, 0.02), at(base, (r() - 0.5) * 0.1, s + s2 / 2, (r() - 0.5) * 0.1, r() * 0.8), tint);
  }
};

export const barrel: Build = (b, base, r) => {
  const tint = pickC(r, [0x6a2a1e, 0x4d5530, 0x3a3f42, 0x7a5a1a]);
  b.add('plain:paint', cyl(0.3, 0.3, 0.92, 14), at(base, 0, 0.46, 0), tint);
  for (const y of [0.05, 0.32, 0.6, 0.88]) b.add('surf:metal', torus(0.305, 0.018, 4, 16), at(base, 0, y, 0, 0, Math.PI / 2), 0xaaaaaa);
  b.add('surf:metal', cyl(0.27, 0.27, 0.02, 14), at(base, 0, 0.93, 0), 0x999999);
  if (r() > 0.4) {
    b.add('plain:paint', cyl(0.3, 0.3, 0.92, 14), at(base, 0.45, 0.46, -0.3), pickC(r, [0x6a2a1e, 0x4d5530]));
  }
};

export const filingCabinet: Build = (b, base, r) => {
  const tint = pickC(r, [PAINT_OLIVE, PAINT_GREY, PAINT_GREEN]);
  b.add('plain:paint', rbox(0.5, 1.32, 0.6, 0.02), at(base, -0.2, 0.66, 0), tint);
  for (let i = 0; i < 4; i++) {
    const open = r() > 0.85 ? 0.25 : 0;
    b.add('plain:paint', rbox(0.46, 0.28, 0.04, 0.01), at(base, -0.2, 0.18 + i * 0.32, 0.31 + open), tint);
    b.add('plain:brass', box(0.12, 0.025, 0.03), at(base, -0.2, 0.25 + i * 0.32, 0.345 + open), 0xb08a40);
    b.add('plain:paper', box(0.08, 0.04, 0.005), at(base, -0.2, 0.18 + i * 0.32, 0.335 + open), 0xd8d0b0);
  }
  b.add('plain:paint', rbox(0.5, 1.0, 0.6, 0.02), at(base, 0.28, 0.5, 0), tint);
  b.add('plain:paper', box(0.3, 0.06, 0.22), at(base, 0.28, 1.03, 0, r()), 0xcfc6a6);
};

export const desk: Build = (b, base, r) => {
  b.add('surf:wood', rbox(1.4, 0.05, 0.75, 0.01), at(base, 0, 0.76, 0), 0xc0a080);
  b.add('surf:wood', rbox(0.42, 0.72, 0.7, 0.01), at(base, 0.46, 0.36, 0), 0xa08868);
  for (const sx of [-0.64]) for (const sz of [-0.32, 0.32]) b.add('surf:wood', box(0.05, 0.74, 0.05), at(base, sx, 0.37, sz), 0x806848);
  for (let i = 0; i < 3; i++) b.add('plain:brass', box(0.1, 0.02, 0.02), at(base, 0.46, 0.15 + i * 0.22, 0.36), 0xb08a40);
  // papers + typewriter or lamp
  for (let i = 0; i < 3; i++) b.add('plain:paper', box(0.21, 0.004, 0.29), at(base, -0.3 + r() * 0.3, 0.79 + i * 0.004, r() * 0.2 - 0.1, r() * 1.2), 0xd9d0b0);
  if (r() > 0.5) typewriter(b, at(base, -0.1, 0.785, -0.05, 0.1), r);
  else deskLamp(b, at(base, -0.5, 0.785, -0.2), r);
};

export const typewriter: Build = (b, base) => {
  b.add('plain:paint', rbox(0.34, 0.1, 0.28, 0.03), at(base, 0, 0.05, 0), 0x1a1a1a);
  b.add('plain:paint', rbox(0.3, 0.08, 0.1, 0.03), at(base, 0, 0.12, -0.08, 0, -0.4), 0x1a1a1a);
  b.add('plain:chrome', cyl(0.025, 0.025, 0.42, 8), at(base, 0, 0.16, -0.1, 0, 0, Math.PI / 2), 0x888888);
  b.add('plain:paper', box(0.21, 0.18, 0.003), at(base, 0, 0.24, -0.11, 0, -0.2), 0xe0d8c0);
  for (let i = 0; i < 4; i++) b.add('plain:paint', box(0.26, 0.015, 0.03), at(base, 0, 0.1 + i * 0.012, 0.06 + i * 0.03), 0x666055);
};

export const deskLamp: Build = (b, base) => {
  b.add('plain:brass', cyl(0.08, 0.1, 0.03, 12), at(base, 0, 0.015, 0), 0x9a7a3a);
  b.add('plain:brass', cyl(0.012, 0.012, 0.35, 6), at(base, 0, 0.19, 0, 0, 0.3), 0x9a7a3a);
  b.add('plain:paint', cyl(0.04, 0.12, 0.12, 12, true), at(base, 0.05, 0.36, 0.08, 0, 0.9), 0x1d3a26);
};

export const chair: Build = (b, base, r) => {
  const tip = r() > 0.75;
  const bb = tip ? at(base, 0, 0.22, 0, r() * 3, Math.PI / 2 * 0.98) : at(base, 0, 0, 0, r() * 0.6 - 0.3);
  b.add('surf:wood', rbox(0.44, 0.04, 0.42, 0.01), at(bb, 0, 0.46, 0), 0xa08060);
  for (const sx of [-0.19, 0.19]) for (const sz of [-0.18, 0.18]) b.add('surf:wood', box(0.035, 0.46, 0.035), at(bb, sx, 0.23, sz), 0x806040);
  for (const sx of [-0.19, 0.19]) b.add('surf:wood', box(0.035, 0.5, 0.035), at(bb, sx, 0.72, -0.18), 0x806040);
  b.add('surf:wood', rbox(0.42, 0.14, 0.03, 0.01), at(bb, 0, 0.88, -0.19), 0xa08060);
};

export const bed: Build = (b, base, r) => {
  // spans 2 cells along local Z (centre between them)
  const iron = 0xc8ccc4;
  for (const sx of [-0.42, 0.42]) {
    b.add('plain:iron', tube([V(sx, 0, -0.95), V(sx, 0.9, -0.95), V(sx, 0.9, -0.94)], 0.022, 6, 6), base, iron);
    b.add('plain:iron', tube([V(sx, 0, 0.95), V(sx, 0.65, 0.95)], 0.022, 2, 6), base, iron);
    b.add('plain:iron', box(0.03, 0.03, 1.9), at(base, sx, 0.42, 0), iron);
  }
  for (const z of [-0.95, 0.95]) for (const y of [0.42, z < 0 ? 0.88 : 0.64]) b.add('plain:iron', cyl(0.018, 0.018, 0.84, 6), at(base, 0, y, z, 0, 0, Math.PI / 2), iron);
  for (let i = -3; i <= 3; i++) b.add('plain:iron', cyl(0.01, 0.01, 0.4, 4), at(base, i * 0.11, 0.68, -0.95), iron);
  const sheet = pickC(r, [0xb8b4a4, 0x9a9688, 0x8c8676]);
  b.add('plain:fabric', rbox(0.84, 0.16, 1.82, 0.06), at(base, 0, 0.52, 0), 0x6e6a5c);
  b.add('plain:fabric', rbox(0.9, 0.06, 1.3, 0.03), at(base, 0, 0.6, 0.25, 0, 0.02, 0.04), sheet);
  b.add('plain:fabric', rbox(0.5, 0.1, 0.3, 0.05), at(base, 0, 0.64, -0.7), 0xc0bcae);
  if (r() > 0.5) { // restraint straps
    for (const z of [-0.2, 0.4]) b.add('plain:rubber', box(0.95, 0.03, 0.06), at(base, 0, 0.62, z), 0x3a2a1a);
  }
};

export const gurney: Build = (b, base, r) => {
  const chrome = 0xb0b4b0;
  b.add('plain:chrome', box(0.6, 0.04, 1.85), at(base, 0, 0.78, 0), chrome);
  for (const sx of [-0.27, 0.27]) for (const sz of [-0.85, 0.85]) {
    b.add('plain:chrome', cyl(0.018, 0.018, 0.72, 6), at(base, sx, 0.4, sz), chrome);
    b.add('plain:rubber', cyl(0.05, 0.05, 0.04, 10), at(base, sx, 0.05, sz, 0, 0, Math.PI / 2), 0x1a1a1a);
  }
  b.add('plain:fabric', rbox(0.58, 0.08, 1.8, 0.03), at(base, 0, 0.84, 0), 0x4a4a42);
  b.add('plain:fabric', rbox(0.62, 0.05, 1.1, 0.02), at(base, 0.02, 0.89, 0.3, 0, 0, 0.05), pickC(r, [0x9a948a, 0x8a5048]));
  for (const z of [-0.3, 0.3]) b.add('plain:rubber', box(0.66, 0.025, 0.07), at(base, 0, 0.9, z), 0x3a2414);
};

export const ivStand: Build = (b, base) => {
  b.add('plain:chrome', cyl(0.012, 0.012, 1.8, 6), at(base, 0, 0.9, 0), 0xaaaaaa);
  for (let i = 0; i < 4; i++) b.add('plain:chrome', cyl(0.01, 0.01, 0.4, 4), at(base, 0, 0.06, 0, (i * Math.PI) / 2, 0, 1.3), 0xaaaaaa);
  b.add('plain:chrome', cyl(0.008, 0.008, 0.3, 4), at(base, 0, 1.78, 0, 0, 0, Math.PI / 2), 0xaaaaaa);
  b.add('plain:glass', lathe([[0, 0], [0.05, 0.02], [0.055, 0.15], [0.02, 0.2], [0.01, 0.24]], 10), at(base, 0.12, 1.5, 0), 0x6a7a6a);
};

export const privacyScreen: Build = (b, base, r) => {
  const ang = [-0.4, 0, 0.4];
  for (let i = 0; i < 3; i++) {
    const m = at(base, (i - 1) * 0.55, 0, 0, ang[i] * (r() > 0.5 ? 1 : -1));
    b.add('plain:chrome', box(0.52, 0.02, 0.02), at(m, 0, 1.7, 0), 0x999999);
    b.add('plain:chrome', box(0.02, 1.7, 0.02), at(m, -0.26, 0.85, 0), 0x999999);
    b.add('plain:fabric', box(0.5, 1.3, 0.01), at(m, 0, 1.0, 0), pickC(r, [0x8a8f7a, 0x7a806c, 0x6f6a58]));
  }
};

export const wheelchair: Build = (b, base) => {
  for (const sx of [-0.3, 0.3]) {
    b.add('plain:rubber', torus(0.3, 0.02, 6, 20), at(base, sx, 0.32, 0, Math.PI / 2), 0x222222);
    b.add('plain:chrome', cyl(0.03, 0.03, 0.04, 8), at(base, sx, 0.32, 0, 0, 0, Math.PI / 2), 0x999999);
  }
  b.add('plain:fabric', box(0.5, 0.04, 0.45), at(base, 0, 0.5, 0.05), 0x3a3028);
  b.add('plain:fabric', box(0.5, 0.45, 0.04), at(base, 0, 0.75, -0.2, 0, -0.15), 0x3a3028);
  b.add('plain:chrome', cyl(0.015, 0.015, 0.6, 6), at(base, 0, 0.45, 0.4, 0, Math.PI / 2 - 0.4), 0x999999);
};

export const operatingTable: Build = (b, base) => {
  b.add('plain:iron', cyl(0.12, 0.25, 0.75, 12), at(base, 0, 0.37, 0), 0x7a7e78);
  b.add('plain:chrome', rbox(0.65, 0.08, 1.9, 0.02), at(base, 0, 0.8, 0), 0x9aa09a);
  b.add('plain:fabric', rbox(0.6, 0.06, 1.85, 0.03), at(base, 0, 0.87, 0), 0x3a4a44);
  b.add('plain:fabric', rbox(0.62, 0.03, 0.6, 0.01), at(base, 0.05, 0.91, 0.4, 0.1), 0x5a2018);
  for (const z of [-0.5, 0.1, 0.6]) b.add('plain:rubber', box(0.7, 0.03, 0.08), at(base, 0, 0.92, z), 0x2a1a10);
};

export const instrumentTray: Build = (b, base, r) => {
  b.add('plain:chrome', cyl(0.015, 0.015, 0.9, 6), at(base, 0, 0.45, 0), 0xaaaaaa);
  b.add('plain:chrome', box(0.5, 0.02, 0.35), at(base, 0, 0.9, 0), 0xaaaaaa);
  for (let i = 0; i < 6; i++) b.add('plain:chrome', box(0.012, 0.008, 0.16), at(base, -0.2 + i * 0.07, 0.915, r() * 0.1 - 0.05, r() * 0.4), 0xdddddd);
  b.add('plain:glass', cyl(0.03, 0.03, 0.1, 8), at(base, 0.18, 0.96, -0.1), 0x705030);
};

export const glassCabinet: Build = (b, base, r) => {
  b.add('plain:paint', rbox(0.9, 1.8, 0.4, 0.015), at(base, 0, 0.9, -0.25), PAINT_WHITE);
  b.add('plain:glass', box(0.8, 1.2, 0.01), at(base, 0, 1.15, -0.04), 0x30403a);
  for (let s = 0; s < 3; s++) for (let i = 0; i < 5; i++) {
    if (r() > 0.7) continue;
    b.add('plain:glass', lathe([[0, 0], [0.035, 0], [0.035, 0.1], [0.015, 0.13], [0.015, 0.16]], 8), at(base, -0.32 + i * 0.16, 0.6 + s * 0.4, -0.25), pickC(r, [0x5a3a1a, 0x3a4a2a, 0x6a6a5a, 0x2a3a4a]));
  }
};

export const bookshelf: Build = (b, base, r) => {
  b.add('surf:wood', box(1.0, 2.1, 0.04), at(base, 0, 1.05, -0.35), 0x7a5a3a);
  for (const sx of [-0.49, 0.49]) b.add('surf:wood', box(0.04, 2.1, 0.4), at(base, sx, 1.05, -0.18), 0x7a5a3a);
  for (let s = 0; s < 5; s++) {
    const y = 0.05 + s * 0.42;
    b.add('surf:wood', box(0.98, 0.03, 0.4), at(base, 0, y, -0.18), 0x7a5a3a);
    let x = -0.46;
    while (x < 0.44) {
      const w = 0.03 + r() * 0.05, hgt = 0.24 + r() * 0.12;
      if (r() > 0.88) { x += 0.1; continue; }
      const lean = r() > 0.9 ? 0.25 : 0;
      b.add('plain:paper', box(w, hgt, 0.26 + r() * 0.06), at(base, x + w / 2, y + 0.015 + hgt / 2, -0.2, 0, 0, lean),
        pickC(r, [0x4a1a14, 0x1a2a3a, 0x2a3a1a, 0x5a4a2a, 0x3a2a2a, 0x6a5a40, 0x222222]));
      x += w + 0.004;
    }
  }
};

export const sandbags: Build = (b, base, r) => {
  for (let row = 0; row < 3; row++) for (let i = 0; i < 3; i++) {
    const x = -0.36 + i * 0.36 + (row % 2) * 0.18 - 0.09;
    if (x > 0.45) continue;
    b.add('plain:fabric', rbox(0.4, 0.17, 0.3, 0.07, 2), at(base, x, 0.09 + row * 0.16, (r() - 0.5) * 0.05, (r() - 0.5) * 0.3), pickC(r, [0x6a5e44, 0x5e543c, 0x726650]));
  }
};

export const pipes: Build = (b, base, r) => {
  for (let i = 0; i < 3; i++) {
    const x = -0.3 + i * 0.3;
    const h = 2.6 + r() * 0.6;
    b.add('surf:metal', cyl(0.07, 0.07, h, 10), at(base, x, h / 2, -0.3), 0x8a7a6a);
    b.add('surf:metal', cyl(0.095, 0.095, 0.08, 10), at(base, x, 1.0 + r(), -0.3), 0x6a5a4a);
  }
  valveWheel(b, at(base, 0, 1.3, -0.18, 0, Math.PI / 2), r);
};

export const valveWheel: Build = (b, base) => {
  b.add('plain:paint', torus(0.12, 0.015, 5, 14), base, PAINT_RED);
  for (let i = 0; i < 3; i++) b.add('plain:paint', box(0.24, 0.015, 0.015), at(base, 0, 0, 0, 0, 0, (i * Math.PI) / 3), PAINT_RED);
};

export const boiler: Build = (b, base, r) => {
  b.add('surf:riveted', cyl(0.45, 0.45, 2.2, 16), at(base, 0, 1.1, 0), 0x8a6a50);
  b.add('surf:riveted', sphere(0.45, 16, 8), at(base, 0, 2.2, 0, 0, 0, 0), 0x8a6a50);
  for (const y of [0.3, 1.1, 1.9]) b.add('surf:metal', torus(0.46, 0.025, 4, 18), at(base, 0, y, 0, 0, Math.PI / 2), 0x5a4a3a);
  b.add('surf:metal', cyl(0.07, 0.07, 1.4, 8), at(base, 0.3, 2.6, 0, 0, 0, 0.3), 0x6a5a4a);
  b.add('plain:brass', cyl(0.09, 0.09, 0.05, 14), at(base, 0, 1.4, 0.46, 0, Math.PI / 2), 0xb08a40);
  b.add('glow', cyl(0.07, 0.07, 0.01, 12), at(base, 0, 1.4, 0.49, 0, Math.PI / 2), 0x804010);
  valveWheel(b, at(base, -0.25, 0.9, 0.42, 0.5, Math.PI / 2), r);
};

export const radioConsole: Build = (b, base, r) => {
  b.add('plain:paint', rbox(1.0, 1.25, 0.55, 0.03), at(base, 0, 0.62, -0.1), 0x3a3a30);
  b.add('plain:paint', rbox(1.02, 0.08, 0.6, 0.02), at(base, 0, 1.28, -0.1), 0x2a2a22);
  b.add('plain:fabric', box(0.4, 0.3, 0.01), at(base, -0.22, 0.45, 0.18), 0x2a2416);
  for (let i = 0; i < 3; i++) {
    b.add('plain:brass', cyl(0.07, 0.07, 0.02, 14), at(base, -0.3 + i * 0.3, 0.98, 0.18, 0, Math.PI / 2), 0x9a7a3a);
    b.add('glow', cyl(0.055, 0.055, 0.005, 12), at(base, -0.3 + i * 0.3, 0.98, 0.195, 0, Math.PI / 2), r() > 0.3 ? 0x7a5010 : 0x202020);
  }
  for (let i = 0; i < 5; i++) b.add('plain:rubber', cyl(0.025, 0.025, 0.04, 8), at(base, 0.05 + i * 0.08, 0.7, 0.19, 0, Math.PI / 2), 0x111111);
  b.add('glow', box(0.3, 0.06, 0.005), at(base, 0.25, 0.85, 0.18), 0x705010);
  for (let i = 0; i < 2; i++) b.add('plain:glass', cyl(0.03, 0.03, 0.12, 8), at(base, -0.3 + i * 0.15, 1.38, -0.2), 0x403020);
};

export const reelComputer: Build = (b, base, r) => {
  b.add('plain:paint', rbox(0.9, 2.0, 0.6, 0.02), at(base, 0, 1.0, -0.15), 0x7a7c70);
  for (const x of [-0.2, 0.2]) {
    b.add('plain:paint', cyl(0.17, 0.17, 0.03, 18), at(base, x, 1.45, 0.16, 0, Math.PI / 2), 0x222222);
    b.add('plain:chrome', cyl(0.05, 0.05, 0.04, 10), at(base, x, 1.45, 0.17, 0, Math.PI / 2), 0xbbbbbb);
  }
  b.add('plain:glass', box(0.8, 0.5, 0.01), at(base, 0, 1.45, 0.155), 0x202826);
  for (let i = 0; i < 8; i++) b.add('glow', sphere(0.018, 6, 4), at(base, -0.3 + i * 0.085, 1.05, 0.16), r() > 0.5 ? 0xa03010 : 0x907010);
  for (let i = 0; i < 4; i++) b.add('plain:rubber', box(0.15, 0.08, 0.02), at(base, -0.3 + i * 0.2, 0.75, 0.16), 0x2a2a2a);
};

export const dialBank: Build = (b, base, r) => {
  b.add('plain:paint', rbox(1.0, 1.0, 0.5, 0.02), at(base, 0, 0.5, -0.05), 0x50544a);
  b.add('plain:paint', rbox(1.0, 0.8, 0.12, 0.02), at(base, 0, 1.3, -0.25, 0, -0.25), 0x50544a);
  for (let row = 0; row < 2; row++) for (let i = 0; i < 4; i++) {
    const m = at(base, -0.36 + i * 0.24, 1.15 + row * 0.3, -0.16 - row * 0.07, 0, -0.25);
    b.add('plain:brass', cyl(0.08, 0.08, 0.02, 14), at(m, 0, 0, 0, 0, Math.PI / 2), 0x9a7a3a);
    b.add('glow', cyl(0.065, 0.065, 0.004, 12), at(m, 0, 0, 0.012, 0, Math.PI / 2), 0x6a6040);
  }
  for (let i = 0; i < 8; i++) b.add('plain:rubber', cyl(0.02, 0.02, 0.05, 6), at(base, -0.4 + i * 0.11, 0.98, 0.15, 0, -0.6), r() > 0.5 ? 0x8a1a1a : 0x111111);
};

export const chipCrate: Build = (b, base, r) => {
  crate(b, base, r);
  b.add('surf:wood', box(0.7, 0.3, 0.7), at(base, 0, 0.95, 0), 0x9a8060);
  for (let i = 0; i < 9; i++) {
    b.add('plain:brass', box(0.08, 0.04, 0.12), at(base, -0.25 + (i % 3) * 0.25, 1.11, -0.25 + Math.floor(i / 3) * 0.25, r()), 0xa0703a);
    b.add('glow', cyl(0.015, 0.015, 0.04, 6), at(base, -0.25 + (i % 3) * 0.25, 1.15, -0.25 + Math.floor(i / 3) * 0.25), 0x105a5a);
  }
};

export const conveyor: Build = (b, base, r) => {
  b.add('surf:riveted', box(0.8, 0.12, 1.0), at(base, 0, 0.8, 0), 0x6a6a5a);
  for (let i = 0; i < 5; i++) b.add('plain:chrome', cyl(0.04, 0.04, 0.76, 8), at(base, 0, 0.88, -0.4 + i * 0.2, 0, 0, Math.PI / 2), 0x999999);
  b.add('plain:rubber', box(0.7, 0.01, 1.0), at(base, 0, 0.93, 0), 0x1a1a1a);
  for (const sz of [-0.45, 0.45]) for (const sx of [-0.35, 0.35]) b.add('surf:metal', box(0.06, 0.8, 0.06), at(base, sx, 0.4, sz), 0x555555);
  if (r() > 0.4) b.add('plain:brass', box(0.12, 0.05, 0.15), at(base, 0, 0.96, r() * 0.6 - 0.3, r()), 0xa0703a);
};

export const capacitor: Build = (b, base) => {
  b.add('surf:riveted', cyl(0.4, 0.45, 0.4, 14), at(base, 0, 0.2, 0), 0x3a4a4a);
  b.add('plain:glass', cyl(0.22, 0.22, 1.6, 14), at(base, 0, 1.2, 0), 0x2a3a3a);
  for (let i = 0; i < 9; i++) b.add('plain:brass', torus(0.26, 0.03, 5, 16), at(base, 0, 0.55 + i * 0.16, 0, 0, Math.PI / 2), 0xb06a30);
  b.add('plain:brass', sphere(0.2, 12, 8), at(base, 0, 2.15, 0), 0x9a7a4a);
};

export const generator: Build = (b, base, r) => {
  b.add('surf:riveted', rbox(0.9, 1.1, 0.9, 0.05), at(base, 0, 0.55, 0), 0x4a5a3a);
  b.add('surf:metal', cyl(0.35, 0.35, 0.15, 18), at(base, 0.47, 0.65, 0, 0, 0, Math.PI / 2), 0x555555);
  for (let i = 0; i < 5; i++) b.add('surf:metal', box(0.7, 0.02, 0.05), at(base, 0, 1.1, -0.3 + i * 0.15), 0x333333);
  b.add('glow', box(0.15, 0.05, 0.005), at(base, -0.1, 0.8, 0.455), 0x803010);
  valveWheel(b, at(base, 0.2, 0.5, 0.46, 0, Math.PI / 2), r);
};

export const cableSpool: Build = (b, base) => {
  for (const s of [-0.3, 0.3]) b.add('surf:wood', cyl(0.45, 0.45, 0.05, 16), at(base, 0, 0.45, s, 0, Math.PI / 2), 0x9a7a5a);
  b.add('plain:rubber', cyl(0.3, 0.3, 0.55, 16), at(base, 0, 0.45, 0, 0, Math.PI / 2), 0x1a1a1a);
};

export const workbench: Build = (b, base, r) => {
  b.add('surf:wood', rbox(1.4, 0.08, 0.7, 0.01), at(base, 0, 0.9, 0), 0x8a6a4a);
  for (const sx of [-0.62, 0.62]) for (const sz of [-0.28, 0.28]) b.add('surf:metal', box(0.06, 0.88, 0.06), at(base, sx, 0.44, sz), 0x444444);
  b.add('surf:wood', box(1.3, 0.03, 0.6), at(base, 0, 0.25, 0), 0x6a5a3a);
  b.add('plain:paint', rbox(0.4, 0.18, 0.2, 0.02), at(base, 0.35, 1.03, -0.1, r()), PAINT_RED);
  for (let i = 0; i < 4; i++) b.add('plain:chrome', box(0.02, 0.01, 0.2), at(base, -0.3 + i * 0.07, 0.95, 0.1, r()), 0xaaaaaa);
  deskLamp(b, at(base, -0.5, 0.94, -0.2), r);
};

export const truck: Build = (b, base, r) => {
  // occupies roughly 2 x 4 cells: centred
  const paint = 0x3c4630;
  b.add('plain:paint', rbox(2.0, 1.4, 1.6, 0.08), at(base, 0, 1.4, 1.6), paint);
  b.add('plain:glass', box(1.7, 0.5, 0.02), at(base, 0, 1.75, 2.41), 0x1a2224);
  b.add('plain:paint', rbox(1.9, 0.8, 1.0, 0.1), at(base, 0, 1.0, 2.7), paint);
  b.add('surf:wood', box(2.1, 0.12, 3.0), at(base, 0, 1.0, -0.7), 0x8a7a6a);
  for (const sx of [-1.0, 1.0]) b.add('surf:wood', box(0.06, 0.6, 3.0), at(base, sx, 1.35, -0.7), 0x7a6a5a);
  for (const sx of [-0.95, 0.95]) for (const sz of [-1.6, 0.0, 2.4]) {
    b.add('plain:rubber', cyl(0.42, 0.42, 0.3, 16), at(base, sx, 0.42, sz, 0, 0, Math.PI / 2), 0x151515);
    b.add('surf:metal', cyl(0.2, 0.2, 0.32, 10), at(base, sx, 0.42, sz, 0, 0, Math.PI / 2), 0x555555);
  }
  for (let i = 0; i < 3; i++) crate(b, at(base, -0.4 + (i % 2) * 0.8, 1.06, -1.5 + i * 0.8, r()), r);
  for (const sx of [-0.7, 0.7]) b.add('glow', cyl(0.1, 0.1, 0.05, 10), at(base, sx, 1.1, 3.22, 0, Math.PI / 2), 0x5a4a20);
};

export const pallet: Build = (b, base, r) => {
  for (let i = 0; i < 5; i++) b.add('surf:wood', box(0.9, 0.025, 0.12), at(base, 0, 0.13, -0.4 + i * 0.2), 0xb09a78);
  for (const sx of [-0.4, 0, 0.4]) b.add('surf:wood', box(0.1, 0.1, 0.95), at(base, sx, 0.06, 0), 0x9a8462);
  if (r() > 0.3) b.add('plain:fabric', rbox(0.8, 0.5 + r() * 0.4, 0.8, 0.08), at(base, 0, 0.5, 0, r()), pickC(r, [0x5e543c, 0x4a4a3a, 0x3a3a34]));
};

export const deadTree: Build = (b, base, r) => {
  const trunk = 0x3a2e24;
  b.add('surf:wood', cyl(0.12, 0.22, 3.2, 8), at(base, 0, 1.6, 0, 0, 0.05), trunk);
  const branch = (ox: number, oy: number, oz: number, len: number, ang: number, tilt: number, depth: number) => {
    const ex = ox + Math.sin(ang) * Math.sin(tilt) * len, ey = oy + Math.cos(tilt) * len, ez = oz + Math.cos(ang) * Math.sin(tilt) * len;
    b.add('surf:wood', tube([V(ox, oy, oz), V((ox + ex) / 2 + (r() - 0.5) * 0.2, (oy + ey) / 2, (oz + ez) / 2), V(ex, ey, ez)], 0.05 * depth, 4, 5), base, trunk);
    if (depth > 1) for (let i = 0; i < 2; i++) branch(ex, ey, ez, len * 0.6, ang + (r() - 0.5) * 1.8, tilt + 0.2, depth - 1);
  };
  for (let i = 0; i < 4; i++) branch(0, 2.0 + i * 0.35, 0, 1.0 + r() * 0.5, r() * Math.PI * 2, 0.7 + r() * 0.4, 3);
};

export const bench: Build = (b, base, r) => {
  for (let i = 0; i < 3; i++) b.add('surf:wood', box(1.4, 0.04, 0.12), at(base, 0, 0.45, -0.14 + i * 0.14), 0x8a6a4a);
  for (const sx of [-0.6, 0.6]) b.add('plain:iron', box(0.05, 0.45, 0.4), at(base, sx, 0.22, 0), 0x2a2a2a);
  if (r() > 0.5) for (let i = 0; i < 2; i++) b.add('surf:wood', box(1.4, 0.04, 0.12), at(base, 0, 0.7 + i * 0.16, -0.24, 0, -0.15), 0x8a6a4a);
};

export const locker: Build = (b, base, r) => {
  for (let i = 0; i < 2; i++) {
    const x = -0.22 + i * 0.44;
    b.add('plain:paint', rbox(0.42, 1.9, 0.5, 0.01), at(base, x, 0.95, -0.2), PAINT_GREEN);
    const open = r() > 0.8;
    b.add('plain:paint', box(0.38, 1.8, 0.02), open ? at(base, x - 0.19, 0.95, 0.07, 1.2) : at(base, x, 0.95, 0.06), PAINT_GREEN);
    for (let s = 0; s < 3; s++) b.add('plain:paint', box(0.28, 0.01, 0.02), at(base, x, 1.6 + s * 0.04, 0.075), 0x222222);
  }
};

export const rubble: Build = (b, base, r) => {
  for (let i = 0; i < 9; i++) {
    const s = 0.12 + r() * 0.3;
    b.add('surf:concrete', rbox(s, s * 0.6, s * (0.7 + r() * 0.5), 0.03), at(base, (r() - 0.5) * 0.8, s * 0.25, (r() - 0.5) * 0.8, r() * 3, r() * 0.5, r() * 0.5), 0x9a9890);
  }
  for (let i = 0; i < 2; i++) b.add('surf:wood', box(0.08, 0.04, 1.0 + r() * 0.4), at(base, (r() - 0.5) * 0.5, 0.15 + r() * 0.2, 0, r() * 3, 0.3, 0.2), 0x7a6040);
};

export const fountain: Build = (b, base, r) => {
  // 2x2 footprint centred
  b.add('surf:stone', lathe([[0, 0], [1.3, 0], [1.3, 0.55], [1.15, 0.6], [1.1, 0.3], [0, 0.3]], 20), base, 0xa0a098);
  b.add('surf:stone', cyl(0.18, 0.25, 1.4, 10), at(base, 0, 0.7, 0), 0x9a9890);
  b.add('surf:stone', lathe([[0, 0], [0.55, 0.05], [0.6, 0.18], [0.5, 0.2], [0, 0.12]], 16), at(base, 0, 1.35, 0), 0x9a9890);
  b.add('surf:water', cyl(1.12, 1.12, 0.02, 20), at(base, 0, 0.45, 0), 0xffffff);
  void r;
};

export const roofVent: Build = (b, base) => {
  b.add('surf:riveted', rbox(0.8, 0.8, 0.8, 0.03), at(base, 0, 0.4, 0), 0x6a6a60);
  b.add('surf:metal', cyl(0.25, 0.25, 0.6, 12), at(base, 0, 1.1, 0), 0x777777);
  b.add('surf:metal', cone(0.4, 0.25, 12), at(base, 0, 1.55, 0), 0x777777);
};

function cone(r: number, h: number, s: number) { return new THREE.ConeGeometry(r, h, s); }

export const lightCage: Build = (b, base) => {
  b.add('plain:iron', cyl(0.005, 0.005, 0.5, 4), at(base, 0, 0.25, 0), 0x111111);
  b.add('plain:iron', cyl(0.035, 0.035, 0.08, 8), at(base, 0, -0.02, 0), 0x2a2a2a);
  for (let i = 0; i < 4; i++) b.add('plain:iron', torus(0.08, 0.006, 3, 10, Math.PI), at(base, 0, -0.08, 0, (i * Math.PI) / 4), 0x2a2a2a);
  b.add('plain:iron', torus(0.08, 0.006, 3, 12), at(base, 0, -0.08, 0, 0, Math.PI / 2), 0x2a2a2a);
};

export const surgicalLamp: Build = (b, base) => {
  b.add('plain:chrome', cyl(0.02, 0.02, 0.8, 6), at(base, 0, 0.4, 0), 0x888888);
  b.add('plain:paint', lathe([[0.02, 0.1], [0.3, 0.0], [0.45, -0.12], [0.42, -0.14], [0.0, -0.05]], 18), at(base, 0, -0.05, 0), PAINT_WHITE);
};

export const implantChair: Build = (b, base) => {
  const leather = 0x3a2416;
  b.add('plain:iron', cyl(0.18, 0.3, 0.5, 12), at(base, 0, 0.25, 0), 0x3a3a38);
  b.add('plain:fabric', rbox(0.6, 0.12, 0.6, 0.04), at(base, 0, 0.6, 0), leather);
  b.add('plain:fabric', rbox(0.6, 0.9, 0.12, 0.04), at(base, 0, 1.05, -0.3, 0, -0.2), leather);
  for (const sx of [-0.33, 0.33]) {
    b.add('plain:fabric', rbox(0.1, 0.08, 0.5, 0.03), at(base, sx, 0.82, -0.02), leather);
    b.add('plain:brass', torus(0.05, 0.012, 4, 10), at(base, sx, 0.86, 0.15, 0, Math.PI / 2), 0x8a6a30);
  }
  // halo of wires and the implant arm
  b.add('plain:brass', torus(0.22, 0.02, 6, 18), at(base, 0, 1.75, -0.25, 0, Math.PI / 2 - 0.3), 0xa06a30);
  for (let i = 0; i < 6; i++) {
    const a = (i / 6) * Math.PI * 2;
    b.add('plain:rubber', tube([V(Math.cos(a) * 0.22, 1.75 + Math.sin(a) * 0.05, -0.25 + Math.sin(a) * 0.2), V(Math.cos(a) * 0.4, 2.2, -0.5), V(Math.cos(a) * 0.3, 3.0, -0.6)], 0.012, 6, 4), base, 0x1a1a1a);
  }
  b.add('glow', sphere(0.04, 8, 6), at(base, 0, 1.75, -0.12), 0x1a7a7a);
};

export const notice: Build = (b, base) => {
  b.add('plain:paper', box(0.3, 0.4, 0.005), base, 0xd8ccaa);
};

// ---------------- themes ----------------
type Weighted = [Build, number][];
const THEMES: Record<PropTheme, Weighted> = {
  reception: [[desk, 3], [filingCabinet, 3], [chair, 2], [bench, 2], [crate, 1], [bookshelf, 1]],
  ward: [[filingCabinet, 2], [ivStand, 2], [privacyScreen, 2], [wheelchair, 1], [glassCabinet, 2], [chair, 1], [gurney, 1]],
  theater: [[instrumentTray, 3], [glassCabinet, 3], [ivStand, 1], [filingCabinet, 1], [gurney, 1]],
  boiler: [[barrel, 3], [crate, 2], [pipes, 3], [boiler, 2], [rubble, 1]],
  courtyard: [[deadTree, 2], [bench, 2], [sandbags, 3], [crate, 1], [rubble, 1]],
  library: [[bookshelf, 5], [desk, 1], [chair, 1]],
  dock: [[crate, 4], [barrel, 3], [pallet, 3], [cableSpool, 1]],
  assembly: [[conveyor, 3], [chipCrate, 3], [workbench, 2], [crate, 1]],
  generator: [[generator, 3], [capacitor, 2], [cableSpool, 2], [barrel, 1]],
  control: [[dialBank, 3], [reelComputer, 3], [radioConsole, 2], [desk, 1]],
  roof: [[roofVent, 3], [sandbags, 3], [crate, 2], [barrel, 1]],
  corridor: [[filingCabinet, 2], [locker, 2], [bench, 1], [crate, 1], [barrel, 1]],
  test: [[crate, 2], [barrel, 2], [filingCabinet, 1], [desk, 1], [sandbags, 1]],
};

export function themeProp(theme: PropTheme, r: RNG): Build {
  const list = THEMES[theme];
  let total = 0;
  for (const [, w] of list) total += w;
  let x = r() * total;
  for (const [f, w] of list) { x -= w; if (x <= 0) return f; }
  return list[0][0];
}

/** Two-cell props by theme (placed when two 'x' cells are adjacent). */
export const DOUBLE_PROPS: Partial<Record<PropTheme, Build[]>> = {
  ward: [bed, bed, gurney],
  theater: [operatingTable],
  reception: [desk],
  library: [bookshelf],
  corridor: [locker],
  boiler: [boiler],
};

/** Low cover props ('o' cells): block movement, not bullets. */
export const LOW_PROPS: Partial<Record<PropTheme, Build[]>> = {
  courtyard: [sandbags, bench],
  roof: [sandbags],
  dock: [pallet, sandbags],
};
