import { burst, chain, filt, gain, noiseSrc, osc, perc, ping, render, sweep, thud } from './dsp';

/** Seamless loop: renders dur + xf seconds and folds the overhang into the head with an equal-power crossfade. */
export function makeLoop(buf: AudioBuffer, xf: number): AudioBuffer {
  const rate = buf.sampleRate;
  const x = Math.floor(xf * rate);
  const len = buf.length - x;
  const out = new AudioBuffer({ length: len, sampleRate: rate, numberOfChannels: buf.numberOfChannels });
  for (let c = 0; c < buf.numberOfChannels; c++) {
    const src = buf.getChannelData(c), dst = out.getChannelData(c);
    for (let i = 0; i < len; i++) dst[i] = src[i];
    for (let i = 0; i < x; i++) {
      const k = i / x;
      dst[i] = src[i] * Math.sin(k * Math.PI / 2) + src[len + i] * Math.cos(k * Math.PI / 2);
    }
  }
  return out;
}

export type AmbSound = 'roomStone' | 'roomMetal' | 'basement' | 'wind' | 'rain' | 'machine' | 'thunder' | 'drip' | 'buzz' | 'steam' | 'distant';

export async function renderAmbience(kind: AmbSound, v: number): Promise<AudioBuffer> {
  const loopDur = 8;
  const oneShot: Partial<Record<AmbSound, number>> = { thunder: 6, drip: 0.6, steam: 2.5, distant: 4 };
  const isLoop = !(kind in oneShot);
  const dur = isLoop ? loopDur + 1 : oneShot[kind]!;
  const buf = await render(dur, (ctx, out) => {
    switch (kind) {
      case 'roomStone': {
        chain(noiseSrc(ctx, 'brown', 0, dur), filt(ctx, 'lowpass', 220), gain(ctx, 0.6), out);
        for (const [f, a] of [[50, 0.05], [100, 0.025]]) chain(osc(ctx, 'sine', f, 0, dur), gain(ctx, a), out);
        break;
      }
      case 'roomMetal': {
        chain(noiseSrc(ctx, 'brown', 0, dur), filt(ctx, 'lowpass', 300), gain(ctx, 0.5), out);
        for (const [f, a] of [[60, 0.06], [120, 0.04], [180, 0.015]]) chain(osc(ctx, 'sine', f, 0, dur), gain(ctx, a), out);
        const n = noiseSrc(ctx, 'pink', 0, dur);
        chain(n, filt(ctx, 'bandpass', 900, 8), gain(ctx, 0.04), out);
        break;
      }
      case 'basement': {
        chain(noiseSrc(ctx, 'brown', 0, dur), filt(ctx, 'lowpass', 160), gain(ctx, 0.7), out);
        for (let i = 0; i < 9; i++) {
          const tt = Math.random() * loopDur;
          ping(ctx, out, tt, 700 + Math.random() * 600, 25, 0.12, 0.12);
        }
        chain(osc(ctx, 'sine', 42, 0, dur), gain(ctx, 0.05), out);
        break;
      }
      case 'wind': {
        const n = noiseSrc(ctx, 'pink', 0, dur);
        const bp = filt(ctx, 'bandpass', 450, 1.2);
        const lfo = osc(ctx, 'sine', 0.13, 0, dur);
        const lg = gain(ctx, 250);
        chain(lfo, lg); lg.connect(bp.frequency);
        const g = gain(ctx, 0.6);
        const lfo2 = osc(ctx, 'sine', 0.21, 0, dur);
        const lg2 = gain(ctx, 0.25);
        chain(lfo2, lg2); lg2.connect(g.gain);
        chain(n, bp, filt(ctx, 'lowpass', 1500), g, out);
        break;
      }
      case 'rain': {
        chain(noiseSrc(ctx, 'pink', 0, dur), filt(ctx, 'highpass', 600), filt(ctx, 'lowpass', 5000), gain(ctx, 0.35), out);
        chain(noiseSrc(ctx, 'brown', 0, dur), filt(ctx, 'lowpass', 400), gain(ctx, 0.3), out);
        for (let i = 0; i < 70; i++) burst(ctx, out, Math.random() * loopDur, 'bandpass', 1500 + Math.random() * 2500, 3, 0.01, 0.05 + Math.random() * 0.08);
        break;
      }
      case 'machine': {
        for (const [f, a] of [[55, 0.12], [110, 0.07], [165, 0.035], [220, 0.02]]) {
          const o = osc(ctx, 'sawtooth', f, 0, dur);
          chain(o, filt(ctx, 'lowpass', 350), gain(ctx, a), out);
        }
        const n = noiseSrc(ctx, 'brown', 0, dur);
        const g = gain(ctx, 0.35);
        const lfo = osc(ctx, 'sine', 2, 0, dur); const lg = gain(ctx, 0.12); chain(lfo, lg); lg.connect(g.gain);
        chain(n, filt(ctx, 'lowpass', 500), g, out);
        for (let i = 0; i < 16; i++) thud(ctx, out, i * 0.5, 120, 60, 0.05, 0.08);
        break;
      }
      case 'buzz': {
        const o = osc(ctx, 'sawtooth', 100, 0, dur);
        chain(o, filt(ctx, 'lowpass', 900, 1), gain(ctx, 0.08), out);
        for (let i = 0; i < 20; i++) burst(ctx, out, Math.random() * loopDur, 'bandpass', 1800, 3, 0.02, 0.15);
        break;
      }
      case 'thunder': {
        const b = burst(ctx, out, 0.05, 'lowpass', 900, 0.7, 4.5, 1.0, 'brown', 0.05);
        sweep(b.f.frequency, 0.05, 1500, 90, 4.5);
        thud(ctx, out, 0.05, 70, 25, 1.5, 0.8);
        for (let i = 0; i < 6; i++) {
          const tt = 0.2 + Math.random() * 3;
          const g = gain(ctx, 0); perc(g.gain, tt, 0.5 * Math.random(), 0.05, 1.0);
          chain(noiseSrc(ctx, 'brown', tt, 1.2), filt(ctx, 'lowpass', 300), g, out);
        }
        break;
      }
      case 'drip':
        ping(ctx, out, 0.01, 900 + v * 120, 30, 0.6, 0.15);
        ping(ctx, out, 0.03, 1400 + v * 90, 25, 0.25, 0.1);
        break;
      case 'steam': {
        const g = gain(ctx, 0); perc(g.gain, 0.01, 0.6, 0.3, 2.0);
        chain(noiseSrc(ctx, 'white', 0, dur), filt(ctx, 'bandpass', 3000, 0.7), filt(ctx, 'lowpass', 6000), g, out);
        break;
      }
      case 'distant': {
        // distant groan / metal creak through a long low-pass
        const s = burst(ctx, out, 0.1, 'bandpass', 220, 9, 2.5, 0.6, 'pink', 0.6);
        sweep(s.f.frequency, 0.1, 180, 320, 2.5);
        thud(ctx, out, 2.4, 90, 40, 0.8, 0.3);
        break;
      }
    }
  }, isLoop ? 2 : 1, 32000);
  return isLoop ? makeLoop(buf, 1) : buf;
}
