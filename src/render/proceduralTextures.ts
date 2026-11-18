import * as THREE from 'three';
import type { Surface } from '../world/mapTypes';
import type { SurfaceTextures } from './materials';

/**
 * Procedural PBR-ish surface generator. Every surface produces an albedo map, a normal map
 * (Sobel of a height field) and a roughness map. All patterns are tileable.
 * Generated once per session and cached.
 */

// ---------- tileable value noise ----------
function hash(x: number, y: number, s: number): number {
  let h = (Math.imul(x, 374761393) + Math.imul(y, 668265263) + Math.imul(s, 1442695041)) | 0;
  h = Math.imul(h ^ (h >>> 13), 1274126177);
  h ^= h >>> 16;
  return (h >>> 0) / 4294967296;
}
const fade = (t: number) => t * t * (3 - 2 * t);
function vnoise(x: number, y: number, period: number, seed: number): number {
  const xi = Math.floor(x), yi = Math.floor(y);
  const xf = x - xi, yf = y - yi;
  const x0 = ((xi % period) + period) % period, y0 = ((yi % period) + period) % period;
  const x1 = (x0 + 1) % period, y1 = (y0 + 1) % period;
  const a = hash(x0, y0, seed), b = hash(x1, y0, seed), c = hash(x0, y1, seed), d = hash(x1, y1, seed);
  const u = fade(xf), v = fade(yf);
  return a + (b - a) * u + (c - a) * v + (a - b - c + d) * u * v;
}
/** fbm on u,v in [0,1): base frequency f (integer), octaves */
export function fbm(u: number, v: number, f: number, oct: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    sum += vnoise(u * f, v * f, f, seed + o * 17) * amp;
    norm += amp;
    amp *= 0.5;
    f *= 2;
  }
  return sum / norm;
}
/** Anisotropic fbm (different frequency on each axis) — used for wood grain and drips. */
function fbm2(u: number, v: number, fu: number, fv: number, oct: number, seed: number): number {
  let sum = 0, amp = 0.5, norm = 0;
  for (let o = 0; o < oct; o++) {
    // tile in u with period fu and in v with fv: use separate periods via scaling
    const x = u * fu, y = v * fv;
    const xi = Math.floor(x), yi = Math.floor(y);
    const xf = x - xi, yf = y - yi;
    const x0 = ((xi % fu) + fu) % fu, y0 = ((yi % fv) + fv) % fv;
    const x1 = (x0 + 1) % fu, y1 = (y0 + 1) % fv;
    const s = seed + o * 31;
    const a = hash(x0, y0, s), b = hash(x1, y0, s), c = hash(x0, y1, s), d = hash(x1, y1, s);
    const uu = fade(xf), vv = fade(yf);
    sum += (a + (b - a) * uu + (c - a) * vv + (a - b - c + d) * uu * vv) * amp;
    norm += amp; amp *= 0.5; fu *= 2; fv *= 2;
  }
  return sum / norm;
}
const sstep = (a: number, b: number, x: number) => { const t = Math.min(1, Math.max(0, (x - a) / (b - a))); return t * t * (3 - 2 * t); };
const mix = (a: number, b: number, t: number) => a + (b - a) * t;

interface Px { r: number; g: number; b: number; h: number; rough: number }

/** Grid cell helper: returns local coords inside a cell of an nx*ny grid with optional row offset. */
function cell(u: number, v: number, nx: number, ny: number, rowOffset: number, jitterSeed = 0) {
  const row = Math.floor(v * ny);
  let x = u * nx + (row % 2) * rowOffset;
  if (jitterSeed) x += hash(row, 7, jitterSeed) * 0.5;
  const col = Math.floor(x);
  const fx = x - col, fy = v * ny - row;
  const ex = Math.min(fx, 1 - fx) / nx, ey = Math.min(fy, 1 - fy) / ny; // edge distance in uv units
  return { col: ((col % nx) + nx) % nx, row, fx, fy, edge: Math.min(ex, ey), ex, ey };
}

type Gen = (u: number, v: number, p: Px) => void;

const GENS: Record<Surface, { gen: Gen; normal: number; scale: number }> = {
  concrete: { scale: 3, normal: 2.2, gen: (u, v, p) => {
    const n = fbm(u, v, 4, 5, 11);
    const stain = sstep(0.55, 0.78, fbm(u, v, 2, 4, 23));
    const pit = sstep(0.78, 0.86, fbm(u, v, 32, 2, 37));
    const crackN = 1 - Math.abs(2 * fbm(u, v, 3, 5, 41) - 1);
    const crack = sstep(0.955, 0.985, crackN);
    let c = 0.38 + n * 0.16 - stain * 0.14 - crack * 0.2;
    p.r = c * 0.98; p.g = c * 0.97; p.b = c * 0.93;
    p.h = 0.5 + (n - 0.5) * 0.4 - pit * 0.35 - crack * 0.5;
    p.rough = 0.88 - stain * 0.15;
  } },
  tile: { scale: 2, normal: 3.0, gen: (u, v, p) => {
    const c = cell(u, v, 8, 8, 0);
    const grout = 1 - sstep(0.004, 0.009, c.edge);
    const tone = hash(c.col, c.row, 5);
    const checker = (c.col + c.row) % 2 === 0;
    const grime = sstep(0.4, 0.8, fbm(u, v, 3, 4, 7));
    const crackN = 1 - Math.abs(2 * fbm(u, v, 4, 4, 77) - 1);
    const cracked = hash(c.col, c.row, 99) > 0.7 ? sstep(0.95, 0.98, crackN) : 0;
    let r = checker ? 0.46 : 0.30, g = checker ? 0.50 : 0.35, b = checker ? 0.45 : 0.32;
    const k = 0.9 + tone * 0.2 - grime * 0.25 - cracked * 0.35;
    r *= k; g *= k; b *= k;
    const gc = 0.16 + fbm(u, v, 32, 2, 3) * 0.05;
    p.r = mix(r, gc, grout); p.g = mix(g, gc * 1.02, grout); p.b = mix(b, gc * 0.95, grout);
    const bevel = sstep(0.006, 0.02, c.edge);
    p.h = 0.3 + bevel * 0.5 - cracked * 0.3 + fbm(u, v, 16, 2, 9) * 0.05;
    p.rough = mix(0.35 + grime * 0.4, 0.95, grout);
  } },
  tileWall: { scale: 2, normal: 3.0, gen: (u, v, p) => {
    const c = cell(u, v, 6, 12, 0.5);
    const grout = 1 - sstep(0.003, 0.007, c.edge);
    const tone = hash(c.col, c.row, 15);
    const chipped = hash(c.col, c.row, 61) > 0.93;
    const chipMask = chipped ? sstep(0.45, 0.55, fbm(u, v, 12, 3, c.col * 7 + c.row)) : 0;
    const drip = sstep(0.55, 0.85, fbm2(u, v, 24, 2, 4, 19)) * 0.5;
    const grime = sstep(0.45, 0.8, fbm(u, v, 3, 4, 5));
    let r = 0.66, g = 0.71, b = 0.62;
    const k = 0.92 + tone * 0.12 - drip * 0.3 - grime * 0.25;
    r *= k; g *= k; b *= k;
    // chipped -> rough plaster
    r = mix(r, 0.32, chipMask); g = mix(g, 0.3, chipMask); b = mix(b, 0.26, chipMask);
    const gc = 0.22;
    p.r = mix(r, gc, grout); p.g = mix(g, gc, grout); p.b = mix(b, gc * 0.9, grout);
    p.h = 0.35 + sstep(0.004, 0.015, c.edge) * 0.5 - chipMask * 0.4;
    p.rough = mix(mix(0.25 + grime * 0.3, 0.9, chipMask), 0.9, grout);
  } },
  stone: { scale: 3, normal: 3.5, gen: (u, v, p) => {
    const c = cell(u, v, 4, 6, 0.5, 13);
    const mortar = 1 - sstep(0.006, 0.014, c.edge + (fbm(u, v, 16, 2, 3) - 0.5) * 0.008);
    const tone = hash(c.col, c.row, 21);
    const n = fbm(u, v, 8, 4, 31);
    const moss = sstep(0.62, 0.8, fbm(u, v, 4, 4, 51));
    let base = 0.3 + tone * 0.12 + (n - 0.5) * 0.2;
    p.r = mix(base * 1.02 - moss * 0.08, 0.17, mortar);
    p.g = mix(base * 1.0 + moss * 0.02, 0.17, mortar);
    p.b = mix(base * 0.94 - moss * 0.08, 0.15, mortar);
    p.h = mortar ? 0.25 * (1 - mortar) + (1 - mortar) * (0.6 + n * 0.3) : 0.6 + n * 0.3;
    p.h = mix(0.6 + n * 0.35, 0.15, mortar);
    p.rough = 0.9;
  } },
  wood: { scale: 2, normal: 2.0, gen: (u, v, p) => {
    const planks = 6;
    const row = Math.floor(v * planks);
    const off = hash(row, 3, 77);
    const x = (u + off) % 1;
    const seamEnd = Math.min(Math.abs(x - 0.5) * 2, 1);
    const fy = v * planks - row;
    const seam = 1 - sstep(0.02, 0.06, Math.min(fy, 1 - fy));
    const endSeam = 1 - sstep(0.002, 0.006, Math.abs(x - 0.999) < 0.5 ? Math.min(x, 1 - x) : 1);
    void seamEnd;
    const grain = fbm2(u, v, 2, 48, 4, 91 + row);
    const ring = Math.sin((grain * 18 + fbm2(u, v, 4, 8, 2, 12) * 6)) * 0.5 + 0.5;
    const tone = hash(row, 9, 55);
    const wear = sstep(0.5, 0.8, fbm(u, v, 4, 3, 33));
    let k = 0.55 + ring * 0.25 + tone * 0.25 - wear * 0.2;
    p.r = 0.33 * k; p.g = 0.21 * k; p.b = 0.12 * k;
    const s = Math.max(seam, endSeam);
    p.r = mix(p.r, 0.05, s); p.g = mix(p.g, 0.035, s); p.b = mix(p.b, 0.025, s);
    // nails
    const nx = (x * 4) % 1, ny = fy;
    const nail = (Math.hypot(nx - 0.5, ny - 0.5) < 0.05 && Math.floor(x * 4) % 2 === 0) ? 1 : 0;
    if (nail) { p.r = 0.12; p.g = 0.11; p.b = 0.1; }
    p.h = 0.6 + ring * 0.08 - s * 0.5 + nail * 0.2;
    p.rough = 0.7 + wear * 0.15;
  } },
  metal: { scale: 2, normal: 1.8, gen: (u, v, p) => {
    const n = fbm(u, v, 6, 5, 3);
    const rust = sstep(0.5, 0.7, fbm(u, v, 3, 5, 17) + (n - 0.5) * 0.3);
    const scratch = sstep(0.82, 0.9, fbm2(u, v, 64, 4, 3, 13)) * 0.6;
    const base = 0.28 + n * 0.08 + scratch * 0.15;
    p.r = mix(base, 0.36 + n * 0.1, rust);
    p.g = mix(base * 1.02, 0.18 + n * 0.05, rust);
    p.b = mix(base * 1.05, 0.08, rust);
    p.h = 0.5 + rust * (n - 0.3) * 0.5;
    p.rough = mix(0.45 - scratch * 0.2, 0.92, rust);
  } },
  riveted: { scale: 2, normal: 3.0, gen: (u, v, p) => {
    const c = cell(u, v, 2, 2, 0);
    const seam = 1 - sstep(0.002, 0.006, c.edge);
    // rivets along panel edges
    const rx = c.fx * 10, ry = c.fy * 10;
    const nearEdgeX = c.fx < 0.06 || c.fx > 0.94, nearEdgeY = c.fy < 0.06 || c.fy > 0.94;
    let rivet = 0;
    if (nearEdgeX || nearEdgeY) {
      const lx = nearEdgeY ? (rx % 1) : (c.fx < 0.5 ? c.fx * 10 * 0.5 + 0.5 - 0.15 : (1 - c.fx) * 10 * 0.5 + 0.5 - 0.15);
      const ly = nearEdgeX ? (ry % 1) : (c.fy < 0.5 ? c.fy * 10 * 0.5 + 0.5 - 0.15 : (1 - c.fy) * 10 * 0.5 + 0.5 - 0.15);
      const d = Math.hypot(lx - 0.5, ly - 0.5);
      rivet = 1 - sstep(0.12, 0.2, d);
    }
    const n = fbm(u, v, 6, 4, 8);
    const chip = sstep(0.62, 0.7, fbm(u, v, 8, 4, 44));
    const rust = sstep(0.55, 0.8, fbm2(u, v, 16, 3, 3, 71)) * (1 - chip) * 0.6;
    let r = 0.22 + n * 0.06, g = 0.28 + n * 0.06, b = 0.3 + n * 0.05; // teal-grey paint
    r = mix(r, 0.34, chip); g = mix(g, 0.2, chip); b = mix(b, 0.12, chip);
    r = mix(r, 0.3, rust); g = mix(g, 0.17, rust); b = mix(b, 0.09, rust);
    const k = 1 - seam * 0.6 + rivet * 0.15;
    p.r = r * k; p.g = g * k; p.b = b * k;
    p.h = 0.5 - seam * 0.4 + rivet * 0.45 - chip * 0.08;
    p.rough = mix(0.55, 0.9, Math.max(chip, rust));
  } },
  grate: { scale: 1.5, normal: 3.5, gen: (u, v, p) => {
    const nx = 10, ny = 10;
    const x = u * nx, y = v * ny;
    const cx = Math.floor(x), cy = Math.floor(y);
    let fx = x - cx - 0.5, fy = y - cy - 0.5;
    if ((cx + cy) % 2) { const t = fx; fx = fy; fy = -t; }
    const d = Math.abs(fx + fy) * 0.7 + Math.abs(fx - fy) * 0.18;
    const raised = 1 - sstep(0.12, 0.18, d);
    const n = fbm(u, v, 8, 4, 2);
    const grime = sstep(0.4, 0.75, fbm(u, v, 3, 4, 6));
    const base = 0.3 + n * 0.08 + raised * 0.1 - grime * 0.12;
    p.r = base; p.g = base * 0.99; p.b = base * 0.97;
    p.h = 0.4 + raised * 0.5;
    p.rough = 0.5 + grime * 0.35 - raised * 0.15;
  } },
  dirt: { scale: 4, normal: 2.5, gen: (u, v, p) => {
    const n = fbm(u, v, 4, 5, 61);
    const puddle = sstep(0.62, 0.68, fbm(u, v, 2, 3, 63));
    const pebble = sstep(0.7, 0.78, fbm(u, v, 24, 2, 65));
    const k = 0.75 + n * 0.5;
    p.r = 0.17 * k + pebble * 0.08; p.g = 0.13 * k + pebble * 0.07; p.b = 0.09 * k + pebble * 0.06;
    p.r *= 1 - puddle * 0.4; p.g *= 1 - puddle * 0.4; p.b *= 1 - puddle * 0.35;
    p.h = 0.5 + (n - 0.5) * 0.6 + pebble * 0.3 - puddle * 0.2;
    p.rough = mix(0.95, 0.12, puddle);
  } },
  grass: { scale: 4, normal: 2.5, gen: (u, v, p) => {
    const n = fbm(u, v, 4, 5, 71);
    const blades = fbm2(u, v, 128, 16, 2, 72);
    const mud = sstep(0.55, 0.7, fbm(u, v, 3, 4, 73));
    const k = 0.7 + n * 0.4 + blades * 0.3;
    p.r = mix(0.12 * k, 0.15 * k, mud); p.g = mix(0.14 * k, 0.11 * k, mud); p.b = mix(0.07 * k, 0.07 * k, mud);
    p.h = 0.5 + blades * 0.3 - mud * 0.2;
    p.rough = mix(0.9, 0.5, mud * 0.5);
  } },
  plaster: { scale: 3, normal: 2.6, gen: (u, v, p) => {
    const n = fbm(u, v, 6, 5, 81);
    const peelN = fbm(u, v, 4, 5, 83);
    const peel = sstep(0.62, 0.64, peelN);
    const rim = sstep(0.6, 0.62, peelN) * (1 - peel);
    const stain = sstep(0.5, 0.8, fbm2(u, v, 6, 2, 4, 85)) * 0.6;
    // under: brick
    const bc = cell(u, v, 6, 16, 0.5);
    const mortar = 1 - sstep(0.003, 0.006, bc.edge);
    const bt = hash(bc.col, bc.row, 87);
    let ur = mix(0.36 + bt * 0.1, 0.24, mortar), ug = mix(0.2 + bt * 0.05, 0.22, mortar), ub = mix(0.14, 0.2, mortar);
    let r = 0.58 + n * 0.1, g = 0.6 + n * 0.1, b = 0.52 + n * 0.08;
    r -= stain * 0.22; g -= stain * 0.25; b -= stain * 0.28;
    r -= rim * 0.2; g -= rim * 0.2; b -= rim * 0.2;
    p.r = mix(r, ur, peel); p.g = mix(g, ug, peel); p.b = mix(b, ub, peel);
    p.h = mix(0.7 + n * 0.1 + rim * 0.15, 0.3 - mortar * 0.15, peel);
    p.rough = 0.9;
  } },
  wallpaper: { scale: 2, normal: 1.6, gen: (u, v, p) => {
    const stripe = Math.sin(u * Math.PI * 2 * 8) * 0.5 + 0.5;
    const mx = (u * 8) % 1, my = (v * 4) % 1;
    const motif = Math.max(0, 1 - Math.hypot((mx - 0.5) * 1.6, (my - 0.5) * 1.0 + Math.sin(mx * 6.28) * 0.12) * 3.2);
    const fadeN = fbm(u, v, 3, 4, 91);
    const peelN = fbm(u, v, 3, 5, 93);
    const peel = sstep(0.66, 0.68, peelN);
    const stain = sstep(0.52, 0.85, fbm2(u, v, 5, 2, 4, 95)) * 0.7;
    let r = 0.34 + stripe * 0.04 + motif * 0.1, g = 0.36 + stripe * 0.05 + motif * 0.08, b = 0.24 + motif * 0.03;
    const k = 0.85 + fadeN * 0.3;
    r *= k; g *= k; b *= k;
    r -= stain * 0.14; g -= stain * 0.16; b -= stain * 0.12;
    const pr = 0.45 + fadeN * 0.1;
    p.r = mix(r, pr, peel); p.g = mix(g, pr * 0.95, peel); p.b = mix(b, pr * 0.82, peel);
    p.h = mix(0.6 + motif * 0.05, 0.4, peel);
    p.rough = 0.85;
  } },
  brick: { scale: 2.5, normal: 3.2, gen: (u, v, p) => {
    const c = cell(u, v, 5, 14, 0.5);
    const mortar = 1 - sstep(0.004, 0.009, c.edge + (fbm(u, v, 24, 2, 4) - 0.5) * 0.004);
    const t = hash(c.col, c.row, 101);
    const n = fbm(u, v, 12, 3, 103);
    const soot = sstep(0.5, 0.85, fbm(u, v, 3, 4, 105)) * 0.5;
    let r = 0.36 + t * 0.12 + n * 0.08, g = 0.17 + t * 0.05 + n * 0.04, b = 0.12 + n * 0.03;
    r *= 1 - soot; g *= 1 - soot; b *= 1 - soot;
    p.r = mix(r, 0.28, mortar); p.g = mix(g, 0.26, mortar); p.b = mix(b, 0.23, mortar);
    p.h = mix(0.65 + n * 0.2, 0.2, mortar);
    p.rough = 0.88;
  } },
  ceilingTile: { scale: 2.4, normal: 2.0, gen: (u, v, p) => {
    const c = cell(u, v, 4, 4, 0);
    const frame = 1 - sstep(0.004, 0.008, c.edge);
    const holes = (hash(Math.floor(u * 96), Math.floor(v * 96), 111) > 0.8) ? 1 : 0;
    const stain = sstep(0.55, 0.8, fbm(u, v, 3, 4, 113));
    const missing = hash(c.col, c.row, 117) > 0.88 ? 1 : 0;
    let base = 0.48 - holes * 0.08 - stain * 0.2;
    if (missing) base = 0.05;
    p.r = mix(base, 0.18, frame); p.g = mix(base * 0.98, 0.18, frame); p.b = mix(base * 0.9, 0.17, frame);
    p.h = mix(missing ? 0.1 : 0.6 - holes * 0.2, 0.75, frame);
    p.rough = 0.95;
  } },
  water: { scale: 4, normal: 1.2, gen: (u, v, p) => {
    const n = fbm(u, v, 4, 5, 121);
    p.r = 0.03; p.g = 0.05; p.b = 0.05;
    p.h = n;
    p.rough = 0.05;
  } },
};

export function surfaceScale(s: Surface) { return GENS[s].scale; }

function buildTextures(s: Surface, size: number): SurfaceTextures {
  const g = GENS[s];
  const n = size * size;
  const albedo = new Uint8Array(n * 4);
  const rough = new Uint8Array(n * 4);
  const height = new Float32Array(n);
  const px: Px = { r: 0, g: 0, b: 0, h: 0, rough: 0 };
  for (let y = 0; y < size; y++) {
    const v = (y + 0.5) / size;
    for (let x = 0; x < size; x++) {
      const u = (x + 0.5) / size;
      g.gen(u, v, px);
      const i = y * size + x;
      // albedo values are authored roughly in linear-ish space; store as sRGB
      albedo[i * 4] = toSrgb8(px.r);
      albedo[i * 4 + 1] = toSrgb8(px.g);
      albedo[i * 4 + 2] = toSrgb8(px.b);
      albedo[i * 4 + 3] = 255;
      height[i] = px.h;
      const rr = Math.max(0, Math.min(255, px.rough * 255)) | 0;
      rough[i * 4] = rr; rough[i * 4 + 1] = rr; rough[i * 4 + 2] = rr; rough[i * 4 + 3] = 255;
    }
  }
  const normal = new Uint8Array(n * 4);
  const str = g.normal * (size / 512) * 2;
  for (let y = 0; y < size; y++) {
    const ym = ((y - 1 + size) % size) * size, y0 = y * size, yp = ((y + 1) % size) * size;
    for (let x = 0; x < size; x++) {
      const xm = (x - 1 + size) % size, xp = (x + 1) % size;
      const dx = (height[ym + xp] + 2 * height[y0 + xp] + height[yp + xp]) - (height[ym + xm] + 2 * height[y0 + xm] + height[yp + xm]);
      const dy = (height[yp + xm] + 2 * height[yp + x] + height[yp + xp]) - (height[ym + xm] + 2 * height[ym + x] + height[ym + xp]);
      let nx = -dx * str, ny = dy * str, nz = 1;
      const l = Math.hypot(nx, ny, nz);
      nx /= l; ny /= l; nz /= l;
      const i = (y0 + x) * 4;
      normal[i] = (nx * 0.5 + 0.5) * 255;
      normal[i + 1] = (ny * 0.5 + 0.5) * 255;
      normal[i + 2] = (nz * 0.5 + 0.5) * 255;
      normal[i + 3] = 255;
    }
  }
  return {
    map: dataTex(albedo, size, true),
    normalMap: dataTex(normal, size, false),
    roughnessMap: dataTex(rough, size, false),
  };
}

function toSrgb8(v: number) {
  v = Math.max(0, Math.min(1, v));
  // authored values are perceptual; small gamma lift keeps darks from crushing
  return Math.round(Math.pow(v, 0.85) * 255);
}

export function dataTex(data: Uint8Array, size: number, srgb: boolean, h = size): THREE.DataTexture {
  const t = new THREE.DataTexture(data, size, h, THREE.RGBAFormat);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.generateMipmaps = true;
  t.minFilter = THREE.LinearMipmapLinearFilter;
  t.magFilter = THREE.LinearFilter;
  t.anisotropy = 4;
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.needsUpdate = true;
  return t;
}

const cache = new Map<Surface, SurfaceTextures>();
let texSize = 512;
export function setTextureSize(s: number) { texSize = s; }

export function getSurface(s: Surface): SurfaceTextures {
  let t = cache.get(s);
  if (!t) { t = buildTextures(s, texSize); cache.set(s, t); }
  return t;
}

/** Generate a batch of surfaces, yielding to the browser between each for the loading bar. */
export async function generateSurfaces(list: Surface[], onProgress: (f: number) => void) {
  const uniq = [...new Set(list)].filter((s) => !cache.has(s));
  for (let i = 0; i < uniq.length; i++) {
    getSurface(uniq[i]);
    onProgress((i + 1) / uniq.length);
    await new Promise((r) => setTimeout(r, 0));
  }
  onProgress(1);
}
