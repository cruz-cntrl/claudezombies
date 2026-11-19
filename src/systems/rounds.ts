import { ROUNDS, zombieCount, zombieHealth, spawnDelay, speedMix, houndCount } from '../config/rounds';
import { BRUTE, HOUND } from '../config/enemies';
import type { SpeedTier } from '../config/enemies';
import { K } from '../world/grid';
import { FlowField } from '../world/flowField';
import { bus } from '../core/events';
import { randInt, rand, pick } from '../core/math';
import { audio } from '../audio/audioEngine';
import type { Game } from '../game';
import type { WindowVisual } from '../world/mapBuilder';
import { groundY } from '../world/terrain';

type SpawnPoint = { window?: WindowVisual; x?: number; z?: number; dist: number };

/** Round flow + spawner: counts, health scaling, speed mix, hound rounds, brutes. */
export class Rounds {
  round = 0;
  state: 'pre' | 'active' | 'break' = 'pre';
  timer = ROUNDS.firstRoundBreak;
  toSpawn = 0;
  spawned = 0;
  total = 0;
  spawnTimer = 0;
  special: 'none' | 'hounds' = 'none';
  nextHound = randInt(ROUNDS.houndEveryMin, ROUNDS.houndEveryMax);
  bruteDue = false;
  lastKill = { x: 0, z: 0 };
  /** extra spawns injected by easter-egg events (relay defence) */
  surge = 0;
  paused = false;
  constructor(private g: Game) {}

  get hp() { return zombieHealth(this.round) * this.g.difficulty.zombieHp; }

  update(dt: number) {
    if (this.paused) return;
    const zm = this.g.zombies;
    if (this.state === 'pre' || this.state === 'break') {
      this.timer -= dt;
      if (this.timer <= 0) this.startRound(this.round + 1);
      return;
    }
    // active
    this.spawnTimer -= dt;
    const alive = zm.aliveCount;
    if ((this.toSpawn > 0 || this.surge > 0) && this.spawnTimer <= 0 && alive < ROUNDS.maxAlive && !this.g.player.downed) {
      if (this.spawnOne()) {
        if (this.surge > 0) this.surge--; else this.toSpawn--;
        this.spawned++;
      }
      const d = this.special === 'hounds' ? Math.max(0.35, 1.6 - this.round * 0.03) : spawnDelay(this.round);
      this.spawnTimer = d * rand(0.7, 1.3);
    }
    // brute mid-round
    if (this.bruteDue && this.spawned >= this.total * 0.4) {
      this.bruteDue = false;
      this.spawnBrute();
    }
    if (this.toSpawn <= 0 && this.surge <= 0 && alive === 0 && zm.activeCount >= 0) this.endRound();
  }

  startRound(n: number) {
    this.round = n;
    this.state = 'active';
    const diff = this.g.difficulty;
    if (n === this.nextHound) {
      this.special = 'hounds';
      this.total = Math.round(houndCount(n) * diff.count);
      this.nextHound = n + randInt(ROUNDS.houndEveryMin, ROUNDS.houndEveryMax);
      this.spawnTimer = 4;
    } else {
      this.special = 'none';
      this.total = Math.round(zombieCount(n) * diff.count);
      this.spawnTimer = 1.5;
    }
    this.toSpawn = this.total;
    this.spawned = 0;
    this.bruteDue = this.special === 'none' && n >= ROUNDS.bruteFromRound && Math.random() < ROUNDS.bruteChancePerRound;
    this.g.powerups.dropsThisRound = 0;
    this.g.economy.repairThisRound = 0;
    const ws = this.g.weapons;
    ws.grenades = Math.min(ws.maxGrenades, ws.grenades + 2);
    bus.emit('roundStart', { round: n, special: this.special });
    bus.emit('ammoChanged', {});
  }

  endRound() {
    if (this.state !== 'active') return;
    this.state = 'break';
    this.timer = ROUNDS.breakSeconds;
    if (this.special === 'hounds') this.g.powerups.drop('resupply', this.lastKill.x, this.lastKill.z, true);
    bus.emit('roundEnd', { round: this.round });
  }

  /** Candidate spawn points in active zones, nearest first (by path distance). */
  private candidates(): SpawnPoint[] {
    const w = this.g.world;
    const flow = w.flow;
    const out: SpawnPoint[] = [];
    for (const win of w.windows) {
      if (!w.zoneActive[win.cell.zone]) continue;
      const d = flow.distanceAt(win.inside.x, win.inside.z);
      out.push({ window: win, dist: d === FlowField.INF ? 1e6 : d });
    }
    for (const v of w.grid.vents) {
      if (v.zone < 0 || !w.zoneActive[v.zone]) continue;
      const d = flow.distanceAt(v.i + 0.5, v.j + 0.5);
      const pd = Math.hypot(v.i + 0.5 - this.g.player.pos.x, v.j + 0.5 - this.g.player.pos.z);
      if (pd < 6) continue;
      out.push({ x: v.i + 0.5, z: v.j + 0.5, dist: d === FlowField.INF ? 1e6 : d });
    }
    out.sort((a, b) => a.dist - b.dist);
    return out;
  }

  private spawnOne(): boolean {
    const zm = this.g.zombies;
    if (this.special === 'hounds') return this.spawnHound();
    const c = this.candidates();
    if (!c.length) return false;
    const pickFrom = c.slice(0, Math.min(4, c.length));
    const sp = pick(pickFrom);
    const [w, r] = speedMix(this.round);
    const roll = Math.random();
    const tier: SpeedTier = roll < w ? 'walker' : roll < w + r ? 'runner' : 'sprinter';
    const z = zm.spawn('zombie', this.hp, tier, sp.window ? { window: sp.window } : { x: sp.x, z: sp.z });
    return !!z;
  }

  /** Random walkable cell in an active zone at a distance band from the player. */
  findFloorCell(minD: number, maxD: number): { x: number; z: number } | null {
    const w = this.g.world, g = w.grid, p = this.g.player.pos;
    for (let tries = 0; tries < 80; tries++) {
      const a = Math.random() * Math.PI * 2, d = rand(minD, maxD);
      const x = p.x + Math.cos(a) * d, z = p.z + Math.sin(a) * d;
      const i = Math.floor(x), j = Math.floor(z);
      if (g.kindAt(i, j) !== K.FLOOR) continue;
      const zone = g.zoneAt(i, j);
      if (zone < 0 || !w.zoneActive[zone]) continue;
      if (w.flow.distanceAt(x, z) === FlowField.INF) continue;
      return { x: i + 0.5, z: j + 0.5 };
    }
    return null;
  }

  private spawnHound(): boolean {
    const cell = this.findFloorCell(7, 16);
    if (!cell) return false;
    const hp = this.hp * HOUND.hpMult * this.g.difficulty.zombieHp / this.g.difficulty.zombieHp;
    const z = this.g.zombies.spawn('hound', hp, 'sprinter', cell);
    if (!z) return false;
    // lightning strike
    this.g.fx.flash(cell.x, 2.5, cell.z, 40, 0xa0c0ff);
    this.g.fx.electric(cell.x, 0.5, cell.z, 20, 0xff6050);
    this.g.fx.decal(2, cell.x, 0.012 + groundY(cell.x, cell.z), cell.z, 0, 1, 0, 1.4);
    audio.play('imp_arcZap', { pos: { x: cell.x, y: 1, z: cell.z }, vol: 1, priority: 6 });
    return true;
  }

  spawnBrute() {
    const cell = this.findFloorCell(10, 22) ?? this.findFloorCell(5, 30);
    if (!cell) return;
    const z = this.g.zombies.spawn('brute', this.hp * BRUTE.hpMult, 'walker', cell);
    if (z) {
      bus.emit('message', { text: 'BRUTE INCOMING', sub: 'Shoot the cage off its chip', duration: 3, color: '#e2392e' });
      audio.play('z_bruteRoar', { pos: { x: cell.x, y: 2, z: cell.z }, vol: 1, priority: 9, refDist: 8 });
    }
  }
}
