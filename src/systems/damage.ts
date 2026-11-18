import * as THREE from 'three';
import type { CombatHost, WeaponInstance } from '../weapons/weaponSystem';
import type { Game } from '../game';
import type { ZHit, Zombie, Part } from '../entities/zombie';
import { K } from '../world/grid';
import { ZOMBIE } from '../config/enemies';
import { ECONOMY } from '../config/economy';
import { clamp } from '../core/math';
import { audio } from '../audio/audioEngine';
import { bus } from '../core/events';
import { jagged } from '../render/fx';
import { buildGrenade } from '../weapons/weaponModels';

interface Projectile {
  active: boolean;
  kind: 'grenade' | 'shell';
  pos: THREE.Vector3;
  vel: THREE.Vector3;
  fuse: number;
  traveled: number;
  mesh: THREE.Object3D;
  dmg: number;
  radius: number;
  self: boolean;
  bounces: number;
}

const _hits: ZHit[] = [];
const _o = new THREE.Vector3();
const _d = new THREE.Vector3();
const _n = { nx: 0, nz: 0, i: 0, j: 0 };

/**
 * All damage flows through here: bullets (penetration, falloff, chip crits), explosions,
 * projectiles, the Signal Disruptor's chaining arcs and melee. Emits hit / kill events
 * and awards points through the economy.
 */
export class Combat implements CombatHost {
  private projectiles: Projectile[] = [];
  readonly previewLine: THREE.Line;
  private previewPos: Float32Array;
  readonly group = new THREE.Group();

  constructor(private g: Game) {
    for (let i = 0; i < 10; i++) {
      const isShell = i >= 6;
      let mesh: THREE.Object3D;
      if (isShell) {
        const m = new THREE.Mesh(new THREE.CylinderGeometry(0.022, 0.022, 0.08, 8), new THREE.MeshStandardMaterial({ color: 0x5a6a3a, metalness: 0.5, roughness: 0.5 }));
        m.rotation.x = Math.PI / 2;
        mesh = new THREE.Group(); mesh.add(m);
      } else mesh = buildGrenade();
      mesh.visible = false;
      this.group.add(mesh);
      this.projectiles.push({ active: false, kind: isShell ? 'shell' : 'grenade', pos: new THREE.Vector3(), vel: new THREE.Vector3(), fuse: 0, traveled: 0, mesh, dmg: 0, radius: 0, self: false, bounces: 0 });
    }
    this.previewPos = new Float32Array(40 * 3);
    const pg = new THREE.BufferGeometry();
    pg.setAttribute('position', new THREE.BufferAttribute(this.previewPos, 3));
    this.previewLine = new THREE.Line(pg, new THREE.LineBasicMaterial({ color: 0xffd080, transparent: true, opacity: 0.55, depthTest: false }));
    this.previewLine.frustumCulled = false;
    this.previewLine.visible = false;
    this.previewLine.renderOrder = 8;
    this.group.add(this.previewLine);
  }

  get zombies() { return this.g.zombies; }
  get fx() { return this.g.fx; }

  private overload() { return this.g.powerups.active('overload'); }

  // ---------------------------------------------------------------- environment
  /** Distance along a 3D ray to the first piece of world geometry, plus hit normal + surface. */
  envRay(o: THREE.Vector3, d: THREE.Vector3, max = 100): { t: number; nx: number; ny: number; nz: number; surface: string } {
    const grid = this.g.world.grid;
    const hl = Math.hypot(d.x, d.z);
    let t = max, nx = 0, ny = 0, nz = 0, surface = 'wall';
    if (hl > 1e-5) {
      const t2 = grid.raycast(o.x, o.z, d.x, d.z, max * hl, _n);
      const tt = t2 / hl;
      if (tt < t) {
        t = tt; nx = _n.nx; nz = _n.nz; ny = 0;
        const k = grid.kindAt(_n.i, _n.j);
        surface = k === K.PROP || k === K.MACHINE ? 'metal' : k === K.DOOR ? 'metal' : 'wall';
        // wall height check: a ray that passes over a wall (outdoor) continues — ignore for simplicity
      }
    }
    if (d.y < -1e-4) {
      const tf = -o.y / d.y;
      if (tf < t) { t = tf; nx = 0; ny = 1; nz = 0; surface = 'floor'; }
    } else if (d.y > 1e-4) {
      const ceil = this.g.world.ceilingAt(o.x, o.z);
      if (isFinite(ceil)) {
        const tc = (ceil - o.y) / d.y;
        if (tc > 0 && tc < t) { t = tc; nx = 0; ny = -1; nz = 0; surface = 'ceiling'; }
      }
    }
    return { t, nx, ny, nz, surface };
  }

  private impactEnv(x: number, y: number, z: number, nx: number, ny: number, nz: number, surface: string) {
    const fx = this.fx;
    const zone = this.g.world.zoneDef(Math.floor(x - nx * 0.1), Math.floor(z - nz * 0.1));
    const mat = surface === 'metal' ? 'metal' : zone && (zone.wall === 'riveted' || zone.wall === 'metal') && surface === 'wall' ? 'metal' : zone?.water && surface === 'floor' ? 'water' : 'wall';
    if (mat === 'metal') { fx.sparks(x, y, z, nx, ny, nz, 7, 0xffb050, 3.5); }
    else if (mat === 'water') { fx.dust(x, y + 0.05, z, 0, 1, 0, 6, 0x405050); }
    else fx.dust(x, y, z, nx, ny, nz, 5, 0x8a8070);
    fx.sparks(x, y, z, nx, ny, nz, 2, 0xffc080, 2);
    if (mat !== 'water') {
      this.g.world.baker.sample(x + nx * 0.2, z + nz * 0.2, _probe);
      fx.decal(0, x, y, z, nx, ny, nz, 0.09 + Math.random() * 0.04, _probe);
    }
    if (Math.random() < 0.7) audio.play(mat === 'metal' ? 'imp_metal' : mat === 'water' ? 'imp_water' : 'imp_wall', { pos: { x, y, z }, vol: 0.55, priority: 2 });
  }

  // ---------------------------------------------------------------- bullets
  hitscan(o: THREE.Vector3, d: THREE.Vector3, w: WeaponInstance, scale: number) {
    const st = w.stats;
    const env = this.envRay(o, d);
    const boss = this.g.boss;
    const bh = boss?.raycast(o.x, o.y, o.z, d.x, d.y, d.z, env.t) ?? null;
    const hits = this.zombies.raycast(o.x, o.y, o.z, d.x, d.y, d.z, bh ? bh.t : env.t, _hits);
    let pen = st.penetration + 1;
    let mult = scale;
    for (const h of hits) {
      if (pen <= 0) break;
      const fall = 1 - clamp((h.t - st.falloffStart) / Math.max(0.01, st.falloffEnd - st.falloffStart), 0, 1) * (1 - st.minDamageMult);
      this.damageZombie(h.z, h.part, st.damage * fall * mult, w.stats.headMult, d.x, d.z, h.x, h.y, h.z_, { weapon: w, sub: h.sub });
      if (st.splashRadius) this.explode(h.x, h.y, h.z_, st.splashRadius, st.splashDamage ?? 100, false, true);
      pen--; mult *= 0.75;
    }
    if (pen > 0 && bh && boss) {
      const fall = 1 - clamp((bh.t - st.falloffStart) / Math.max(0.01, st.falloffEnd - st.falloffStart), 0, 1) * (1 - st.minDamageMult);
      this.hitBoss(bh.part, st.damage * fall * mult * (bh.part === 'crit' ? st.headMult * ZOMBIE.chipCritMult : 1), bh.x, bh.y, bh.z, bh.shieldIdx);
      if (st.splashRadius) this.explode(bh.x, bh.y, bh.z, st.splashRadius, st.splashDamage ?? 100, false, true);
      pen = 0;
    }
    if (pen > 0 && env.t < 100) {
      const x = o.x + d.x * env.t, y = o.y + d.y * env.t, z = o.z + d.z * env.t;
      this.impactEnv(x, y, z, env.nx, env.ny, env.nz, env.surface);
      if (st.splashRadius) this.explode(x, y, z, st.splashRadius, st.splashDamage ?? 100, false, true);
    }
  }

  /** Central zombie damage: part multipliers, overload, points, FX, sounds, HUD hit markers. */
  damageZombie(z: Zombie, part: Part, base: number, headMult: number, dx: number, dz: number, hx: number, hy: number, hz: number,
    opts: { weapon?: WeaponInstance; melee?: boolean; explosive?: boolean; arc?: boolean; noPoints?: boolean; sub?: number } = {}) {
    if (!z.alive) return { killed: false, crit: false };
    let dmg = base;
    if (part === 'chip') dmg *= headMult * ZOMBIE.chipCritMult;
    else if (part === 'head') dmg *= headMult;
    else if (part === 'limb') dmg *= 0.8;
    if (this.overload() && !z.boss) dmg = z.type === 'brute' ? dmg * 8 : 1e9;
    const res = this.zombies.damage(z, dmg, part, dx, dz, { explosive: opts.explosive, melee: opts.melee, sub: opts.sub });
    const fx = this.fx;
    // FX + sound
    if (part === 'chip' || part === 'cage') {
      fx.sparks(hx, hy, hz, -dx, 0.6, -dz, 12, 0x90f8ff, 3.5);
      fx.electric(hx, hy, hz, 6, this.g.world.def.chipColor);
      if (part === 'chip') audio.play('imp_chip', { pos: { x: hx, y: hy, z: hz }, vol: 0.95, priority: 7 });
    } else {
      fx.blood(hx, hy, hz, dx, 0.2, dz, part === 'head' ? 10 : 6);
      audio.play(part === 'head' ? 'imp_head' : 'imp_flesh', { pos: { x: hx, y: hy, z: hz }, vol: 0.75, priority: 4 });
      if (Math.random() < 0.3) {
        const t = this.envRay(_o.set(hx, hy, hz), _d.set(dx, -0.4, dz).normalize(), 3);
        if (t.t < 3) fx.decal(1, hx + _d.x * t.t, hy + _d.y * t.t, hz + _d.z * t.t, t.nx, t.ny, t.nz, 0.5 + Math.random() * 0.5);
      }
    }
    if (opts.arc) audio.play('imp_arcZap', { pos: { x: hx, y: hy, z: hz }, vol: 0.8, priority: 5 });
    bus.emit('zombieHit', { chip: part === 'chip' && res.crit, headshot: part === 'head', damage: dmg, x: hx, y: hy, z: hz });
    const eco = this.g.economy;
    if (res.cageBroke) eco.add(ECONOMY.bruteCageBreak, 'cage');
    if (res.killed) {
      const melee = !!opts.melee;
      let pts = ECONOMY.kill;
      if (z.type === 'hound') pts = ECONOMY.houndKill;
      else if (z.type === 'brute') pts = ECONOMY.bruteKill;
      else if (melee) pts = ECONOMY.meleeKill;
      else if (part === 'chip') pts = ECONOMY.chipKill;
      else if (part === 'head') pts = ECONOMY.headshotKill;
      if (!opts.noPoints) eco.add(pts, part === 'chip' ? 'chip' : 'kill', part === 'chip');
      const st = this.g.player.stats;
      st.kills++;
      if (part === 'head') st.headshots++;
      if (part === 'chip') st.chipKills++;
      bus.emit('zombieKilled', { kind: z.type, headshot: part === 'head', chip: part === 'chip', melee, x: z.x, z: z.z, explosive: opts.explosive });
    } else if (!opts.noPoints && !opts.explosive) eco.add(ECONOMY.hit, 'hit');
    return res;
  }

  /** Damage the active boss (bullets, explosions, arcs, melee). */
  hitBoss(part: 'crit' | 'body' | 'shield', dmg: number, x: number, y: number, z: number, idx?: number) {
    const boss = this.g.boss;
    if (!boss || !boss.alive) return;
    const fx = this.fx;
    if (part === 'crit') { fx.sparks(x, y, z, 0, 1, 0, 10, 0xff8060, 3.5); audio.play('imp_chip', { pos: { x, y, z }, vol: 0.9, priority: 7 }); }
    else if (part === 'shield') { audio.play('imp_cage', { pos: { x, y, z }, vol: 0.7, priority: 5 }); }
    else { fx.blood(x, y, z, 0, 0.3, 0, 5); audio.play('imp_flesh', { pos: { x, y, z }, vol: 0.7, priority: 4 }); }
    boss.damage(dmg, part, idx);
    this.g.economy.add(ECONOMY.hit, 'hit');
    bus.emit('zombieHit', { chip: part === 'crit', headshot: false, damage: dmg, x, y, z });
  }

  // ---------------------------------------------------------------- explosions
  explode(x: number, y: number, z: number, radius: number, damage: number, selfDamage: boolean, small = false) {
    const fx = this.fx;
    if (small) {
      fx.glowPuff(x, y, z, 0xff8030, radius * 0.9, 0.15);
      fx.sparks(x, y, z, 0, 1, 0, 10, 0xffa040, 4);
      fx.smoke(x, y, z, 3, 0.3, 0x3a3634, 0.8);
      audio.play('imp_explosion', { pos: { x, y, z }, vol: 0.45, rate: 1.4, priority: 4 });
    } else {
      fx.explosion(x, y, z, radius / 4.5);
      fx.decal(2, x, 0.012, z, 0, 1, 0, radius * 0.7);
      audio.play('imp_explosion', { pos: { x, y, z }, vol: 1, priority: 9, refDist: 6, reverb: 0.5 });
      const p = this.g.player.pos;
      const d = Math.hypot(p.x - x, p.z - z);
      this.g.player.shake = Math.max(this.g.player.shake, clamp(1.4 - d / 10, 0, 1.4));
    }
    const grid = this.g.world.grid;
    for (const zb of this.zombies.all()) {
      if (!zb.alive) continue;
      const dx = zb.x - x, dz = zb.z - z;
      const d = Math.hypot(dx, dz, (zb.y + 1) - y);
      if (d > radius) continue;
      if (!grid.los(x, z, zb.x, zb.z) && d > 0.8) continue;
      const k = 1 - (d / radius) * 0.6;
      const nd = Math.hypot(dx, dz) || 1;
      this.damageZombie(zb, 'body', damage * k, 1, dx / nd, dz / nd, zb.x, 1, zb.z, { explosive: true });
    }
    const boss = this.g.boss;
    if (boss?.alive && damage > 0) {
      const c = boss.center();
      const d = Math.hypot(c.x - x, c.z - z);
      if (d < radius + 1.5) this.hitBoss('body', damage * 0.5 * (1 - Math.min(1, d / (radius + 1.5)) * 0.5), c.x, c.y, c.z);
      boss.explodeAt(x, z, radius, damage);
    }
    if (selfDamage) {
      const p = this.g.player.pos;
      const d = Math.hypot(p.x - x, p.z - z, 1 - y);
      if (d < radius && grid.los(x, z, p.x, p.z)) this.g.damagePlayer(clamp(90 * (1 - d / radius), 10, 80), x, z, true);
    }
  }

  // ---------------------------------------------------------------- projectiles
  private spawnProjectile(kind: 'grenade' | 'shell'): Projectile | null {
    for (const p of this.projectiles) if (!p.active && p.kind === kind) return p;
    return null;
  }

  projectile(o: THREE.Vector3, d: THREE.Vector3, w: WeaponInstance) {
    const p = this.spawnProjectile('shell');
    if (!p) return;
    p.active = true; p.mesh.visible = true;
    p.pos.copy(o).addScaledVector(d, 0.5); p.pos.y -= 0.08;
    p.vel.copy(d).multiplyScalar(26); p.vel.y += 1.5;
    p.fuse = 6; p.traveled = 0; p.bounces = 0;
    p.dmg = w.stats.splashDamage ?? 600; p.radius = w.stats.splashRadius ?? 4; p.self = true;
    this.fx.smoke(p.pos.x, p.pos.y, p.pos.z, 4, 0.2);
  }

  throwGrenade(o: THREE.Vector3, v: THREE.Vector3, fuse: number) {
    const p = this.spawnProjectile('grenade');
    if (!p) return;
    p.active = true; p.mesh.visible = true;
    p.pos.copy(o); p.vel.copy(v); p.fuse = fuse; p.traveled = 0; p.bounces = 0;
    p.dmg = 450 + this.g.rounds.round * 60; p.radius = 4.2; p.self = true;
  }

  explodeInHand() {
    const p = this.g.player;
    this.explode(p.pos.x, 1.2, p.pos.z, 4.2, 450 + this.g.rounds.round * 60, true);
  }

  update(dt: number) {
    const grid = this.g.world.grid;
    for (const p of this.projectiles) {
      if (!p.active) continue;
      p.fuse -= dt;
      const sub = 3;
      for (let s = 0; s < sub; s++) {
        const h = dt / sub;
        p.vel.y -= 9.8 * h;
        const nx = p.pos.x + p.vel.x * h, ny = p.pos.y + p.vel.y * h, nz = p.pos.z + p.vel.z * h;
        p.traveled += Math.hypot(p.vel.x, p.vel.y, p.vel.z) * h;
        let bounced = false;
        if (grid.blocksShot(Math.floor(nx), Math.floor(p.pos.z))) { p.vel.x *= -0.45; bounced = true; } else p.pos.x = nx;
        if (grid.blocksShot(Math.floor(p.pos.x), Math.floor(nz))) { p.vel.z *= -0.45; bounced = true; } else p.pos.z = nz;
        const ceil = this.g.world.ceilingAt(p.pos.x, p.pos.z);
        if (ny < 0.05) { p.pos.y = 0.05; p.vel.y *= -0.35; p.vel.x *= 0.65; p.vel.z *= 0.65; if (Math.abs(p.vel.y) > 0.8) bounced = true; }
        else if (isFinite(ceil) && ny > ceil - 0.05) { p.pos.y = ceil - 0.05; p.vel.y *= -0.4; bounced = true; }
        else p.pos.y = ny;
        if (bounced) {
          p.bounces++;
          if (p.kind === 'shell' && p.traveled > 2) { p.fuse = 0; break; }
          if (p.kind === 'grenade' && p.bounces < 6) audio.play('ui_grenadeBounce', { pos: { x: p.pos.x, y: p.pos.y, z: p.pos.z }, vol: 0.7 });
        }
        if (p.kind === 'shell' && p.traveled > 2) {
          for (const z of this.zombies.all()) {
            if (z.alive && Math.hypot(z.x - p.pos.x, z.z - p.pos.z) < 0.6 * z.scale && p.pos.y < 2.2 * z.scale) { p.fuse = 0; break; }
          }
        }
      }
      p.mesh.position.copy(p.pos);
      p.mesh.rotation.x += dt * 9; p.mesh.rotation.z += dt * 5;
      if (p.kind === 'shell') { p.mesh.lookAt(_o.copy(p.pos).add(p.vel)); if (Math.random() < 0.5) this.fx.smoke(p.pos.x, p.pos.y, p.pos.z, 1, 0.12, 0x8a8a8a, 0.1); }
      if (p.fuse <= 0) {
        p.active = false; p.mesh.visible = false;
        if (p.kind === 'shell' && p.traveled < 2) { this.fx.dust(p.pos.x, p.pos.y, p.pos.z, 0, 1, 0, 4); continue; }
        this.explode(p.pos.x, p.pos.y, p.pos.z, p.radius, p.dmg, p.self);
      }
    }
  }

  /** Trajectory preview while cooking a grenade. */
  updatePreview(active: boolean, o: THREE.Vector3, v: THREE.Vector3) {
    this.previewLine.visible = active;
    if (!active) return;
    const grid = this.g.world.grid;
    let x = o.x, y = o.y, z = o.z, vx = v.x, vy = v.y, vz = v.z;
    let n = 0;
    for (; n < 40; n++) {
      this.previewPos[n * 3] = x; this.previewPos[n * 3 + 1] = y; this.previewPos[n * 3 + 2] = z;
      const h = 0.045;
      vy -= 9.8 * h;
      x += vx * h; y += vy * h; z += vz * h;
      if (y < 0.05 || grid.blocksShot(Math.floor(x), Math.floor(z))) { n++; this.previewPos[n * 3] = x; this.previewPos[n * 3 + 1] = Math.max(0.05, y); this.previewPos[n * 3 + 2] = z; n++; break; }
    }
    this.previewLine.geometry.setDrawRange(0, n);
    (this.previewLine.geometry.attributes.position as THREE.BufferAttribute).needsUpdate = true;
  }

  // ---------------------------------------------------------------- signal disruptor
  signalArc(o: THREE.Vector3, d: THREE.Vector3, w: WeaponInstance) {
    const chain = w.stats.chain ?? 6;
    const fx = this.fx;
    const muzzle = this.muzzleWorld(new THREE.Vector3());
    // first target: best within a narrow cone
    let first: Zombie | null = null, bestScore = 1e9;
    for (const z of this.zombies.all()) {
      if (!z.alive) continue;
      const tx = z.chip.x - o.x, ty = z.chip.y - o.y, tz = z.chip.z - o.z;
      const dist = Math.hypot(tx, ty, tz);
      if (dist > 32) continue;
      const cos = (tx * d.x + ty * d.y + tz * d.z) / dist;
      if (cos < 0.965) continue;
      if (!this.g.world.grid.los(o.x, o.z, z.x, z.z)) continue;
      const score = dist * (2 - cos * 1.5);
      if (score < bestScore) { bestScore = score; first = z; }
    }
    const color = w.upgraded ? 0xff5050 : 0x60f0ff;
    const boss = this.g.boss;
    if (!first && boss?.alive) {
      const c = boss.center();
      const tx = c.x - o.x, ty = c.y - o.y, tz = c.z - o.z, dist = Math.hypot(tx, ty, tz);
      if (dist < 32 && (tx * d.x + ty * d.y + tz * d.z) / dist > 0.95) {
        fx.arc(jagged(muzzle, c.clone(), 10, 0.35), 0.25, 0.06, color);
        fx.electric(c.x, c.y, c.z, 14, color);
        this.hitBoss('crit', w.stats.damage * 0.35, c.x, c.y, c.z);
        return;
      }
    }
    if (!first) {
      const env = this.envRay(o, d, 25);
      const end = new THREE.Vector3().copy(o).addScaledVector(d, env.t);
      fx.arc(jagged(muzzle, end, 10, 0.35), 0.18, 0.05, color);
      fx.electric(end.x, end.y, end.z, 8, color);
      return;
    }
    const hitSet = new Set<Zombie>();
    let from = muzzle.clone();
    let cur: Zombie | null = first;
    for (let c = 0; c < chain && cur; c++) {
      hitSet.add(cur);
      const to = cur.chip.clone();
      fx.arc(jagged(from, to, 9, 0.3 + c * 0.03), 0.25, 0.045, color);
      fx.electric(to.x, to.y, to.z, 10, color);
      fx.glowPuff(to.x, to.y, to.z, color, 0.8, 0.2);
      const nd = Math.hypot(to.x - from.x, to.z - from.z) || 1;
      this.damageZombie(cur, 'chip', w.stats.damage * (cur.type === 'zombie' || cur.type === 'hound' ? 10 : 0.12), 1, (to.x - from.x) / nd, (to.z - from.z) / nd, to.x, to.y, to.z, { arc: true });
      from = to;
      // next: nearest unhit within 7 m
      let next: Zombie | null = null, nb = 7;
      for (const z of this.zombies.all()) {
        if (!z.alive || hitSet.has(z)) continue;
        const dd = Math.hypot(z.x - to.x, z.z - to.z);
        if (dd < nb && this.g.world.grid.los(to.x, to.z, z.x, z.z)) { nb = dd; next = z; }
      }
      cur = next;
    }
    this.g.fx.flash(o.x + d.x, o.y, o.z + d.z, 20, color);
  }

  // ---------------------------------------------------------------- melee
  findLungeTarget(o: THREE.Vector3, d: THREE.Vector3, range: number): THREE.Vector3 | null {
    let best: Zombie | null = null, bd = range;
    for (const z of this.zombies.all()) {
      if (!z.alive) continue;
      const dx = z.x - o.x, dz = z.z - o.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bd) continue;
      const cos = (dx * d.x + dz * d.z) / (dist * Math.hypot(d.x, d.z) || 1);
      if (cos < 0.75) continue;
      bd = dist; best = z;
    }
    return best ? new THREE.Vector3(best.x, 0, best.z) : null;
  }

  melee(o: THREE.Vector3, d: THREE.Vector3): { hit: boolean } {
    let best: Zombie | null = null, bd = 1.9;
    for (const z of this.zombies.all()) {
      if (!z.alive) continue;
      const dx = z.x - o.x, dz = z.z - o.z;
      const dist = Math.hypot(dx, dz);
      if (dist > bd) continue;
      const cos = (dx * d.x + dz * d.z) / (dist * Math.hypot(d.x, d.z) || 1);
      if (cos < 0.6 && dist > 0.7) continue;
      bd = dist; best = z;
    }
    const boss = this.g.boss;
    if (!best && boss?.alive) {
      const c = boss.center();
      if (Math.hypot(c.x - o.x, c.z - o.z) < 2.6) { this.hitBoss('body', 150, c.x, c.y, c.z); audio.play('imp_meleeHit', { bus: 'sfx', vol: 0.9 }); return { hit: true }; }
    }
    if (!best) return { hit: false };
    const nd = Math.hypot(best.x - o.x, best.z - o.z) || 1;
    const part: Part = best.type === 'hound' ? 'head' : 'body';
    this.damageZombie(best, part, 150, 1, (best.x - o.x) / nd, (best.z - o.z) / nd, best.neck.x, best.neck.y - 0.2, best.neck.z, { melee: true });
    audio.play('imp_meleeHit', { bus: 'sfx', vol: 0.9, priority: 7 });
    this.g.player.shake = Math.max(this.g.player.shake, 0.35);
    return { hit: true };
  }

  muzzleWorld(out: THREE.Vector3): THREE.Vector3 {
    const p = this.g.player;
    const cam = this.g.r.camera;
    const yaw = p.yaw, pitch = p.pitch;
    const fx = -Math.sin(yaw) * Math.cos(pitch), fy = Math.sin(pitch), fz = -Math.cos(yaw) * Math.cos(pitch);
    const rx = Math.cos(yaw), rz = -Math.sin(yaw);
    const k = 1 - p.ads;
    out.set(cam.position.x + fx * 0.6 + rx * 0.12 * k, cam.position.y + fy * 0.6 - 0.08 * k, cam.position.z + fz * 0.6 + rz * 0.12 * k);
    return out;
  }

  clear() {
    for (const p of this.projectiles) { p.active = false; p.mesh.visible = false; }
    this.previewLine.visible = false;
  }
}

const _probe = { r: 0, g: 0, b: 0 };
