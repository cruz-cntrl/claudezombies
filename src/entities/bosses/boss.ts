import * as THREE from 'three';
import { bus } from '../../core/events';
import type { Game } from '../../game';
import { raySphere, rayCapsule } from '../zombie';

export type BossPart = 'crit' | 'body' | 'shield';
export interface BossHit { t: number; part: BossPart; x: number; y: number; z: number; shieldIdx?: number }

/** Shared boss plumbing: health bar events, hit shapes, probe-lit materials, defeat flow. */
export abstract class Boss {
  readonly group = new THREE.Group();
  hp: number;
  readonly maxHp: number;
  alive = true;
  phase = 1;
  time = 0;
  readonly pos = new THREE.Vector3();
  protected mats: THREE.MeshStandardMaterial[] = [];
  protected baseEmissive: THREE.Color[] = [];
  onDefeated: (() => void) | null = null;
  /** capsules / spheres for ray tests, updated by subclasses */
  protected spheres: { c: THREE.Vector3; r: number; part: BossPart; idx?: number }[] = [];
  protected capsules: { a: THREE.Vector3; b: THREE.Vector3; r: number; part: BossPart }[] = [];
  private probe = { r: 0, g: 0, b: 0 };
  deathT = -1;

  constructor(protected g: Game, readonly name: string, hp: number) {
    this.hp = this.maxHp = hp;
    g.r.scene.add(this.group);
    bus.emit('bossStart', { name });
    bus.emit('bossHealth', { frac: 1, phase: 1 });
  }

  protected mat(color: number, params: THREE.MeshStandardMaterialParameters = {}): THREE.MeshStandardMaterial {
    const m = new THREE.MeshStandardMaterial({ color, roughness: 0.7, metalness: 0.1, ...params });
    this.mats.push(m);
    this.baseEmissive.push(m.emissive.clone());
    return m;
  }

  /** Light the boss from the probe grid (it has no baked vertex light). */
  protected lightFromProbe() {
    this.g.world.baker.sample(this.pos.x, this.pos.z, this.probe);
    const k = 1.4;
    this.mats.forEach((m, i) => {
      const b = this.baseEmissive[i];
      m.emissive.setRGB(b.r + (this.probe.r * k + 0.04) * (m.color.r + 0.15), b.g + (this.probe.g * k + 0.04) * (m.color.g + 0.15), b.b + (this.probe.b * k + 0.05) * (m.color.b + 0.15));
    });
  }

  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number): BossHit | null {
    if (!this.alive) return null;
    let best = maxT, part: BossPart = 'body', idx: number | undefined;
    for (const s of this.spheres) {
      const t = raySphere(ox, oy, oz, dx, dy, dz, s.c.x, s.c.y, s.c.z, s.r);
      if (t >= 0 && t < best) { best = t; part = s.part; idx = s.idx; }
    }
    for (const c of this.capsules) {
      const t = rayCapsule(ox, oy, oz, dx, dy, dz, c.a, c.b, c.r);
      if (t >= 0 && t < best) { best = t; part = c.part; idx = undefined; }
    }
    if (best >= maxT) return null;
    return { t: best, part, x: ox + dx * best, y: oy + dy * best, z: oz + dz * best, shieldIdx: idx };
  }

  /** Apply damage. Returns true if this killed the boss. */
  damage(amount: number, part: BossPart, idx?: number): boolean {
    if (!this.alive) return false;
    if (part === 'shield') { this.damageShield(idx ?? 0, amount); return false; }
    if (!this.vulnerable(part)) { this.deflect(); return false; }
    this.hp -= amount;
    this.onHurt(amount, part);
    bus.emit('bossHealth', { frac: Math.max(0, this.hp / this.maxHp), phase: this.phase });
    if (this.hp <= 0) { this.die(); return true; }
    return false;
  }

  protected vulnerable(_part: BossPart) { return true; }
  /** Explosions near shield parts (pylons). */
  explodeAt(x: number, z: number, radius: number, damage: number) {
    for (const s of this.spheres) {
      if (s.part !== 'shield') continue;
      const d = Math.hypot(s.c.x - x, s.c.z - z);
      if (d < radius + 0.5) this.damage(damage * (1 - d / (radius + 0.5) * 0.5), 'shield', s.idx);
    }
  }
  protected damageShield(_idx: number, _amount: number) {}
  protected deflect() {}
  protected onHurt(_amount: number, _part: BossPart) {}

  protected die() {
    this.alive = false;
    this.deathT = 0;
    bus.emit('bossEnd', { name: this.name });
    this.onDefeated?.();
  }

  abstract update(dt: number): void;
  abstract center(): THREE.Vector3;

  dispose() {
    this.g.r.scene.remove(this.group);
    this.group.traverse((o) => { const m = o as THREE.Mesh; if (m.geometry) m.geometry.dispose(); });
    for (const m of this.mats) m.dispose();
  }
}
