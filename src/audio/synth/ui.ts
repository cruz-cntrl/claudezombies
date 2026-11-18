import { burst, chain, filt, gain, noiseSrc, osc, perc, ping, render, shaper, sweep, thud, type Ctx } from './dsp';
import { voice } from './zombies';

/** Warm FM electric-piano note (tine-ish), slightly detuned pair — the "old jukebox" voice. */
export function epiano(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, level: number, bright = 1) {
  for (const det of [-3, 3]) {
    const f = freq * Math.pow(2, det / 1200);
    const car = osc(ctx, 'sine', f, t, dur + 0.5);
    const mod = osc(ctx, 'sine', f, t, dur + 0.5);
    const mg = gain(ctx, 0);
    perc(mg.gain, t, f * 1.6 * bright, 0.002, dur * 0.7);
    chain(mod, mg); mg.connect(car.frequency);
    const tine = osc(ctx, 'sine', f * 4, t, 0.3);
    const tg = gain(ctx, 0);
    perc(tg.gain, t, 0.06 * bright, 0.001, 0.12);
    const g = gain(ctx, 0);
    perc(g.gain, t, level * 0.5, 0.004, dur);
    chain(car, g, out);
    chain(tine, tg, out);
  }
}

/** Organ-like additive pad note */
export function organ(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, level: number) {
  const g = gain(ctx, 0);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.linearRampToValueAtTime(level, t + 0.05);
  g.gain.setValueAtTime(level, t + dur);
  g.gain.linearRampToValueAtTime(0.0001, t + dur + 0.15);
  const lp = filt(ctx, 'lowpass', 1800, 0.5);
  chain(g, lp, out);
  [[1, 1], [2, 0.5], [3, 0.25], [4, 0.12], [0.5, 0.4]].forEach(([m, a]) => {
    const o = osc(ctx, 'sine', freq * m * (1 + (Math.random() - 0.5) * 0.002), t, dur + 0.2);
    const og = gain(ctx, a);
    chain(o, og, g);
  });
}

/** FM bell (music box / register ding) */
export function bell(ctx: Ctx, out: AudioNode, t: number, freq: number, dur: number, level: number, ratio = 3.5) {
  const car = osc(ctx, 'sine', freq, t, dur);
  const mod = osc(ctx, 'sine', freq * ratio, t, dur);
  const mg = gain(ctx, 0);
  perc(mg.gain, t, freq * 2, 0.001, dur * 0.4);
  chain(mod, mg); mg.connect(car.frequency);
  const g = gain(ctx, 0);
  perc(g.gain, t, level, 0.002, dur);
  chain(car, g, filt(ctx, 'lowpass', 3500), out);
}

export function vinyl(ctx: Ctx, out: AudioNode, dur: number, level: number) {
  const hiss = noiseSrc(ctx, 'pink', 0, dur);
  chain(hiss, filt(ctx, 'bandpass', 2500, 0.5), gain(ctx, level * 0.15), out);
  for (let i = 0; i < dur * 9; i++) {
    burst(ctx, out, Math.random() * dur, 'bandpass', 1500 + Math.random() * 2500, 2, 0.004, level * (0.3 + Math.random() * 0.7));
  }
}

const midi = (n: number) => 440 * Math.pow(2, (n - 69) / 12);

/** Perk jingles: short melodic motifs, each its own mood. Notes: [midi, beat, lengthBeats] */
const PERK_MOTIFS: Record<string, { bpm: number; notes: [number, number, number][]; bass: number[] }> = {
  ironhide:   { bpm: 92,  notes: [[57, 0, 1], [60, 1, 1], [64, 2, 1], [62, 3, 0.5], [60, 3.5, 0.5], [57, 4, 2]], bass: [45, 41] },
  quickhands: { bpm: 132, notes: [[64, 0, 0.5], [67, 0.5, 0.5], [69, 1, 0.5], [67, 1.5, 0.5], [64, 2, 0.5], [62, 2.5, 0.5], [64, 3, 1.5]], bass: [40, 43] },
  secondwind: { bpm: 84,  notes: [[60, 0, 1.5], [65, 1.5, 0.5], [67, 2, 1], [69, 3, 1], [72, 4, 2]], bass: [41, 48] },
  fleetfoot:  { bpm: 140, notes: [[67, 0, 0.5], [69, 0.5, 0.5], [71, 1, 0.5], [74, 1.5, 0.5], [71, 2, 0.5], [69, 2.5, 0.5], [67, 3, 1]], bass: [43, 38] },
  rapidfire:  { bpm: 120, notes: [[62, 0, 0.5], [62, 0.5, 0.5], [65, 1, 0.5], [69, 1.5, 1], [67, 2.5, 0.5], [65, 3, 1.5]], bass: [38, 45] },
  packmule:   { bpm: 100, notes: [[55, 0, 1], [59, 1, 0.5], [62, 1.5, 0.5], [60, 2, 1], [59, 3, 0.5], [55, 3.5, 1.5]], bass: [43, 38] },
};

export type UiSound =
  | 'click' | 'back' | 'purchase' | 'denied' | 'chalk' | 'powerOn' | 'gateOpen' | 'debris' | 'boxOpen' | 'boxJingle'
  | 'radioLaugh' | 'drink' | 'heartbeat' | 'hurt' | 'downed' | 'puSpawn' | 'puGrab' | 'puResupply' | 'puOverload'
  | 'puDouble' | 'puKill' | 'puFortify' | 'puEnd' | 'rewirer' | 'noteFound' | 'valve' | 'tune' | 'eeStep' | 'step'
  | 'grenadePin' | 'grenadeBounce' | 'perkJingle_ironhide' | 'perkJingle_quickhands' | 'perkJingle_secondwind'
  | 'perkJingle_fleetfoot' | 'perkJingle_rapidfire' | 'perkJingle_packmule' | 'musicBox' | 'tape' | 'keypad' | 'alarm';

export function renderUi(kind: UiSound, v: number): Promise<AudioBuffer> {
  if (kind.startsWith('perkJingle_')) return renderJingle(kind.slice(11));
  const durs: Partial<Record<UiSound, number>> = {
    powerOn: 3.5, gateOpen: 2.2, debris: 2.4, boxOpen: 1.6, boxJingle: 4.2, radioLaugh: 2.6, drink: 1.6, heartbeat: 0.9,
    downed: 2.0, puSpawn: 1.2, puGrab: 1.0, puResupply: 2.0, puOverload: 2.0, puDouble: 2.0, puKill: 2.6, puFortify: 2.0,
    puEnd: 1.2, rewirer: 4.5, noteFound: 1.2, valve: 0.8, tune: 0.4, eeStep: 2.5, musicBox: 3.0, tape: 1.2, alarm: 2.5, chalk: 0.5,
    purchase: 1.0, hurt: 0.5,
  };
  return render((durs[kind] ?? 0.4) + 0.05, (ctx, out) => {
    const t = 0.005;
    const r = (k: number) => 0.5 + 0.5 * Math.sin(v * 4.1 + k);
    switch (kind) {
      case 'click': thud(ctx, out, t, 300, 150, 0.03, 0.5); ping(ctx, out, t, 1400, 6, 0.25, 0.02); break;
      case 'back': thud(ctx, out, t, 220, 120, 0.04, 0.5); break;
      case 'purchase':
        thud(ctx, out, t, 160, 60, 0.1, 0.9);
        burst(ctx, out, t, 'bandpass', 600, 1, 0.12, 0.5, 'pink');
        bell(ctx, out, t + 0.06, 1318, 0.7, 0.35, 2.0);
        bell(ctx, out, t + 0.06, 1975, 0.5, 0.15, 2.0);
        break;
      case 'denied': {
        const o = osc(ctx, 'sawtooth', 98, t, 0.3);
        const g = gain(ctx, 0); perc(g.gain, t, 0.5, 0.01, 0.25);
        chain(o, filt(ctx, 'lowpass', 500, 2), g, out);
        break;
      }
      case 'chalk': {
        const n = noiseSrc(ctx, 'white', t, 0.4);
        const g = gain(ctx, 0); perc(g.gain, t, 0.5, 0.05, 0.35);
        const am = osc(ctx, 'sine', 38, t, 0.4); const ag = gain(ctx, 0.35); chain(am, ag); ag.connect(g.gain);
        chain(n, filt(ctx, 'bandpass', 2600, 2), filt(ctx, 'lowpass', 4500), g, out);
        break;
      }
      case 'powerOn': {
        thud(ctx, out, t, 120, 40, 0.4, 1.0);
        ping(ctx, out, t, 700, 5, 0.5, 0.2);
        for (const [f, a] of [[50, 0.4], [100, 0.25], [150, 0.12]]) {
          const o = osc(ctx, 'sawtooth', f * 0.6, t + 0.2, 3.2);
          sweep(o.frequency, t + 0.2, f * 0.6, f, 1.5);
          const g = gain(ctx, 0); g.gain.setValueAtTime(0.0001, t + 0.2); g.gain.linearRampToValueAtTime(a, t + 1.6); g.gain.linearRampToValueAtTime(0.0001, t + 3.4);
          chain(o, filt(ctx, 'lowpass', 500), g, out);
        }
        for (let i = 0; i < 12; i++) burst(ctx, out, t + 0.3 + Math.random() * 2, 'bandpass', 1500 + Math.random() * 1000, 4, 0.02, 0.2);
        break;
      }
      case 'gateOpen': {
        thud(ctx, out, t, 140, 60, 0.15, 0.9);
        ping(ctx, out, t, 900, 15, 0.4, 0.3);
        const s = burst(ctx, out, t + 0.1, 'bandpass', 500, 6, 1.6, 0.4, 'pink', 0.3);
        sweep(s.f.frequency, t + 0.1, 400, 900, 1.6);
        for (let i = 0; i < 14; i++) ping(ctx, out, t + 0.1 + i * 0.1 + Math.random() * 0.05, 1100 + Math.random() * 700, 15, 0.12, 0.05);
        thud(ctx, out, t + 1.9, 180, 70, 0.15, 0.7);
        break;
      }
      case 'debris': {
        const b = burst(ctx, out, t, 'lowpass', 800, 0.7, 1.8, 0.9, 'brown', 0.05);
        sweep(b.f.frequency, t, 900, 200, 2);
        for (let i = 0; i < 20; i++) burst(ctx, out, t + Math.random() * 1.6, 'bandpass', 500 + Math.random() * 1200, 3, 0.03, 0.3 * Math.random());
        thud(ctx, out, t, 90, 35, 0.6, 0.8);
        break;
      }
      case 'boxOpen': {
        const s = burst(ctx, out, t, 'bandpass', 300, 8, 0.6, 0.5, 'pink', 0.1);
        sweep(s.f.frequency, t, 250, 500, 0.6);
        thud(ctx, out, t + 0.55, 150, 60, 0.1, 0.6);
        bell(ctx, out, t + 0.6, 784, 1.0, 0.2, 2);
        bell(ctx, out, t + 0.6, 1175, 0.9, 0.12, 2);
        break;
      }
      case 'boxJingle': {
        const seq = [72, 76, 79, 76, 74, 71, 72, 67, 69, 72, 76, 74, 72];
        seq.forEach((n, i) => bell(ctx, out, t + i * 0.3, midi(n), 0.8, 0.3, 3.5));
        seq.forEach((n, i) => { if (i % 2 === 0) epiano(ctx, out, t + i * 0.3, midi(n - 24), 0.5, 0.25, 0.5); });
        break;
      }
      case 'musicBox': {
        const seq = [69, 72, 76, 74, 72, 71, 72, 69];
        seq.forEach((n, i) => bell(ctx, out, t + i * 0.35, midi(n), 0.9, 0.3, 3.5));
        break;
      }
      case 'radioLaugh': {
        const radio = gain(ctx, 1);
        chain(radio, filt(ctx, 'highpass', 350), filt(ctx, 'lowpass', 2400), out);
        burst(ctx, radio, t, 'bandpass', 1800, 0.7, 2.4, 0.35, 'white', 0.05);
        voice(ctx, radio, t + 0.3, { dur: 1.8, f0: 150, f0End: 105, vowels: ['a', 'a', 'a', 'o'], breath: 0.4, wobble: 4, trem: 1, tremRate: 6.5, attack: 0.03, release: 0.5, level: 1, drive: 4 }, v);
        break;
      }
      case 'drink': {
        for (let i = 0; i < 4; i++) {
          const tt = t + 0.2 + i * 0.28;
          const o = osc(ctx, 'sine', 180, tt, 0.15);
          sweep(o.frequency, tt, 220, 120, 0.12);
          const g = gain(ctx, 0); perc(g.gain, tt, 0.6, 0.01, 0.12);
          chain(o, g, out);
          burst(ctx, out, tt, 'bandpass', 500, 3, 0.1, 0.3, 'pink');
        }
        ping(ctx, out, t, 1200, 12, 0.3, 0.2);
        thud(ctx, out, t + 1.4, 300, 140, 0.05, 0.4);
        break;
      }
      case 'heartbeat': {
        // harmonics make the beat audible on phone speakers
        const hb = gain(ctx, 1);
        chain(hb, gain(ctx, 0.6), out);
        chain(hb, shaper(ctx, 8), filt(ctx, 'bandpass', 260, 0.7), gain(ctx, 0.7), out);
        thud(ctx, hb, t, 70, 40, 0.12, 1);
        thud(ctx, hb, t + 0.22, 62, 38, 0.15, 0.8);
        break;
      }
        break;
      case 'hurt':
        voice(ctx, out, t, { dur: 0.35, f0: 115 + r(1) * 20, f0End: 95, vowels: ['e', 'er'], breath: 0.6, wobble: 6, trem: 0.2, tremRate: 10, attack: 0.01, release: 0.2, level: 0.9, drive: 3 }, v);
        thud(ctx, out, t, 110, 50, 0.12, 0.6);
        break;
      case 'downed':
        thud(ctx, out, t, 90, 30, 0.6, 1);
        voice(ctx, out, t + 0.05, { dur: 0.9, f0: 110, f0End: 70, vowels: ['a', 'u'], breath: 0.7, wobble: 6, trem: 0.3, tremRate: 7, attack: 0.02, release: 0.5, level: 0.8, drive: 3 }, v);
        break;
      case 'puSpawn': {
        for (let i = 0; i < 3; i++) bell(ctx, out, t + i * 0.12, midi(60 + i * 7), 0.9, 0.18, 1.5);
        const s = burst(ctx, out, t, 'bandpass', 800, 4, 1.0, 0.2, 'pink', 0.3);
        sweep(s.f.frequency, t, 400, 1600, 1.0);
        break;
      }
      case 'puGrab':
        bell(ctx, out, t, midi(67), 0.8, 0.3, 2);
        bell(ctx, out, t + 0.08, midi(74), 0.8, 0.25, 2);
        thud(ctx, out, t, 140, 60, 0.15, 0.6);
        break;
      case 'puResupply': case 'puOverload': case 'puDouble': case 'puKill': case 'puFortify': {
        // radio-broadcast style announcement chord (stands in for an announcer voice)
        const roots: Record<string, number[]> = { puResupply: [48, 55, 60, 64], puOverload: [45, 52, 57, 61], puDouble: [50, 57, 62, 66], puKill: [41, 48, 53, 56], puFortify: [43, 50, 55, 59] };
        const radio = gain(ctx, 1);
        chain(radio, filt(ctx, 'lowpass', 2500), out);
        roots[kind].forEach((n, i) => organ(ctx, radio, t + i * 0.06, midi(n), 1.2, 0.18));
        burst(ctx, radio, t, 'bandpass', 1500, 0.8, 0.4, 0.2);
        thud(ctx, out, t, 90, 35, 0.4, 0.8);
        if (kind === 'puKill') { burst(ctx, out, t + 0.3, 'bandpass', 1600, 2, 1.5, 0.35, 'white', 0.2); }
        break;
      }
      case 'puEnd':
        organ(ctx, out, t, midi(52), 0.6, 0.2);
        organ(ctx, out, t + 0.3, midi(47), 0.7, 0.2);
        break;
      case 'rewirer': {
        for (let i = 0; i < 16; i++) {
          const tt = t + Math.random() * 3.8;
          const n = noiseSrc(ctx, 'white', tt, 0.25);
          const bp = filt(ctx, 'bandpass', 1200 + Math.random() * 1200, 5);
          const g = gain(ctx, 0); perc(g.gain, tt, 0.4, 0.002, 0.15 + Math.random() * 0.2);
          chain(n, bp, g, out);
        }
        const hum = osc(ctx, 'sawtooth', 55, t, 4.2);
        sweep(hum.frequency, t, 40, 110, 3.8);
        const hg = gain(ctx, 0); hg.gain.setValueAtTime(0.0001, t); hg.gain.linearRampToValueAtTime(0.4, t + 3.6); hg.gain.linearRampToValueAtTime(0.0001, t + 4.3);
        chain(hum, filt(ctx, 'lowpass', 600, 3), hg, out);
        thud(ctx, out, t + 3.9, 100, 30, 0.4, 1);
        bell(ctx, out, t + 3.95, midi(64), 0.6, 0.2, 2);
        break;
      }
      case 'noteFound':
        burst(ctx, out, t, 'bandpass', 1200, 1, 0.3, 0.4, 'pink', 0.1);
        epiano(ctx, out, t + 0.1, midi(62), 1.0, 0.4);
        epiano(ctx, out, t + 0.25, midi(69), 0.9, 0.3);
        break;
      case 'valve':
        ping(ctx, out, t, 1300, 30, 0.4, 0.3);
        thud(ctx, out, t, 300, 150, 0.05, 0.4);
        burst(ctx, out, t + 0.05, 'bandpass', 2000, 4, 0.4, 0.15, 'white', 0.1);
        break;
      case 'tune':
        burst(ctx, out, t, 'bandpass', 1400 + r(2) * 800, 3, 0.3, 0.3, 'white', 0.05);
        break;
      case 'eeStep': {
        const radio = gain(ctx, 1);
        chain(radio, filt(ctx, 'highpass', 300), filt(ctx, 'lowpass', 2500), out);
        [57, 60, 64, 69].forEach((n, i) => epiano(ctx, radio, t + i * 0.2, midi(n), 1.5, 0.3, 0.6));
        burst(ctx, radio, t, 'bandpass', 1600, 0.7, 2.2, 0.2, 'white', 0.3);
        break;
      }
      case 'tape': {
        const s = burst(ctx, out, t, 'bandpass', 600, 3, 0.8, 0.4, 'pink', 0.2);
        sweep(s.f.frequency, t, 300, 1200, 0.8);
        thud(ctx, out, t, 250, 100, 0.05, 0.5);
        ping(ctx, out, t + 0.02, 1100, 8, 0.3, 0.05);
        break;
      }
      case 'keypad':
        ping(ctx, out, t, 900 + r(3) * 200, 6, 0.4, 0.06);
        thud(ctx, out, t, 300, 160, 0.03, 0.3);
        break;
      case 'alarm': {
        for (let i = 0; i < 4; i++) {
          const o = osc(ctx, 'triangle', 330, t + i * 0.6, 0.45);
          sweep(o.frequency, t + i * 0.6, 300, 520, 0.4);
          const g = gain(ctx, 0); perc(g.gain, t + i * 0.6, 0.35, 0.05, 0.45);
          chain(o, filt(ctx, 'lowpass', 1200), g, out);
        }
        break;
      }
      case 'grenadePin':
        ping(ctx, out, t, 2000, 14, 0.4, 0.06);
        ping(ctx, out, t + 0.08, 1600, 10, 0.3, 0.05);
        break;
      case 'grenadeBounce':
        thud(ctx, out, t, 240, 100, 0.04, 0.6);
        ping(ctx, out, t, 1200 + r(4) * 400, 8, 0.3, 0.05);
        break;
      case 'step': {
        thud(ctx, out, t, 90 + r(5) * 30, 50, 0.05, 0.3);
        burst(ctx, out, t, 'bandpass', 500 + r(6) * 400, 1, 0.06, 0.45, 'pink');
        burst(ctx, out, t + 0.01, 'bandpass', 1400 + r(7) * 500, 1.5, 0.035, 0.22, 'pink');
        break;
      }
    }
  });
}

async function renderJingle(perk: string): Promise<AudioBuffer> {
  const m = PERK_MOTIFS[perk] ?? PERK_MOTIFS.ironhide;
  const beat = 60 / m.bpm;
  const len = (Math.max(...m.notes.map(([, b, l]) => b + l)) + 1) * beat + 1;
  return render(len, (ctx, out) => {
    const bus = gain(ctx, 1);
    chain(bus, filt(ctx, 'lowpass', 3000, 0.5), out);
    for (const [n, b, l] of m.notes) epiano(ctx, bus, 0.05 + b * beat, midi(n), l * beat + 0.3, 0.45);
    m.bass.forEach((n, i) => {
      const tt = 0.05 + i * 2 * beat;
      const o = osc(ctx, 'triangle', midi(n), tt, 2 * beat);
      const g = gain(ctx, 0); perc(g.gain, tt, 0.35, 0.01, 2 * beat);
      chain(o, filt(ctx, 'lowpass', 400), g, bus);
    });
    // soft brushed snare pulse
    for (let b = 0; b < 4; b++) burst(ctx, bus, 0.05 + (b * 2 + 1) * beat, 'bandpass', 1800, 0.8, 0.1, 0.12, 'pink');
    vinyl(ctx, out, len, 0.25);
  }, 1, 32000);
}
