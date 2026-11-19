/**
 * Ground height for outdoor maps. Indoor maps are flat (0). The active World installs a
 * height field at build time; everything that stands on the ground (camera, Tethered,
 * decals, pickups, grenades, cutscene cameras) adds `groundY(x, z)`.
 *
 * The field is stored at cell corners and sampled bilinearly, so the static geometry warp
 * (applied once at build) and the runtime lookups agree exactly.
 */
export class HeightField {
  readonly data: Float32Array;
  constructor(readonly w: number, readonly h: number, fn: (x: number, z: number) => number) {
    this.data = new Float32Array((w + 1) * (h + 1));
    for (let j = 0; j <= h; j++) for (let i = 0; i <= w; i++) this.data[j * (w + 1) + i] = fn(i, j);
  }
  at(x: number, z: number): number {
    const w = this.w, h = this.h;
    const fx = Math.max(0, Math.min(w - 1e-4, x)), fz = Math.max(0, Math.min(h - 1e-4, z));
    const i = Math.floor(fx), j = Math.floor(fz);
    const tx = fx - i, tz = fz - j;
    const d = this.data, s = w + 1;
    const a = d[j * s + i], b = d[j * s + i + 1], c = d[(j + 1) * s + i], e = d[(j + 1) * s + i + 1];
    return (a * (1 - tx) + b * tx) * (1 - tz) + (c * (1 - tx) + e * tx) * tz;
  }
}

let active: HeightField | null = null;

export function setTerrain(hf: HeightField | null) { active = hf; }
export function getTerrain() { return active; }

/** Ground height at a world position (0 on flat maps). */
export function groundY(x: number, z: number): number {
  return active ? active.at(x, z) : 0;
}

/**
 * Distance along a downward ray (origin o, direction d with d.y < 0) to the ground, or
 * Infinity. Fixed-point refinement is exact on flat ground and converges fast on gentle hills.
 */
export function groundHitT(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number): number {
  if (dy > -1e-4) return Infinity;
  let t = (groundY(ox, oz) - oy) / dy;
  if (!active) return t;
  for (let k = 0; k < 4; k++) t = (groundY(ox + dx * t, oz + dz * t) - oy) / dy;
  return t;
}
