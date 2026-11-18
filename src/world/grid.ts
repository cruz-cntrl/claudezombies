import type { MapDef } from './mapTypes';

/** Cell kinds */
export const enum K {
  VOID = 0, FLOOR = 1, WALL = 2, OUTSIDE = 3, WINDOW = 4, DOOR = 5, PROP = 6, MACHINE = 7, LOW = 8,
}

export interface Marker { ch: string; i: number; j: number; zone: number; index: number; facing: number }
export interface WindowCell {
  i: number; j: number; zone: number;
  /** inward normal (from outside to inside), unit grid axis */
  nx: number; nz: number;
}
export interface DoorCells { id: string; cells: number[]; zones: Set<number> }

/**
 * Uniform grid (1 m cells) built from a MapDef ASCII layout.
 * Provides movement collision, 2D ray casts (DDA) and zone lookups.
 */
export class Grid {
  readonly w: number;
  readonly h: number;
  readonly kind: Uint8Array;
  readonly zone: Int8Array;
  readonly markers: Marker[] = [];
  readonly windows: WindowCell[] = [];
  readonly doors = new Map<string, DoorCells>();
  readonly vents: { i: number; j: number; zone: number }[] = [];
  start = { i: 1, j: 1 };
  /** door cells store their id char here (0 if none) */
  readonly doorId: Uint8Array;

  constructor(readonly def: MapDef) {
    const rows = def.layout;
    this.h = rows.length;
    this.w = Math.max(...rows.map((r) => r.length));
    const n = this.w * this.h;
    this.kind = new Uint8Array(n);
    this.zone = new Int8Array(n).fill(-1);
    this.doorId = new Uint8Array(n);
    const letters = def.zones.map((z) => z.letter);
    const counters: Record<string, number> = {};

    for (let j = 0; j < this.h; j++) {
      const row = rows[j];
      for (let i = 0; i < this.w; i++) {
        const ch = row[i] ?? ' ';
        const idx = j * this.w + i;
        const zi = letters.indexOf(ch);
        if (zi >= 0) { this.kind[idx] = K.FLOOR; this.zone[idx] = zi; continue; }
        switch (ch) {
          case ' ': this.kind[idx] = K.VOID; break;
          case '#': this.kind[idx] = K.WALL; break;
          case ',': this.kind[idx] = K.OUTSIDE; break;
          case 'w': this.kind[idx] = K.WINDOW; break;
          case '*': this.kind[idx] = K.FLOOR; this.start = { i, j }; break;
          case 'v': this.kind[idx] = K.FLOOR; this.vents.push({ i, j, zone: -1 }); break;
          case 'x': this.kind[idx] = K.PROP; this.pushMarker(ch, i, j, counters); break;
          case 'o': this.kind[idx] = K.LOW; this.pushMarker(ch, i, j, counters); break;
          case 'p': case 'c': case 'r':
            this.kind[idx] = K.MACHINE; this.pushMarker(ch, i, j, counters); break;
          case 'b': case 's': case 'e': case 'l':
            this.kind[idx] = K.FLOOR; this.pushMarker(ch, i, j, counters); break;
          default:
            if (ch >= '1' && ch <= '9') {
              this.kind[idx] = K.DOOR;
              this.doorId[idx] = ch.charCodeAt(0);
              let d = this.doors.get(ch);
              if (!d) { d = { id: ch, cells: [], zones: new Set() }; this.doors.set(ch, d); }
              d.cells.push(idx);
            } else {
              this.kind[idx] = K.WALL;
            }
        }
      }
    }
    this.fillZones();
    for (const m of this.markers) m.zone = this.zone[m.j * this.w + m.i];
    for (const m of this.markers) m.facing = this.computeFacing(m.i, m.j);
    for (const v of this.vents) v.zone = this.zone[v.j * this.w + v.i];
    // doors: adjacent zones
    for (const d of this.doors.values()) {
      for (const c of d.cells) {
        const i = c % this.w, j = (c / this.w) | 0;
        for (const [di, dj] of DIRS4) {
          const z = this.zoneAt(i + di, j + dj);
          if (z >= 0) d.zones.add(z);
        }
      }
      for (const c of d.cells) this.zone[c] = [...d.zones][0] ?? -1;
    }
    // windows
    for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
      if (this.kind[j * this.w + i] !== K.WINDOW) continue;
      for (const [di, dj] of DIRS4) {
        const inside = this.kindAt(i + di, j + dj);
        const outside = this.kindAt(i - di, j - dj);
        if (inside !== K.OUTSIDE && inside !== K.WALL && inside !== K.VOID && inside !== K.WINDOW && outside === K.OUTSIDE) {
          const z = this.zoneAt(i + di, j + dj);
          this.windows.push({ i, j, zone: z, nx: di, nz: dj });
          this.zone[j * this.w + i] = z;
          break;
        }
      }
    }
  }

  private pushMarker(ch: string, i: number, j: number, counters: Record<string, number>) {
    const index = counters[ch] ?? 0;
    counters[ch] = index + 1;
    this.markers.push({ ch, i, j, zone: -1, index, facing: 0 });
  }

  /** Spread zone ids from lettered floor cells into marker/start/vent cells. */
  private fillZones() {
    let changed = true;
    let guard = 0;
    while (changed && guard++ < 200) {
      changed = false;
      for (let j = 0; j < this.h; j++) for (let i = 0; i < this.w; i++) {
        const idx = j * this.w + i;
        const k = this.kind[idx];
        if (this.zone[idx] >= 0) continue;
        if (k !== K.FLOOR && k !== K.PROP && k !== K.MACHINE && k !== K.LOW) continue;
        for (const [di, dj] of DIRS4) {
          const ni = i + di, nj = j + dj;
          const nk = this.kindAt(ni, nj);
          if (nk === K.DOOR || nk === K.WALL || nk === K.VOID || nk === K.WINDOW || nk === K.OUTSIDE) continue;
          const z = this.zoneAt(ni, nj);
          if (z >= 0) { this.zone[idx] = z; changed = true; break; }
        }
      }
    }
  }

  /** Facing angle (yaw) pointing away from the nearest adjacent wall, toward open floor. */
  private computeFacing(i: number, j: number): number {
    // prefer the direction with walkable floor where the opposite side is wall
    let best = 0, bestScore = -1;
    const yaws = [Math.PI, 0, -Math.PI / 2, Math.PI / 2]; // facing +z? see mapping below
    // yaw convention: object faces direction (sin(yaw), cos(yaw)) in xz => yaw 0 faces +z
    const dirs: [number, number, number][] = [[0, 1, 0], [0, -1, Math.PI], [1, 0, Math.PI / 2], [-1, 0, -Math.PI / 2]];
    void yaws;
    for (const [di, dj, yaw] of dirs) {
      const front = this.kindAt(i + di, j + dj);
      const back = this.kindAt(i - di, j - dj);
      let s = 0;
      if (front === K.FLOOR || front === K.DOOR) s += 2;
      if (back === K.WALL || back === K.WINDOW) s += 3;
      if (s > bestScore) { bestScore = s; best = yaw; }
    }
    return best;
  }

  idx(i: number, j: number) { return j * this.w + i; }
  inBounds(i: number, j: number) { return i >= 0 && j >= 0 && i < this.w && j < this.h; }
  kindAt(i: number, j: number): number { return this.inBounds(i, j) ? this.kind[j * this.w + i] : K.VOID; }
  zoneAt(i: number, j: number): number { return this.inBounds(i, j) ? this.zone[j * this.w + i] : -1; }
  zoneAtPos(x: number, z: number) { return this.zoneAt(Math.floor(x), Math.floor(z)); }

  /** Blocks the player */
  solidForPlayer(i: number, j: number): boolean {
    const k = this.kindAt(i, j);
    return k !== K.FLOOR;
  }
  /** Walkable for zombies inside the building */
  walkable(i: number, j: number): boolean {
    return this.kindAt(i, j) === K.FLOOR;
  }
  /** Outside ground walkable by zombies before entering */
  walkableOutside(i: number, j: number): boolean {
    return this.kindAt(i, j) === K.OUTSIDE;
  }
  blocksShot(i: number, j: number): boolean {
    const k = this.kindAt(i, j);
    return k === K.WALL || k === K.DOOR || k === K.PROP || k === K.MACHINE || k === K.VOID;
  }

  openDoor(id: string) {
    const d = this.doors.get(id);
    if (!d) return;
    for (const c of d.cells) this.kind[c] = K.FLOOR;
  }

  /**
   * Resolve a circle against solid cells (in place). `solid` decides which cells collide.
   * Returns true if a collision happened.
   */
  collideCircle(pos: { x: number; z: number }, r: number, solid: (i: number, j: number) => boolean): boolean {
    let hit = false;
    const i0 = Math.floor(pos.x - r), i1 = Math.floor(pos.x + r);
    const j0 = Math.floor(pos.z - r), j1 = Math.floor(pos.z + r);
    for (let j = j0; j <= j1; j++) for (let i = i0; i <= i1; i++) {
      if (!solid(i, j)) continue;
      const cx = Math.max(i, Math.min(pos.x, i + 1));
      const cz = Math.max(j, Math.min(pos.z, j + 1));
      let dx = pos.x - cx, dz = pos.z - cz;
      const d2 = dx * dx + dz * dz;
      if (d2 < r * r) {
        hit = true;
        if (d2 > 1e-8) {
          const d = Math.sqrt(d2);
          const push = r - d;
          pos.x += (dx / d) * push;
          pos.z += (dz / d) * push;
        } else {
          // centre inside the cell: push out along the shortest axis
          const left = pos.x - i, right = i + 1 - pos.x, top = pos.z - j, bot = j + 1 - pos.z;
          const m = Math.min(left, right, top, bot);
          if (m === left) pos.x = i - r; else if (m === right) pos.x = i + 1 + r;
          else if (m === top) pos.z = j - r; else pos.z = j + 1 + r;
          dx = dz = 0;
        }
      }
    }
    return hit;
  }

  /**
   * 2D DDA ray cast through the grid. Returns the distance (in the xz plane) to the first
   * shot-blocking cell, or maxDist. Also writes the hit normal into `out` if provided.
   */
  raycast(ox: number, oz: number, dx: number, dz: number, maxDist: number,
    out?: { nx: number; nz: number; i: number; j: number }, blocker = (i: number, j: number) => this.blocksShot(i, j)): number {
    const len = Math.hypot(dx, dz);
    if (len < 1e-9) return maxDist;
    dx /= len; dz /= len;
    let i = Math.floor(ox), j = Math.floor(oz);
    const stepI = dx > 0 ? 1 : -1, stepJ = dz > 0 ? 1 : -1;
    const tDeltaX = Math.abs(1 / dx), tDeltaZ = Math.abs(1 / dz);
    let tMaxX = dx > 0 ? (i + 1 - ox) * tDeltaX : (ox - i) * tDeltaX;
    let tMaxZ = dz > 0 ? (j + 1 - oz) * tDeltaZ : (oz - j) * tDeltaZ;
    if (!isFinite(tMaxX)) tMaxX = Infinity;
    if (!isFinite(tMaxZ)) tMaxZ = Infinity;
    let t = 0;
    let side = 0;
    for (let n = 0; n < 512; n++) {
      if (tMaxX < tMaxZ) { t = tMaxX; tMaxX += tDeltaX; i += stepI; side = 0; }
      else { t = tMaxZ; tMaxZ += tDeltaZ; j += stepJ; side = 1; }
      if (t > maxDist) return maxDist;
      if (blocker(i, j)) {
        if (out) {
          out.i = i; out.j = j;
          if (side === 0) { out.nx = -stepI; out.nz = 0; } else { out.nx = 0; out.nz = -stepJ; }
        }
        return t;
      }
    }
    return maxDist;
  }

  /** Line of sight between two points (shot-blocking cells only). */
  los(ax: number, az: number, bx: number, bz: number): boolean {
    const d = Math.hypot(bx - ax, bz - az);
    return this.raycast(ax, az, bx - ax, bz - az, d) >= d - 1e-4;
  }
}

export const DIRS4: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
export const DIRS8: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1], [1, 1], [1, -1], [-1, 1], [-1, -1]];
