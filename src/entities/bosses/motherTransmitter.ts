import * as THREE from 'three';
import { Boss, type BossPart } from './boss';
import type { Game } from '../../game';
import { BOSS } from '../../config/enemies';
import { audio } from '../../audio/audioEngine';
import { bus } from '../../core/events';
import { clamp, rand, wrapAngle } from '../../core/math';
import { jagged } from '../../render/fx';
import { compose, M, sphere, cyl, torus, rbox, lathe } from '../../render/geometryKit';

interface Pylon { pos: THREE.Vector3; hp: number; mesh: THREE.Group; alive: boolean; glow: THREE.Mesh }
interface Ring { r: number; gap: number; mesh: THREE.Mesh; hit: boolean }

/**
 * THE MOTHER TRANSMITTER — machine fused with Tethered flesh.
 *  Phase 1: rooted, protected by 3 shield pylons (destroy them). Emits signal-pulse rings with a gap.
 *  Phase 2: tears free and crawls after you, lashing with cables.
 *  Phase 3 (<30%): the shell splits; only the exposed core can be hurt. Pulses quicken.
 */
export class MotherTransmitter extends Boss {
  private pylons: Pylon[] = [];
  private rings: Ring[] = [];
  private pulseT = 4;
  private telegraph = 0;
  private spawnT = 10;
  private lashT = 0;
  private core: THREE.Mesh;
  private coreMat: THREE.MeshBasicMaterial;
  private shell: THREE.Group;
  private body = new THREE.Group();
  private tentacles: THREE.Mesh[] = [];
  private ringGeo: THREE.TorusGeometry;
  private ringMat: THREE.MeshBasicMaterial;
  private tmp = new THREE.Vector3();
  private flowDir = { x: 0, z: 0 };

  constructor(g: Game, x: number, z: number) {
    super(g, 'The Mother Transmitter', BOSS.mother.hp + BOSS.mother.hpPerRound * g.rounds.round);
    this.pos.set(x, 0, z);
    const flesh = this.mat(0x6a3a34, { roughness: 0.6 });
    const metal = this.mat(0x4a4a44, { metalness: 0.7, roughness: 0.4 });
    const copper = this.mat(0xb06a30, { metalness: 0.85, roughness: 0.3 });
    this.coreMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.5, 0.4) });
    const mk = (geo: THREE.BufferGeometry, m: THREE.Material) => { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; return mesh; };
    // fleshy mass
    const lump: [THREE.BufferGeometry, THREE.Matrix4 | null, number?][] = [];
    for (let k = 0; k < 9; k++) {
      const a = (k / 9) * Math.PI * 2;
      lump.push([sphere(0.7 + (k % 3) * 0.15, 10, 8), M(Math.cos(a) * 0.7, 0.9 + (k % 2) * 0.3, Math.sin(a) * 0.7, 0, 0, 0, 1, 0.8, 1)]);
    }
    lump.push([sphere(1.1, 14, 10), M(0, 1.2, 0, 0, 0, 0, 1, 0.85, 1)]);
    this.body.add(mk(compose(lump), flesh));
    // machine shell (breaks in phase 3)
    this.shell = new THREE.Group();
    const shellParts: [THREE.BufferGeometry, THREE.Matrix4 | null, number?][] = [];
    for (let k = 0; k < 6; k++) {
      const a = (k / 6) * Math.PI * 2;
      shellParts.push([rbox(0.9, 1.3, 0.2, 0.05), M(Math.cos(a) * 0.95, 1.5, Math.sin(a) * 0.95, -a + Math.PI / 2, 0, 0.15)]);
    }
    shellParts.push([lathe([[0, 0.5], [0.7, 0.35], [0.9, 0], [0.8, -0.1], [0, 0]], 14), M(0, 2.1, 0)]);
    this.shell.add(mk(compose(shellParts), metal));
    this.body.add(this.shell);
    // tubes + copper rings
    const deco: [THREE.BufferGeometry, THREE.Matrix4 | null, number?][] = [];
    for (let k = 0; k < 8; k++) { const a = (k / 8) * Math.PI * 2; deco.push([cyl(0.08, 0.1, 0.5, 8), M(Math.cos(a) * 1.0, 2.2, Math.sin(a) * 1.0, 0, Math.cos(a) * 0.4, Math.sin(a) * 0.4)]); }
    for (let k = 0; k < 3; k++) deco.push([torus(1.25 - k * 0.12, 0.05, 6, 24), M(0, 0.6 + k * 0.5, 0, 0, Math.PI / 2)]);
    this.body.add(mk(compose(deco), copper));
    this.core = mk(new THREE.SphereGeometry(0.42, 16, 12), this.coreMat);
    this.core.position.y = 1.5;
    this.body.add(this.core);
    // cable tentacles
    for (let k = 0; k < 5; k++) {
      const t = mk(new THREE.CylinderGeometry(0.06, 0.1, 2.6, 6), metal);
      t.geometry.translate(0, -1.3, 0);
      t.position.set(Math.cos(k * 1.3) * 0.8, 1.6, Math.sin(k * 1.3) * 0.8);
      this.tentacles.push(t);
      this.body.add(t);
    }
    this.group.add(this.body);
    // pylons
    for (let k = 0; k < 3; k++) {
      const a = (k / 3) * Math.PI * 2 + 0.4;
      let px = x + Math.cos(a) * 5.5, pz = z + Math.sin(a) * 5.5;
      const c = g.world.grid;
      for (let tries = 0; tries < 8 && !c.walkable(Math.floor(px), Math.floor(pz)); tries++) { px = x + Math.cos(a) * (5.5 - tries * 0.6); pz = z + Math.sin(a) * (5.5 - tries * 0.6); }
      const pm = new THREE.Group();
      pm.add(mk(compose([[rbox(0.7, 0.4, 0.7, 0.04), M(0, 0.2, 0)], [cyl(0.12, 0.16, 2.6, 8), M(0, 1.6, 0)],
        ...Array.from({ length: 6 }, (_, i) => [torus(0.22, 0.035, 5, 12), M(0, 1.0 + i * 0.3, 0, 0, Math.PI / 2)] as [THREE.BufferGeometry, THREE.Matrix4, number?])]), copper));
      const glow = mk(new THREE.SphereGeometry(0.2, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.5, 3) }));
      glow.position.y = 3.0;
      pm.add(glow);
      pm.position.set(px, 0, pz);
      this.group.add(pm);
      this.pylons.push({ pos: new THREE.Vector3(px, 3.0, pz), hp: BOSS.mother.pylonHp, mesh: pm, alive: true, glow });
    }
    this.ringGeo = new THREE.TorusGeometry(1, 0.09, 6, 64, Math.PI * 2 - 1.1);
    this.ringGeo.rotateX(Math.PI / 2);
    this.ringMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.4, 0.3), transparent: true, opacity: 0.9, depthWrite: false, blending: THREE.AdditiveBlending });
    this.spheres = [
      { c: new THREE.Vector3(), r: 0.5, part: 'crit' },
      { c: new THREE.Vector3(), r: 1.5, part: 'body' },
      ...this.pylons.map((p, i) => ({ c: p.pos, r: 0.45, part: 'shield' as BossPart, idx: i })),
    ];
    audio.play('z_motherPulse', { pos: { x, y: 2, z }, vol: 1, priority: 10, refDist: 12 });
    g.fx.flash(x, 4, z, 50, 0xff3020);
  }

  center() { return this.tmp.set(this.pos.x, 1.6, this.pos.z); }

  protected vulnerable(part: BossPart) {
    if (this.phase === 1) return false;
    if (this.phase === 3) return part === 'crit';
    return true;
  }

  protected deflect() {
    const c = this.center();
    this.g.fx.sparks(c.x, c.y + 0.5, c.z, 0, 1, 0, 3, 0x80e0ff, 3);
  }

  protected damageShield(idx: number, amount: number) {
    const p = this.pylons[idx];
    if (!p || !p.alive) return;
    p.hp -= amount;
    this.g.fx.sparks(p.pos.x, p.pos.y, p.pos.z, 0, 1, 0, 4, 0x80e0ff, 3);
    if (p.hp <= 0) {
      p.alive = false;
      p.mesh.visible = false;
      this.g.combat.explode(p.pos.x, 1.2, p.pos.z, 3, 0, false);
      this.spheres = this.spheres.filter((s) => s.idx !== idx);
      if (this.pylons.every((q) => !q.alive)) {
        this.phase = 2;
        bus.emit('message', { text: 'THE SHIELD IS DOWN', sub: 'She is tearing herself free', duration: 2.5, color: '#4ff0e8' });
        audio.play('z_bruteRoar', { pos: this.center(), vol: 1, rate: 0.55, priority: 10 });
        bus.emit('bossHealth', { frac: this.hp / this.maxHp, phase: 2 });
      }
    }
  }

  protected onHurt(_a: number, _part: BossPart) {
    if (this.phase === 2 && this.hp < this.maxHp * 0.3) {
      this.phase = 3;
      this.shell.visible = false;
      this.g.combat.explode(this.pos.x, 2, this.pos.z, 3.5, 0, false);
      bus.emit('message', { text: 'THE CORE IS EXPOSED', sub: 'Shoot the glowing heart', duration: 2.5, color: '#e2392e' });
    }
  }

  update(dt: number) {
    this.time += dt;
    const g = this.g, p = g.player.pos, fx = g.fx;
    if (!this.alive) {
      this.deathT += dt;
      this.body.position.y = -clamp(this.deathT * 0.5, 0, 3);
      this.coreMat.color.setScalar(Math.max(0, 2 - this.deathT));
      if (this.deathT < 2 && Math.random() < 0.6) fx.electric(this.pos.x + rand(-1, 1), 1.5, this.pos.z + rand(-1, 1), 6, 0xff5040);
      for (const r of this.rings) r.mesh.visible = false;
      return;
    }
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    // pylon beams
    for (const py of this.pylons) {
      if (!py.alive) continue;
      (py.glow.material as THREE.MeshBasicMaterial).color.setRGB(0.6, 2 + Math.sin(this.time * 8) * 0.5, 3);
      if (Math.random() < dt * 9) fx.arc(jagged(py.pos, this.center().clone().setY(2), 8, 0.4), 0.12, 0.05, 0x60e0ff);
    }
    // movement (phase 2+)
    if (this.phase >= 2) {
      let mx = dx / (dist || 1), mz = dz / (dist || 1);
      const grid = g.world.grid;
      if (!grid.los(this.pos.x, this.pos.z, p.x, p.z) && g.world.flow.direction(this.pos.x, this.pos.z, this.flowDir)) { mx = this.flowDir.x; mz = this.flowDir.z; }
      if (dist > 2.5) { this.pos.x += mx * 1.6 * dt; this.pos.z += mz * 1.6 * dt; }
      grid.collideCircle(this.pos, 1.2, (i, j) => !grid.walkable(i, j));
      // cable lash
      this.lashT -= dt;
      if (dist < 3.2 && this.lashT <= 0 && !g.player.downed) {
        this.lashT = 1.6;
        audio.play('z_attack', { pos: this.center(), vol: 1, rate: 0.5, priority: 8 });
        setTimeout(() => { if (this.alive && Math.hypot(g.player.pos.x - this.pos.x, g.player.pos.z - this.pos.z) < 3.6) g.damagePlayer(55, this.pos.x, this.pos.z); }, 450);
      }
    }
    // pulses
    this.pulseT -= dt;
    const pulseEvery = this.phase === 3 ? 3.5 : this.phase === 2 ? 5.5 : 5;
    if (this.pulseT <= 1 && this.telegraph <= 0) { this.telegraph = 1; audio.play('z_motherPulse', { pos: this.center(), vol: 1, priority: 9, refDist: 10 }); }
    if (this.telegraph > 0) this.telegraph -= dt;
    if (this.pulseT <= 0) {
      this.pulseT = pulseEvery;
      this.telegraph = 0;
      const mesh = new THREE.Mesh(this.ringGeo, this.ringMat);
      mesh.position.set(this.pos.x, 0.5, this.pos.z);
      const gap = Math.atan2(dz, dx) + rand(-1.4, 1.4);
      mesh.rotation.y = -gap - 0.55; // orient the arc's gap toward `gap`
      this.group.add(mesh);
      this.rings.push({ r: 0.5, gap, mesh, hit: false });
      fx.glowPuff(this.pos.x, 1.5, this.pos.z, 0xff4030, 3, 0.25);
    }
    for (let i = this.rings.length - 1; i >= 0; i--) {
      const r = this.rings[i];
      r.r += 7.5 * dt;
      r.mesh.scale.setScalar(r.r);
      (r.mesh.material as THREE.MeshBasicMaterial).opacity = Math.max(0, 1 - r.r / 26);
      if (!r.hit && Math.abs(dist - r.r) < 0.55 && !g.player.downed) {
        // inside the gap? (gap is 1.1 rad wide)
        const ang = Math.atan2(dz, dx);
        const inGap = Math.abs(wrapAngle(ang - r.gap)) < 0.55;
        const covered = !g.world.grid.los(this.pos.x, this.pos.z, p.x, p.z);
        if (!inGap && !covered) { r.hit = true; g.damagePlayer(BOSS.mother.pulseDamage, this.pos.x, this.pos.z); g.r.fx.staticJam = 0.6; }
      }
      if (r.r > 26) { this.group.remove(r.mesh); this.rings.splice(i, 1); }
    }
    // minions
    this.spawnT -= dt;
    if (this.spawnT <= 0) {
      this.spawnT = this.phase === 3 ? 7 : 11;
      for (let k = 0; k < (this.phase === 3 ? 4 : 2); k++) {
        const c = g.rounds.findFloorCell(6, 16);
        if (c) g.zombies.spawn('zombie', g.rounds.hp * 0.7, 'runner', c);
      }
    }
    // pose / glow
    this.body.position.set(this.pos.x, Math.sin(this.time * 1.4) * 0.05, this.pos.z);
    this.body.rotation.y = Math.atan2(dx, dz);
    const tele = this.telegraph > 0 ? 1 + (1 - this.telegraph) * 3 : 1;
    const pulse = (1.4 + Math.sin(this.time * 6) * 0.4) * tele * (this.phase === 3 ? 1.6 : 1);
    this.coreMat.color.setRGB(pulse * 1.6, pulse * 0.25, pulse * 0.2);
    this.core.scale.setScalar(1 + (tele - 1) * 0.1 + (this.phase === 3 ? 0.3 : 0));
    this.tentacles.forEach((t, k) => { t.rotation.set(0.6 + Math.sin(this.time * 2 + k) * 0.5, k * 1.3, Math.cos(this.time * 1.7 + k) * 0.5); });
    this.group.updateMatrixWorld(true);
    this.core.getWorldPosition(this.spheres[0].c);
    this.spheres[0].r = this.phase === 3 ? 0.62 : 0.45;
    this.spheres[1].c.set(this.pos.x, 1.3, this.pos.z);
    // in phase 3 the body sphere should not swallow core hits: shrink it
    this.spheres[1].r = this.phase === 3 ? 0.9 : 1.5;
    this.lightFromProbe();
  }

  protected die() {
    super.die();
    for (const r of this.rings) this.group.remove(r.mesh);
    this.rings = [];
    audio.play('z_bruteDeath', { pos: this.center(), vol: 1, rate: 0.5, priority: 10 });
    this.g.combat.explode(this.pos.x, 1.5, this.pos.z, 4, 0, false);
  }
}
