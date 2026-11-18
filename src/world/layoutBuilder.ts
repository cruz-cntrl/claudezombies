/**
 * Programmatic map authoring: carve rooms, outside ground, walls, doors and named markers,
 * then emit the ASCII layout + marker ids consumed by Grid. Coordinates are cells (x = column, y = row).
 */
export class LayoutBuilder {
  readonly g: string[][];
  readonly markerIds: Record<string, string> = {};
  constructor(readonly w: number, readonly h: number) {
    this.g = Array.from({ length: h }, () => Array.from({ length: w }, () => ' '));
  }
  rect(x0: number, y0: number, x1: number, y1: number, ch: string) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.in(x, y)) this.g[y][x] = ch;
    return this;
  }
  /** Floor rectangle surrounded by walls (walls never overwrite existing floor/door cells). */
  room(x0: number, y0: number, x1: number, y1: number, letter: string) {
    for (let y = y0 - 1; y <= y1 + 1; y++) for (let x = x0 - 1; x <= x1 + 1; x++) {
      if (!this.in(x, y)) continue;
      const inside = x >= x0 && x <= x1 && y >= y0 && y <= y1;
      if (inside) this.g[y][x] = letter;
      else if (this.g[y][x] === ' ' || this.g[y][x] === ',') this.g[y][x] = '#';
    }
    return this;
  }
  set(x: number, y: number, ch: string, id?: string) {
    if (!this.in(x, y)) return this;
    this.g[y][x] = ch;
    if (id) this.markerIds[`${x},${y}`] = id;
    return this;
  }
  /** Ring of outside ground around the whole footprint (only over void cells). */
  outside(x0: number, y0: number, x1: number, y1: number) {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.in(x, y) && this.g[y][x] === ' ') this.g[y][x] = ',';
    return this;
  }
  fillVoid(x0: number, y0: number, x1: number, y1: number, ch = '#') {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) if (this.in(x, y) && this.g[y][x] === ' ') this.g[y][x] = ch;
    return this;
  }
  in(x: number, y: number) { return x >= 0 && y >= 0 && x < this.w && y < this.h; }
  build(): string[] { return this.g.map((r) => r.join('')); }
}
