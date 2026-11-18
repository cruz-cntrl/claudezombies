import { RATE, render, strings, piano, tom, staticBurst, bell, vinyl, gain, chain, filt, osc, burst, thud, midi, noiseSrc } from './compose';
import { renderSong, songDuration } from './songs';
import { audio, type Voice } from '../audioEngine';
import { bus } from '../../core/events';
import type { Game } from '../../game';

/**
 * Generated score: menu theme, adaptive in-game layers (drone / pulse / percussion /
 * tension strings, all locked to the same 20 s loop), stingers and the easter-egg songs.
 */
const BPM = 96, BEAT = 60 / BPM, BAR = BEAT * 4, LOOP = BAR * 8;
// Dm – Bb – Gm – A, two bars each (roots, midi)
const PROG = [[38, 41, 45], [34, 38, 41], [31, 34, 38], [33, 37, 40]];

function renderMenu() {
  const len = 32;
  return render(len + 2, (ctx, out) => {
    const rev = ctx.createConvolver();
    const ir = new AudioBuffer({ length: RATE * 3, sampleRate: RATE, numberOfChannels: 2 });
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); let y = 0; for (let i = 0; i < d.length; i++) { y = y * 0.7 + (Math.random() * 2 - 1) * 0.3; d[i] = y * Math.pow(1 - i / d.length, 2.5); } }
    rev.buffer = ir;
    const wet = gain(ctx, 0.35);
    chain(wet, rev, out);
    const chords = [[38, 45, 50, 53], [34, 41, 46, 50], [31, 38, 43, 46], [33, 40, 45, 49]];
    chords.forEach((c, i) => strings(ctx, out, i * 8, c, 8.4, 0.5, 700, 2.5));
    chords.forEach((c, i) => strings(ctx, wet, i * 8, c, 8.4, 0.3, 700, 2.5));
    // sub drone
    const sub = osc(ctx, 'sine', midi(26), 0, len + 1);
    const sg = gain(ctx, 0.25);
    chain(sub, sg, out);
    // lonely piano
    const mel: [number, number][] = [[62, 1], [65, 3.5], [64, 5], [62, 7.5], [58, 9], [62, 11.5], [57, 13], [55, 17], [58, 19.5], [62, 21], [61, 24.5], [57, 26], [64, 28.5], [62, 30]];
    for (const [n, t] of mel) { piano(ctx, out, t, n, 2.5, 0.32); piano(ctx, wet, t, n, 2.5, 0.25); }
    vinyl(ctx, out, len + 1, 0.5);
  }, 2, RATE);
}

function renderLayer(kind: 'drone' | 'pulse' | 'perc' | 'tension') {
  return render(LOOP + 1.5, (ctx, out) => {
    for (let b = 0; b < 8; b++) {
      const ch = PROG[Math.floor(b / 2)];
      const t = b * BAR;
      switch (kind) {
        case 'drone':
          if (b % 2 === 0) strings(ctx, out, t, [ch[0] - 12, ch[0]], BAR * 2, 0.45, 450, 1.5);
          if (b === 0) { const n = noiseSrc(ctx, 'brown', 0, LOOP + 1); chain(n, filt(ctx, 'lowpass', 180), gain(ctx, 0.25), out); }
          break;
        case 'pulse':
          for (let k = 0; k < 8; k++) {
            const tt = t + k * BEAT * 0.5;
            const o = osc(ctx, 'sawtooth', midi(ch[0]), tt, BEAT * 0.4);
            const g = gain(ctx, 0);
            g.gain.setValueAtTime(0.0001, tt); g.gain.linearRampToValueAtTime(k % 2 ? 0.18 : 0.28, tt + 0.005); g.gain.setTargetAtTime(0.0001, tt + 0.01, 0.06);
            const lp = filt(ctx, 'lowpass', 500, 2);
            chain(o, lp, g, out);
          }
          break;
        case 'perc':
          tom(ctx, out, t, 62, 0.9);
          tom(ctx, out, t + BEAT * 1.5, 70, 0.55);
          tom(ctx, out, t + BEAT * 2.5, 58, 0.75);
          if (b % 2 === 1) { tom(ctx, out, t + BEAT * 3.5, 80, 0.5); tom(ctx, out, t + BEAT * 3.75, 74, 0.45); }
          for (let k = 0; k < 8; k++) burst(ctx, out, t + k * BEAT * 0.5, 'bandpass', 2400, 1.5, 0.05, k % 2 ? 0.05 : 0.09, 'pink');
          break;
        case 'tension': {
          const notes = [ch[1] + 12, ch[2] + 12, ch[0] + 25];
          const g = gain(ctx, 1);
          const am = osc(ctx, 'sine', 7.5, t, BAR + 0.5);
          const ag = gain(ctx, 0.45);
          chain(am, ag); ag.connect(g.gain);
          chain(g, out);
          strings(ctx, g, t, notes, BAR, 0.32, 1700, 0.25);
          break;
        }
      }
    }
  }, 2, RATE);
}

type Stinger = 'roundStart' | 'roundEnd' | 'special' | 'gameOver' | 'bossStart' | 'victory';
function renderStinger(k: Stinger) {
  const len = k === 'gameOver' || k === 'victory' ? 9 : 5;
  return render(len, (ctx, out) => {
    switch (k) {
      case 'roundStart':
        bell(ctx, out, 0.01, midi(38), 4, 0.6, 1.41);
        bell(ctx, out, 0.01, midi(50), 3, 0.25, 2.01);
        strings(ctx, out, 0.0, [38, 45, 50], 3, 0.6, 500, 1.0);
        thud(ctx, out, 0.01, 70, 30, 1.5, 0.8);
        staticBurst(ctx, out, 1.2, 1.4, 0.3);
        break;
      case 'roundEnd':
        piano(ctx, out, 0.01, 57, 2, 0.4); piano(ctx, out, 0.4, 53, 2, 0.35); piano(ctx, out, 0.8, 50, 3, 0.4);
        strings(ctx, out, 0.2, [38, 45], 3.5, 0.35, 600, 0.8);
        break;
      case 'special': {
        staticBurst(ctx, out, 0, 4.5, 0.55);
        for (let i = 0; i < 3; i++) {
          const o = osc(ctx, 'triangle', 220, 0.4 + i * 1.2, 0.8);
          o.frequency.setValueAtTime(220, 0.4 + i * 1.2); o.frequency.linearRampToValueAtTime(330, 1.0 + i * 1.2);
          const g = gain(ctx, 0); g.gain.setValueAtTime(0.0001, 0.4 + i * 1.2); g.gain.linearRampToValueAtTime(0.3, 0.6 + i * 1.2); g.gain.linearRampToValueAtTime(0.0001, 1.2 + i * 1.2);
          chain(o, filt(ctx, 'lowpass', 900), g, out);
        }
        thud(ctx, out, 0, 60, 25, 2, 0.8);
        break;
      }
      case 'bossStart':
        thud(ctx, out, 0.01, 55, 22, 2.5, 1);
        strings(ctx, out, 0, [26, 33, 38, 39], 4.5, 0.7, 700, 0.4);
        staticBurst(ctx, out, 0.5, 3, 0.4);
        for (let i = 0; i < 4; i++) tom(ctx, out, 0.8 + i * 0.6, 55 + i * 4, 0.8);
        break;
      case 'gameOver': {
        const seq: [number, number][] = [[57, 0], [53, 1], [50, 2], [49, 3.5], [50, 5]];
        for (const [n, t] of seq) piano(ctx, out, t + 0.05, n, 3, 0.4);
        strings(ctx, out, 0, [38, 41, 45], 4, 0.45, 600, 1);
        strings(ctx, out, 4, [34, 37, 41], 4.5, 0.45, 500, 1);
        thud(ctx, out, 0.05, 50, 24, 3, 0.6);
        break;
      }
      case 'victory':
        strings(ctx, out, 0, [38, 45, 50, 54], 4, 0.5, 1200, 1.5);
        strings(ctx, out, 4, [43, 50, 55, 59], 4.5, 0.55, 1400, 1.0);
        bell(ctx, out, 0.5, midi(62), 3, 0.35, 2); bell(ctx, out, 4.2, midi(67), 4, 0.35, 2);
        staticBurst(ctx, out, 0, 1, 0.2);
        break;
    }
  }, 2, RATE);
}

export class Music {
  private layers: (Voice | null)[] = [];
  private layerBufs: AudioBuffer[] | null = null;
  private menuVoice: Voice | null = null;
  private songVoice: Voice | null = null;
  private stingers = new Map<Stinger, AudioBuffer>();
  private rendering: Promise<void> | null = null;
  private unsub: (() => void)[] = [];
  private game: Game | null = null;
  private registered = false;

  private register() {
    if (this.registered) return;
    this.registered = true;
    audio.register('mus_menu', 1, () => renderMenu());
    for (const k of ['drone', 'pulse', 'perc', 'tension'] as const) audio.register('mus_' + k, 1, () => renderLayer(k));
    for (const k of ['roundStart', 'roundEnd', 'special', 'gameOver', 'bossStart', 'victory'] as Stinger[]) audio.register('stg_' + k, 1, () => renderStinger(k));
    audio.register('song_ravenmoor', 1, () => renderSong('ravenmoor'));
    audio.register('song_station', 1, () => renderSong('station'));
  }

  playMenu() {
    this.register();
    this.stopLayers(1);
    if (this.menuVoice?.alive) return;
    audio.ensure('mus_menu').then(() => {
      if (this.game || this.menuVoice?.alive) return;
      this.menuVoice = audio.play('mus_menu', { bus: 'music', loop: true, vol: 0.0001, priority: 10, noVariation: true });
      this.menuVoice?.setVolume(0.75, 1.5);
    });
  }

  stop(fade = 1) {
    if (this.menuVoice) { const v = this.menuVoice; v.setVolume(0, fade / 3); setTimeout(() => audio.stop(v, 0.1), fade * 1000); this.menuVoice = null; }
    this.stopLayers(fade);
    if (this.songVoice) { audio.stop(this.songVoice, fade); this.songVoice = null; }
  }

  private stopLayers(fade: number) {
    for (const v of this.layers) if (v) { v.setVolume(0, fade / 3); setTimeout(() => audio.stop(v, 0.1), fade * 1000); }
    this.layers = [];
  }

  startGame(g: Game) {
    this.register();
    this.stop(1);
    this.game = g;
    for (const u of this.unsub) u();
    this.unsub = [
      bus.on('roundStart', (e) => this.stinger(e.special === 'hounds' ? 'special' : 'roundStart')),
      bus.on('roundEnd', () => this.stinger('roundEnd')),
      bus.on('bossStart', () => this.stinger('bossStart')),
      bus.on('bossEnd', () => this.stinger('victory')),
    ];
    const names = ['mus_drone', 'mus_pulse', 'mus_perc', 'mus_tension'];
    this.rendering = Promise.all(names.map((n) => audio.ensure(n))).then(() => {
      if (this.game !== g) return;
      const t = audio.ctx.currentTime + 0.1;
      this.layers = names.map((n) => audio.play(n, { bus: 'music', loop: true, vol: 0.0001, priority: 10, noVariation: true, delay: t - audio.ctx.currentTime }));
    });
    for (const k of ['roundStart', 'roundEnd', 'special', 'gameOver', 'bossStart', 'victory']) audio.ensure('stg_' + k);
  }

  private stinger(k: Stinger) {
    audio.play('stg_' + k, { bus: 'music', vol: 0.85, priority: 9, noVariation: true });
  }

  gameOver() {
    this.stopLayers(2);
    this.game = null;
    this.stinger('gameOver');
  }

  /** Easter-egg song — ducks the score while it plays. */
  async playSong(id: string) {
    this.register();
    await audio.ensure('song_' + id);
    if (this.songVoice?.alive) return;
    this.songVoice = audio.play('song_' + id, { bus: 'music', vol: 0.95, priority: 10, noVariation: true });
    setTimeout(() => { this.songVoice = null; }, songDuration(id) * 1000);
  }

  get songPlaying() { return !!this.songVoice?.alive; }

  /** Adaptive mix: layer gains follow round number and how many are alive. */
  update(_dt: number, g: Game | null) {
    if (!g || !this.layers.length) return;
    const I = g.musicIntensity;
    const song = this.songPlaying ? 0.15 : 1;
    const breakK = g.rounds.state === 'active' ? 1 : 0.55;
    const vols = [
      0.55,
      Math.min(1, Math.max(0, (I - 0.15) * 1.6)) * 0.55,
      Math.min(1, Math.max(0, (I - 0.35) * 1.8)) * 0.6 * breakK,
      Math.min(1, Math.max(0, (I - 0.55) * 2.2)) * 0.4 * breakK,
    ];
    this.layers.forEach((v, i) => v?.setVolume(vols[i] * song, 1.2));
    audio.duck(Math.min(1, g.zombies.aliveCount / 18) * 0.6);
  }
}

export { BAR, LOOP };
