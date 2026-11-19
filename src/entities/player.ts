import * as THREE from 'three';
import type { Grid } from '../world/grid';
import type { Input } from '../input/input';
import { clamp, damp } from '../core/math';
import { PERK_TUNING, type PerkId } from '../config/perks';
import { groundY } from '../world/terrain';
import { K } from '../world/grid';
import { type Ladder, inRect, clampToRect } from '../world/ladders';
import { audio } from '../audio/audioEngine';

/**
 * First-person player: movement with grid collision, sprint stamina, health + regen,
 * downed state, and camera feel (bob, landing, recoil offsets owned by the weapon system).
 */
export class Player {
  readonly pos = new THREE.Vector3();
  readonly prevPos = new THREE.Vector3();
  readonly vel = new THREE.Vector2();
  yaw = 0;
  pitch = 0;
  radius = 0.3;
  eye = 1.62;
  hp = 100;
  maxHp = 100;
  regenDelay = 4;
  sinceDamage = 99;
  downed = false;
  downTimer = 0;
  selfRevives = 2;
  dead = false;
  perks = new Set<PerkId>();
  secondWindBuys = 0;
  sprinting = false;
  stamina = 1;
  bobPhase = 0;
  bobAmount = 0;
  moveSpeedMult = 1;
  ads = 0;              // 0..1 aim progress (set by weapon system)
  recoilPitch = 0;      // camera kick (radians), recovers in weapon system
  recoilYaw = 0;
  shake = 0;
  speed = 0;
  /** external slowdown (e.g. hit by zombie) */
  slow = 0;
  points = 0;
  // ---- vertical movement: jumping, vaulting low cover, ladders and platforms
  mode: 'ground' | 'ladder' | 'platform' | 'vault' = 'ground';
  /** height of the floor you stand on above the terrain (platform / ladder) */
  elev = 0;
  /** airborne offset above that floor */
  jumpY = 0;
  vy = 0;
  ladder: Ladder | null = null;
  ladders: Ladder[] = [];
  private vault: { fx: number; fz: number; tx: number; tz: number; t: number; dur: number } | null = null;
  /** camera dip after landing */
  land = 0;
  /** feet height above the terrain (what zombies compare against) */
  get height() { return this.elev + this.jumpY; }
  stats = { kills: 0, headshots: 0, chipKills: 0, pointsEarned: 0, doorsOpened: 0, time: 0, downs: 0 };

  spawn(x: number, z: number, yaw: number) {
    this.mode = 'ground'; this.elev = 0; this.jumpY = 0; this.vy = 0; this.ladder = null; this.vault = null;
    this.pos.set(x, 0, z);
    this.prevPos.copy(this.pos);
    this.yaw = yaw;
    this.pitch = 0;
  }

  get maxHealth() { return this.perks.has('ironhide') ? PERK_TUNING.ironhideHp : 100; }

  update(dt: number, input: Input, grid: Grid, weaponMoveMult: number, blockers: (pos: THREE.Vector3) => void) {
    this.prevPos.copy(this.pos);
    // look
    const [dx, dy] = input.consumeLook();
    this.yaw -= dx;
    this.pitch = clamp(this.pitch - dy, -1.45, 1.45);

    // regen
    this.maxHp = this.maxHealth;
    this.sinceDamage += dt;
    if (!this.downed && this.sinceDamage > this.regenDelay && this.hp < this.maxHp) {
      this.hp = Math.min(this.maxHp, this.hp + dt * 60);
    }

    const jumpPressed = input.consume('jump');
    // vaulting over low cover: a short scripted hop
    if (this.mode === 'vault' && this.vault) {
      const v = this.vault;
      v.t += dt;
      const k = Math.min(1, v.t / v.dur), e = k * k * (3 - 2 * k);
      this.pos.x = v.fx + (v.tx - v.fx) * e; this.pos.z = v.fz + (v.tz - v.fz) * e;
      this.jumpY = Math.sin(k * Math.PI) * 0.7;
      if (k >= 1) { this.mode = 'ground'; this.vault = null; this.jumpY = 0; this.land = 0.5; }
      this.finishFrame(dt);
      return;
    }
    // on a ladder: forward climbs, back descends, jump lets go
    if (this.mode === 'ladder' && this.ladder) {
      const L = this.ladder;
      // forward = the way you're facing: toward the ladder climbs, facing away (or looking down) descends
      const facing = -Math.sin(this.yaw) * L.nx - Math.cos(this.yaw) * L.nz;
      const dir = facing < -0.2 || (this.pitch < -0.6 && facing < 0.5) ? -1 : 1;
      const climb = clamp(input.moveY, -1, 1) * dir;
      this.elev = clamp(this.elev + climb * 2.6 * dt, 0, L.top);
      this.pos.x = L.bx + L.nx * 0.05; this.pos.z = L.bz + L.nz * 0.05;
      this.vel.set(0, 0);
      this.sprinting = false;
      if (Math.abs(climb) > 0.1) { this.bobPhase += dt * 7; if (Math.sin(this.bobPhase) * Math.sin(this.bobPhase - dt * 7) < 0) audio.play('ui_step', { pos: { x: this.pos.x, y: this.elev, z: this.pos.z }, vol: 0.35, rate: 1.3 }); }
      if (this.elev >= L.top - 0.02 && climb > 0.2) {
        this.mode = 'platform'; this.elev = L.top; this.pos.x = L.tx; this.pos.z = L.tz; this.ladder = null; this.land = 0.3;
      } else if (this.elev <= 0.01 && climb < -0.2) {
        this.mode = 'ground'; this.elev = 0; this.pos.x = L.bx - L.nx * 0.35; this.pos.z = L.bz - L.nz * 0.35; this.ladder = null;
      } else if (jumpPressed || this.downed) {
        // let go: drop from where you are
        this.mode = 'ground'; this.jumpY = this.elev; this.elev = 0; this.vy = 0; this.ladder = null;
        this.pos.x = L.bx - L.nx * 0.4; this.pos.z = L.bz - L.nz * 0.4;
      }
      this.finishFrame(dt);
      return;
    }

    // movement
    let mx = input.moveX, my = input.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const fleet = this.perks.has('fleetfoot');
    // aiming (button, toggle or the look-pad tap) always wins over sprinting
    const wantSprint = input.sprint && my > 0.3 && !this.downed && this.ads < 0.2 && !input.fire && !input.aiming;
    if (wantSprint && this.stamina > 0.02) {
      this.sprinting = true;
      this.stamina -= dt / (fleet ? 8 : 4);
    } else {
      this.sprinting = false;
      this.stamina = Math.min(1, this.stamina + dt / 3);
    }
    if (this.stamina <= 0) this.stamina = 0;
    let speed = 4.3;
    if (this.sprinting) speed = 6.6 * (fleet ? PERK_TUNING.fleetfootSprintMult : 1);
    if (this.downed) speed = 1.1;
    speed *= weaponMoveMult;
    speed *= 1 - this.ads * 0.45;
    speed *= 1 - this.slow * 0.5;
    this.slow = Math.max(0, this.slow - dt * 1.5);
    const sin = Math.sin(this.yaw), cos = Math.cos(this.yaw);
    // forward = (-sin, -cos), right = (cos, -sin)
    const tx = (-sin * my + cos * mx) * speed;
    const tz = (-cos * my - sin * mx) * speed;
    const accel = mag > 0.05 ? 14 : 18;
    this.vel.x = damp(this.vel.x, tx, accel, dt);
    this.vel.y = damp(this.vel.y, tz, accel, dt);
    this.pos.x += this.vel.x * dt;
    this.pos.z += this.vel.y * dt;
    if (this.mode === 'platform') {
      // up on a platform: the railing holds you in, except at the ladder opening
      const L = this.ladders.find((l) => inRect(l, this.pos.x, this.pos.z, 1.2));
      if (L) {
        const toTop = Math.hypot(this.pos.x - L.tx, this.pos.z - L.tz);
        const outward = -(this.vel.x * L.nx + this.vel.y * L.nz);
        clampToRect(L, this.pos, this.radius);
        if (toTop < 0.7 && outward > 1.2) {
          this.mode = 'ladder'; this.ladder = L; this.elev = L.top - 0.15; this.jumpY = 0;
        }
      } else { this.mode = 'ground'; this.jumpY = this.elev; this.elev = 0; }
    } else {
      blockers(this.pos);
      for (let k = 0; k < 2; k++) grid.collideCircle(this.pos, this.radius, (i, j) => grid.solidForPlayer(i, j));
      // walk into a ladder to climb it
      if (this.jumpY < 0.3 && !this.downed) for (const L of this.ladders) {
        const d = Math.hypot(this.pos.x - L.bx, this.pos.z - L.bz);
        const into = this.vel.x * L.nx + this.vel.y * L.nz;
        if (d < 0.75 && into > 1.0) { this.mode = 'ladder'; this.ladder = L; this.elev = 0.05; this.jumpY = 0; this.vy = 0; break; }
      }
    }
    // jump — or vault, if there is low cover right in front of you
    if (jumpPressed && this.mode !== 'ladder' && this.jumpY < 0.05 && !this.downed) {
      if (!(this.mode === 'ground' && this.tryVault(grid))) { this.vy = 4.7; this.jumpY = 0.001; audio.play('ui_step', { pos: { x: this.pos.x, y: 0, z: this.pos.z }, vol: 0.5, rate: 0.8 }); }
    }
    this.speed = Math.hypot(this.vel.x, this.vel.y);
    this.finishFrame(dt);
  }

  /** Low cover ahead + open floor behind it → hop over. */
  private tryVault(grid: Grid): boolean {
    const fx = -Math.sin(this.yaw), fz = -Math.cos(this.yaw);
    // prefer the direction you're moving, else where you look
    const sp = Math.hypot(this.vel.x, this.vel.y);
    const dx = sp > 0.8 ? this.vel.x / sp : fx, dz = sp > 0.8 ? this.vel.y / sp : fz;
    for (const reach of [0.55, 0.9]) {
      const ci = Math.floor(this.pos.x + dx * reach), cj = Math.floor(this.pos.z + dz * reach);
      if (!grid.vaultable(ci, cj)) continue;
      // landing: first open floor cell past the cover (max 2 cells of cover), same or adjacent zone only
      for (let s = 1; s <= 3; s++) {
        const lx = this.pos.x + dx * (reach + s * 0.9), lz = this.pos.z + dz * (reach + s * 0.9);
        const li = Math.floor(lx), lj = Math.floor(lz);
        if (grid.kindAt(li, lj) === K.FLOOR) {
          if (grid.zoneAt(li, lj) !== grid.zoneAtPos(this.pos.x, this.pos.z)) return false;
          const tx = li + 0.5 + (lx - li - 0.5) * 0.4, tz = lj + 0.5 + (lz - lj - 0.5) * 0.4;
          this.mode = 'vault';
          this.vault = { fx: this.pos.x, fz: this.pos.z, tx, tz, t: 0, dur: 0.42 + 0.12 * s };
          audio.play('ui_step', { pos: { x: this.pos.x, y: 0, z: this.pos.z }, vol: 0.6, rate: 0.7 });
          return true;
        }
        if (!grid.vaultable(li, lj)) return false;
      }
      return false;
    }
    return false;
  }

  /** Gravity, landing and the shared per-frame bookkeeping. */
  private finishFrame(dt: number) {
    if (this.mode !== 'vault' && (this.jumpY > 0 || this.vy > 0)) {
      this.vy -= 15 * dt;
      this.jumpY += this.vy * dt;
      if (this.jumpY <= 0) {
        const hard = this.vy < -7;
        this.jumpY = 0; this.vy = 0; this.land = hard ? 1 : 0.6;
        audio.play('ui_step', { pos: { x: this.pos.x, y: 0, z: this.pos.z }, vol: hard ? 0.9 : 0.55, rate: 0.75 });
      }
    }
    this.land = Math.max(0, this.land - dt * 3);

    // bob
    const moving = this.speed > 0.5;
    this.bobAmount = damp(this.bobAmount, moving ? Math.min(1, this.speed / 4.3) : 0, 8, dt);
    this.bobPhase += dt * (this.sprinting ? 13 : 9.5) * (moving ? 1 : 0.3);
    this.shake = Math.max(0, this.shake - dt * 2.5);
    this.eye = damp(this.eye, this.downed ? 0.55 : 1.62, 6, dt);
  }

  /** Writes the camera transform (with interpolation alpha). */
  applyCamera(cam: THREE.PerspectiveCamera, alpha: number, time: number) {
    const x = this.prevPos.x + (this.pos.x - this.prevPos.x) * alpha;
    const z = this.prevPos.z + (this.pos.z - this.prevPos.z) * alpha;
    const bob = this.bobAmount * (1 - this.ads * 0.85);
    const by = Math.abs(Math.sin(this.bobPhase)) * 0.045 * bob;
    const bx = Math.cos(this.bobPhase) * 0.025 * bob;
    // aimed: keep the view (and the reticle) on the bullet path
    const sh = this.shake * this.shake * (1 - this.ads * 0.85);
    const shx = (Math.sin(time * 61) + Math.sin(time * 37)) * 0.02 * sh;
    const shy = (Math.sin(time * 53) + Math.sin(time * 29)) * 0.02 * sh;
    const dip = Math.sin(this.land * Math.PI) * 0.12 * this.land;
    cam.position.set(x + Math.cos(this.yaw) * bx, this.eye + by - dip + this.elev + this.jumpY + groundY(x, z), z - Math.sin(this.yaw) * bx);
    cam.rotation.order = 'YXZ';
    cam.rotation.y = this.yaw + this.recoilYaw + shx;
    cam.rotation.x = this.pitch + this.recoilPitch + shy;
    cam.rotation.z = (this.downed ? 0.25 : 0) + Math.sin(this.bobPhase * 0.5) * 0.004 * bob;
  }

  /** Forward look vector (with recoil). */
  forward(out: THREE.Vector3) {
    const p = this.pitch + this.recoilPitch, y = this.yaw + this.recoilYaw;
    out.set(-Math.sin(y) * Math.cos(p), Math.sin(p), -Math.cos(y) * Math.cos(p));
    return out;
  }
}
