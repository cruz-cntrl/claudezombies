import type { Grid } from './grid';

/**
 * Dijkstra flow field toward a target cell (the player). Costs: 10 orthogonal, 14 diagonal.
 * Diagonals are only allowed when both orthogonal neighbours are walkable (no corner cutting).
 * Recomputed only when the target changes cell (or the map changes, e.g. a door opens).
 */
export class FlowField {
  readonly dist: Uint32Array;
  private heap: Int32Array;
  private heapKey: Uint32Array;
  private heapSize = 0;
  targetI = -1;
  targetJ = -1;
  dirty = true;
  static readonly INF = 0xffffffff;

  constructor(private grid: Grid) {
    const n = grid.w * grid.h;
    this.dist = new Uint32Array(n);
    this.heap = new Int32Array(n * 8);
    this.heapKey = new Uint32Array(n * 8);
  }

  update(ti: number, tj: number) {
    if (!this.dirty && ti === this.targetI && tj === this.targetJ) return;
    this.dirty = false;
    this.targetI = ti; this.targetJ = tj;
    const g = this.grid, w = g.w;
    this.dist.fill(FlowField.INF);
    if (!g.zombiePass(ti, tj)) {
      // player standing on an odd cell: seed from walkable neighbours
      let seeded = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (g.zombiePass(ti + di, tj + dj)) { this.push((tj + dj) * w + ti + di, 5); this.dist[(tj + dj) * w + ti + di] = 5; seeded = true; }
      }
      if (!seeded) return;
    } else {
      const s = tj * w + ti;
      this.dist[s] = 0;
      this.push(s, 0);
    }
    while (this.heapSize > 0) {
      const key = this.heapKey[0];
      const c = this.pop();
      if (key > this.dist[c]) continue;
      const ci = c % w, cj = (c / w) | 0;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        if (di === 0 && dj === 0) continue;
        const ni = ci + di, nj = cj + dj;
        if (!g.zombiePass(ni, nj)) continue;
        let cost = 10;
        if (di !== 0 && dj !== 0) {
          if (!g.walkable(ci + di, cj) || !g.walkable(ci, cj + dj)) continue;
          cost = 14;
        }
        // clambering over low cover is slower than walking round it, unless the detour is long
        if (g.kindAt(ni, nj) !== 1) cost += 22;
        const nIdx = nj * w + ni;
        const nd = key + cost;
        if (nd < this.dist[nIdx]) { this.dist[nIdx] = nd; this.push(nIdx, nd); }
      }
    }
  }

  /**
   * Writes a steering direction for a world position into `out`. Uses the lowest-cost
   * neighbour; returns false if the cell is unreachable.
   */
  direction(x: number, z: number, out: { x: number; z: number }): boolean {
    const g = this.grid, w = g.w;
    const i = Math.floor(x), j = Math.floor(z);
    if (!g.inBounds(i, j)) return false;
    const here = this.dist[j * w + i];
    let best = here, bi = -99, bj = -99;
    for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
      if (di === 0 && dj === 0) continue;
      const ni = i + di, nj = j + dj;
      if (!g.inBounds(ni, nj)) continue;
      if (di !== 0 && dj !== 0 && (!g.walkable(i + di, j) || !g.walkable(i, j + dj))) continue;
      if (!g.zombiePass(ni, nj)) continue;
      const d = this.dist[nj * w + ni];
      if (d < best) { best = d; bi = ni; bj = nj; }
    }
    if (bi === -99) return false;
    const tx = bi + 0.5 - x, tz = bj + 0.5 - z;
    const l = Math.hypot(tx, tz) || 1;
    out.x = tx / l; out.z = tz / l;
    return true;
  }

  distanceAt(x: number, z: number) {
    const i = Math.floor(x), j = Math.floor(z);
    if (!this.grid.inBounds(i, j)) return FlowField.INF;
    return this.dist[j * this.grid.w + i];
  }

  private push(idx: number, key: number) {
    let n = this.heapSize++;
    if (n >= this.heap.length) { this.heapSize--; return; }
    while (n > 0) {
      const p = (n - 1) >> 1;
      if (this.heapKey[p] <= key) break;
      this.heap[n] = this.heap[p]; this.heapKey[n] = this.heapKey[p];
      n = p;
    }
    this.heap[n] = idx; this.heapKey[n] = key;
  }

  private pop(): number {
    const top = this.heap[0];
    const lastI = this.heap[--this.heapSize], lastK = this.heapKey[this.heapSize];
    let n = 0;
    const size = this.heapSize;
    while (true) {
      let c = 2 * n + 1;
      if (c >= size) break;
      if (c + 1 < size && this.heapKey[c + 1] < this.heapKey[c]) c++;
      if (this.heapKey[c] >= lastK) break;
      this.heap[n] = this.heap[c]; this.heapKey[n] = this.heapKey[c];
      n = c;
    }
    this.heap[n] = lastI; this.heapKey[n] = lastK;
    return top;
  }
}
