import * as THREE from 'three';
import { WEAPONS, statsFor, type WeaponDef, type WeaponStats, type ReloadStyle } from '../config/weapons';
import { PERK_TUNING } from '../config/perks';
import type { Input } from '../input/input';
import type { Player } from '../entities/player';
import { Viewmodel } from './viewmodel';
import { audio } from '../audio/audioEngine';
import { bus } from '../core/events';
import { damp, clamp } from '../core/math';
import { save } from '../core/save';

export class WeaponInstance {
  mag: number;
  reserve: number;
  stats: WeaponStats;
  constructor(public def: WeaponDef, public upgraded = false) {
    this.stats = statsFor(def, upgraded);
    this.mag = this.stats.mag;
    this.reserve = this.stats.reserve;
  }
  upgrade() {
    this.upgraded = true;
    this.stats = statsFor(this.def, true);
    this.mag = this.stats.mag;
    this.reserve = this.stats.reserve;
  }
  refill() { this.mag = this.stats.mag; this.reserve = this.stats.reserve; }
  get name() { return this.upgraded ? this.def.upgradedName : this.def.name; }
  get soundId() { return 'gun_' + this.def.id + (this.upgraded ? '_up' : ''); }
}

/** What the weapon system needs from the game (implemented by systems/damage.ts Combat). */
export interface CombatHost {
  hitscan(o: THREE.Vector3, d: THREE.Vector3, w: WeaponInstance, pelletDamageScale: number): void;
  projectile(o: THREE.Vector3, d: THREE.Vector3, w: WeaponInstance): void;
  signalArc(o: THREE.Vector3, d: THREE.Vector3, w: WeaponInstance): void;
  melee(o: THREE.Vector3, d: THREE.Vector3): { hit: boolean; lungeTo?: THREE.Vector3 };
  findLungeTarget(o: THREE.Vector3, d: THREE.Vector3, range: number): THREE.Vector3 | null;
  throwGrenade(o: THREE.Vector3, v: THREE.Vector3, fuse: number): void;
  explodeInHand(): void;
  muzzleWorld(out: THREE.Vector3): THREE.Vector3;
  /** distance to a target on the exact bullet path, or -1 */
  targetUnderReticle(o: THREE.Vector3, d: THREE.Vector3, range: number): number;
}

type State = 'ready' | 'reload' | 'swap' | 'melee' | 'throw' | 'drink' | 'busy';

const RELOAD_EVENTS: Record<ReloadStyle, [number, string][]> = {
  mag: [[0.18, 'mech_magOut'], [0.56, 'mech_magIn'], [0.82, 'mech_slideRelease']],
  drum: [[0.2, 'mech_drumOut'], [0.56, 'mech_drumIn'], [0.82, 'mech_boltBack']],
  clip: [[0.2, 'mech_boltBack'], [0.45, 'mech_clipIn'], [0.68, 'mech_boltFwd']],
  cylinder: [[0.12, 'mech_cylOpen'], [0.45, 'mech_shellIn'], [0.6, 'mech_shellIn'], [0.82, 'mech_cylClose']],
  pump: [[0.5, 'mech_shellIn']],
  break: [[0.1, 'mech_breakOpen'], [0.5, 'mech_shellIn'], [0.62, 'mech_shellIn'], [0.82, 'mech_breakClose']],
  belt: [[0.12, 'mech_beltOpen'], [0.48, 'mech_beltIn'], [0.76, 'mech_breakClose'], [0.9, 'mech_boltBack']],
  bolt: [[0.12, 'mech_boltBack'], [0.35, 'mech_shellIn'], [0.5, 'mech_shellIn'], [0.65, 'mech_shellIn'], [0.85, 'mech_boltFwd']],
};

export class WeaponSystem {
  slots: WeaponInstance[] = [];
  cur = 0;
  state: State = 'ready';
  cooldown = 0;
  reloadT = 0;
  reloadDur = 1;
  private reloadCommitted = false;
  private reloadWasEmpty = false;
  swapT = 0;
  private swapPhase: 'down' | 'up' = 'down';
  private swapTo = -1;
  meleeT = -1;
  private meleeHitDone = false;
  actionT = -1;
  private actionDur = 0.5;
  ads = 0;
  bloom = 0;
  grenades = 2;
  maxGrenades = 4;
  cookT = -1;
  throwT = -1;
  fuse = 3;
  drinkT = -1;
  drinkColor = 0xffffff;
  private drinkDone: (() => void) | null = null;
  private firePrev = false;
  /** auto-fire while aiming: the reticle is on a target (checked a few times a second) */
  autoFiring = false;
  private autoCheckT = 0;
  private dryClicked = false;
  private lastShot = 0;
  private time = 0;
  private savedSlots: { slots: WeaponInstance[]; cur: number } | null = null;
  readonly vm: Viewmodel;
  private tmpO = new THREE.Vector3();
  private tmpD = new THREE.Vector3();
  private tmpR = new THREE.Vector3();
  lookDX = 0;
  lookDY = 0;
  /** total spread in degrees (for the crosshair) */
  spread = 2;
  hipSpreadPx = 20;

  constructor(vmCamera: THREE.PerspectiveCamera, vmScene: THREE.Scene, flashTex: THREE.Texture, private player: Player) {
    this.vm = new Viewmodel(vmCamera, vmScene, flashTex);
  }

  get current(): WeaponInstance | null { return this.slots[this.cur] ?? null; }
  maxSlots() { return this.player.perks.has('packmule') ? 3 : 2; }
  owns(id: string) { return this.slots.find((w) => w.def.id === id) ?? null; }
  get busy() { return this.state !== 'ready' && this.state !== 'reload'; }

  /** Give a weapon (wall-buy, crate). Refills ammo if already owned. */
  give(id: string, upgraded = false) {
    const owned = this.owns(id);
    if (owned) { owned.refill(); bus.emit('ammoChanged', {}); return; }
    const w = new WeaponInstance(WEAPONS[id], upgraded);
    if (this.slots.length < this.maxSlots()) {
      this.slots.push(w);
      this.beginSwap(this.slots.length - 1);
    } else {
      this.slots[this.cur] = w;
      this.state = 'swap'; this.swapPhase = 'up'; this.swapT = 1; this.swapTo = -1;
      this.vm.setWeapon(w.def.id, w.upgraded);
      audio.play('mech_swap', { bus: 'sfx', vol: 0.6 });
    }
    bus.emit('weaponChanged', {});
  }

  /** Drop the extra weapon when Packmule is lost. */
  trimSlots() {
    while (this.slots.length > this.maxSlots()) {
      this.slots.splice(this.slots.length - 1, 1);
      if (this.cur >= this.slots.length) this.cur = 0;
    }
    if (this.current) this.vm.setWeapon(this.current.def.id, this.current.upgraded);
    bus.emit('weaponChanged', {});
  }

  refillAll() { for (const w of this.slots) w.refill(); this.grenades = this.maxGrenades; bus.emit('ammoChanged', {}); }

  startDowned() {
    this.savedSlots = { slots: this.slots, cur: this.cur };
    const pistol = this.slots.find((w) => w.def.cls === 'pistol' || w.def.cls === 'revolver');
    const w = pistol ?? new WeaponInstance(WEAPONS.warden);
    if (w.mag + w.reserve === 0) w.refill();
    this.slots = [w];
    this.cur = 0;
    this.state = 'ready';
    this.cookT = -1; this.throwT = -1; this.drinkT = -1; this.meleeT = -1;
    this.vm.setWeapon(w.def.id, w.upgraded);
    bus.emit('weaponChanged', {});
  }

  endDowned() {
    if (!this.savedSlots) return;
    this.slots = this.savedSlots.slots;
    this.cur = Math.min(this.savedSlots.cur, this.slots.length - 1);
    this.savedSlots = null;
    this.state = 'ready';
    if (this.current) this.vm.setWeapon(this.current.def.id, this.current.upgraded);
    bus.emit('weaponChanged', {});
  }

  beginSwap(to: number) {
    if (to === this.cur && this.state !== 'ready') return;
    this.cancelReload();
    this.state = 'swap';
    this.swapPhase = 'down';
    this.swapTo = to;
    audio.play('mech_swap', { bus: 'sfx', vol: 0.6 });
  }

  startDrink(color: number, done: () => void) {
    this.cancelReload();
    this.state = 'drink';
    this.drinkT = 0;
    this.drinkColor = color;
    this.drinkDone = done;
    audio.play('ui_drink', { bus: 'sfx' });
  }

  private cancelReload() {
    if (this.state === 'reload') { this.state = 'ready'; this.reloadT = 0; }
  }

  startReload() {
    const w = this.current;
    if (!w || this.state !== 'ready') return;
    if (w.mag >= w.stats.mag || w.reserve <= 0) return;
    this.state = 'reload';
    this.reloadT = 0;
    this.reloadCommitted = false;
    this.reloadWasEmpty = w.mag === 0;
    const qh = this.player.perks.has('quickhands') ? PERK_TUNING.quickhandsReloadMult : 1;
    this.reloadDur = (w.stats.perShellReload ? w.stats.reloadTac : (w.mag === 0 ? w.stats.reloadEmpty : w.stats.reloadTac)) * qh;
    bus.emit('ammoChanged', {});
  }

  update(dt: number, input: Input, host: CombatHost, camPos: THREE.Vector3) {
    this.time += dt;
    const w = this.current;
    const p = this.player;
    if (!w) return;
    const st = w.stats;
    if (this.cooldown > 0) this.cooldown -= dt;
    this.bloom = Math.max(0, this.bloom - dt * 6);

    // --- swap
    if (input.consume('swap') && this.slots.length > 1 && (this.state === 'ready' || this.state === 'reload') && !p.downed) {
      this.beginSwap((this.cur + 1) % this.slots.length);
    }
    if (this.state === 'swap') {
      if (this.swapPhase === 'down') {
        this.swapT += dt / 0.22;
        if (this.swapT >= 1) {
          this.swapT = 1;
          if (this.swapTo >= 0) this.cur = this.swapTo;
          const nw = this.current!;
          this.vm.setWeapon(nw.def.id, nw.upgraded);
          this.swapPhase = 'up';
          bus.emit('weaponChanged', {});
        }
      } else {
        this.swapT -= dt / 0.28;
        if (this.swapT <= 0) { this.swapT = 0; this.state = 'ready'; }
      }
    }

    // --- melee
    if (input.consume('melee') && (this.state === 'ready' || this.state === 'reload') && this.meleeT < 0) {
      this.cancelReload();
      this.state = 'melee';
      this.meleeT = 0;
      this.meleeHitDone = false;
      audio.play('mech_knife', { bus: 'sfx', vol: 0.8 });
      p.forward(this.tmpD);
      const target = host.findLungeTarget(camPos, this.tmpD, 2.6);
      if (target) {
        const dx = target.x - p.pos.x, dz = target.z - p.pos.z;
        const d = Math.hypot(dx, dz);
        if (d > 1.0) { p.vel.x += (dx / d) * Math.min(8, (d - 0.8) * 9); p.vel.y += (dz / d) * Math.min(8, (d - 0.8) * 9); }
      }
    }
    if (this.state === 'melee') {
      this.meleeT += dt / 0.5;
      if (!this.meleeHitDone && this.meleeT > 0.32) {
        this.meleeHitDone = true;
        p.forward(this.tmpD);
        host.melee(camPos, this.tmpD);
      }
      if (this.meleeT >= 1) { this.meleeT = -1; this.state = 'ready'; }
    }

    // --- drink
    if (this.state === 'drink') {
      this.drinkT += dt / 2.0;
      if (this.drinkT >= 1) { this.drinkT = -1; this.state = 'ready'; const d = this.drinkDone; this.drinkDone = null; d?.(); }
    }

    // --- grenades
    if (input.grenadeHeld && this.cookT < 0 && this.throwT < 0 && this.grenades > 0 && (this.state === 'ready' || this.state === 'reload') && !p.downed) {
      this.cancelReload();
      this.cookT = 0;
      this.state = 'throw';
      audio.play('ui_grenadePin', { bus: 'sfx' });
    }
    input.consume('grenadeRelease');
    if (this.cookT >= 0) {
      this.cookT += dt;
      if (this.cookT >= this.fuse) {
        this.cookT = -1; this.grenades--; this.state = 'ready';
        host.explodeInHand();
        bus.emit('ammoChanged', {});
      } else if (!input.grenadeHeld) {
        const fuseLeft = this.fuse - this.cookT;
        this.cookT = -1;
        this.throwT = 0;
        this.grenades--;
        p.forward(this.tmpD);
        const v = this.tmpR.copy(this.tmpD).multiplyScalar(13);
        v.y += 3.2;
        v.x += p.vel.x * 0.5; v.z += p.vel.y * 0.5;
        this.tmpO.copy(camPos).addScaledVector(this.tmpD, 0.4);
        this.tmpO.y -= 0.1;
        host.throwGrenade(this.tmpO, v, fuseLeft);
        bus.emit('ammoChanged', {});
      }
    }
    if (this.throwT >= 0) {
      this.throwT += dt / 0.45;
      if (this.throwT >= 1) { this.throwT = -1; this.state = 'ready'; }
    }

    // --- ADS
    const wantAds = input.aiming && !p.sprinting && p.mode !== 'ladder' && p.mode !== 'vault' && (this.state === 'ready' || (this.state === 'reload' && false)) && !p.downed;
    const adsTime = st.adsTime * (p.perks.has('fleetfoot') ? PERK_TUNING.fleetfootAdsMult : 1);
    const prevAds = this.ads;
    this.ads = clamp(this.ads + (wantAds ? 1 : -1) * dt / adsTime, 0, 1);
    if (prevAds === 0 && this.ads > 0) audio.play('mech_adsIn', { bus: 'sfx', vol: 0.35 });
    p.ads = this.ads;
    input.zoom = 1 + (st.adsZoom - 1) * this.ads;

    // --- reload
    if (input.consume('reload')) this.startReload();
    if (this.state === 'reload') {
      const prevT = this.reloadT;
      this.reloadT += dt / this.reloadDur;
      const evs = RELOAD_EVENTS[w.def.reloadStyle];
      for (const [t, snd] of evs) if (prevT < t && this.reloadT >= t) audio.play(snd, { bus: 'sfx', vol: 0.7 });
      if (st.perShellReload) {
        if (this.reloadT >= 1) {
          if (w.reserve > 0 && w.mag < st.mag) { w.mag++; w.reserve--; bus.emit('ammoChanged', {}); }
          if (w.mag >= st.mag || w.reserve <= 0) {
            this.state = 'ready';
            if (this.reloadWasEmpty) { this.actionT = 0; this.actionDur = 0.4; audio.play('mech_pump', { bus: 'sfx', vol: 0.7 }); }
          } else this.reloadT = 0;
        }
        if (input.fire && w.mag > 0 && this.reloadT < 0.4) this.state = 'ready';
      } else {
        if (!this.reloadCommitted && this.reloadT >= 0.7) {
          this.reloadCommitted = true;
          const need = st.mag - w.mag;
          const take = Math.min(need, w.reserve);
          w.mag += take; w.reserve -= take;
          bus.emit('ammoChanged', {});
        }
        if (this.reloadT >= 1) this.state = 'ready';
      }
    }

    // --- auto-reload when the mag runs dry (mobile-friendly)
    if (this.state === 'ready' && w.mag === 0 && w.reserve > 0 && this.cooldown <= 0 && this.actionT < 0) this.startReload();

    // --- action cycle
    if (this.actionT >= 0) { this.actionT += dt / this.actionDur; if (this.actionT >= 1) this.actionT = -1; }

    // --- firing
    // hands are busy on a ladder or mid-vault
    const handsBusy = p.mode === 'ladder' || p.mode === 'vault';
    // touch: aimed in with the dot on a Tethered → fire automatically (every gun; semi-autos at their
    // normal cadence; launchers only when the target isn't close enough to catch the blast)
    this.autoCheckT -= dt;
    if (this.autoCheckT <= 0) {
      this.autoCheckT = 0.05;
      this.autoFiring = false;
      if (save.settings.autoFireAds && input.usingTouch && input.aiming && this.ads > 0.75 && !handsBusy && !p.downed && this.state === 'ready') {
        p.forward(this.tmpD);
        const range = Math.max(25, st.falloffEnd * 1.4);
        const t = host.targetUnderReticle(camPos, this.tmpD, range);
        this.autoFiring = t >= 0 && (st.projectile !== 'grenade' || t > 7);
      }
    }
    const fireDown = handsBusy ? false : (input.fire || this.autoFiring) && !p.downed ? true : input.fire;
    const pressed = fireDown && !this.firePrev;
    if (!fireDown) this.dryClicked = false;
    if (fireDown && (this.state === 'ready') && this.cooldown <= 0 && !p.sprinting) {
      if (w.mag <= 0) {
        if (w.reserve > 0) this.startReload();
        else if (!this.dryClicked) { audio.play('mech_dryFire', { bus: 'sfx' }); this.dryClicked = true; }
      } else {
        const semiHoldRepeat = (input.usingTouch || this.autoFiring) && this.time - this.lastShot > (60 / st.rpm) * 1.45;
        if (st.auto || pressed || semiHoldRepeat) this.shoot(w, host, camPos);
      }
    }
    if (p.sprinting && fireDown) p.sprinting = false;
    this.firePrev = fireDown;

    // spread for crosshair
    const moving = Math.min(1, p.speed / 4.3);
    const base = st.spreadHip + (st.spreadAds - st.spreadHip) * this.ads;
    this.spread = base * (1 + moving * 0.6 * (1 - this.ads)) + this.bloom * (1 - this.ads * 0.6);

    // recoil recovery
    p.recoilPitch = damp(p.recoilPitch, 0, 7, dt);
    p.recoilYaw = damp(p.recoilYaw, 0, 7, dt);

    // viewmodel
    const [ldx, ldy] = [this.lookDX, this.lookDY];
    this.vm.update(dt, {
      ads: this.ads, bobPhase: p.bobPhase, bobAmount: p.bobAmount, sprint: p.sprinting ? 1 : 0,
      lookDX: ldx, lookDY: ldy,
      reload: this.state === 'reload' ? { style: w.def.reloadStyle, t: this.reloadT } : null,
      swap: this.state === 'swap' ? this.swapT : p.mode === 'ladder' ? 0.85 : p.mode === 'vault' ? 0.4 : 0,
      melee: this.meleeT, action: this.actionT, throwT: this.throwT, cookT: this.cookT,
      drink: this.drinkT, drinkColor: this.drinkColor, downed: p.downed, time: this.time,
    });
  }

  private shoot(w: WeaponInstance, host: CombatHost, camPos: THREE.Vector3) {
    const st = w.stats;
    const p = this.player;
    w.mag--;
    this.lastShot = this.time;
    const rate = st.rpm * (p.perks.has('rapidfire') ? PERK_TUNING.rapidfireMult : 1);
    this.cooldown = 60 / rate;
    p.forward(this.tmpD);
    const spreadRad = (this.spread * Math.PI) / 180;
    for (let i = 0; i < st.pellets; i++) {
      const d = this.tmpR.copy(this.tmpD);
      if (spreadRad > 0) {
        // uniform random in cone (perturb in camera-right / camera-up)
        const a = Math.random() * Math.PI * 2, r = Math.sqrt(Math.random()) * Math.tan(spreadRad);
        const yaw = p.yaw + p.recoilYaw, pitch = p.pitch + p.recoilPitch;
        const rx = Math.cos(yaw), rz = -Math.sin(yaw);
        const ux = Math.sin(pitch) * Math.sin(yaw), uy = Math.cos(pitch), uz = Math.sin(pitch) * Math.cos(yaw);
        d.x += (rx * Math.cos(a) + ux * Math.sin(a)) * r;
        d.y += uy * Math.sin(a) * r;
        d.z += (rz * Math.cos(a) + uz * Math.sin(a)) * r;
        d.normalize();
      }
      if (st.projectile === 'grenade') host.projectile(camPos, d, w);
      else if (st.projectile === 'arc') host.signalArc(camPos, d, w);
      else host.hitscan(camPos, d, w, 1);
    }
    // recoil
    const adsK = 1 - this.ads * 0.45;
    p.recoilPitch += ((st.recoilUp * Math.PI) / 180) * adsK * (0.8 + Math.random() * 0.4);
    p.recoilYaw += (((Math.random() - 0.5) * 2 * st.recoilSide * Math.PI) / 180) * adsK;
    p.shake = Math.max(p.shake, st.kick * 0.35);
    this.bloom = Math.min(6, this.bloom + 0.35 + st.recoilUp * 0.15);
    this.vm.fire(st.kick);
    // sound
    audio.play(w.soundId, { bus: 'sfx', priority: 9, vol: 1.0, reverb: 0.35 });
    if (w.def.reloadStyle === 'clip' && w.mag === 0) audio.play('mech_clipPing', { bus: 'sfx', vol: 0.8, delay: 0.05 });
    // pump / bolt cycle
    if ((w.def.reloadStyle === 'pump' || (w.def.reloadStyle === 'bolt')) && w.mag > 0) { this.actionT = 0; this.actionDur = Math.min(0.9, this.cooldown * 0.9); }
    // casing (world space)
    const m = host.muzzleWorld(this.tmpO);
    if (st.projectile !== 'arc' && w.def.reloadStyle !== 'cylinder' && w.def.reloadStyle !== 'break') {
      const rx = Math.cos(p.yaw), rz = -Math.sin(p.yaw);
      const fx = -Math.sin(p.yaw), fz = -Math.cos(p.yaw);
      castFx?.(m.x - fx * 0.3 + rx * 0.05, m.y - 0.05, m.z - fz * 0.3 + rz * 0.05,
        rx * (1.6 + Math.random()) + p.vel.x, 1.8 + Math.random(), rz * (1.6 + Math.random()) + p.vel.y,
        w.def.reloadStyle === 'pump');
    }
    if (save.settings.aimAssist) { /* aim assist reacts in aimAssist.ts */ }
    bus.emit('ammoChanged', {});
  }

  /** HUD helper: is the current mag low? */
  get lowAmmo() {
    const w = this.current;
    if (!w) return false;
    return w.mag <= Math.max(1, Math.floor(w.stats.mag * 0.25));
  }
}

/** Casing spawner hook (set by Game to fx.casing). */
export let castFx: ((x: number, y: number, z: number, vx: number, vy: number, vz: number, shell: boolean) => void) | null = null;
export function setCasingSpawner(fn: typeof castFx) { castFx = fn; }
