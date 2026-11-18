import * as THREE from 'three';
import type { Game } from '../game';
import { h } from '../core/dom';
import { audio } from '../audio/audioEngine';
import { bus } from '../core/events';
import { save, persist } from '../core/save';
import { PROLOGUE, ROOM_LINES, BOSS_LINES, type StoryCard } from '../config/story';
import { K } from '../world/grid';
import { smoothstep } from '../core/math';
import type { Boss } from '../entities/bosses/boss';

interface Shot { from: THREE.Vector3; to: THREE.Vector3; lookFrom: THREE.Vector3; lookTo: THREE.Vector3; dur: number }
interface Card { at: number; dur: number; text: string; sub?: string; kind: 'prologue' | 'title' | 'caption' }
interface Scene {
  id: string;
  shots: Shot[];
  cards: Card[];
  sounds: { at: number; name: string; vol?: number }[];
  /** darken the world (prologue) until this time */
  darkUntil?: number;
  /** let the boss animate during the scene */
  boss?: boolean;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

/**
 * In-engine cutscenes. While one plays the simulation is frozen (no spawns, no attacks, no
 * damage), the player is invulnerable, controls and HUD hide, and the camera follows
 * scripted shots that hand back seamlessly to the player's own view.
 */
export class Cutscenes {
  active: Scene | null = null;
  private queue: Scene[] = [];
  private t = 0;
  private total = 0;
  private root: HTMLElement;
  private bars: HTMLElement[];
  private cardEl: HTMLElement;
  private dark: HTMLElement;
  private skipBtn: HTMLElement;
  private shownCard = -999;
  private seenZones = new Set<number>();
  private tmpLook = new THREE.Vector3();
  private unsub: (() => void)[] = [];

  constructor(private g: Game) {
    this.dark = h('div', { class: 'cs-dark' });
    this.bars = [h('div', { class: 'cs-bar top' }), h('div', { class: 'cs-bar bottom' })];
    this.cardEl = h('div', { class: 'cs-card' });
    this.skipBtn = h('button', { class: 'cs-skip', onclick: () => this.skip() }, 'SKIP ›');
    this.root = h('div', { class: 'cs-root' }, this.dark, ...this.bars, this.cardEl, this.skipBtn);
    document.getElementById('app')!.appendChild(this.root);
    const sz = g.world.grid.zoneAt(g.world.grid.start.i, g.world.grid.start.j);
    if (sz >= 0) this.seenZones.add(sz);
    this.unsub.push(bus.on('doorOpened', (e) => this.onDoor(e.id)));
    this.onKey = this.onKey.bind(this);
    window.addEventListener('keydown', this.onKey);
  }

  private onKey(e: KeyboardEvent) {
    if (this.active && (e.code === 'Space' || e.code === 'Enter')) { e.preventDefault(); this.skip(); }
  }

  get enabled() { return save.settings.cutscenes; }

  // ------------------------------------------------------------------ scene builders
  /** Start of a game: the prologue (first time on this map), then a sweep of the starting room. */
  playIntro() {
    if (!this.enabled) return;
    const g = this.g, map = g.world.def.id;
    const first = !save.seen.includes('prologue:' + map);
    const p = g.player;
    const eye = V(p.pos.x, p.eye, p.pos.z);
    const fwd = V(-Math.sin(p.yaw), 0, -Math.cos(p.yaw));
    const right = V(Math.cos(p.yaw), 0, -Math.sin(p.yaw));
    const zi = g.world.grid.zoneAt(g.world.grid.start.i, g.world.grid.start.j);
    const zd = g.world.def.zones[zi];
    const ceil = zd?.ceiling ? zd.height - 0.5 : 3.2;
    const bb = this.zoneBox(zi);
    const clampIn = (v: THREE.Vector3) => { v.x = Math.max(bb.x0 + 0.7, Math.min(bb.x1 - 0.7, v.x)); v.z = Math.max(bb.z0 + 0.7, Math.min(bb.z1 - 0.7, v.z)); return v; };
    const cards: Card[] = [];
    const shots: Shot[] = [];
    let t = 0;
    const sounds: Scene['sounds'] = [];
    if (first) {
      const lines: StoryCard[] = PROLOGUE[map] ?? [];
      sounds.push({ at: 0, name: 'stg_special', vol: 0.7 });
      for (const c of lines) { cards.push({ at: t, dur: 3.6, text: c.text, sub: c.sub, kind: 'prologue' }); t += 3.6; }
      // slow drift high in the room behind the cards
      const a = clampIn(eye.clone().addScaledVector(right, 2.5).addScaledVector(fwd, 2.5).setY(ceil));
      const b = clampIn(eye.clone().addScaledVector(right, -2.5).addScaledVector(fwd, 1.5).setY(ceil - 0.3));
      shots.push({ from: a, to: b, lookFrom: eye.clone().addScaledVector(fwd, -3).setY(0.6), lookTo: eye.clone().addScaledVector(fwd, 3).setY(0.8), dur: t });
    }
    // establishing sweep that lands in the player's eyes
    const lines = ROOM_LINES[map]?.[zd?.letter ?? ''];
    const s0 = shots.length ? shots[shots.length - 1].to.clone() : clampIn(eye.clone().addScaledVector(fwd, -2.8).addScaledVector(right, 2.4).setY(Math.min(ceil, 3.0)));
    const l0 = shots.length ? shots[shots.length - 1].lookTo.clone() : eye.clone().addScaledVector(fwd, 4).setY(0.9);
    const mid = clampIn(eye.clone().addScaledVector(fwd, -1.4).addScaledVector(right, -0.6).setY(2.1));
    shots.push({ from: s0, to: mid, lookFrom: l0, lookTo: eye.clone().addScaledVector(fwd, 5).setY(1.2), dur: 3.4 });
    shots.push({ from: mid.clone(), to: eye.clone(), lookFrom: eye.clone().addScaledVector(fwd, 5).setY(1.2), lookTo: this.playerLook(), dur: 1.1 });
    cards.push({ at: t + 0.2, dur: 3.2, text: g.world.def.name.toUpperCase(), sub: lines ? lines.title : undefined, kind: 'title' });
    if (lines) cards.push({ at: t + 0.9, dur: 3.3, text: lines.line, kind: 'caption' });
    sounds.push({ at: t + 0.15, name: 'stg_roundEnd', vol: 0.55 });
    this.play({ id: 'intro', shots, cards, sounds, darkUntil: first ? t : 0 });
    if (first) { save.seen.push('prologue:' + map); persist(); }
  }

  /** A door / debris opened: fly into the newly unlocked room. */
  private onDoor(id: string) {
    const g = this.g;
    const cells = g.world.grid.doors.get(id);
    if (!cells) return;
    const fresh = [...cells.zones].filter((z) => !this.seenZones.has(z));
    for (const z of cells.zones) this.seenZones.add(z);
    if (!fresh.length || !this.enabled) return;
    const zi = fresh[0];
    const zd = g.world.def.zones[zi];
    const lines = ROOM_LINES[g.world.def.id]?.[zd.letter];
    if (!lines) return;
    const vis = g.world.doors.get(id)!;
    const D = V(vis.center.x, 0, vis.center.z);
    const bb = this.zoneBox(zi);
    const Z = V((bb.x0 + bb.x1) / 2, 0, (bb.z0 + bb.z1) / 2);
    const dir = Z.clone().sub(D).setY(0);
    const dist = dir.length() || 1;
    dir.multiplyScalar(1 / dist);
    const grid = g.world.grid;
    let from = D.clone().addScaledVector(dir, -1.5);
    if (grid.kindAt(Math.floor(from.x), Math.floor(from.z)) !== K.FLOOR) from = D.clone();
    from.y = 2.0;
    const ceil = zd.ceiling ? zd.height - 0.4 : 3.4;
    const to = D.clone().addScaledVector(dir, Math.min(4.5, dist * 0.6)).setY(Math.min(2.4, ceil));
    const focus = this.focusIn(zi, Z);
    this.play({
      id: 'area:' + zi,
      shots: [
        { from, to, lookFrom: D.clone().addScaledVector(dir, 2).setY(1.6), lookTo: focus.clone().setY(1.1), dur: 3.8 },
        { from: to.clone(), to: this.playerEye(), lookFrom: focus.clone().setY(1.1), lookTo: this.playerLook(), dur: 1.2 },
      ],
      cards: [
        { at: 0.35, dur: 3.3, text: lines.title, kind: 'title' },
        { at: 0.9, dur: 3.2, text: lines.line, kind: 'caption' },
      ],
      sounds: [{ at: 0.1, name: 'ui_noteFound', vol: 0.6 }],
    });
  }

  /** A boss arrives. */
  playBoss(boss: Boss) {
    if (!this.enabled) return;
    const c = boss.center().clone();
    const p = this.g.player.pos;
    const dir = V(p.x - c.x, 0, p.z - c.z);
    const d = dir.length() || 1;
    dir.multiplyScalar(1 / d);
    const grid = this.g.world.grid;
    let dist = Math.min(7, d - 0.5);
    while (dist > 3 && grid.kindAt(Math.floor(c.x + dir.x * dist), Math.floor(c.z + dir.z * dist)) !== K.FLOOR) dist -= 0.5;
    const from = c.clone().addScaledVector(dir, dist).setY(1.4);
    const to = c.clone().addScaledVector(dir, Math.max(3, dist - 2)).setY(1.9);
    const info = BOSS_LINES[boss.name] ?? { title: boss.name.toUpperCase(), line: '' };
    this.play({
      id: 'boss',
      boss: true,
      shots: [
        { from, to, lookFrom: c.clone().setY(2.6), lookTo: c.clone().setY(2.2), dur: 4.2 },
        { from: to.clone(), to: this.playerEye(), lookFrom: c.clone().setY(2.2), lookTo: c.clone().setY(1.8), dur: 1.0 },
      ],
      cards: [
        { at: 0.6, dur: 3.4, text: info.title, kind: 'title' },
        { at: 1.1, dur: 3.2, text: info.line, kind: 'caption' },
      ],
      sounds: [],
    });
  }

  // ------------------------------------------------------------------ helpers
  private zoneBox(zi: number) {
    const g = this.g.world.grid;
    let x0 = 1e9, z0 = 1e9, x1 = -1e9, z1 = -1e9;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.zoneAt(i, j) === zi && g.kindAt(i, j) !== K.WINDOW) {
      x0 = Math.min(x0, i); z0 = Math.min(z0, j); x1 = Math.max(x1, i + 1); z1 = Math.max(z1, j + 1);
    }
    return { x0, z0, x1, z1 };
  }

  /** Something worth looking at in a room: a perk machine, the Rewirer, a set-piece, else its centre. */
  private focusIn(zi: number, centre: THREE.Vector3) {
    let best: THREE.Vector3 | null = null, bd = 1e9;
    for (const m of this.g.world.grid.markers) {
      if (m.zone !== zi || !'pqrcs'.includes(m.ch)) continue;
      const d = Math.hypot(m.i + 0.5 - centre.x, m.j + 0.5 - centre.z);
      if (d < bd) { bd = d; best = V(m.i + 0.5, 0, m.j + 0.5); }
    }
    return best ?? centre;
  }

  private playerEye() { const p = this.g.player; return V(p.pos.x, p.eye, p.pos.z); }
  private playerLook() {
    const p = this.g.player;
    const f = p.forward(new THREE.Vector3());
    return V(p.pos.x + f.x * 5, p.eye + f.y * 5, p.pos.z + f.z * 5);
  }

  // ------------------------------------------------------------------ playback
  play(scene: Scene) {
    if (this.active) { this.queue.push(scene); return; }
    this.active = scene;
    this.t = 0;
    this.total = Math.max(scene.shots.reduce((a, s) => a + s.dur, 0), ...scene.cards.map((c) => c.at + c.dur));
    this.shownCard = -999;
    this.root.classList.add('on');
    this.dark.style.opacity = scene.darkUntil ? '0.82' : '0';
    this.g.onCutscene?.(true);
  }

  skip() {
    if (!this.active) return;
    audio.play('ui_click', { bus: 'ui', vol: 0.6 });
    this.queue = this.queue.filter((s) => s.id === 'boss'); // keep a boss reveal; drop queued room tours
    this.finish();
  }

  private finish() {
    this.active = null;
    this.cardEl.className = 'cs-card';
    this.cardEl.innerHTML = '';
    const next = this.queue.shift();
    if (next) { this.play(next); return; }
    this.root.classList.remove('on');
    this.g.invuln = Math.max(this.g.invuln, 1.5); // a moment to get your bearings
    this.g.onCutscene?.(false);
  }

  update(dt: number) {
    const s = this.active;
    if (!s) return;
    const prev = this.t;
    this.t += dt;
    for (const snd of s.sounds) if (prev <= snd.at && this.t > snd.at) audio.play(snd.name, { bus: 'music', vol: snd.vol ?? 0.7, noVariation: true, priority: 8 });
    if (s.darkUntil && this.t > s.darkUntil) this.dark.style.opacity = '0';
    // cards (typewriter)
    let ci = -1;
    for (let i = 0; i < s.cards.length; i++) { const c = s.cards[i]; if (this.t >= c.at && this.t < c.at + c.dur) ci = i; }
    const titleOrPro = s.cards.findIndex((c) => (c.kind !== 'caption') && this.t >= c.at && this.t < c.at + c.dur);
    const cap = s.cards.findIndex((c) => c.kind === 'caption' && this.t >= c.at && this.t < c.at + c.dur);
    const key = (titleOrPro + 1) * 100 + (cap + 1);
    if (key !== this.shownCard) {
      this.shownCard = key;
      this.cardEl.innerHTML = '';
      if (titleOrPro >= 0) {
        const c = s.cards[titleOrPro];
        this.cardEl.appendChild(h('div', { class: 'cs-' + c.kind }, h('div', { class: 'cs-text' }, ''), c.sub ? h('div', { class: 'cs-sub' }, '') : null));
      }
      if (cap >= 0) this.cardEl.appendChild(h('div', { class: 'cs-caption' }, h('div', { class: 'cs-text' }, '')));
    }
    void ci;
    // typewriter reveal
    const typeIn = (idx: number, sel: string) => {
      if (idx < 0) return;
      const c = s.cards[idx];
      const k = Math.min(1, (this.t - c.at) / Math.max(0.6, c.dur * 0.45));
      const box = this.cardEl.querySelector(sel);
      if (!box) return;
      const txt = box.querySelector('.cs-text') as HTMLElement | null;
      const sub = box.querySelector('.cs-sub') as HTMLElement | null;
      const full = c.text.length + (c.sub?.length ?? 0);
      const n = Math.floor(k * full);
      if (txt) txt.textContent = c.text.slice(0, Math.min(n, c.text.length));
      if (sub && c.sub) sub.textContent = c.sub.slice(0, Math.max(0, n - c.text.length));
      const fadeOut = c.at + c.dur - this.t;
      (box as HTMLElement).style.opacity = String(Math.min(1, fadeOut / 0.4, (this.t - c.at) / 0.25));
    };
    typeIn(titleOrPro, '.cs-prologue, .cs-title');
    typeIn(cap, '.cs-caption');
    if (this.t >= this.total) this.finish();
  }

  /** Drive the camera for the current shot. */
  applyCamera(cam: THREE.PerspectiveCamera) {
    const s = this.active;
    if (!s) return;
    let t = this.t;
    let shot = s.shots[s.shots.length - 1];
    let k = 1;
    for (const sh of s.shots) {
      if (t <= sh.dur) { shot = sh; k = t / sh.dur; break; }
      t -= sh.dur;
    }
    const e = smoothstep(0, 1, k);
    cam.position.lerpVectors(shot.from, shot.to, e);
    this.tmpLook.lerpVectors(shot.lookFrom, shot.lookTo, e);
    cam.up.set(0, 1, 0);
    cam.lookAt(this.tmpLook);
  }

  dispose() {
    for (const u of this.unsub) u();
    window.removeEventListener('keydown', this.onKey);
    this.root.remove();
  }
}
