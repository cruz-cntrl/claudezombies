import { burst, chain, filt, gain, noiseSrc, osc, perc, ping, render, shaper, sweep, thud, type Ctx } from './dsp';

/**
 * Creature voices via formant synthesis: a filtered glottal source (sawtooth through a low-pass,
 * mixed with brown noise for breath) shaped by 3 parallel vowel formant band-passes, with slow
 * pitch wobble, tremolo and soft saturation. Kept low and throaty — never shrieky.
 */
const VOWELS: Record<string, [number, number, number]> = {
  u: [320, 800, 2300],
  o: [450, 850, 2500],
  a: [700, 1150, 2500],
  e: [500, 1600, 2400],
  er: [480, 1250, 2200],
};

export interface VoiceSpec {
  dur: number;
  f0: number;            // base pitch
  f0End?: number;
  vowels: string[];      // morph sequence
  breath: number;        // noise mix 0..1
  wobble: number;        // pitch wobble depth (Hz)
  trem: number;          // tremolo depth
  tremRate: number;
  attack: number;
  release: number;
  level: number;
  drive: number;
  formantShift?: number; // multiply formants (smaller creatures > 1)
}

export function voice(ctx: Ctx, out: AudioNode, t: number, s: VoiceSpec, seed: number) {
  const rnd = (k: number) => 0.5 + 0.5 * Math.sin(seed * 9.13 + k * 3.7);
  const src = gain(ctx, 1);
  const glottal = osc(ctx, 'sawtooth', s.f0, t, s.dur);
  if (s.f0End) sweep(glottal.frequency, t, s.f0, s.f0End, s.dur);
  const wob = osc(ctx, 'sine', 3 + rnd(1) * 4, t, s.dur);
  const wobG = gain(ctx, s.wobble);
  chain(wob, wobG); wobG.connect(glottal.frequency);
  const jitter = noiseSrc(ctx, 'brown', t, s.dur);
  const jg = gain(ctx, s.wobble * 2);
  chain(jitter, filt(ctx, 'lowpass', 30), jg); jg.connect(glottal.frequency);
  const glp = filt(ctx, 'lowpass', 1400, 0.7);
  const gG = gain(ctx, 1 - s.breath * 0.6);
  chain(glottal, glp, gG, src);
  const br = noiseSrc(ctx, 'pink', t, s.dur);
  const bG = gain(ctx, s.breath * 1.4);
  chain(br, filt(ctx, 'lowpass', 2500), bG, src);
  // formants
  const env = gain(ctx, 0);
  const sh = s.formantShift ?? 1;
  const fGains = [1, 0.55, 0.18];
  const seg = s.dur / Math.max(1, s.vowels.length - 1);
  for (let k = 0; k < 3; k++) {
    const f = filt(ctx, 'bandpass', VOWELS[s.vowels[0]][k] * sh, k === 0 ? 5 : 7);
    s.vowels.forEach((v, vi) => {
      const fr = VOWELS[v][k] * sh * (0.95 + rnd(vi + k) * 0.1);
      if (vi === 0) f.frequency.setValueAtTime(fr, t);
      else f.frequency.linearRampToValueAtTime(fr, t + vi * seg);
    });
    const g = gain(ctx, fGains[k] * 3);
    src.connect(f); chain(f, g, env);
  }
  // amplitude envelope + tremolo
  env.gain.setValueAtTime(0.0001, t);
  env.gain.linearRampToValueAtTime(s.level, t + s.attack);
  env.gain.setValueAtTime(s.level, t + Math.max(s.attack, s.dur - s.release));
  env.gain.linearRampToValueAtTime(0.0001, t + s.dur);
  const trem = osc(ctx, 'sine', s.tremRate, t, s.dur);
  const tg = gain(ctx, s.trem * s.level);
  chain(trem, tg); tg.connect(env.gain);
  chain(env, shaper(ctx, s.drive), filt(ctx, 'lowpass', 3200, 0.6), filt(ctx, 'highpass', 60), out);
}

export type CreatureSound =
  | 'moan' | 'groan' | 'chase' | 'attack' | 'death' | 'hurt' | 'gurgle'
  | 'houndSnarl' | 'houndBark' | 'houndDeath'
  | 'bruteRoar' | 'bruteSlam' | 'bruteDeath'
  | 'wardenRoar' | 'wardenScreech' | 'motherPulse' | 'motherHum'
  | 'chipBuzz' | 'boardTear' | 'boardPlace' | 'climb' | 'emerge';

export function renderCreature(kind: CreatureSound, v: number): Promise<AudioBuffer> {
  const r = (k: number) => 0.5 + 0.5 * Math.sin(v * 7.77 + k * 1.93);
  const specs: Partial<Record<CreatureSound, VoiceSpec>> = {
    moan:  { dur: 1.8 + r(1), f0: 78 + r(2) * 25, f0End: 62 + r(3) * 15, vowels: ['u', 'o', 'u'], breath: 0.45, wobble: 4, trem: 0.25, tremRate: 5 + r(4) * 3, attack: 0.25, release: 0.6, level: 0.8, drive: 2 },
    groan: { dur: 1.0 + r(5) * 0.6, f0: 68 + r(6) * 15, f0End: 55, vowels: ['er', 'o', 'u'], breath: 0.6, wobble: 6, trem: 0.4, tremRate: 9, attack: 0.1, release: 0.4, level: 0.8, drive: 3 },
    chase: { dur: 1.1 + r(7) * 0.5, f0: 120 + r(8) * 30, f0End: 85, vowels: ['a', 'a', 'o'], breath: 0.55, wobble: 9, trem: 0.3, tremRate: 11, attack: 0.05, release: 0.5, level: 1, drive: 4 },
    attack:{ dur: 0.55, f0: 110 + r(9) * 30, f0End: 80, vowels: ['a', 'er'], breath: 0.7, wobble: 10, trem: 0.4, tremRate: 14, attack: 0.02, release: 0.25, level: 1, drive: 5 },
    death: { dur: 1.3, f0: 95 + r(10) * 20, f0End: 45, vowels: ['a', 'o', 'u'], breath: 0.6, wobble: 12, trem: 0.5, tremRate: 7, attack: 0.03, release: 0.8, level: 0.9, drive: 3 },
    hurt:  { dur: 0.4, f0: 105 + r(11) * 25, f0End: 85, vowels: ['e', 'er'], breath: 0.6, wobble: 8, trem: 0.3, tremRate: 12, attack: 0.01, release: 0.2, level: 0.8, drive: 3 },
    gurgle:{ dur: 1.2, f0: 60, f0End: 50, vowels: ['u', 'er', 'u', 'o'], breath: 0.8, wobble: 14, trem: 0.7, tremRate: 16, attack: 0.1, release: 0.4, level: 0.7, drive: 4 },
    houndSnarl: { dur: 0.9, f0: 95 + r(12) * 20, vowels: ['er', 'a', 'er'], breath: 0.75, wobble: 15, trem: 0.6, tremRate: 22, attack: 0.04, release: 0.3, level: 0.8, drive: 5, formantShift: 1.15 },
    houndBark:  { dur: 0.35, f0: 160 + r(13) * 30, f0End: 110, vowels: ['a', 'o'], breath: 0.5, wobble: 10, trem: 0.2, tremRate: 10, attack: 0.01, release: 0.15, level: 1, drive: 5, formantShift: 1.2 },
    houndDeath: { dur: 0.8, f0: 170, f0End: 70, vowels: ['e', 'u'], breath: 0.6, wobble: 10, trem: 0.5, tremRate: 9, attack: 0.01, release: 0.5, level: 0.9, drive: 3, formantShift: 1.2 },
    bruteRoar:  { dur: 2.2, f0: 52 + r(14) * 8, f0End: 40, vowels: ['o', 'a', 'o', 'u'], breath: 0.55, wobble: 5, trem: 0.35, tremRate: 7, attack: 0.15, release: 0.8, level: 1, drive: 6, formantShift: 0.75 },
    bruteDeath: { dur: 2.0, f0: 60, f0End: 28, vowels: ['a', 'o', 'u'], breath: 0.6, wobble: 8, trem: 0.5, tremRate: 6, attack: 0.05, release: 1.2, level: 1, drive: 5, formantShift: 0.75 },
    wardenRoar: { dur: 2.6, f0: 48, f0End: 36, vowels: ['o', 'a', 'a', 'u'], breath: 0.5, wobble: 6, trem: 0.3, tremRate: 5, attack: 0.2, release: 1, level: 1, drive: 7, formantShift: 0.7 },
    wardenScreech: { dur: 2.0, f0: 140, f0End: 100, vowels: ['a', 'e', 'a'], breath: 0.7, wobble: 25, trem: 0.6, tremRate: 18, attack: 0.05, release: 0.8, level: 1, drive: 8, formantShift: 0.9 },
  };
  const durs: Partial<Record<CreatureSound, number>> = { chipBuzz: 2.0, bruteSlam: 1.6, motherPulse: 2.4, motherHum: 4.0, boardTear: 0.8, boardPlace: 0.5, climb: 0.9, emerge: 1.5 };
  const dur = specs[kind]?.dur ?? durs[kind] ?? 1;
  return render(dur + 0.1, (ctx, out) => {
    const t = 0.01;
    const s = specs[kind];
    if (s) {
      voice(ctx, out, t, s, v);
      if (kind === 'death' || kind === 'gurgle') {
        for (let i = 0; i < 6; i++) ping(ctx, out, t + 0.3 + i * 0.12 + r(i) * 0.05, 300 + r(i + 3) * 300, 5, 0.15, 0.05);
      }
      if (kind === 'wardenScreech') {
        // radio static jam layered under
        burst(ctx, out, t, 'bandpass', 1800, 1, s.dur, 0.25, 'white', 0.1);
      }
      return;
    }
    switch (kind) {
      case 'chipBuzz': {
        // faint electrical hum + random crackles — loopable
        const hum = osc(ctx, 'sawtooth', 60, 0, dur);
        const hg = gain(ctx, 0.08);
        chain(hum, filt(ctx, 'lowpass', 400), hg, out);
        for (let i = 0; i < 26; i++) {
          const tt = Math.random() * (dur - 0.05);
          burst(ctx, out, tt, 'bandpass', 1500 + Math.random() * 1500, 4, 0.01 + Math.random() * 0.02, 0.15 + Math.random() * 0.4);
        }
        break;
      }
      case 'bruteSlam': {
        const pre = gain(ctx, 1);
        chain(pre, shaper(ctx, 3), out);
        thud(ctx, pre, t, 90, 25, 0.7, 1);
        const b = burst(ctx, pre, t, 'lowpass', 900, 0.7, 1.0, 0.9, 'brown');
        sweep(b.f.frequency, t, 1200, 120, 1.0);
        for (let i = 0; i < 8; i++) burst(ctx, out, t + 0.15 + Math.random() * 0.8, 'bandpass', 800 + Math.random() * 1000, 3, 0.03, 0.1);
        break;
      }
      case 'motherPulse': {
        const o = osc(ctx, 'sine', 55, t, dur);
        sweep(o.frequency, t, 30, 90, 1.2);
        const g = gain(ctx, 0);
        perc(g.gain, t, 1, 0.8, 1.4);
        chain(o, g, out);
        const z = burst(ctx, out, t + 0.6, 'bandpass', 900, 3, 1.5, 0.5, 'white', 0.4);
        const lfo = osc(ctx, 'sawtooth', 23, t, dur);
        const lg = gain(ctx, 500);
        chain(lfo, lg); lg.connect(z.f.frequency);
        break;
      }
      case 'motherHum': {
        for (const f of [41, 55, 82.5, 110]) {
          const o = osc(ctx, 'sawtooth', f, 0, dur);
          const g = gain(ctx, 0.15);
          chain(o, filt(ctx, 'lowpass', 300 + f), g, out);
        }
        const n = noiseSrc(ctx, 'brown', 0, dur);
        chain(n, filt(ctx, 'lowpass', 200), gain(ctx, 0.5), out);
        break;
      }
      case 'boardTear':
        burst(ctx, out, t, 'bandpass', 600 + r(1) * 300, 2, 0.25, 0.7, 'pink', 0.05);
        for (let i = 0; i < 5; i++) ping(ctx, out, t + 0.05 + i * 0.03, 350 + r(i) * 300, 6, 0.3, 0.04);
        thud(ctx, out, t + 0.25, 160, 60, 0.12, 0.8);
        burst(ctx, out, t + 0.27, 'bandpass', 900, 1, 0.1, 0.5, 'pink');
        break;
      case 'boardPlace':
        thud(ctx, out, t, 180, 70, 0.08, 0.9);
        burst(ctx, out, t, 'bandpass', 700, 1.2, 0.06, 0.6, 'pink');
        thud(ctx, out, t + 0.18, 200, 80, 0.06, 0.7);
        ping(ctx, out, t + 0.18, 900, 6, 0.3, 0.05);
        break;
      case 'climb':
        burst(ctx, out, t, 'bandpass', 500, 1, 0.3, 0.6, 'pink', 0.05);
        thud(ctx, out, t + 0.5, 140, 50, 0.15, 0.9);
        burst(ctx, out, t + 0.5, 'lowpass', 500, 0.7, 0.2, 0.5, 'brown');
        break;
      case 'emerge': {
        const b = burst(ctx, out, t, 'lowpass', 400, 0.7, 1.2, 0.8, 'brown', 0.3);
        sweep(b.f.frequency, t, 200, 900, 1.0);
        for (let i = 0; i < 6; i++) burst(ctx, out, t + Math.random(), 'bandpass', 600 + Math.random() * 600, 3, 0.04, 0.2, 'pink');
        break;
      }
    }
  }, 1, 32000);
}
