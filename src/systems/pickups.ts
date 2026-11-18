import * as THREE from 'three';
import type { Game } from '../game';
import { ECONOMY } from '../config/economy';
import { compose, rbox, cyl, M } from '../render/geometryKit';
import { MatLib } from '../render/matLib';
import { getSurface } from '../render/proceduralTextures';
import { audio } from '../audio/audioEngine';
import { bus } from '../core/events';
import type { Zombie } from '../entities/zombie';

interface Drop { tier: (typeof ECONOMY.ammoDropTiers)[number]; x: number; z: number; t: number; spin: number }

/**
 * Ammo drops: kills sometimes leave a tin of rounds. Size is random (small / medium /
 * large); walking over it tops up every weapon by that share of its max reserve.
 * Rendered as one InstancedMesh.
 */
export class Pickups {
  private drops: Drop[] = [];
  readonly mesh: THREE.InstancedMesh;
  private bake: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3();
  private probe = { r: 0, g: 0, b: 0 };

  constructor(private g: Game) {
    const geo = compose([
      [rbox(0.34, 0.16, 0.2, 0.02), M(0, 0.08, 0), 0x4a5236],
      [rbox(0.35, 0.03, 0.21, 0.01), M(0, 0.165, 0), 0x3a4228],
      [rbox(0.08, 0.04, 0.03, 0.01), M(0, 0.1, 0.105), 0xb09030],
      ...[0, 1, 2, 3, 4].map((k) => [cyl(0.012, 0.012, 0.07, 6), M(-0.08 + k * 0.04, 0.2, 0.03), 0xd0a040] as [THREE.BufferGeometry, THREE.Matrix4, number]),
    ]);
    const n = ECONOMY.maxAmmoDrops;
    this.bake = new THREE.InstancedBufferAttribute(new Float32Array(n * 3), 3);
    geo.setAttribute('instBake', this.bake);
    const metal = getSurface('metal');
    const mat = MatLib.instanced({ vertexColors: true, roughness: 0.5, metalness: 0.3, normalMap: metal.normalMap, emissive: new THREE.Color(0x221a08) });
    this.mesh = new THREE.InstancedMesh(geo, mat, n);
    this.mesh.frustumCulled = false;
    this.mesh.count = 0;
  }

  onKill(z: Zombie) {
    const tiers = ECONOMY.ammoDropTiers;
    let tier = null as Drop['tier'] | null;
    if (z.type === 'brute') tier = tiers[2];
    else if (Math.random() < ECONOMY.ammoDropChance * this.g.difficulty.dropRate * (z.type === 'hound' ? 0.6 : 1)) {
      let total = 0;
      for (const t of tiers) total += t.weight;
      let r = Math.random() * total;
      tier = tiers[0];
      for (const t of tiers) { r -= t.weight; if (r <= 0) { tier = t; break; } }
    }
    if (!tier) return;
    if (this.drops.length >= ECONOMY.maxAmmoDrops) this.drops.shift();
    this.drops.push({ tier, x: z.x, z: z.z, t: 0, spin: Math.random() * 6 });
  }

  /** Add `frac` of each weapon's max reserve. Returns rounds added to the current weapon. */
  private give(frac: number): number {
    const ws = this.g.weapons;
    let cur = 0;
    for (const w of ws.slots) {
      const room = w.stats.reserve - w.reserve;
      if (room <= 0) continue;
      const add = Math.min(room, Math.max(1, Math.round(w.stats.reserve * frac * (w.def.cls === 'wonder' ? 0.5 : 1))));
      w.reserve += add;
      if (w === ws.current) cur = add;
    }
    bus.emit('ammoChanged', {});
    return cur;
  }

  private hasRoom() { return this.g.weapons.slots.some((w) => w.reserve < w.stats.reserve); }

  update(dt: number) {
    const p = this.g.player.pos;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      if (d.t > ECONOMY.ammoDropLifetime) { this.drops.splice(i, 1); continue; }
      if (!this.g.player.downed && Math.hypot(p.x - d.x, p.z - d.z) < 1.0 && this.hasRoom()) {
        const n = this.give(d.tier.frac);
        this.drops.splice(i, 1);
        audio.play('mech_magIn', { bus: 'sfx', vol: 0.8, priority: 6 });
        audio.play('ui_puGrab', { bus: 'ui', vol: 0.35, rate: 1.3 });
        bus.emit('pickup', { text: n > 0 ? `+${n} AMMO` : 'AMMO', size: d.tier.id });
      }
    }
    // render
    for (let i = 0; i < this.drops.length; i++) {
      const d = this.drops[i];
      const blink = d.t > ECONOMY.ammoDropLifetime - 5 && Math.sin(d.t * 18) < 0;
      this.e.set(0, d.spin + d.t * 1.2, 0);
      this.q.setFromEuler(this.e);
      this.v.set(d.x, 0.06 + Math.sin(d.t * 3) * 0.04, d.z);
      this.s.setScalar(blink ? 0.001 : d.tier.scale);
      this.m.compose(this.v, this.q, this.s);
      this.mesh.setMatrixAt(i, this.m);
      this.g.world.baker.sample(d.x, d.z, this.probe);
      this.bake.setXYZ(i, this.probe.r * 1.4 + 0.05, this.probe.g * 1.4 + 0.04, this.probe.b * 1.4 + 0.02);
      if (Math.random() < dt * 3) this.g.fx.glowPuff(d.x + (Math.random() - 0.5) * 0.3, 0.3, d.z + (Math.random() - 0.5) * 0.3, 0xffc060, 0.07, 0.5);
    }
    this.mesh.count = this.drops.length;
    this.mesh.instanceMatrix.needsUpdate = true;
    this.bake.needsUpdate = true;
  }

  clear() { this.drops = []; this.mesh.count = 0; }
}
