import * as THREE from 'three';
import type { Grid } from '../world/grid';
import type { Input } from '../input/input';
import { clamp, damp } from '../core/math';
import { PERK_TUNING, type PerkId } from '../config/perks';
import { groundY } from '../world/terrain';

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
  stats = { kills: 0, headshots: 0, chipKills: 0, pointsEarned: 0, doorsOpened: 0, time: 0, downs: 0 };

  spawn(x: number, z: number, yaw: number) {
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

    // movement
    let mx = input.moveX, my = input.moveY;
    const mag = Math.hypot(mx, my);
    if (mag > 1) { mx /= mag; my /= mag; }
    const fleet = this.perks.has('fleetfoot');
    const wantSprint = input.sprint && my > 0.3 && !this.downed && this.ads < 0.2 && !input.fire;
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
    blockers(this.pos);
    for (let k = 0; k < 2; k++) grid.collideCircle(this.pos, this.radius, (i, j) => grid.solidForPlayer(i, j));
    this.speed = Math.hypot(this.vel.x, this.vel.y);

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
    cam.position.set(x + Math.cos(this.yaw) * bx, this.eye + by + groundY(x, z), z - Math.sin(this.yaw) * bx);
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
