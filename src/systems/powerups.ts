import * as THREE from 'three';
import { POWERUPS } from '../config/enemies';
import { ECONOMY } from '../config/economy';
import { bus } from '../core/events';
import { audio } from '../audio/audioEngine';
import { pick } from '../core/math';
import type { Game } from '../game';

export type PowerupId = 'resupply' | 'overload' | 'double' | 'killsignal' | 'fortify';
export const POWERUP_INFO: Record<PowerupId, { name: string; color: number; timed: boolean }> = {
  resupply: { name: 'RESUPPLY', color: 0xffd060, timed: false },
  overload: { name: 'OVERLOAD', color: 0xff5040, timed: true },
  double: { name: 'DOUBLE POINTS', color: 0x60ff90, timed: true },
  killsignal: { name: 'KILL SIGNAL', color: 0x60e0ff, timed: false },
  fortify: { name: 'FORTIFY', color: 0xd09060, timed: false },
};

function iconTexture(id: PowerupId): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const col = '#' + POWERUP_INFO[id].color.toString(16).padStart(6, '0');
  const grd = g.createRadialGradient(64, 64, 10, 64, 64, 64);
  grd.addColorStop(0, col + 'aa'); grd.addColorStop(0.55, col + '33'); grd.addColorStop(1, col + '00');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.strokeStyle = '#fff'; g.fillStyle = '#fff'; g.lineWidth = 7; g.lineCap = 'round'; g.lineJoin = 'round';
  g.beginPath();
  switch (id) {
    case 'resupply': g.strokeRect(36, 46, 56, 40); g.moveTo(36, 60); g.lineTo(92, 60); g.moveTo(50, 46); g.lineTo(50, 36); g.lineTo(78, 36); g.lineTo(78, 46); break;
    case 'overload': g.moveTo(72, 26); g.lineTo(46, 68); g.lineTo(66, 68); g.lineTo(56, 102); g.lineTo(84, 56); g.lineTo(64, 56); g.closePath(); g.fill(); break;
    case 'double': g.font = 'bold 52px Black Ops One, Impact, sans-serif'; g.textAlign = 'center'; g.textBaseline = 'middle'; g.fillText('x2', 64, 68); break;
    case 'killsignal': g.moveTo(64, 100); g.lineTo(64, 50); g.moveTo(48, 100); g.lineTo(64, 50); g.lineTo(80, 100); g.arc(64, 44, 14, Math.PI * 1.2, Math.PI * 1.8); g.moveTo(40, 30); g.arc(64, 44, 28, Math.PI * 1.15, Math.PI * 1.85); break;
    case 'fortify': for (let i = 0; i < 3; i++) { g.moveTo(34, 46 + i * 18); g.lineTo(94, 40 + i * 18); } break;
  }
  g.stroke();
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

interface Drop { id: PowerupId; x: number; z: number; t: number; sprite: THREE.Sprite; ring: THREE.Mesh }

/** Floating power-up drops (max 4 per round) and their timed effects. */
export class Powerups {
  readonly group = new THREE.Group();
  private drops: Drop[] = [];
  private timers = new Map<PowerupId, number>();
  dropsThisRound = 0;
  private tex = new Map<PowerupId, THREE.CanvasTexture>();
  private ringGeo = new THREE.RingGeometry(0.45, 0.52, 32);

  constructor(private g: Game) {}

  active(id: PowerupId) { return (this.timers.get(id) ?? 0) > 0; }
  timeLeft(id: PowerupId) { return this.timers.get(id) ?? 0; }

  onKill(x: number, z: number) {
    if (this.dropsThisRound >= POWERUPS.maxPerRound) return;
    if (Math.random() > POWERUPS.baseDropChance * this.g.difficulty.dropRate) return;
    const ids: PowerupId[] = ['resupply', 'overload', 'double', 'killsignal', 'fortify', 'double', 'overload'];
    this.drop(pick(ids), x, z);
  }

  drop(id: PowerupId, x: number, z: number, force = false) {
    if (!force) this.dropsThisRound++;
    let tex = this.tex.get(id);
    if (!tex) { tex = iconTexture(id); this.tex.set(id, tex); }
    const c = new THREE.Color(POWERUP_INFO[id].color);
    const sprite = new THREE.Sprite(new THREE.SpriteMaterial({ map: tex, color: new THREE.Color(1.8, 1.8, 1.8), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false }));
    sprite.scale.set(0.9, 0.9, 0.9);
    const ring = new THREE.Mesh(this.ringGeo, new THREE.MeshBasicMaterial({ color: c.multiplyScalar(2.5), transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false, blending: THREE.AdditiveBlending }));
    ring.rotation.x = -Math.PI / 2;
    this.group.add(sprite, ring);
    this.drops.push({ id, x, z, t: 0, sprite, ring });
    audio.play('ui_puSpawn', { pos: { x, y: 1, z }, vol: 0.8, priority: 7 });
  }

  update(dt: number) {
    for (const [id, t] of this.timers) {
      if (t <= 0) continue;
      const nt = t - dt;
      this.timers.set(id, nt);
      if (nt <= 0) audio.play('ui_puEnd', { bus: 'ui', vol: 0.7 });
    }
    const p = this.g.player.pos;
    for (let i = this.drops.length - 1; i >= 0; i--) {
      const d = this.drops[i];
      d.t += dt;
      const y = 1.0 + Math.sin(d.t * 2.5) * 0.12;
      d.sprite.position.set(d.x, y, d.z);
      d.ring.position.set(d.x, 0.03, d.z);
      d.ring.scale.setScalar(1 + Math.sin(d.t * 3) * 0.1);
      const blink = d.t > POWERUPS.blinkFrom ? (Math.sin(d.t * (d.t > 22 ? 22 : 12)) > 0 ? 1 : 0.15) : 1;
      (d.sprite.material as THREE.SpriteMaterial).opacity = blink;
      if (Math.random() < dt * 6) this.g.fx.glowPuff(d.x + (Math.random() - 0.5) * 0.5, y, d.z + (Math.random() - 0.5) * 0.5, POWERUP_INFO[d.id].color, 0.12, 0.6);
      const near = Math.hypot(p.x - d.x, p.z - d.z) < 1.1 && !this.g.player.downed;
      if (near || d.t > POWERUPS.lifetime) {
        this.group.remove(d.sprite, d.ring);
        d.sprite.material.dispose();
        (d.ring.material as THREE.Material).dispose();
        this.drops.splice(i, 1);
        if (near) this.apply(d.id);
      }
    }
  }

  apply(id: PowerupId) {
    const g = this.g;
    audio.play('ui_puGrab', { bus: 'ui', vol: 0.9 });
    const snd: Record<PowerupId, string> = { resupply: 'ui_puResupply', overload: 'ui_puOverload', double: 'ui_puDouble', killsignal: 'ui_puKill', fortify: 'ui_puFortify' };
    audio.play(snd[id], { bus: 'ui', vol: 0.9, delay: 0.15 });
    bus.emit('powerupGrab', { id });
    bus.emit('message', { text: POWERUP_INFO[id].name, duration: 2.2, color: '#' + POWERUP_INFO[id].color.toString(16).padStart(6, '0') });
    switch (id) {
      case 'resupply': g.weapons.refillAll(); break;
      case 'overload': case 'double':
        this.timers.set(id, POWERUPS.duration);
        bus.emit('powerupStart', { id, duration: POWERUPS.duration });
        break;
      case 'killsignal':
        g.zombies.killAll((z) => z.type !== 'brute' && !z.boss);
        g.economy.add(ECONOMY.killSignalBonus, 'killsignal');
        g.r.fx.staticJam = 0.6;
        break;
      case 'fortify':
        g.barriers.fortifyAll();
        g.economy.add(ECONOMY.fortifyBonus, 'fortify');
        break;
    }
  }

  clear() {
    for (const d of this.drops) this.group.remove(d.sprite, d.ring);
    this.drops = [];
    this.timers.clear();
  }

  dispose() {
    this.clear();
    for (const t of this.tex.values()) t.dispose();
    this.ringGeo.dispose();
  }

  get list() { return [...this.timers.entries()].filter(([, t]) => t > 0); }
}
