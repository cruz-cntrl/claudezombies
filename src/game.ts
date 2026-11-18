import * as THREE from 'three';
import type { Renderer } from './render/renderer';
import { World } from './world/mapBuilder';
import { Player } from './entities/player';
import type { Input } from './input/input';
import type { MapDef } from './world/mapTypes';
import type { DifficultyDef } from './config/difficulty';
import { FX } from './render/fx';
import { WeaponSystem, setCasingSpawner } from './weapons/weaponSystem';
import { ZombieManager } from './entities/zombie';
import { Barriers } from './world/barriers';
import { Interactables } from './world/interactables';
import { Combat } from './systems/damage';
import { Economy } from './systems/economy';
import { Rounds } from './systems/rounds';
import { Powerups } from './systems/powerups';
import { Hud } from './ui/hud';
import type { TouchControls } from './input/touchControls';
import { audio, type Voice } from './audio/audioEngine';
import { bus } from './core/events';
import { ECONOMY } from './config/economy';
import { damp } from './core/math';
import { MapObjects } from './systems/mapObjects';
import { AimAssist } from './input/aimAssist';
import { AmbientFx } from './systems/ambientFx';

/**
 * One play session on one map. Owns the world and all gameplay systems.
 * The App (main.ts) owns menus, renderer, input and audio across sessions.
 */
export class Game {
  readonly player = new Player();
  time = 0;
  playerLamp: THREE.PointLight;
  readonly fx: FX;
  readonly weapons: WeaponSystem;
  readonly zombies: ZombieManager;
  readonly barriers: Barriers;
  readonly interact = new Interactables();
  readonly combat: Combat;
  readonly economy: Economy;
  readonly rounds: Rounds;
  readonly powerups: Powerups;
  readonly hud: Hud;
  readonly objects: MapObjects;
  readonly aim: AimAssist;
  readonly ambient: AmbientFx;
  over = false;
  onGameOver: (() => void) | null = null;
  onReadNote: ((id: string, digit: string | null) => void) | null = null;
  onModal: ((el: HTMLElement | null) => void) | null = null;
  /** easter-egg system summary for the game-over screen */
  eeSummary(): string { return this.ee ? this.ee.summary() : '—'; }
  ee: { summary(): string; update(dt: number): void; dispose(): void } | null = null;
  invuln = 0;
  powerOn = false;
  private tmpV = new THREE.Vector3();
  private tmpV2 = new THREE.Vector3();
  private camPos = new THREE.Vector3();
  private ambVoice: Voice | null = null;
  private ambKey = '';
  private stepPhase = 0;
  private heartT = 0;
  private unsub: (() => void)[] = [];
  private probe = { r: 0, g: 0, b: 0 };
  private zoneIdx = -1;
  musicIntensity = 0;

  constructor(
    readonly r: Renderer,
    readonly world: World,
    readonly input: Input,
    readonly difficulty: DifficultyDef,
    readonly touch: TouchControls,
  ) {
    const g = world.grid;
    let bestYaw = 0, best = -1;
    for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2;
      const d = g.raycast(g.start.i + 0.5, g.start.j + 0.5, -Math.sin(yaw), -Math.cos(yaw), 30, undefined, (i, j) => g.kindAt(i, j) !== 1);
      if (d > best) { best = d; bestYaw = yaw; }
    }
    this.player.spawn(g.start.i + 0.5, g.start.j + 0.5, bestYaw);
    this.player.selfRevives = difficulty.selfRevives;
    this.playerLamp = new THREE.PointLight(0xffd8a8, 0.35, 6, 2);
    r.scene.add(this.playerLamp);

    this.fx = new FX(r.preset.decals, r.preset.casings);
    this.fx.particleScale = r.preset.particles;
    r.scene.add(this.fx.group);
    this.fx.onCasingBounce = (x, y, z, shell) => audio.play(shell ? 'mech_shellCasing' : 'mech_casing', { pos: { x, y, z }, vol: 0.4, priority: 1 });
    setCasingSpawner((x, y, z, vx, vy, vz, shell) => this.fx.casing(x, y, z, vx, vy, vz, shell));

    this.weapons = new WeaponSystem(r.vmCamera, r.vmScene, this.fx.flashTex, this.player);
    this.economy = new Economy(this);
    this.powerups = new Powerups(this);
    r.scene.add(this.powerups.group);
    this.combat = new Combat(this);
    r.scene.add(this.combat.group);
    this.zombies = new ZombieManager(world, {
      playerPos: this.player.pos,
      playerAlive: () => !this.over,
      playerTargetable: () => !this.over && !this.player.downed && this.invuln <= 0,
      damagePlayer: (a, x, z) => this.damagePlayer(a, x, z),
      tearBoard: (w) => this.barriers.tear(w),
      boardsAt: (w) => this.barriers.count(w),
      onKilled: (z) => {
        this.rounds.lastKill.x = z.x; this.rounds.lastKill.z = z.z;
        if (z.type !== 'brute' && !z.boss) this.powerups.onKill(z.x, z.z);
      },
      fx: this.fx,
      difficultySpeed: difficulty.zombieSpeed,
      chipColor: new THREE.Color(world.def.chipColor),
      shake: (a) => { this.player.shake = Math.max(this.player.shake, a); },
    });
    this.zombies.setupChipLights(r.scene, r.preset.chipLights);
    r.scene.add(this.zombies.group);
    this.barriers = new Barriers(world, this.fx);
    r.scene.add(this.barriers.mesh);
    this.rounds = new Rounds(this);
    this.hud = new Hud(this);
    this.aim = new AimAssist(this);
    this.ambient = new AmbientFx(this);
    r.scene.add(this.ambient.group);

    // windows: repair interactables
    for (const w of world.windows) {
      this.interact.add({
        x: w.inside.x, z: w.inside.z, r: 1.7, hold: ECONOMY.repairTime, repeat: true, priority: 0.2,
        label: () => (this.barriers.count(w) < 6 ? { text: 'Rebuild barrier', sub: this.economy.repairThisRound < ECONOMY.boardRepairCapPerRound ? '+10 per board' : 'Hold to rebuild' } : null),
        can: () => this.barriers.count(w) < 6,
        use: () => {
          if (this.barriers.repair(w) && this.economy.repairThisRound < ECONOMY.boardRepairCapPerRound) {
            this.economy.repairThisRound += ECONOMY.boardRepair;
            this.economy.add(ECONOMY.boardRepair, 'repair');
          }
        },
      });
    }
    this.objects = new MapObjects(this);

    this.weapons.give('warden');
    this.weapons.vm.setWeapon('warden', false);
    this.weapons.state = 'ready';

    this.unsub.push(
      bus.on('roundStart', (e) => {
        this.hud.message(e.special === 'hounds' ? 'THE STATIC STORM' : `ROUND ${e.round}`, e.special === 'hounds' ? 'Chipped hounds are loose' : undefined, 3, e.special === 'hounds' ? '#e2392e' : undefined);
        if (e.special === 'hounds') audio.play('ui_alarm', { bus: 'ui', vol: 0.8 });
      }),
      bus.on('zombieKilled', () => { /* stats handled in combat */ }),
    );
    this.hud.setVisible(true);
  }

  static async load(r: Renderer, def: MapDef, onProgress: (f: number, label: string) => void): Promise<World> {
    const world = new World(def);
    await world.build(onProgress);
    r.scene.add(world.group);
    r.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);
    r.scene.background = new THREE.Color(def.fogColor);
    world.setupLightPool(r.scene, r.preset.practicalLights);
    return world;
  }

  // ---------------------------------------------------------------- player damage
  damagePlayer(amount: number, fromX: number, fromZ: number, self = false) {
    const p = this.player;
    if (this.over || p.downed || this.invuln > 0) return;
    if (!self) amount *= this.difficulty.damageToPlayer;
    p.hp -= amount;
    p.sinceDamage = 0;
    p.slow = 1;
    p.shake = Math.max(p.shake, 0.5);
    this.r.fx.ca = 1;
    bus.emit('playerDamaged', { amount, fromX, fromZ });
    audio.play('ui_hurt', { bus: 'sfx', vol: 0.8, priority: 8 });
    audio.play('imp_flesh', { bus: 'sfx', vol: 0.6 });
    if (p.hp <= 0) this.down();
  }

  private down() {
    const p = this.player;
    p.hp = 0;
    p.stats.downs++;
    if (p.selfRevives > 0) {
      p.selfRevives--;
      p.downed = true;
      p.downTimer = 6;
      // perks are lost when downed (classic rule) — packmule extra slot is trimmed on revive
      p.perks.clear();
      p.secondWindBuys = 0;
      bus.emit('perksChanged', {});
      this.weapons.startDowned();
      audio.play('ui_downed', { bus: 'sfx', vol: 1, priority: 10 });
      bus.emit('playerDowned', { selfRevive: true });
    } else {
      this.gameOver();
    }
  }

  private revive() {
    const p = this.player;
    p.downed = false;
    p.maxHp = p.maxHealth;
    p.hp = p.maxHp;
    this.invuln = 2.5;
    this.weapons.endDowned();
    this.weapons.trimSlots();
    // shove nearby zombies back
    for (const z of this.zombies.all()) {
      const dx = z.x - p.pos.x, dz = z.z - p.pos.z, d = Math.hypot(dx, dz);
      if (d < 3 && z.alive && z.type !== 'brute') { z.setState('stagger'); }
    }
    bus.emit('playerRevived', {});
  }

  gameOver() {
    if (this.over) return;
    this.over = true;
    this.player.downed = true;
    this.player.dead = true;
    audio.play('ui_downed', { bus: 'sfx', vol: 1, priority: 10 });
    bus.emit('gameOver', {});
    setTimeout(() => this.onGameOver?.(), 2600);
  }

  // ---------------------------------------------------------------- loop
  update(dt: number) {
    this.time += dt;
    const p = this.player;
    if (!this.over) p.stats.time += dt;
    this.invuln = Math.max(0, this.invuln - dt);
    const ws = this.weapons;
    const cur = ws.current;
    const moveMult = cur ? cur.stats.moveMult : 1;
    // aim assist adjusts look before the player consumes it
    this.aim.update(dt);
    const lookX = this.input.lookDX, lookY = this.input.lookDY;
    p.update(dt, this.input, this.world.grid, moveMult, (pos) => this.pushFromZombies(pos));
    ws.lookDX = lookX; ws.lookDY = lookY;
    if (p.downed && !this.over) {
      p.downTimer -= dt;
      if (p.downTimer <= 0) this.revive();
    }
    this.world.flow.update(Math.floor(p.pos.x), Math.floor(p.pos.z));
    this.camPos.set(p.pos.x, p.eye, p.pos.z);
    if (!this.over) ws.update(dt, this.input, this.combat, this.camPos);
    // grenade preview
    if (ws.cookT >= 0) {
      p.forward(this.tmpV);
      this.tmpV2.copy(this.tmpV).multiplyScalar(13); this.tmpV2.y += 3.2;
      this.combat.updatePreview(true, this.tmpV.multiplyScalar(0.4).add(this.camPos), this.tmpV2);
    } else this.combat.updatePreview(false, this.tmpV, this.tmpV2);
    this.combat.update(dt);
    this.zombies.update(dt);
    this.zombies.pose(dt);
    if (!this.over) this.rounds.update(dt);
    this.powerups.update(dt);
    this.barriers.update(dt);
    this.objects.update(dt);
    this.ee?.update(dt);
    const it = this.interact.update(dt, p, this.input);
    this.touch.setInteract(it.prompt && !this.over ? { ...it.prompt, progress: it.progress } : null);
    // music intensity (used by the score)
    const alive = this.zombies.aliveCount;
    this.musicIntensity = damp(this.musicIntensity, Math.min(1, alive / 14 + this.rounds.round / 30), 1, dt);
  }

  private pushFromZombies(pos: THREE.Vector3) {
    for (const z of this.zombies.all()) {
      if (!z.alive || z.state === 'outside' || z.state === 'window' || z.state === 'emerge') continue;
      const dx = pos.x - z.x, dz = pos.z - z.z;
      const min = 0.3 + (z.type === 'brute' ? 0.6 : z.type === 'hound' ? 0.3 : 0.34);
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        pos.x += (dx / d) * (min - d) * 0.6;
        pos.z += (dz / d) * (min - d) * 0.6;
      }
    }
  }

  render(alpha: number, frameDt: number) {
    const cam = this.r.camera;
    const p = this.player;
    p.applyCamera(cam, alpha, this.time);
    const ws = this.weapons;
    const zoom = 1 + ((ws.current?.stats.adsZoom ?? 1) - 1) * ws.ads;
    cam.fov = this.r.baseFov / zoom;
    cam.updateProjectionMatrix();
    this.r.vmCamera.fov = 58 - ws.ads * 8;
    this.r.vmCamera.updateProjectionMatrix();
    const f = p.forward(this.tmpV);
    this.playerLamp.position.set(cam.position.x - f.x * 0.6, cam.position.y + 0.35, cam.position.z - f.z * 0.6);
    this.world.update(frameDt, this.time, cam.position, this.powerOn);
    this.ambient.update(frameDt);
    this.fx.update(frameDt, cam);
    this.fx.setPixelScale(this.r.renderer.domElement.height, cam.fov);
    // viewmodel lighting from the probe grid
    this.world.baker.sample(p.pos.x, p.pos.z, this.probe);
    ws.vm.setLighting(this.probe.r, this.probe.g, this.probe.b);
    this.hud.update(frameDt);
    // post fx
    const fx = this.r.fx;
    fx.ca = damp(fx.ca, 0, 3, frameDt);
    fx.desat = damp(fx.desat, p.downed ? 0.85 : 0, 3, frameDt);
    fx.staticJam = damp(fx.staticJam, 0, 2.5, frameDt);
    this.r.setBloom(0.75);
    // audio listener + ambience + heartbeat + footsteps
    audio.update(frameDt, cam.position, f.x, f.z);
    this.updateAmbience();
    if (frameDt > 0) {
      const hpFrac = p.hp / p.maxHp;
      this.heartT -= frameDt;
      if ((hpFrac < 0.4 || p.downed) && this.heartT <= 0 && !this.over) { this.heartT = p.downed ? 0.7 : 0.9; audio.play('ui_heartbeat', { bus: 'sfx', vol: 0.7, priority: 6, noVariation: true }); }
      const ph = Math.floor(p.bobPhase / Math.PI);
      if (ph !== this.stepPhase) { this.stepPhase = ph; if (p.speed > 1) audio.play('ui_step', { bus: 'sfx', vol: p.sprinting ? 0.35 : 0.22, priority: 1 }); }
    }
  }

  private updateAmbience() {
    const p = this.player;
    const zi = this.world.grid.zoneAtPos(p.pos.x, p.pos.z);
    if (zi < 0 || zi === this.zoneIdx) return;
    this.zoneIdx = zi;
    const zd = this.world.def.zones[zi];
    audio.setReverb(zd.reverb);
    const key = zd.rain ? 'amb_rain' : zd.reverb === 'outdoor' ? 'amb_wind' : zd.water ? 'amb_basement' : zd.reverb === 'metal' ? 'amb_roomMetal' : 'amb_roomStone';
    if (key === this.ambKey) return;
    this.ambKey = key;
    const old = this.ambVoice;
    if (old) { old.setVolume(0, 0.8); setTimeout(() => audio.stop(old, 0.1), 2500); }
    this.ambVoice = audio.play(key, { bus: 'music', loop: true, vol: 0.0001, priority: 10, noVariation: true });
    this.ambVoice?.setVolume(key === 'amb_rain' || key === 'amb_wind' ? 0.5 : 0.45, 0.8);
  }

  dispose() {
    for (const u of this.unsub) u();
    this.hud.dispose();
    this.objects.dispose();
    this.ee?.dispose();
    this.zombies.stopAudio();
    audio.stop(this.ambVoice, 0.5);
    this.r.scene.remove(this.world.group, this.playerLamp, this.fx.group, this.zombies.group, this.barriers.mesh, this.combat.group, this.powerups.group, this.ambient.group);
    for (const l of this.zombies.chipLights) this.r.scene.remove(l);
    this.world.setupLightPool(this.r.scene, 0);
    this.world.dispose();
    this.touch.setInteract(null);
  }
}
