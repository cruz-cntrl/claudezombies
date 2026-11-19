import * as THREE from 'three';
import type { Game } from '../game';
import { audio } from '../audio/audioEngine';
import { K } from '../world/grid';
import { jagged } from '../render/fx';

/** Atmosphere: rain streaks, drifting dust, steam bursts, lightning, distant one-shots. */
export class AmbientFx {
  readonly group = new THREE.Group();
  private rain: THREE.LineSegments;
  private rainPos: Float32Array;
  private rainVel: Float32Array;
  private readonly N = 420;
  private dustT = 0;
  private steamT = 2;
  private oneShotT = 6;
  private lightningT = 8;
  private flash = 0;
  private steamSpots: { x: number; z: number }[] = [];
  private coils: THREE.Vector3[] = [];
  private arcT = 1;

  constructor(private g: Game) {
    this.rainPos = new Float32Array(this.N * 6);
    this.rainVel = new Float32Array(this.N);
    const geo = new THREE.BufferGeometry();
    geo.setAttribute('position', new THREE.BufferAttribute(this.rainPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.rain = new THREE.LineSegments(geo, new THREE.LineBasicMaterial({ color: 0x8a9aa8, transparent: true, opacity: 0.35, depthWrite: false }));
    this.rain.frustumCulled = false;
    this.group.add(this.rain);
    for (let i = 0; i < this.N; i++) this.respawn(i, true);
    const grid = g.world.grid;
    // capacitor tops in generator-themed zones arc to each other
    g.world.def.zones.forEach((z, zi) => {
      if (z.theme !== 'generator') return;
      for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++)
        if (grid.zoneAt(i, j) === zi && grid.kindAt(i, j) === K.PROP) this.coils.push(new THREE.Vector3(i + 0.5, 2.1, j + 0.5));
    });
    g.world.def.zones.forEach((z, zi) => {
      if (!z.steam) return;
      for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++)
        if (grid.zoneAt(i, j) === zi && grid.kindAt(i, j) === K.PROP) this.steamSpots.push({ x: i + 0.5, z: j + 0.5 });
    });
  }

  private rainy(x: number, z: number) {
    const zd = this.g.world.zoneDef(Math.floor(x), Math.floor(z));
    if (zd) return !!zd.rain || (!zd.ceiling && this.g.world.def.sky === 'storm');
    const k = this.g.world.grid.kindAt(Math.floor(x), Math.floor(z));
    return k === K.OUTSIDE && (this.g.world.def.sky === 'storm' || this.g.world.def.zones.some((zz) => zz.rain));
  }

  private respawn(i: number, randomY: boolean) {
    const p = this.g.player.pos;
    const x = p.x + (Math.random() - 0.5) * 22, z = p.z + (Math.random() - 0.5) * 22;
    const y = randomY ? Math.random() * 7 : 7 + Math.random() * 2;
    const ok = this.rainy(x, z);
    const o = i * 6;
    const yy = ok ? y : -50;
    this.rainPos[o] = x; this.rainPos[o + 1] = yy; this.rainPos[o + 2] = z;
    this.rainPos[o + 3] = x + 0.03; this.rainPos[o + 4] = yy - 0.45; this.rainPos[o + 5] = z + 0.02;
    this.rainVel[i] = 11 + Math.random() * 4;
  }

  update(dt: number) {
    const g = this.g, p = g.player.pos, fx = g.fx;
    // rain
    for (let i = 0; i < this.N; i++) {
      const o = i * 6;
      if (this.rainPos[o + 1] < -10) { if (Math.random() < 0.05) this.respawn(i, false); continue; }
      const dy = this.rainVel[i] * dt;
      this.rainPos[o + 1] -= dy; this.rainPos[o + 4] -= dy;
      this.rainPos[o] += dt * 0.6; this.rainPos[o + 3] += dt * 0.6;
      if (this.rainPos[o + 4] < 0) {
        if (Math.random() < 0.15) fx.alpha.spawn(this.rainPos[o], 0.03, this.rainPos[o + 2], 0, 0.6, 0, 0.25, 0.5, 0.55, 0.6, 0.3, 0.04, 2, 0, 1);
        this.respawn(i, false);
      }
    }
    (this.rain.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    // dust motes near the player (indoor)
    this.dustT -= dt;
    if (this.dustT <= 0) {
      this.dustT = 0.12 / g.r.preset.particles;
      const x = p.x + (Math.random() - 0.5) * 8, z = p.z + (Math.random() - 0.5) * 8;
      const zd = g.world.zoneDef(Math.floor(x), Math.floor(z));
      if (zd?.ceiling) fx.alpha.spawn(x, 0.4 + Math.random() * 2.4, z, (Math.random() - 0.5) * 0.1, (Math.random() - 0.4) * 0.05, (Math.random() - 0.5) * 0.1, 6, 0.9, 0.85, 0.7, 0.25, 0.018, 0, 0, 0);
    }
    // steam bursts
    this.steamT -= dt;
    if (this.steamT <= 0 && this.steamSpots.length) {
      this.steamT = 1.5 + Math.random() * 3;
      const s = this.steamSpots[Math.floor(Math.random() * this.steamSpots.length)];
      if (Math.hypot(s.x - p.x, s.z - p.z) < 16) {
        for (let k = 0; k < 10; k++) fx.alpha.spawn(s.x, 1.8 + Math.random() * 0.8, s.z, (Math.random() - 0.5) * 1.2, 0.6 + Math.random() * 0.6, (Math.random() - 0.5) * 1.2, 1.2 + Math.random(), 0.8, 0.8, 0.8, 0.22, 0.25, 4, -0.3, 1.2);
        if (Math.random() < 0.6) audio.play('amb_steam', { pos: { x: s.x, y: 2, z: s.z }, vol: 0.35, priority: 1 });
      }
    }
    // capacitor arcs (only once the power is on)
    this.arcT -= dt;
    if (this.arcT <= 0 && this.coils.length > 1 && g.powerOn) {
      this.arcT = 0.3 + Math.random() * 1.2;
      const a = this.coils[Math.floor(Math.random() * this.coils.length)];
      let b = a, bd = 1e9;
      for (const c of this.coils) { const d = c.distanceTo(a); if (c !== a && d < bd && d < 9 && Math.random() < 0.7) { bd = d; b = c; } }
      if (b !== a && Math.hypot(a.x - p.x, a.z - p.z) < 20) {
        fx.arc(jagged(a, b, 10, 0.5), 0.14, 0.04, 0x9ad8ff);
        fx.electric(b.x, b.y, b.z, 5, 0x9ad8ff);
        fx.flash(a.x, a.y + 0.5, a.z, 8, 0x9ad8ff);
        if (Math.random() < 0.6) audio.play('imp_arcZap', { pos: { x: a.x, y: a.y, z: a.z }, vol: 0.35, priority: 2 });
      }
    }
    // sparks from flickering fixtures
    for (const pr of g.world.practicals) {
      if (pr.burst > 0 && pr.flicker > 0.6 && Math.random() < dt * 3 && Math.hypot(pr.x - p.x, pr.z - p.z) < 12) {
        fx.sparks(pr.x, pr.y - 0.1, pr.z, 0, -1, 0, 4, 0xffd090, 1.5);
      }
    }
    // lightning
    const storm = g.world.def.sky === 'storm';
    const outdoorNearby = g.world.def.sky !== 'dusk' && g.world.def.zones.some((z) => !z.ceiling);
    this.lightningT -= dt;
    if (this.lightningT <= 0 && outdoorNearby) {
      this.lightningT = storm ? 6 + Math.random() * 10 : 14 + Math.random() * 22;
      this.flash = 1;
      const zd = g.world.zoneDef(Math.floor(p.x), Math.floor(p.z));
      audio.play('amb_thunder', { bus: 'sfx', vol: zd && !zd.ceiling ? 0.9 : 0.45, delay: 0.3 + Math.random() * 1.2, priority: 6 });
    }
    if (this.flash > 0) {
      this.flash = Math.max(0, this.flash - dt * 3);
      const f = this.flash > 0.6 || (this.flash > 0.2 && this.flash < 0.35) ? this.flash : 0;
      (g.world.sky.material as THREE.ShaderMaterial).uniforms.uFlash.value = f;
      const zd = g.world.zoneDef(Math.floor(p.x), Math.floor(p.z));
      if (f > 0 && zd && !zd.ceiling) fx.flash(p.x, 9, p.z, 25 * f, 0xb0c0ff);
    }
    // distant one-shots
    this.oneShotT -= dt;
    if (this.oneShotT <= 0) {
      this.oneShotT = 8 + Math.random() * 14;
      const a = Math.random() * 6.28;
      const zd = g.world.zoneDef(Math.floor(p.x), Math.floor(p.z));
      const name = zd?.water ? 'amb_drip' : 'amb_distant';
      audio.play(name, { pos: { x: p.x + Math.cos(a) * 6, y: 2, z: p.z + Math.sin(a) * 6 }, vol: zd?.water ? 0.5 : 0.4, priority: 1 });
    }
  }
}
