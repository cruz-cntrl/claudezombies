/** Fixed-capacity object pool. Objects are created up front; acquire() returns null when exhausted. */
export class Pool<T> {
  readonly items: T[] = [];
  private free: T[] = [];
  constructor(factory: (i: number) => T, size: number) {
    for (let i = 0; i < size; i++) {
      const o = factory(i);
      this.items.push(o);
      this.free.push(o);
    }
  }
  acquire(): T | null { return this.free.pop() ?? null; }
  release(o: T): void { this.free.push(o); }
  get available() { return this.free.length; }
}

/** Ring buffer pool: always returns an item, recycling the oldest when full (decals, casings). */
export class RingPool<T> {
  readonly items: T[] = [];
  private idx = 0;
  constructor(factory: (i: number) => T, size: number) {
    for (let i = 0; i < size; i++) this.items.push(factory(i));
  }
  next(): T {
    const o = this.items[this.idx];
    this.idx = (this.idx + 1) % this.items.length;
    return o;
  }
}
