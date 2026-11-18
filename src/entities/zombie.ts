import * as THREE from 'three';
import { RigMeshes, Poser, HUMAN_PARTS, HOUND_PARTS, humanGeometry, houndGeometry, createMaterials, type HumanPart, type HoundPart } from './zombieRig';
import { ZOMBIE, HOUND, BRUTE, type SpeedTier } from '../config/enemies';
import type { World, WindowVisual } from '../world/mapBuilder';
import { K } from '../world/grid';
import { clamp, damp, wrapAngle, rand, pick } from '../core/math';
import { audio, type Voice } from '../audio/audioEngine';

export type ZType = 'zombie' | 'hound' | 'brute';
export type ZState = 'inactive' | 'emerge' | 'outside' | 'window' | 'climb' | 'chase' | 'attack' | 'stagger' | 'knockdown' | 'dying';
export type Part = 'chip' | 'head' | 'body' | 'limb' | 'cage';

export interface ZHit { t: number; z: Zombie; part: Part; x: number; y: number; z_: number }

export class Zombie {
  idx: number;
  active = false;
  type: ZType = 'zombie';
  state: ZState = 'inactive';
  stateT = 0;
  x = 0; z = 0; y = 0; yaw = 0;
  vx = 0; vz = 0;
  speed = 1;
  tier: SpeedTier = 'walker';
  hp = 100; maxHp = 100;
  cageHp = 0;
  scale = 1;
  skin = new THREE.Color();
  cloth = new THREE.Color();
  trousers = new THREE.Color();
  limp = 0;
  phase = 0;
  shoulder = 0;   // asymmetric shoulder height
  chipOff = 0;    // chip placement variation
  armLen = 1;
  window: WindowVisual | null = null;
  tearT = 0;
  attackT = 0;
  attackHit = false;
  cooldown = 0;
  hitFlash = 0;
  stagger = 0;
  deathT = 0;
  deathDirX = 0; deathDirZ = 0;
  chipDead = false;
  chipPop: { x: number; y: number; z: number; vx: number; vy: number; vz: number; t: number } | null = null;
  chipFlicker = 1;
  chipStutter = 0;
  stuckT = 0;
  bestDist = 1e9;
  vocalT = 2;
  screamed = false;
  armL = 0; armR = 0; // reach poses
  lunge = 0;
  slamT = -1;
  enraged = false;
  climbFrom = new THREE.Vector3();
  climbTo = new THREE.Vector3();
  // pose outputs (world)
  readonly head = new THREE.Vector3();
  readonly chip = new THREE.Vector3();
  readonly pelvis = new THREE.Vector3();
  readonly neck = new THREE.Vector3();
  readonly limbs: THREE.Vector3[] = Array.from({ length: 16 }, () => new THREE.Vector3());
  kinds: string[] = [];
  voiceTimer = 0;
  boss = false;
  constructor(idx: number) { this.idx = idx; }
  setState(s: ZState) { this.state = s; this.stateT = 0; }
  get alive() { return this.active && this.state !== 'dying'; }
}

const _m = Array.from({ length: 12 }, () => new THREE.Matrix4());
const _v = new THREE.Vector3();
const _probe = { r: 0, g: 0, b: 0 };
const _col = new THREE.Color();
const _zero = new THREE.Matrix4().makeScale(0, 0, 0);
const _dir = { x: 0, z: 0 };

const SKINS = [0x8a8a76, 0x7a7a68, 0x948e78, 0x6e7464, 0x867c6c, 0x7c8478];
const CLOTHES = [0x9a9c90, 0x8a9286, 0x5a5e44, 0x4c5038, 0x7a7668, 0x6a5e50, 0xa4a094, 0x3e4436];
const TROUSERS = [0x3a3a32, 0x4a4a3a, 0x2e2e2a, 0x9a9a90, 0x5a503e];

export interface ZombieHost {
  playerPos: THREE.Vector3;
  playerAlive: () => boolean;
  playerTargetable: () => boolean;
  damagePlayer: (amount: number, fromX: number, fromZ: number) => void;
  tearBoard: (w: WindowVisual, z: Zombie) => boolean;
  boardsAt: (w: WindowVisual) => number;
  onKilled: (z: Zombie) => void;
  fx: import('../render/fx').FX;
  difficultySpeed: number;
  chipColor: THREE.Color;
  shake: (a: number) => void;
}

export class ZombieManager {
  readonly humans: Zombie[] = [];
  readonly hounds: Zombie[] = [];
  readonly human: RigMeshes<HumanPart>;
  readonly hound: RigMeshes<HoundPart>;
  readonly group = new THREE.Group();
  private poser = new Poser();
  private windowOccupant = new Map<WindowVisual, Zombie>();
  readonly maxAlive = 24;
  chipLights: THREE.PointLight[] = [];
  private buzzVoices: (Voice | null)[] = [null, null, null];
  private buzzTimer = 0;
  private time = 0;
  freezeAll = false;
  private cageCount = 0;
  /** 0 = map chip colour, 1 = red (special rounds / bosses) */
  chipTint = 0;
  private glowCol = new THREE.Color();
  private static RED = new THREE.Color(0xff3020);

  constructor(private world: World, private host: ZombieHost) {
    const mats = createMaterials();
    this.human = new RigMeshes(HUMAN_PARTS, humanGeometry, this.maxAlive + 4, mats.skin, mats.glow, mats.chip);
    this.hound = new RigMeshes(HOUND_PARTS, houndGeometry, this.maxAlive, mats.skin, mats.glow, mats.chip);
    this.group.add(this.human.group, this.hound.group);
    for (let i = 0; i < this.maxAlive + 4; i++) this.humans.push(new Zombie(i));
    for (let i = 0; i < this.maxAlive; i++) this.hounds.push(new Zombie(i));
  }

  setupChipLights(scene: THREE.Scene, count: number) {
    for (const l of this.chipLights) scene.remove(l);
    this.chipLights = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(this.host.chipColor, 0, 3.5, 2);
      scene.add(l);
      this.chipLights.push(l);
    }
  }

  get aliveCount() {
    let n = 0;
    for (const z of this.humans) if (z.active && z.state !== 'dying') n++;
    for (const z of this.hounds) if (z.active && z.state !== 'dying') n++;
    return n;
  }
  get activeCount() {
    let n = 0;
    for (const z of this.humans) if (z.active) n++;
    for (const z of this.hounds) if (z.active) n++;
    return n;
  }

  *all() {
    for (const z of this.humans) if (z.active) yield z;
    for (const z of this.hounds) if (z.active) yield z;
  }

  // -------------------------------------------------------------- spawning
  spawn(type: ZType, hp: number, tier: SpeedTier, at: { window?: WindowVisual; x?: number; z?: number }): Zombie | null {
    const list = type === 'hound' ? this.hounds : this.humans;
    // keep the last 4 human slots for brutes/bosses so a full horde never blocks them
    const limit = type === 'zombie' ? this.maxAlive : list.length;
    let z: Zombie | null = null;
    for (let i = 0; i < limit; i++) if (!list[i].active) { z = list[i]; break; }
    if (!z) return null;
    if (this.aliveCount >= this.maxAlive && type === 'zombie') return null;
    z.active = true;
    z.type = type;
    z.hp = z.maxHp = hp;
    z.tier = tier;
    z.scale = type === 'brute' ? BRUTE.scale : type === 'hound' ? 1 : rand(0.92, 1.08);
    z.skin.setHex(pick(SKINS)).offsetHSL(0, 0, rand(-0.05, 0.05));
    z.cloth.setHex(pick(CLOTHES));
    z.trousers.setHex(pick(TROUSERS));
    if (type === 'hound') { z.skin.setHex(0x8a4a40); z.cloth.setHex(0x7a3a30); }
    if (type === 'brute') { z.skin.setHex(0x7a7a6c); z.cloth.setHex(0x3a3e30); z.trousers.setHex(0x2a2a24); }
    z.limp = Math.random() < 0.35 ? rand(0.3, 0.8) * (Math.random() < 0.5 ? -1 : 1) : 0;
    z.shoulder = rand(-0.06, 0.06);
    z.chipOff = rand(-1, 1);
    z.armLen = type === 'brute' ? 1.05 : rand(1.06, 1.18);
    z.phase = Math.random() * 10;
    z.cageHp = type === 'brute' ? Math.max(BRUTE.minCageHp, hp / BRUTE.hpMult * BRUTE.cageHpMult) : 0;
    z.chipDead = false; z.chipPop = null; z.chipStutter = 0;
    z.deathT = 0; z.stagger = 0; z.hitFlash = 0; z.cooldown = 0; z.attackT = 0; z.slamT = -1; z.enraged = false;
    z.stuckT = 0; z.bestDist = 1e9; z.vocalT = rand(0.5, 3); z.screamed = false; z.lunge = 0; z.boss = false;
    z.vx = z.vz = 0; z.y = 0;
    const speeds = ZOMBIE.speeds;
    z.speed = (type === 'hound' ? HOUND.speed : type === 'brute' ? BRUTE.speed : speeds[tier] * rand(0.92, 1.08)) * this.host.difficultySpeed;
    if (at.window) {
      z.window = at.window;
      z.x = at.window.spawn.x + rand(-0.4, 0.4);
      z.z = at.window.spawn.z + rand(-0.4, 0.4);
      z.setState('outside');
    } else {
      z.window = null;
      z.x = at.x!; z.z = at.z!;
      z.setState('emerge');
      if (type !== 'hound') audio.play('z_emerge', { pos: { x: z.x, y: 0.5, z: z.z }, vol: 0.8 });
    }
    const p = this.host.playerPos;
    z.yaw = Math.atan2(p.x - z.x, p.z - z.z);
    return z;
  }

  // -------------------------------------------------------------- update
  update(dt: number) {
    this.time += dt;
    const g = this.world.grid;
    const p = this.host.playerPos;
    const flow = this.world.flow;
    const targetable = this.host.playerTargetable();
    // separation (O(n^2) on <= 48 agents)
    const act: Zombie[] = [];
    for (const z of this.all()) if (z.state === 'chase' || z.state === 'attack' || z.state === 'outside' || z.state === 'stagger') act.push(z);
    for (let a = 0; a < act.length; a++) for (let b = a + 1; b < act.length; b++) {
      const A = act[a], B = act[b];
      const dx = B.x - A.x, dz = B.z - A.z;
      const min = (radius(A) + radius(B)) * 0.95;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2), push = (min - d) * 0.5;
        const nx = dx / d, nz = dz / d;
        A.x -= nx * push; A.z -= nz * push;
        B.x += nx * push; B.z += nz * push;
      }
    }

    for (const z of this.all()) {
      z.stateT += dt;
      z.hitFlash = Math.max(0, z.hitFlash - dt * 5);
      z.chipStutter = Math.max(0, z.chipStutter - dt);
      z.cooldown -= dt;
      z.stagger = Math.max(0, z.stagger - dt * 2.5);
      if (this.freezeAll && z.state !== 'dying') continue;
      const dxp = p.x - z.x, dzp = p.z - z.z;
      const distP = Math.hypot(dxp, dzp);
      const r = radius(z);
      switch (z.state) {
        case 'emerge': {
          const dur = z.type === 'hound' ? 0.6 : 1.4;
          z.y = z.type === 'hound' ? 0 : -1.6 * (1 - clamp(z.stateT / dur, 0, 1));
          if (z.stateT > dur) { z.y = 0; z.setState('chase'); }
          break;
        }
        case 'outside': {
          const w = z.window!;
          const tx = w.outside.x, tz = w.outside.z;
          const occ = this.windowOccupant.get(w);
          const queue = occ && occ !== z && occ.active;
          const dx = tx - z.x, dz = tz - z.z;
          const d = Math.hypot(dx, dz);
          const stopAt = queue ? 1.3 : 0.05;
          if (d > stopAt) {
            const sp = Math.min(z.speed, 2.6);
            z.x += (dx / d) * sp * dt; z.z += (dz / d) * sp * dt;
            z.yaw = turn(z.yaw, Math.atan2(dx, dz), 6, dt);
            z.phase += dt * gaitRate(z, sp);
          } else if (!queue) {
            this.windowOccupant.set(w, z);
            z.x = tx; z.z = tz;
            z.setState('window');
            z.tearT = 0;
          } else z.phase += dt * 0.5;
          g.collideCircle(z, r, (i, j) => g.kindAt(i, j) !== K.OUTSIDE);
          // waiting in a queue: try another free window in an unlocked area
          if (queue && z.stateT > 7 + (z.idx % 5)) {
            let best: WindowVisual | null = null, bd = 1e9;
            for (const w2 of this.world.windows) {
              if (w2 === w || !this.world.zoneActive[w2.cell.zone]) continue;
              const o = this.windowOccupant.get(w2);
              if (o && o.active) continue;
              const d2 = Math.hypot(w2.spawn.x - z.x, w2.spawn.z - z.z);
              if (d2 < bd) { bd = d2; best = w2; }
            }
            if (best) {
              if (bd > 14) { z.x = best.spawn.x; z.z = best.spawn.z; } // out of sight: shortcut around the building
              z.window = best;
            }
            z.stateT = 0;
          }
          if (z.stateT > 45) this.respawnElsewhere(z);
          break;
        }
        case 'window': {
          const w = z.window!;
          z.yaw = turn(z.yaw, w.yaw, 8, dt);
          if (this.host.boardsAt(w) > 0) {
            z.tearT += dt;
            if (z.tearT > ZOMBIE.boardTearTime * (z.tier === 'sprinter' ? 0.6 : z.tier === 'runner' ? 0.8 : 1)) {
              z.tearT = 0;
              this.host.tearBoard(w, z);
            }
          } else {
            z.setState('climb');
            z.climbFrom.set(z.x, 0, z.z);
            z.climbTo.copy(w.inside);
            audio.play('z_climb', { pos: { x: z.x, y: 1, z: z.z }, vol: 0.8 });
          }
          // swipe through the window if the player is right there
          if (distP < 1.6 && z.cooldown <= 0 && targetable) this.beginAttack(z);
          break;
        }
        case 'climb': {
          const t = clamp(z.stateT / (ZOMBIE.climbTime * (z.tier === 'walker' ? 1 : 0.7)), 0, 1);
          z.x = z.climbFrom.x + (z.climbTo.x - z.climbFrom.x) * t;
          z.z = z.climbFrom.z + (z.climbTo.z - z.climbFrom.z) * t;
          z.y = Math.sin(t * Math.PI) * 0.9;
          if (t >= 1) {
            z.y = 0;
            if (this.windowOccupant.get(z.window!) === z) this.windowOccupant.delete(z.window!);
            z.setState('chase');
          }
          break;
        }
        case 'chase': {
          if (!targetable) {
            // wander slowly while the player is downed
            z.phase += dt * 1.5;
            break;
          }
          let sp = z.speed * (z.enraged ? BRUTE.enragedSpeed / BRUTE.speed : 1);
          // direct line when close and visible, else flow field
          let mx = 0, mz = 0;
          const los = distP < 7 && g.los(z.x, z.z, p.x, p.z);
          if (los) { mx = dxp / (distP || 1); mz = dzp / (distP || 1); }
          else if (flow.direction(z.x, z.z, _dir)) { mx = _dir.x; mz = _dir.z; }
          else { mx = dxp / (distP || 1); mz = dzp / (distP || 1); }
          if (z.type === 'hound' && distP < 3 && distP > 1.2) sp *= 1.3;
          // smooth steering
          z.vx = damp(z.vx, mx * sp, z.type === 'hound' ? 8 : 5, dt);
          z.vz = damp(z.vz, mz * sp, z.type === 'hound' ? 8 : 5, dt);
          const slowK = 1 - z.stagger * 0.8;
          z.x += z.vx * dt * slowK; z.z += z.vz * dt * slowK;
          g.collideCircle(z, r * 0.9, (i, j) => !g.walkable(i, j));
          const sv = Math.hypot(z.vx, z.vz);
          if (sv > 0.1) z.yaw = turn(z.yaw, Math.atan2(z.vx, z.vz), z.type === 'hound' ? 10 : 6, dt);
          z.phase += dt * gaitRate(z, sv);
          // attack
          const range = z.type === 'hound' ? HOUND.attackRange : z.type === 'brute' ? BRUTE.slamRadius * 0.55 : ZOMBIE.attackRange * z.scale;
          if (distP < range && z.cooldown <= 0) this.beginAttack(z);
          // vocal: chase scream
          if (!z.screamed && distP < 11 && z.type === 'zombie' && z.tier !== 'walker') {
            z.screamed = true;
            audio.play('z_chase', { pos: { x: z.x, y: 1.6, z: z.z }, bus: 'voice', vol: 0.9, priority: 4 });
          }
          // stuck detection
          const fd = flow.distanceAt(z.x, z.z);
          if (fd < z.bestDist - 5) { z.bestDist = fd; z.stuckT = 0; } else z.stuckT += dt;
          if (z.stuckT > ZOMBIE.stuckRespawnSeconds && distP > 4) this.respawnElsewhere(z);
          break;
        }
        case 'attack': {
          const windup = z.type === 'hound' ? HOUND.attackWindup : z.type === 'brute' ? BRUTE.slamWindup : ZOMBIE.attackWindup;
          z.yaw = turn(z.yaw, Math.atan2(dxp, dzp), z.type === 'brute' ? 2 : 8, dt);
          if (z.type === 'hound' && z.stateT < windup + 0.15 && z.stateT > windup * 0.5) {
            z.x += Math.sin(z.yaw) * 5 * dt; z.z += Math.cos(z.yaw) * 5 * dt;
            g.collideCircle(z, r, (i, j) => !g.walkable(i, j));
          }
          if (!z.attackHit && z.stateT >= windup) {
            z.attackHit = true;
            if (z.type === 'brute') {
              this.host.fx.dust(z.x + Math.sin(z.yaw) * 1.2, 0.05, z.z + Math.cos(z.yaw) * 1.2, 0, 1, 0, 30, 0x6a6058);
              this.host.fx.decal(2, z.x + Math.sin(z.yaw) * 1.2, 0.01, z.z + Math.cos(z.yaw) * 1.2, 0, 1, 0, 2.4);
              audio.play('z_bruteSlam', { pos: { x: z.x, y: 0.3, z: z.z }, vol: 1, priority: 8 });
              this.host.shake(Math.max(0, 1 - distP / 10) * 1.2);
              if (distP < BRUTE.slamRadius && targetable) this.host.damagePlayer(BRUTE.slamDamage * (1 - distP / BRUTE.slamRadius * 0.5), z.x, z.z);
            } else {
              const reach = (z.type === 'hound' ? HOUND.attackRange : ZOMBIE.attackRange) + 0.45;
              const inWindow = z.state === 'attack' && z.window && this.windowOccupant.get(z.window) === z;
              if (distP < reach && targetable && (inWindow || g.los(z.x, z.z, p.x, p.z))) {
                this.host.damagePlayer(z.type === 'hound' ? HOUND.damage : ZOMBIE.attackDamage, z.x, z.z);
              }
            }
          }
          const total = windup + (z.type === 'brute' ? 0.9 : 0.35);
          if (z.stateT > total) {
            z.cooldown = z.type === 'hound' ? HOUND.attackCooldown : z.type === 'brute' ? 1.2 : 0.55;
            const backToWindow = z.window && this.windowOccupant.get(z.window) === z && this.host.boardsAt(z.window) > 0;
            z.setState(backToWindow ? 'window' : z.window && this.windowOccupant.get(z.window) === z ? 'window' : 'chase');
          }
          break;
        }
        case 'stagger':
          if (z.stateT > 0.45) z.setState('chase');
          break;
        case 'knockdown':
          if (z.stateT > 1.6) z.setState('chase');
          break;
        case 'dying': {
          z.deathT += dt;
          if (z.chipPop) {
            const c = z.chipPop;
            c.vy -= 9.8 * dt; c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
            if (c.y < 0.03) { c.y = 0.03; c.vy *= -0.3; c.vx *= 0.6; c.vz *= 0.6; }
            c.t += dt;
          }
          if (z.deathT > 0.18) {
            // slide a little along death dir for ragdoll-ish momentum
            const k = Math.max(0, 1 - (z.deathT - 0.18) * 2.5);
            z.x += z.deathDirX * k * dt * 1.5; z.z += z.deathDirZ * k * dt * 1.5;
          }
          if (z.deathT > 6.5) z.active = false;
          break;
        }
      }
      // vocals
      z.vocalT -= dt;
      if (z.vocalT <= 0 && z.state !== 'dying') {
        z.vocalT = rand(3, 7);
        const name = z.type === 'hound' ? 'z_houndSnarl' : z.type === 'brute' ? 'z_bruteRoar' : (z.state === 'chase' && z.tier !== 'walker' ? 'z_groan' : 'z_moan');
        audio.play(name, { pos: { x: z.x, y: 1.6 * z.scale, z: z.z }, bus: 'voice', vol: z.type === 'brute' ? 1 : 0.75, priority: 3, refDist: 2 });
      }
    }
    this.updateBuzz(dt);
  }

  private beginAttack(z: Zombie) {
    z.setState('attack');
    z.attackHit = false;
    const snd = z.type === 'hound' ? 'z_houndBark' : z.type === 'brute' ? 'z_bruteRoar' : 'z_attack';
    audio.play(snd, { pos: { x: z.x, y: 1.5, z: z.z }, bus: 'voice', vol: 1, priority: 6 });
  }

  /** Teleport a stuck zombie back to a fresh window spawn. */
  stuckRespawns = 0;
  stuckLog: string[] = [];
  respawnElsewhere(z: Zombie) {
    this.stuckRespawns++;
    if (this.stuckLog.length < 30) this.stuckLog.push(`${z.type}/${z.state} at ${z.x.toFixed(1)},${z.z.toFixed(1)} flow=${this.world.flow.distanceAt(z.x, z.z)} t=${z.stateT.toFixed(1)}`);
    if (z.window && this.windowOccupant.get(z.window) === z) this.windowOccupant.delete(z.window);
    const ws = this.world.windows.filter((w) => this.world.zoneActive[w.cell.zone]);
    if (!ws.length || z.type !== 'zombie') { z.stuckT = 0; z.bestDist = 1e9; return; }
    const w = pick(ws);
    z.window = w;
    z.x = w.spawn.x; z.z = w.spawn.z; z.y = 0;
    z.setState('outside');
    z.stuckT = 0; z.bestDist = 1e9;
  }

  private updateBuzz(dt: number) {
    this.buzzTimer -= dt;
    if (this.buzzTimer > 0) return;
    this.buzzTimer = 0.5;
    const p = this.host.playerPos;
    const near: Zombie[] = [];
    for (const z of this.all()) if (z.alive && !z.chipDead) near.push(z);
    near.sort((a, b) => ((a.x - p.x) ** 2 + (a.z - p.z) ** 2) - ((b.x - p.x) ** 2 + (b.z - p.z) ** 2));
    for (let i = 0; i < this.buzzVoices.length; i++) {
      const z = near[i];
      let v = this.buzzVoices[i];
      if (!z || Math.hypot(z.x - p.x, z.z - p.z) > 14) { if (v) { audio.stop(v, 0.3); this.buzzVoices[i] = null; } continue; }
      if (!v || !v.alive) {
        v = audio.play('z_chipBuzz', { pos: { x: z.x, y: 1.7, z: z.z }, loop: true, vol: 0.18, priority: 1, refDist: 1.2 });
        this.buzzVoices[i] = v;
      }
      if (v) v.setPos(z.chip.x ? { x: z.chip.x, y: z.chip.y, z: z.chip.z } : { x: z.x, y: 1.7, z: z.z });
    }
  }

  stopAudio() { for (const v of this.buzzVoices) audio.stop(v, 0.1); this.buzzVoices.fill(null); }

  // -------------------------------------------------------------- damage
  /** Apply damage. Returns true if killed. */
  damage(z: Zombie, dmg: number, part: Part, dirX: number, dirZ: number, opts: { explosive?: boolean; melee?: boolean; noStagger?: boolean } = {}): { killed: boolean; crit: boolean; cageBroke?: boolean } {
    if (!z.alive) return { killed: false, crit: false };
    let crit = false;
    if (z.type === 'brute' && z.cageHp > 0 && (part === 'chip' || part === 'cage' || part === 'head')) {
      z.cageHp -= dmg;
      audio.play('imp_cage', { pos: { x: z.head.x, y: z.head.y, z: z.head.z }, vol: 0.8 });
      this.host.fx.sparks(z.head.x, z.head.y + 0.15, z.head.z, -dirX, 0.5, -dirZ, 6, 0xffc070, 3);
      if (z.cageHp <= 0) {
        z.cageHp = 0;
        z.enraged = true;
        audio.play('z_bruteRoar', { pos: { x: z.x, y: 2.4, z: z.z }, bus: 'voice', vol: 1, priority: 8 });
        this.host.fx.sparks(z.head.x, z.head.y + 0.2, z.head.z, 0, 1, 0, 25, 0xffc070, 5);
        return { killed: false, crit: false, cageBroke: true };
      }
      return { killed: false, crit: false };
    }
    if (part === 'chip') { crit = true; z.chipStutter = 0.25; }
    z.hp -= dmg;
    z.hitFlash = 1;
    if (z.hp <= 0) {
      this.kill(z, part, dirX, dirZ, opts.explosive);
      return { killed: true, crit };
    }
    if (!opts.noStagger && z.type !== 'brute') {
      if (opts.explosive && z.type === 'zombie') { z.setState('knockdown'); z.deathDirX = dirX; z.deathDirZ = dirZ; }
      else if (dmg > z.maxHp * ZOMBIE.staggerThreshold && (z.state === 'chase' || z.state === 'attack')) { z.setState('stagger'); }
      else z.stagger = Math.min(1, z.stagger + 0.35);
    }
    if (Math.random() < 0.25) audio.play(z.type === 'hound' ? 'z_houndSnarl' : 'z_hurt', { pos: { x: z.x, y: 1.6, z: z.z }, bus: 'voice', vol: 0.7, priority: 3 });
    return { killed: false, crit };
  }

  kill(z: Zombie, part: Part, dirX: number, dirZ: number, explosive = false) {
    if (!z.alive) return;
    if (z.window && this.windowOccupant.get(z.window) === z) this.windowOccupant.delete(z.window);
    z.state = 'dying';
    z.stateT = 0;
    z.deathT = 0;
    z.y = Math.max(0, z.y);
    const k = explosive ? 2.5 : 1;
    z.deathDirX = dirX * k; z.deathDirZ = dirZ * k;
    z.chipDead = true;
    const fx = this.host.fx;
    fx.sparks(z.chip.x, z.chip.y, z.chip.z, 0, 1, 0, part === 'chip' ? 22 : 10, 0x80f0ff, part === 'chip' ? 4 : 2.5);
    fx.electric(z.chip.x, z.chip.y, z.chip.z, part === 'chip' ? 10 : 4, this.host.chipColor.getHex());
    if (part === 'chip' || explosive) {
      z.chipPop = { x: z.chip.x, y: z.chip.y, z: z.chip.z, vx: dirX * 2 + rand(-1, 1), vy: 3 + Math.random() * 2, vz: dirZ * 2 + rand(-1, 1), t: 0 };
    }
    const death = z.type === 'hound' ? 'z_houndDeath' : z.type === 'brute' ? 'z_bruteDeath' : 'z_death';
    audio.play(death, { pos: { x: z.x, y: 1.5, z: z.z }, bus: 'voice', vol: 0.9, priority: 5 });
    audio.play('imp_bodyfall', { pos: { x: z.x, y: 0.2, z: z.z }, vol: 0.7, delay: z.type === 'brute' ? 0.9 : 0.6, priority: 3 });
    fx.decal(3, z.x + dirX * 0.6, 0.012, z.z + dirZ * 0.6, 0, 1, 0, 1.0 + Math.random() * 0.6);
    this.host.onKilled(z);
  }

  killAll(filter: (z: Zombie) => boolean) {
    for (const z of this.all()) if (z.alive && filter(z)) this.kill(z, 'body', rand(-1, 1), rand(-1, 1));
  }

  // -------------------------------------------------------------- raycast
  private hitPool: ZHit[] = Array.from({ length: 64 }, () => ({ t: 0, z: null as unknown as Zombie, part: 'body' as Part, x: 0, y: 0, z_: 0 }));
  /** Ray vs every live creature's hit shapes. Returns hits sorted by distance (one per creature). */
  raycast(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, maxT: number, out: ZHit[]): ZHit[] {
    out.length = 0;
    let used = 0;
    for (const z of this.all()) {
      if (!z.alive || z.state === 'inactive') continue;
      // broad phase: distance from ray to creature axis
      const cx = z.x - ox, cz = z.z - oz;
      const proj = cx * dx + cz * dz;
      const hlen = Math.hypot(dx, dz) || 1e-6;
      if (proj < -1) continue;
      const perp = Math.abs(cx * dz - cz * dx) / hlen;
      if (perp > 1.2 * z.scale) continue;
      let best = maxT, part: Part = 'body';
      const chk = (cxw: number, cyw: number, czw: number, rad: number, p: Part) => {
        const t = raySphere(ox, oy, oz, dx, dy, dz, cxw, cyw, czw, rad);
        if (t >= 0 && t < best) { best = t; part = p; }
      };
      if (!z.chipDead) chk(z.chip.x, z.chip.y, z.chip.z, (z.type === 'brute' && z.cageHp > 0 ? 0.2 : 0.075) * z.scale, z.type === 'brute' && z.cageHp > 0 ? 'cage' : 'chip');
      chk(z.head.x, z.head.y, z.head.z, (z.type === 'hound' ? 0.14 : 0.13) * z.scale, 'head');
      const L = z.limbs;
      const segs = z.type === 'hound' ? 5 : 7;
      for (let s = 0; s < segs; s++) {
        const a = L[s * 2], b = L[s * 2 + 1];
        const rad = (s === 0 ? (z.type === 'hound' ? 0.17 : 0.19) : z.type === 'hound' ? 0.06 : 0.075) * z.scale;
        const t = rayCapsule(ox, oy, oz, dx, dy, dz, a, b, rad);
        if (t >= 0 && t < best) { best = t; part = s === 0 ? 'body' : 'limb'; }
      }
      if (best < maxT && used < this.hitPool.length) {
        const h = this.hitPool[used++];
        h.t = best; h.z = z; h.part = part;
        h.x = ox + dx * best; h.y = oy + dy * best; h.z_ = oz + dz * best;
        out.push(h);
      }
    }
    out.sort((a, b) => a.t - b.t);
    return out;
  }

  // -------------------------------------------------------------- pose & render
  pose(dt: number) {
    const H = this.human, D = this.hound;
    const glowCol = this.glowCol.copy(this.host.chipColor).lerp(ZombieManager.RED, this.chipTint);
    let hi = 0, di = 0;
    this.cageCount = 0;
    const lights: Zombie[] = [];
    for (const z of this.humans) {
      if (!z.active) continue;
      this.poseHuman(z, hi++, dt);
      if (!z.chipDead) lights.push(z);
    }
    for (const z of this.hounds) {
      if (!z.active) continue;
      this.poseHound(z, di++, dt);
      if (!z.chipDead) lights.push(z);
    }
    for (const p of HUMAN_PARTS) H.meshes[p].count = hi;
    H.meshes.cage.count = this.cageCount;
    for (const p of HOUND_PARTS) D.meshes[p].count = di;
    for (const p of HUMAN_PARTS) { H.meshes[p].instanceMatrix.needsUpdate = true; if (H.meshes[p].instanceColor) H.meshes[p].instanceColor!.needsUpdate = true; }
    for (const p of HOUND_PARTS) { D.meshes[p].instanceMatrix.needsUpdate = true; if (D.meshes[p].instanceColor) D.meshes[p].instanceColor!.needsUpdate = true; }
    for (const k in H.bake) H.bake[k].needsUpdate = true;
    for (const k in D.bake) D.bake[k].needsUpdate = true;
    // chip point lights for the nearest few
    const pp = this.host.playerPos;
    lights.sort((a, b) => ((a.x - pp.x) ** 2 + (a.z - pp.z) ** 2) - ((b.x - pp.x) ** 2 + (b.z - pp.z) ** 2));
    for (let n = 0; n < this.chipLights.length; n++) {
      const l = this.chipLights[n], z = lights[n];
      if (!z) { l.intensity = 0; continue; }
      l.position.copy(z.chip);
      l.color.copy(glowCol);
      l.intensity = 1.6 * z.chipFlicker;
    }
    void hi;
  }

  private setInst<P extends string>(rig: RigMeshes<P>, part: P, i: number, m: THREE.Matrix4, col: THREE.Color | null) {
    rig.meshes[part].setMatrixAt(i, m);
    if (col) rig.meshes[part].setColorAt(i, col);
    const b = rig.bake[part];
    if (b) b.setXYZ(i, _probe.r, _probe.g, _probe.b);
  }

  private poseHuman(z: Zombie, i: number, dt: number) {
    const H = this.human, P = this.poser;
    this.world.baker.sample(z.x, z.z, _probe);
    const flash = z.hitFlash;
    _probe.r = _probe.r * 0.95 + flash * 0.25; _probe.g = _probe.g * 0.95 + flash * 0.05; _probe.b = _probe.b * 0.95 + flash * 0.03;
    const s = z.scale;
    const t = this.time;
    const moving = z.state === 'chase' || z.state === 'outside';
    const run = z.tier !== 'walker' || z.type === 'brute';
    const ph = z.phase;
    const sinP = Math.sin(ph), cosP = Math.cos(ph);
    const limp = z.limp;
    // base values
    let hunch = z.type === 'brute' ? 0.35 : 0.28 + (run ? 0.18 : 0);
    let bodyRoll = Math.sin(ph) * 0.06 + limp * 0.08;
    let hipY = 0.93;
    let rootPitch = 0;
    let legL = 0, legR = 0, kneeL = 0, kneeR = 0;
    let armLx = -1.25, armRx = -1.15, armLz = 0.15, armRz = -0.15, elbowL = -0.3, elbowR = -0.4;
    let headX = 0.1 + Math.sin(t * 1.7 + i) * 0.08, headZ = Math.sin(t * 0.9 + i * 2) * 0.15;
    if (moving) {
      const amp = run ? 0.75 : 0.42;
      const aL = amp * (limp > 0 ? 1 - limp * 0.6 : 1), aR = amp * (limp < 0 ? 1 + limp * 0.6 : 1);
      legL = sinP * aL; legR = -sinP * aR;
      kneeL = Math.max(0, -Math.sin(ph + 0.6)) * (run ? 1.3 : 0.7);
      kneeR = Math.max(0, Math.sin(ph + 0.6)) * (run ? 1.3 : 0.7);
      hipY = 0.93 - Math.abs(cosP) * (run ? 0.07 : 0.035) - Math.abs(limp) * 0.03 * Math.max(0, limp > 0 ? sinP : -sinP);
      if (z.tier === 'sprinter' && z.type === 'zombie') {
        hunch = 0.6;
        armLx = 0.6 - sinP * 0.9; armRx = 0.6 + sinP * 0.9; elbowL = -1.2; elbowR = -1.2; armLz = 0.25; armRz = -0.25;
      } else if (run) {
        armLx = -1.4 + sinP * 0.5; armRx = -1.3 - sinP * 0.5; elbowL = -0.2; elbowR = -0.3;
      } else {
        armLx = -1.2 + Math.sin(ph * 0.5 + 1) * 0.15; armRx = -1.05 + Math.sin(ph * 0.5) * 0.18;
      }
    }
    if (z.state === 'window') {
      // grab & yank boards
      const k = Math.sin((z.tearT / ZOMBIE.boardTearTime) * Math.PI);
      armLx = -1.7 + k * 0.6; armRx = -1.9 + k * 0.7; elbowL = -0.2 - k * 0.6; elbowR = -0.1 - k * 0.7;
      hunch = 0.25 - k * 0.15;
    }
    if (z.state === 'climb') {
      const k = clamp(z.stateT / ZOMBIE.climbTime, 0, 1);
      hunch = 0.9 * Math.sin(k * Math.PI) + 0.2; armLx = -1.6; armRx = -1.6; legL = -0.9 * Math.sin(k * Math.PI); legR = 0.5; kneeL = 1.4; kneeR = 0.6;
    }
    if (z.state === 'emerge') {
      armLx = -2.6 + clamp(z.stateT, 0, 1) * 1.2; armRx = -2.4 + clamp(z.stateT, 0, 1) * 1.1; hunch = 0.5;
    }
    if (z.state === 'attack') {
      const w = z.type === 'brute' ? BRUTE.slamWindup : ZOMBIE.attackWindup;
      const k = z.stateT / w;
      if (z.type === 'brute') {
        const raise = clamp(k, 0, 1), down = clamp((z.stateT - w) / 0.2, 0, 1);
        armLx = armRx = -3.0 * raise + down * 2.6; elbowL = elbowR = -0.4;
        hunch = 0.1 - raise * 0.3 + down * 0.9;
      } else if (k < 1) { armRx = -1.2 - k * 1.6; elbowR = -1.2 * k; hunch = 0.2 - k * 0.15; armLx = -1.0; }
      else { const s2 = clamp((z.stateT - w) / 0.18, 0, 1); armRx = -2.8 + s2 * 2.6; elbowR = -1.2 + s2 * 1.0; hunch = 0.05 + s2 * 0.5; armRz = -0.15 - s2 * 0.6; }
    }
    if (z.state === 'stagger') { hunch -= 0.4 * Math.sin((z.stateT / 0.45) * Math.PI); armLx = -0.4; armRx = -0.3; }
    hunch -= z.stagger * 0.25;
    if (z.state === 'knockdown') {
      const k = z.stateT;
      const down = k < 0.4 ? k / 0.4 : k > 1.1 ? 1 - (k - 1.1) / 0.5 : 1;
      rootPitch = -down * 1.45; hipY = 0.93 - down * 0.7; kneeL = kneeR = down * 0.6; armLx = -0.5 - down; armRx = -0.4 - down;
    }
    if (z.state === 'dying') {
      const dt2 = Math.max(0, z.deathT - 0.15);
      const fall = clamp(dt2 * dt2 * 3.2, 0, 1);
      const sink = clamp((z.deathT - 5.2) / 1.2, 0, 1);
      rootPitch = fall * (z.deathDirX * Math.sin(z.yaw) + z.deathDirZ * Math.cos(z.yaw) >= 0 ? 1.5 : -1.5);
      hipY = 0.93 - fall * 0.78 - sink * 0.35;
      kneeL = 0.4 + fall * 0.5; kneeR = 0.3 + fall * 0.9;
      const flop = Math.sin(z.deathT * 18) * Math.exp(-z.deathT * 4) * 0.4;
      armLx = -0.6 + flop - fall * 1.6; armRx = -0.2 - flop - fall * 1.1; armLz = 0.8 * fall; armRz = -1.0 * fall;
      hunch = 0.1 + fall * 0.4; headX = fall * 0.5 + flop;
    }
    // hierarchy
    const root = _m[0], pelvis = _m[1], torso = _m[2], head = _m[3], tmp = _m[4], ua = _m[5], la = _m[6], ul = _m[7];
    P.local(root, IDENT, z.x, z.y, z.z, rootPitch, z.yaw, 0, s);
    P.local(pelvis, root, 0, hipY, 0, 0, 0, bodyRoll * 0.5);
    const torsoScale = z.type === 'brute' ? 1.25 : 1;
    // pelvis colour = trousers/clothing
    _col.copy(z.cloth).multiplyScalar(0.9);
    this.setInst(H, 'pelvis', i, pelvis, _col);
    P.local(torso, pelvis, 0, 0.06, 0, hunch, Math.sin(z.phase * 0.5) * 0.08, bodyRoll, torsoScale, 1, torsoScale);
    _col.copy(z.cloth);
    this.setInst(H, 'torso', i, torso, _col);
    P.local(head, torso, 0, 0.62, 0.02, headX - hunch * 0.6, headZ * 0.4, headZ + z.shoulder * 2, 1 / torsoScale);
    _col.copy(z.skin);
    this.setInst(H, 'head', i, head, _col);
    // chip + glow
    P.local(tmp, head, 0.045 + z.chipOff * 0.025, 0.215 - Math.abs(z.chipOff) * 0.012, -0.02 + z.chipOff * 0.02, 0.2, 0.3 + z.chipOff * 0.4, -0.35 - z.chipOff * 0.15);
    if (z.chipPop) {
      const c = z.chipPop;
      P.local(tmp, IDENT, c.x, c.y, c.z, c.t * 9, c.t * 7, 0, s);
    }
    this.setInst(H, 'chip', i, tmp, null);
    _v.setFromMatrixPosition(tmp);
    if (!z.chipPop) z.chip.copy(_v); else z.chip.set(z.chipPop.x, z.chipPop.y, z.chipPop.z);
    // flicker
    let fl = 0.75 + Math.sin(t * 23 + i * 3) * 0.12 + (Math.random() < 0.04 ? -0.5 : 0);
    if (z.chipStutter > 0) fl = Math.random() < 0.6 ? 0.05 : 1.4;
    if (z.chipDead) fl = Math.max(0, 1 - z.deathT * 6) * (Math.random() < 0.5 ? 1.5 : 0.2);
    z.chipFlicker = Math.max(0, fl);
    _col.copy(this.glowCol).multiplyScalar(z.chipFlicker * 3);
    H.meshes.glow.setMatrixAt(i, tmp);
    H.meshes.glow.setColorAt(i, _col);
    // cage
    // cages are packed into their own slots so only brutes pay for the geometry
    if (z.type === 'brute' && z.cageHp > 0) { P.local(tmp, head, 0, 0.02, 0, 0, 0, 0, 1.15); this.setInst(H, 'cage', this.cageCount++, tmp, null); }
    z.head.setFromMatrixPosition(head).add(_v.set(0, 0.12 * s, 0));
    z.neck.setFromMatrixPosition(head);
    z.pelvis.setFromMatrixPosition(pelvis);
    z.limbs[0].copy(z.pelvis); z.limbs[1].copy(z.neck);
    // arms
    let li = 2;
    for (const side of [-1, 1]) {
      const ax = side < 0 ? armLx : armRx, az = side < 0 ? armLz : armRz, el = side < 0 ? elbowL : elbowR;
      const swayA = Math.sin(t * 2 + i + side) * 0.06;
      P.local(ua, torso, side * 0.21, 0.47 + side * z.shoulder, 0, ax + swayA, 0, az + side * 0.05, 1, z.armLen, 1);
      _col.copy(z.type === 'brute' ? z.skin : z.cloth).multiplyScalar(0.95);
      this.setInst(H, side < 0 ? 'uArmL' : 'uArmR', i, ua, _col);
      P.local(la, ua, 0, -0.36, 0, el, 0, 0, 1, 1, 1);
      _col.copy(z.skin);
      this.setInst(H, side < 0 ? 'lArmL' : 'lArmR', i, la, _col);
      z.limbs[li++].setFromMatrixPosition(ua);
      _v.set(0, -0.4, 0).applyMatrix4(la);
      z.limbs[li++].copy(_v);
    }
    // legs
    for (const side of [-1, 1]) {
      const lg = side < 0 ? legL : legR, kn = side < 0 ? kneeL : kneeR;
      P.local(ul, pelvis, side * 0.1, -0.06, 0, -lg, 0, side * 0.04);
      _col.copy(z.trousers);
      this.setInst(H, side < 0 ? 'uLegL' : 'uLegR', i, ul, _col);
      P.local(la, ul, 0, -0.43, 0, kn, 0, 0);
      _col.copy(side === Math.sign(z.limp) ? z.skin : z.trousers);
      this.setInst(H, side < 0 ? 'lLegL' : 'lLegR', i, la, _col);
      z.limbs[li++].setFromMatrixPosition(ul);
      _v.set(0, -0.42, 0).applyMatrix4(la);
      z.limbs[li++].copy(_v);
    }
    void dt; void damp;
  }

  private poseHound(z: Zombie, i: number, dt: number) {
    const D = this.hound, P = this.poser;
    this.world.baker.sample(z.x, z.z, _probe);
    _probe.r = _probe.r * 1.2 + z.hitFlash * 0.25; _probe.g *= 1.2; _probe.b *= 1.2;
    const ph = z.phase;
    const moving = z.state === 'chase';
    const gal = moving ? 1 : 0.15;
    let pitch = 0, bodyY = 0.55 + Math.abs(Math.sin(ph)) * 0.06 * gal, roll = 0;
    if (z.state === 'attack') { const k = clamp(z.stateT / HOUND.attackWindup, 0, 1.5); pitch = k < 1 ? 0.25 * k : -0.4; bodyY += k < 1 ? -0.1 * k : 0.25; }
    if (z.state === 'dying') { const f = clamp(z.deathT * 3, 0, 1); roll = f * 1.5; bodyY = 0.55 - f * 0.38 - clamp((z.deathT - 5.2) / 1.2, 0, 1) * 0.3; }
    if (z.state === 'emerge') { bodyY = 0.55 * clamp(z.stateT / 0.6, 0, 1); }
    const root = _m[0], body = _m[1], head = _m[2], up = _m[3], low = _m[4], tmp = _m[5];
    P.local(root, IDENT, z.x, 0, z.z, 0, z.yaw, 0);
    P.local(body, root, 0, bodyY, 0, pitch + Math.sin(ph * 2) * 0.05 * gal, 0, roll);
    _col.copy(z.skin);
    this.setInst(D, 'hBody', i, body, _col);
    P.local(head, body, 0, 0.14, 0.45, -0.15 + Math.sin(ph * 2 + 1) * 0.1 * gal + (z.state === 'attack' ? -0.3 : 0), Math.sin(this.time * 3 + i) * 0.1, 0);
    this.setInst(D, 'hHead', i, head, _col);
    P.local(tmp, head, 0.0, 0.1, -0.02, -0.2, 0, 0.2, 0.9);
    this.setInst(D, 'chip', i, tmp, null);
    z.chip.setFromMatrixPosition(tmp);
    if (z.chipPop) z.chip.set(z.chipPop.x, z.chipPop.y, z.chipPop.z);
    let fl = 0.8 + Math.sin(this.time * 29 + i) * 0.15;
    if (z.chipDead) fl = Math.max(0, 1 - z.deathT * 6);
    z.chipFlicker = fl;
    D.meshes.glow.setMatrixAt(i, tmp);
    _col.copy(this.glowCol).multiplyScalar(fl * 3);
    D.meshes.glow.setColorAt(i, _col);
    z.head.setFromMatrixPosition(head);
    // legs: gallop gait (front pair vs back pair offset)
    const legs: [HoundPart, HoundPart, number, number, number][] = [
      ['hLegFL', 'hLowFL', -0.1, 0.27, 0], ['hLegFR', 'hLowFR', 0.1, 0.27, 0.4],
      ['hLegBL', 'hLowBL', -0.1, -0.27, Math.PI], ['hLegBR', 'hLowBR', 0.1, -0.27, Math.PI + 0.4],
    ];
    _col.copy(z.cloth);
    let li = 2;
    for (const [u, l, x, zz, off] of legs) {
      const a = Math.sin(ph + off) * 0.8 * gal;
      P.local(up, body, x, -0.05, zz, a, 0, 0);
      this.setInst(D, u, i, up, _col);
      P.local(low, up, 0, -0.26, 0, Math.max(0, Math.sin(ph + off + 1)) * 0.9 * gal - (zz < 0 ? 0.4 : -0.2), 0, 0);
      this.setInst(D, l, i, low, _col);
      if (li < 10) { z.limbs[li++].setFromMatrixPosition(up); _v.set(0, -0.28, 0).applyMatrix4(low); z.limbs[li++].copy(_v); }
    }
    P.local(tmp, body, 0, 0.1, -0.35, -0.9 + Math.sin(this.time * 8 + i) * 0.3, 0, 0);
    this.setInst(D, 'hTail', i, tmp, _col);
    // body capsule
    _v.set(0, 0, -0.35).applyMatrix4(body); z.limbs[0].copy(_v);
    _v.set(0, 0.05, 0.35).applyMatrix4(body); z.limbs[1].copy(_v);
    void dt;
  }

  clear() {
    for (const z of this.humans) z.active = false;
    for (const z of this.hounds) z.active = false;
    this.windowOccupant.clear();
  }
}


const IDENT = new THREE.Matrix4();

function radius(z: Zombie) { return z.type === 'brute' ? BRUTE.radius : z.type === 'hound' ? HOUND.radius : ZOMBIE.radius; }
function gaitRate(z: Zombie, sp: number) { return z.type === 'hound' ? 2.2 + sp * 1.4 : 1.5 + sp * 2.1; }
function turn(cur: number, target: number, rate: number, dt: number) {
  const d = wrapAngle(target - cur);
  return cur + d * Math.min(1, rate * dt);
}

export function raySphere(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, cx: number, cy: number, cz: number, r: number): number {
  const lx = cx - ox, ly = cy - oy, lz = cz - oz;
  const tca = lx * dx + ly * dy + lz * dz;
  if (tca < 0) return -1;
  const d2 = lx * lx + ly * ly + lz * lz - tca * tca;
  if (d2 > r * r) return -1;
  return tca - Math.sqrt(r * r - d2);
}

/** Approximate ray vs capsule (segment a-b, radius r). */
export function rayCapsule(ox: number, oy: number, oz: number, dx: number, dy: number, dz: number, a: THREE.Vector3, b: THREE.Vector3, r: number): number {
  // closest points between ray and segment
  const ux = b.x - a.x, uy = b.y - a.y, uz = b.z - a.z;
  const wx = ox - a.x, wy = oy - a.y, wz = oz - a.z;
  const A = ux * ux + uy * uy + uz * uz;
  const B = ux * dx + uy * dy + uz * dz;
  const C = dx * dx + dy * dy + dz * dz;
  const Dd = ux * wx + uy * wy + uz * wz;
  const E = dx * wx + dy * wy + dz * wz;
  const den = A * C - B * B;
  let s = den > 1e-8 ? (Dd * C - B * E) / den : 0;
  s = Math.max(0, Math.min(1, s));
  let t = (B * s - E) / C;
  if (t < 0) t = 0;
  const px = a.x + ux * s - (ox + dx * t), py = a.y + uy * s - (oy + dy * t), pz = a.z + uz * s - (oz + dz * t);
  const d2 = px * px + py * py + pz * pz;
  if (d2 > r * r) return -1;
  return Math.max(0, t - Math.sqrt(r * r - d2));
}
