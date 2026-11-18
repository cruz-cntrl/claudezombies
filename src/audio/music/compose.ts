import { burst, chain, filt, gain, noiseSrc, osc, perc, render, shaper, sweep, thud, type Ctx } from '../synth/dsp';
import { epiano, bell, vinyl } from '../synth/ui';

/**
 * Music building blocks: warm string pads, a lonely piano, low toms, gritty rock kit and
 * distorted bass/guitar. All rendered offline. Nothing raw — every oscillator is filtered.
 */
export const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);
export const RATE = 32000;

/** Detuned saw ensemble through a low-pass with slow movement + a delayed chorus copy. */
export function strings(ctx: Ctx, out: AudioNode, t: number, notes: number[], dur: number, level: number, cutoff = 900, attack = 1.2) {
  const bus = gain(ctx, 0);
  bus.gain.setValueAtTime(0.0001, t);
  bus.gain.linearRampToValueAtTime(level, t + attack);
  bus.gain.setValueAtTime(level, t + Math.max(attack, dur - 1.2));
  bus.gain.linearRampToValueAtTime(0.0001, t + dur + 0.6);
  const lp = filt(ctx, 'lowpass', cutoff, 0.8);
  const lfo = osc(ctx, 'sine', 0.13 + Math.random() * 0.05, t, dur + 1);
  const lg = gain(ctx, cutoff * 0.25);
  chain(lfo, lg); lg.connect(lp.frequency);
  const dl = ctx.createDelay(0.1); dl.delayTime.value = 0.021;
  const dg = gain(ctx, 0.6);
  chain(bus, lp, out);
  chain(lp, dl, dg, out);
  for (const n of notes) {
    for (const d of [-7, 0, 6]) {
      const o = osc(ctx, 'sawtooth', midi(n) * Math.pow(2, d / 1200), t, dur + 1);
      const g = gain(ctx, 0.12);
      chain(o, g, bus);
    }
  }
}

/** Soft "piano": additive partials with fast decay + felt thump. */
export function piano(ctx: Ctx, out: AudioNode, t: number, n: number, dur: number, level: number) {
  const f = midi(n);
  const g = gain(ctx, 0);
  perc(g.gain, t, level, 0.004, Math.min(4, dur + 1.5));
  chain(g, filt(ctx, 'lowpass', 2600, 0.6), out);
  [[1, 1], [2, 0.42], [3, 0.18], [4, 0.09], [5.02, 0.04]].forEach(([m, a]) => {
    const o = osc(ctx, 'sine', f * m, t, dur + 2);
    const og = gain(ctx, 0);
    perc(og.gain, t, a, 0.003, (dur + 1.5) / m);
    chain(o, og, g);
  });
  thud(ctx, out, t, f, f * 0.98, 0.04, level * 0.15);
}

export function tom(ctx: Ctx, out: AudioNode, t: number, f: number, level: number) {
  thud(ctx, out, t, f * 1.8, f, 0.45, level);
  burst(ctx, out, t, 'lowpass', 400, 0.7, 0.12, level * 0.35, 'brown');
}

export function kick(ctx: Ctx, out: AudioNode, t: number, level: number) {
  thud(ctx, out, t, 130, 42, 0.32, level);
  burst(ctx, out, t, 'bandpass', 1800, 1, 0.01, level * 0.15);
}

export function snare(ctx: Ctx, out: AudioNode, t: number, level: number) {
  burst(ctx, out, t, 'bandpass', 1600, 0.7, 0.16, level * 0.7, 'white', 0.001);
  burst(ctx, out, t, 'lowpass', 4000, 0.7, 0.1, level * 0.25);
  thud(ctx, out, t, 190, 150, 0.09, level * 0.6);
}

export function hat(ctx: Ctx, out: AudioNode, t: number, level: number, open = false) {
  burst(ctx, out, t, 'bandpass', 6500, 1.2, open ? 0.18 : 0.04, level);
}

/** Distorted bass note (saw + sub through drive + low-pass). */
export function dirtyBass(ctx: Ctx, out: AudioNode, t: number, n: number, dur: number, level: number) {
  const f = midi(n);
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 0.006);
  g.gain.setTargetAtTime(level * 0.6, t + 0.02, 0.1);
  g.gain.setValueAtTime(level * 0.6, t + dur * 0.9);
  g.gain.linearRampToValueAtTime(0.0001, t + dur);
  const lp = filt(ctx, 'lowpass', 1100, 1.2);
  sweep(lp.frequency, t, 1600, 500, dur);
  chain(g, shaper(ctx, 4), lp, out);
  for (const [type, mul, a] of [['sawtooth', 1, 0.5], ['sine', 0.5, 0.6]] as [OscillatorType, number, number][]) {
    const o = osc(ctx, type, f * mul, t, dur + 0.05);
    chain(o, gain(ctx, a), g);
  }
}

/** Overdriven power chord (root + fifth + octave), palm-muted when short. */
export function guitar(ctx: Ctx, out: AudioNode, t: number, root: number, dur: number, level: number, mute = false) {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 0.005);
  g.gain.setTargetAtTime(level * (mute ? 0.2 : 0.7), t + 0.01, mute ? 0.04 : 0.5);
  g.gain.setValueAtTime(level * (mute ? 0.05 : 0.6), t + dur * 0.95);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.05);
  const cab = filt(ctx, 'lowpass', mute ? 1300 : 2600, 0.9);
  const body = filt(ctx, 'peaking', 700, 1, 4);
  chain(g, shaper(ctx, 12), filt(ctx, 'highpass', 90), body, cab, out);
  for (const iv of [0, 7, 12]) for (const d of [-8, 8]) {
    const o = osc(ctx, 'sawtooth', midi(root + iv) * Math.pow(2, d / 1200), t, dur + 0.1);
    chain(o, gain(ctx, 0.12), g);
  }
}

/** Singing lead: filtered detuned saw + vibrato, through drive. */
export function lead(ctx: Ctx, out: AudioNode, t: number, n: number, dur: number, level: number) {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 0.03);
  g.gain.setValueAtTime(level * 0.85, t + dur * 0.8);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.1);
  chain(g, shaper(ctx, 6), filt(ctx, 'bandpass', 1100, 0.7), filt(ctx, 'lowpass', 2800), out);
  const vib = osc(ctx, 'sine', 5.5, t, dur + 0.2);
  const vg = gain(ctx, 0);
  vg.gain.setValueAtTime(0, t); vg.gain.linearRampToValueAtTime(midi(n) * 0.012, t + dur * 0.5);
  chain(vib, vg);
  for (const d of [-6, 6]) {
    const o = osc(ctx, 'sawtooth', midi(n) * Math.pow(2, d / 1200), t, dur + 0.2);
    vg.connect(o.frequency);
    chain(o, gain(ctx, 0.2), g);
  }
}

/** Radio-static burst used in stingers. */
export function staticBurst(ctx: Ctx, out: AudioNode, t: number, dur: number, level: number) {
  const n = noiseSrc(ctx, 'white', t, dur);
  const bp = filt(ctx, 'bandpass', 1700, 0.8);
  const g = gain(ctx, 0);
  perc(g.gain, t, level, 0.01, dur);
  const am = osc(ctx, 'square', 17, t, dur);
  const ag = gain(ctx, level * 0.5);
  chain(am, ag); ag.connect(g.gain);
  chain(n, bp, filt(ctx, 'lowpass', 3500), g, out);
}

export { render, bell, epiano, vinyl, gain, chain, filt, osc, sweep, noiseSrc, burst, thud };
