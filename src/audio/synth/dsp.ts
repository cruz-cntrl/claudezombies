/**
 * DSP building blocks for offline sound design. Every sound is rendered once at load with an
 * OfflineAudioContext. Rules of the house: no raw square/saw lead voices, everything filtered,
 * layered and enveloped; keep energy low-mid; avoid piercing highs.
 */
export type Ctx = OfflineAudioContext | BaseAudioContext;

const noiseCache = new Map<string, AudioBuffer>();

/** Shared noise buffers (AudioBuffers are context-independent). */
export function noise(ctx: Ctx, color: 'white' | 'pink' | 'brown', seconds = 4): AudioBuffer {
  const key = color + ctx.sampleRate + ':' + seconds;
  let b = noiseCache.get(key);
  if (b) return b;
  const len = Math.floor(ctx.sampleRate * seconds);
  b = new AudioBuffer({ length: len, sampleRate: ctx.sampleRate, numberOfChannels: 1 });
  const d = b.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0, last = 0;
  for (let i = 0; i < len; i++) {
    const w = Math.random() * 2 - 1;
    if (color === 'white') d[i] = w;
    else if (color === 'pink') {
      b0 = 0.99886 * b0 + w * 0.0555179; b1 = 0.99332 * b1 + w * 0.0750759; b2 = 0.969 * b2 + w * 0.153852;
      b3 = 0.8665 * b3 + w * 0.3104856; b4 = 0.55 * b4 + w * 0.5329522; b5 = -0.7616 * b5 - w * 0.016898;
      d[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + w * 0.5362) * 0.11;
      b6 = w * 0.115926;
    } else {
      last = (last + 0.02 * w) / 1.02;
      d[i] = last * 3.5;
    }
  }
  noiseCache.set(key, b);
  return b;
}

export function noiseSrc(ctx: Ctx, color: 'white' | 'pink' | 'brown', t: number, dur: number, offset = Math.random() * 2) {
  const s = ctx.createBufferSource();
  s.buffer = noise(ctx, color);
  s.loop = true;
  s.start(t, offset);
  s.stop(t + dur + 0.05);
  return s;
}

export function gain(ctx: Ctx, v = 1) { const g = ctx.createGain(); g.gain.value = v; return g; }

export function filt(ctx: Ctx, type: BiquadFilterType, freq: number, q = 0.707, gainDb = 0) {
  const f = ctx.createBiquadFilter();
  f.type = type; f.frequency.value = freq; f.Q.value = q; f.gain.value = gainDb;
  return f;
}

export function osc(ctx: Ctx, type: OscillatorType, freq: number, t: number, dur: number) {
  const o = ctx.createOscillator();
  o.type = type; o.frequency.value = freq;
  o.start(t); o.stop(t + dur + 0.05);
  return o;
}

/** Percussive envelope: attack then exponential decay (time constant ~ decay/4). */
export function perc(p: AudioParam, t: number, peak: number, attack: number, decay: number) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + Math.max(0.0005, attack));
  p.setTargetAtTime(0.0001, t + attack, decay / 4);
}

/** ADSR-ish envelope */
export function adsr(p: AudioParam, t: number, a: number, d: number, s: number, hold: number, r: number, peak = 1) {
  p.setValueAtTime(0.0001, t);
  p.linearRampToValueAtTime(peak, t + a);
  p.setTargetAtTime(peak * s, t + a, d / 3);
  p.setValueAtTime(peak * s, t + a + hold);
  p.setTargetAtTime(0.0001, t + a + hold, r / 4);
}

export function sweep(p: AudioParam, t: number, from: number, to: number, time: number) {
  p.setValueAtTime(from, t);
  p.exponentialRampToValueAtTime(Math.max(1e-4, to), t + time);
}

let curveCache = new Map<number, Float32Array<ArrayBuffer>>();
/** Soft saturation (tanh). drive 1..20 */
export function shaper(ctx: Ctx, drive: number) {
  const ws = ctx.createWaveShaper();
  let c = curveCache.get(drive);
  if (!c) {
    c = new Float32Array(1024);
    const norm = Math.tanh(drive);
    for (let i = 0; i < 1024; i++) {
      const x = (i / 1023) * 2 - 1;
      c[i] = Math.tanh(x * drive) / norm;
    }
    curveCache.set(drive, c);
  }
  ws.curve = c;
  ws.oversample = '2x';
  return ws;
}

/** Chain nodes: a -> b -> c ... returns last */
export function chain(...nodes: AudioNode[]): AudioNode {
  for (let i = 0; i < nodes.length - 1; i++) nodes[i].connect(nodes[i + 1]);
  return nodes[nodes.length - 1];
}

/** Generated impulse response: exponentially decaying stereo noise with early reflections. */
export function impulse(ctx: Ctx, seconds: number, decay: number, opts: { lowpass?: number; early?: number; predelay?: number } = {}) {
  const rate = ctx.sampleRate;
  const len = Math.floor(rate * seconds);
  const ir = new AudioBuffer({ length: len, sampleRate: rate, numberOfChannels: 2 });
  const pre = Math.floor((opts.predelay ?? 0.01) * rate);
  const lp = opts.lowpass ?? 6000;
  const a = Math.exp((-2 * Math.PI * lp) / rate);
  for (let ch = 0; ch < 2; ch++) {
    const d = ir.getChannelData(ch);
    let y = 0;
    for (let i = pre; i < len; i++) {
      const t = (i - pre) / rate;
      const env = Math.pow(1 - (i - pre) / (len - pre), decay) * Math.exp(-t * 2.5);
      const w = Math.random() * 2 - 1;
      // progressively darker tail
      const k = a + (1 - a) * Math.min(1, t / seconds) * 0.6;
      y = y * k + w * (1 - k);
      d[i] = y * env;
    }
    // early reflections
    const early = opts.early ?? 6;
    for (let e = 0; e < early; e++) {
      const idx = pre + Math.floor((0.005 + Math.random() * 0.06) * rate);
      if (idx < len) d[idx] += (Math.random() * 0.6 + 0.2) * (Math.random() > 0.5 ? 1 : -1);
    }
  }
  return ir;
}

/** Render helper: builds graph via fn(ctx, out) and returns the rendered buffer. */
export async function render(seconds: number, fn: (ctx: OfflineAudioContext, out: AudioNode) => void, channels = 1, rate = 44100): Promise<AudioBuffer> {
  const ctx = new OfflineAudioContext(channels, Math.ceil(seconds * rate), rate);
  const out = ctx.createGain();
  out.connect(ctx.destination);
  fn(ctx, out);
  const buf = await ctx.startRendering();
  normalizePeak(buf, 0.89);
  return buf;
}

/** Peak-normalize so every asset has predictable headroom; mixing level is set at playback. */
export function normalizePeak(buf: AudioBuffer, target: number) {
  let peak = 0;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) { const v = Math.abs(d[i]); if (v > peak) peak = v; }
  }
  if (peak < 1e-5) return;
  const k = target / peak;
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < d.length; i++) d[i] *= k;
  }
  // short fade-out on the last 10 ms to avoid clicks
  const fade = Math.min(buf.length, Math.floor(buf.sampleRate * 0.01));
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const d = buf.getChannelData(c);
    for (let i = 0; i < fade; i++) d[d.length - 1 - i] *= i / fade;
  }
}

/** Short decaying resonant "ping" — a metallic click. freq kept in the mid range. */
export function ping(ctx: Ctx, out: AudioNode, t: number, freq: number, q: number, level: number, decay = 0.08) {
  const n = noiseSrc(ctx, 'white', t, 0.02);
  const g = gain(ctx, 0);
  perc(g.gain, t, level, 0.0005, 0.004);
  const f = filt(ctx, 'bandpass', freq, q);
  const ring = gain(ctx, 0);
  perc(ring.gain, t, 1, 0.0005, decay);
  chain(n, g, f, ring, out);
}

/** Low thud */
export function thud(ctx: Ctx, out: AudioNode, t: number, f0: number, f1: number, decay: number, level: number) {
  const o = osc(ctx, 'sine', f0, t, decay * 1.5);
  sweep(o.frequency, t, f0, f1, decay * 0.6);
  const g = gain(ctx, 0);
  perc(g.gain, t, level, 0.002, decay);
  chain(o, g, out);
}

/** Filtered noise burst */
export function burst(ctx: Ctx, out: AudioNode, t: number, type: BiquadFilterType, freq: number, q: number, dur: number, level: number, color: 'white' | 'pink' | 'brown' = 'white', attack = 0.001) {
  const n = noiseSrc(ctx, color, t, dur * 1.5);
  const f = filt(ctx, type, freq, q);
  const g = gain(ctx, 0);
  perc(g.gain, t, level, attack, dur);
  chain(n, f, g, out);
  return { f, g };
}
