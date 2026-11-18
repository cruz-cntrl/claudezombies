import { impulse } from './synth/dsp';
import type { ReverbType } from '../world/mapTypes';
import { save } from '../core/save';
import { dbToGain } from '../core/math';

export type Bus = 'sfx' | 'music' | 'voice' | 'ui';
export interface Vec3 { x: number; y: number; z: number }

export interface PlayOpts {
  pos?: Vec3;
  bus?: Bus;
  vol?: number;
  rate?: number;
  priority?: number;     // 0..10 (10 = never stolen first)
  loop?: boolean;
  reverb?: number;       // send level
  refDist?: number;
  noVariation?: boolean;
  delay?: number;
  offset?: number;
}

export class Voice {
  src!: AudioBufferSourceNode;
  gain!: GainNode;
  panner: PannerNode | null = null;
  filter: BiquadFilterNode | null = null;
  send: GainNode | null = null;
  priority = 5;
  started = 0;
  ends = 0;
  pos: Vec3 | null = null;
  loop = false;
  alive = true;
  occluded = false;
  baseVol = 1;
  name = '';
  setPos(p: Vec3) { this.pos = p; }
  setVolume(v: number, t = 0.05) {
    if (!this.alive) return;
    this.baseVol = v;
    this.gain.gain.setTargetAtTime(v * (this.occluded ? 0.55 : 1), this.gain.context.currentTime, t);
  }
}

type RenderFn = (variation: number) => Promise<AudioBuffer>;

/**
 * Web Audio engine. All assets are pre-rendered AudioBuffers (see synth/); at runtime we only
 * play buffers through: voice → [occlusion filter] → [HRTF panner] → gain → bus → master
 * (compressor + limiter). A reverb send per area type feeds a convolver bus.
 */
export class AudioEngine {
  ctx: AudioContext;
  master: GainNode;
  busses: Record<Bus, GainNode>;
  private duckGain: GainNode;
  private reverbIn: GainNode;
  private convs: { node: ConvolverNode; g: GainNode; type: ReverbType }[] = [];
  private irs = new Map<ReverbType, AudioBuffer>();
  reverbType: ReverbType = 'room';
  private bank = new Map<string, AudioBuffer[]>();
  private registry = new Map<string, { n: number; fn: RenderFn; pending?: Promise<void> }>();
  private lastVar = new Map<string, number>();
  voices: Voice[] = [];
  maxVoices = 32;
  unlocked = false;
  listener = { x: 0, y: 1.6, z: 0 };
  private occTimer = 0;
  occluder: ((ax: number, az: number, bx: number, bz: number) => boolean) | null = null;
  private bgQueue: string[] = [];
  private bgRunning = false;

  constructor() {
    const AC: typeof AudioContext = (window as any).AudioContext || (window as any).webkitAudioContext;
    this.ctx = new AC({ latencyHint: 'interactive' });
    const ctx = this.ctx;
    const comp = ctx.createDynamicsCompressor();
    comp.threshold.value = -16; comp.knee.value = 10; comp.ratio.value = 3.5; comp.attack.value = 0.004; comp.release.value = 0.2;
    const limiter = ctx.createDynamicsCompressor();
    limiter.threshold.value = -2; limiter.knee.value = 0; limiter.ratio.value = 20; limiter.attack.value = 0.001; limiter.release.value = 0.1;
    this.master = ctx.createGain();
    this.master.connect(comp); comp.connect(limiter); limiter.connect(ctx.destination);
    this.duckGain = ctx.createGain();
    this.duckGain.connect(this.master);
    this.busses = {
      sfx: ctx.createGain(), music: ctx.createGain(), voice: ctx.createGain(), ui: ctx.createGain(),
    };
    this.busses.sfx.connect(this.master);
    this.busses.voice.connect(this.master);
    this.busses.ui.connect(this.master);
    this.busses.music.connect(this.duckGain);
    this.reverbIn = ctx.createGain();
    this.applyVolumes();
    for (const t of ['hall', 'room', 'metal', 'outdoor'] as ReverbType[]) this.irs.set(t, this.makeIR(t));
    this.setReverb('room', true);
    document.addEventListener('visibilitychange', () => {
      if (document.hidden) this.ctx.suspend().catch(() => {});
      else if (this.unlocked) this.ctx.resume().catch(() => {});
    });
  }

  private makeIR(t: ReverbType): AudioBuffer {
    switch (t) {
      case 'hall': return impulse(this.ctx, 2.6, 2.2, { lowpass: 3500, early: 8, predelay: 0.02 });
      case 'metal': return impulse(this.ctx, 1.9, 1.8, { lowpass: 5500, early: 12, predelay: 0.012 });
      case 'outdoor': return impulse(this.ctx, 1.4, 3.5, { lowpass: 2200, early: 3, predelay: 0.06 });
      default: return impulse(this.ctx, 0.9, 2.5, { lowpass: 4000, early: 10, predelay: 0.006 });
    }
  }

  /** Crossfade the reverb bus to a new room type. */
  setReverb(type: ReverbType, immediate = false) {
    if (type === this.reverbType && this.convs.length) return;
    this.reverbType = type;
    const ctx = this.ctx;
    const node = ctx.createConvolver();
    node.buffer = this.irs.get(type)!;
    const g = ctx.createGain();
    g.gain.value = immediate ? 1 : 0;
    this.reverbIn.connect(node); node.connect(g); g.connect(this.busses.sfx);
    const now = ctx.currentTime;
    if (!immediate) g.gain.setTargetAtTime(1, now, 0.4);
    for (const c of this.convs) {
      c.g.gain.setTargetAtTime(0, now, 0.4);
      const old = c;
      setTimeout(() => { try { this.reverbIn.disconnect(old.node); old.node.disconnect(); old.g.disconnect(); } catch { /* */ } }, 3000);
    }
    this.convs = [{ node, g, type }];
  }

  applyVolumes() {
    const s = save.settings;
    this.master.gain.value = s.master;
    this.busses.music.gain.value = s.music * 0.7;
    this.busses.sfx.gain.value = s.sfx;
    this.busses.ui.gain.value = s.sfx * 0.8;
    this.busses.voice.gain.value = s.voice;
  }

  /** Music ducking during heavy combat (0 = none, 1 = max) */
  duck(amount: number) {
    this.duckGain.gain.setTargetAtTime(1 - amount * 0.35, this.ctx.currentTime, 0.5);
  }

  /** iOS: must be called from a user gesture. */
  unlock() {
    const nav = navigator as any;
    try { if (nav.audioSession) nav.audioSession.type = 'playback'; } catch { /* */ }
    if (this.ctx.state !== 'running') this.ctx.resume().catch(() => {});
    if (!this.unlocked) {
      const b = this.ctx.createBuffer(1, 1, 22050);
      const s = this.ctx.createBufferSource();
      s.buffer = b; s.connect(this.ctx.destination); s.start(0);
      this.unlocked = true;
    }
  }

  // ---------------------------------------------------------------- asset bank
  register(name: string, variations: number, fn: RenderFn) {
    this.registry.set(name, { n: variations, fn });
  }

  has(name: string) { return this.bank.has(name); }

  async ensure(name: string): Promise<void> {
    if (this.bank.has(name)) return;
    const r = this.registry.get(name);
    if (!r) return;
    if (!r.pending) {
      r.pending = (async () => {
        const list: AudioBuffer[] = [];
        for (let v = 0; v < r.n; v++) list.push(await r.fn(v));
        this.bank.set(name, list);
      })().catch((e) => console.warn('audio render failed', name, e));
    }
    return r.pending;
  }

  /** Render a set of sounds with limited parallelism, reporting progress. */
  async preload(names: string[], onProgress?: (f: number) => void) {
    const todo = names.filter((n) => !this.bank.has(n));
    let done = 0;
    const par = 6;
    let idx = 0;
    const worker = async () => {
      while (idx < todo.length) {
        const n = todo[idx++];
        await this.ensure(n);
        done++;
        onProgress?.(done / todo.length);
      }
    };
    await Promise.all(Array.from({ length: par }, worker));
    onProgress?.(1);
  }

  /** Render everything else slowly in the background (after first playable). */
  background(names?: string[]) {
    const list = names ?? [...this.registry.keys()];
    for (const n of list) if (!this.bank.has(n) && !this.bgQueue.includes(n)) this.bgQueue.push(n);
    if (this.bgRunning) return;
    this.bgRunning = true;
    const step = async () => {
      const n = this.bgQueue.shift();
      if (!n) { this.bgRunning = false; return; }
      await this.ensure(n);
      setTimeout(step, 30);
    };
    setTimeout(step, 200);
  }

  // ---------------------------------------------------------------- playback
  play(name: string, o: PlayOpts = {}): Voice | null {
    if (!this.unlocked || this.ctx.state !== 'running') return null;
    const list = this.bank.get(name);
    if (!list) { this.ensure(name); return null; }
    let vi = Math.floor(Math.random() * list.length);
    if (list.length > 1 && vi === this.lastVar.get(name)) vi = (vi + 1) % list.length;
    this.lastVar.set(name, vi);
    const buf = list[vi];
    const prio = o.priority ?? 5;
    // distance cull for quiet far sounds
    if (o.pos) {
      const d = Math.hypot(o.pos.x - this.listener.x, o.pos.z - this.listener.z);
      if (d > 45 && prio < 8) return null;
    }
    if (this.voices.length >= this.maxVoices) {
      let worst: Voice | null = null;
      for (const v of this.voices) {
        if (v.priority > prio) continue;
        if (!worst || v.priority < worst.priority || (v.priority === worst.priority && v.started < worst.started)) worst = v;
      }
      if (!worst) return null;
      this.stop(worst, 0.02);
    }
    const ctx = this.ctx;
    const v = new Voice();
    v.name = name;
    v.priority = prio;
    v.loop = !!o.loop;
    const src = ctx.createBufferSource();
    src.buffer = buf;
    src.loop = !!o.loop;
    const rate = (o.rate ?? 1) * (o.noVariation ? 1 : 1 + (Math.random() - 0.5) * 0.08);
    src.playbackRate.value = rate;
    const g = ctx.createGain();
    const vol = (o.vol ?? 1) * (o.noVariation ? 1 : dbToGain((Math.random() - 0.5) * 4));
    v.baseVol = vol;
    g.gain.value = vol;
    let node: AudioNode = src;
    if (o.pos) {
      const f = ctx.createBiquadFilter();
      f.type = 'lowpass'; f.frequency.value = 20000; f.Q.value = 0.5;
      const p = ctx.createPanner();
      p.panningModel = 'HRTF';
      p.distanceModel = 'inverse';
      p.refDistance = o.refDist ?? 2.5;
      p.maxDistance = 60;
      p.rolloffFactor = 1.1;
      setPannerPos(p, o.pos);
      node.connect(f); f.connect(p); node = p;
      v.panner = p; v.filter = f; v.pos = o.pos;
    }
    node.connect(g);
    g.connect(this.busses[o.bus ?? 'sfx']);
    const send = o.reverb ?? (o.pos ? 0.25 : 0);
    if (send > 0) {
      const sg = ctx.createGain();
      sg.gain.value = send;
      g.connect(sg); sg.connect(this.reverbIn);
      v.send = sg;
    }
    const when = ctx.currentTime + (o.delay ?? 0);
    src.start(when, o.offset ?? 0);
    v.src = src; v.gain = g;
    v.started = ctx.currentTime;
    v.ends = o.loop ? Infinity : when + buf.duration / rate;
    src.onended = () => this.release(v);
    this.voices.push(v);
    return v;
  }

  stop(v: Voice | null, fade = 0.05) {
    if (!v || !v.alive) return;
    const t = this.ctx.currentTime;
    try {
      v.gain.gain.cancelScheduledValues(t);
      v.gain.gain.setValueAtTime(v.gain.gain.value, t);
      v.gain.gain.linearRampToValueAtTime(0, t + fade);
      v.src.stop(t + fade + 0.01);
    } catch { /* already stopped */ }
    this.release(v);
  }

  private release(v: Voice) {
    if (!v.alive) return;
    v.alive = false;
    const i = this.voices.indexOf(v);
    if (i >= 0) this.voices.splice(i, 1);
    setTimeout(() => { try { v.gain.disconnect(); v.send?.disconnect(); v.panner?.disconnect(); v.filter?.disconnect(); } catch { /* */ } }, 200);
  }

  stopAll() {
    for (const v of [...this.voices]) this.stop(v, 0.1);
  }

  /** Update listener + positional voices (occlusion is throttled). */
  update(dt: number, pos: Vec3, fx: number, fz: number) {
    this.listener.x = pos.x; this.listener.y = pos.y; this.listener.z = pos.z;
    const L = this.ctx.listener as any;
    const t = this.ctx.currentTime;
    if (L.positionX) {
      L.positionX.setTargetAtTime(pos.x, t, 0.02); L.positionY.setTargetAtTime(pos.y, t, 0.02); L.positionZ.setTargetAtTime(pos.z, t, 0.02);
      L.forwardX.setTargetAtTime(fx, t, 0.02); L.forwardY.setTargetAtTime(0, t, 0.02); L.forwardZ.setTargetAtTime(fz, t, 0.02);
      L.upX.value = 0; L.upY.value = 1; L.upZ.value = 0;
    } else {
      L.setPosition(pos.x, pos.y, pos.z);
      L.setOrientation(fx, 0, fz, 0, 1, 0);
    }
    this.occTimer -= dt;
    const doOcc = this.occTimer <= 0 && !!this.occluder;
    if (doOcc) this.occTimer = 0.15;
    for (const v of this.voices) {
      if (!v.panner || !v.pos) continue;
      setPannerPos(v.panner, v.pos, t);
      if (doOcc && v.filter) {
        const occ = !this.occluder!(pos.x, pos.z, v.pos.x, v.pos.z);
        if (occ !== v.occluded) {
          v.occluded = occ;
          v.filter.frequency.setTargetAtTime(occ ? 900 : 20000, t, 0.08);
          v.gain.gain.setTargetAtTime(v.baseVol * (occ ? 0.55 : 1), t, 0.08);
        }
      }
    }
  }
}

function setPannerPos(p: PannerNode, pos: Vec3, t?: number) {
  if ((p as any).positionX) {
    if (t === undefined) { p.positionX.value = pos.x; p.positionY.value = pos.y; p.positionZ.value = pos.z; }
    else { p.positionX.setTargetAtTime(pos.x, t, 0.03); p.positionY.setTargetAtTime(pos.y, t, 0.03); p.positionZ.setTargetAtTime(pos.z, t, 0.03); }
  } else (p as any).setPosition(pos.x, pos.y, pos.z);
}

export const audio = new AudioEngine();
