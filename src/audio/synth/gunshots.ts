import { burst, chain, filt, gain, noiseSrc, osc, perc, ping, render, shaper, sweep, thud, type Ctx } from './dsp';

/**
 * Layered gunshot design: transient crack + pitched body thump + bandpassed bark + low boom +
 * mechanical action + distant low-passed tail. Each weapon gets a distinct profile.
 */
export interface GunProfile {
  crack: number;       // crack centre freq (bandpass)
  crackLvl: number;
  thump: [number, number, number]; // f0, f1, decay
  thumpLvl: number;
  bark: number;        // bark centre
  barkQ: number;
  barkDecay: number;
  barkLvl: number;
  boom: number;        // lowpass cutoff of noise body
  boomDecay: number;
  boomLvl: number;
  tail: number;        // seconds
  tailLvl: number;
  tailLp: number;
  drive: number;
  mech?: 'slide' | 'bolt' | 'pump' | 'none' | 'ping' | 'arc' | 'thunk';
  mechDelay?: number;
  dur: number;
}

export const GUN_PROFILES: Record<string, GunProfile> = {
  warden:      { crack: 3200, crackLvl: 0.7, thump: [170, 55, 0.09], thumpLvl: 0.9, bark: 1400, barkQ: 1.1, barkDecay: 0.07, barkLvl: 0.7, boom: 900, boomDecay: 0.12, boomLvl: 0.5, tail: 0.5, tailLvl: 0.25, tailLp: 900, drive: 2.2, mech: 'slide', mechDelay: 0.06, dur: 0.75 },
  hollowpoint: { crack: 2600, crackLvl: 0.8, thump: [140, 40, 0.22], thumpLvl: 1.0, bark: 900, barkQ: 0.9, barkDecay: 0.14, barkLvl: 0.85, boom: 700, boomDecay: 0.3, boomLvl: 0.8, tail: 1.1, tailLvl: 0.4, tailLp: 700, drive: 3.2, mech: 'none', dur: 1.3 },
  chatterbox:  { crack: 3600, crackLvl: 0.6, thump: [180, 70, 0.06], thumpLvl: 0.7, bark: 1600, barkQ: 1.3, barkDecay: 0.05, barkLvl: 0.6, boom: 1100, boomDecay: 0.08, boomLvl: 0.4, tail: 0.35, tailLvl: 0.2, tailLp: 1100, drive: 2, mech: 'none', dur: 0.5 },
  typewriter:  { crack: 3000, crackLvl: 0.65, thump: [160, 55, 0.08], thumpLvl: 0.85, bark: 1150, barkQ: 1.0, barkDecay: 0.07, barkLvl: 0.7, boom: 850, boomDecay: 0.12, boomLvl: 0.55, tail: 0.45, tailLvl: 0.25, tailLp: 850, drive: 2.6, mech: 'none', dur: 0.6 },
  fieldmarshal:{ crack: 2900, crackLvl: 0.85, thump: [150, 45, 0.16], thumpLvl: 1.0, bark: 1050, barkQ: 0.9, barkDecay: 0.1, barkLvl: 0.8, boom: 800, boomDecay: 0.22, boomLvl: 0.7, tail: 1.0, tailLvl: 0.4, tailLp: 800, drive: 2.8, mech: 'none', dur: 1.2 },
  ironside:    { crack: 2700, crackLvl: 0.8, thump: [140, 42, 0.15], thumpLvl: 1.0, bark: 950, barkQ: 0.9, barkDecay: 0.1, barkLvl: 0.85, boom: 750, boomDecay: 0.2, boomLvl: 0.75, tail: 0.8, tailLvl: 0.35, tailLp: 750, drive: 3, mech: 'none', dur: 0.95 },
  vanguard:    { crack: 3100, crackLvl: 0.75, thump: [155, 50, 0.11], thumpLvl: 0.9, bark: 1250, barkQ: 1.0, barkDecay: 0.08, barkLvl: 0.75, boom: 900, boomDecay: 0.15, boomLvl: 0.6, tail: 0.6, tailLvl: 0.3, tailLp: 900, drive: 2.6, mech: 'none', dur: 0.75 },
  trench:      { crack: 2200, crackLvl: 0.7, thump: [120, 38, 0.25], thumpLvl: 1.0, bark: 700, barkQ: 0.7, barkDecay: 0.18, barkLvl: 0.95, boom: 600, boomDecay: 0.35, boomLvl: 1.0, tail: 1.2, tailLvl: 0.45, tailLp: 650, drive: 3.5, mech: 'pump', mechDelay: 0.32, dur: 1.4 },
  coachgun:    { crack: 2100, crackLvl: 0.75, thump: [115, 35, 0.28], thumpLvl: 1.0, bark: 650, barkQ: 0.7, barkDecay: 0.2, barkLvl: 1.0, boom: 550, boomDecay: 0.4, boomLvl: 1.0, tail: 1.3, tailLvl: 0.5, tailLp: 600, drive: 3.8, mech: 'none', dur: 1.5 },
  gravedigger: { crack: 2800, crackLvl: 0.75, thump: [130, 40, 0.14], thumpLvl: 1.0, bark: 900, barkQ: 0.9, barkDecay: 0.1, barkLvl: 0.85, boom: 700, boomDecay: 0.2, boomLvl: 0.8, tail: 0.7, tailLvl: 0.35, tailLp: 700, drive: 3.2, mech: 'none', dur: 0.85 },
  longshot:    { crack: 3400, crackLvl: 1.0, thump: [130, 34, 0.3], thumpLvl: 1.0, bark: 1000, barkQ: 0.8, barkDecay: 0.15, barkLvl: 0.9, boom: 650, boomDecay: 0.45, boomLvl: 0.9, tail: 2.0, tailLvl: 0.55, tailLp: 650, drive: 3.4, mech: 'bolt', mechDelay: 0.45, dur: 2.2 },
  marksman:    { crack: 3000, crackLvl: 0.8, thump: [150, 46, 0.13], thumpLvl: 0.95, bark: 1150, barkQ: 1.0, barkDecay: 0.09, barkLvl: 0.75, boom: 850, boomDecay: 0.18, boomLvl: 0.65, tail: 0.8, tailLvl: 0.35, tailLp: 850, drive: 2.6, mech: 'none', dur: 0.95 },
  thumper:     { crack: 900, crackLvl: 0.5, thump: [95, 40, 0.18], thumpLvl: 1.0, bark: 520, barkQ: 0.8, barkDecay: 0.14, barkLvl: 0.9, boom: 400, boomDecay: 0.15, boomLvl: 0.7, tail: 0.4, tailLvl: 0.2, tailLp: 500, drive: 2, mech: 'thunk', dur: 0.6 },
  disruptor:   { crack: 1800, crackLvl: 0.6, thump: [90, 28, 0.35], thumpLvl: 0.8, bark: 760, barkQ: 1.4, barkDecay: 0.25, barkLvl: 0.8, boom: 500, boomDecay: 0.3, boomLvl: 0.6, tail: 1.0, tailLvl: 0.35, tailLp: 1200, drive: 2.5, mech: 'arc', dur: 1.3 },
};

/** Render one gunshot variation. */
export function renderGunshot(id: string, upgraded: boolean, variation: number): Promise<AudioBuffer> {
  const p = GUN_PROFILES[id] ?? GUN_PROFILES.warden;
  const v = (k: number) => 1 + (Math.sin(variation * 12.9898 + k * 78.233) * 0.5) * 0.12;
  return render(p.dur + (upgraded ? 0.2 : 0), (ctx, out) => {
    const t = 0.002;
    const pre = gain(ctx, 1);
    const drive = shaper(ctx, p.drive * (upgraded ? 1.6 : 1));
    const post = filt(ctx, 'lowpass', 7500, 0.5);
    const hp = filt(ctx, 'highpass', 30, 0.7);
    chain(pre, drive, post, hp, out);

    // 1. transient crack — very short, band-limited
    burst(ctx, pre, t, 'bandpass', p.crack * v(1), 0.8, 0.012, p.crackLvl * 1.1);
    burst(ctx, pre, t, 'highpass', 1800, 0.7, 0.006, p.crackLvl * 0.4);
    // 2. body thump — sine with fast pitch drop
    // the sub thump is kept for headphones, but its harmonics (300–900 Hz) carry the weight on phone speakers
    const low = gain(ctx, 1);
    chain(low, gain(ctx, 0.22), pre);
    chain(low, shaper(ctx, 7), filt(ctx, 'highpass', 220, 0.7), filt(ctx, 'lowpass', 1300, 0.7), gain(ctx, 1.3), pre);
    thud(ctx, low, t, p.thump[0] * v(2), p.thump[1], p.thump[2], p.thumpLvl);
    // 3. mid bark
    const bark = burst(ctx, pre, t, 'bandpass', p.bark * v(3), p.barkQ, p.barkDecay * 1.8, p.barkLvl * 2.8, 'pink');
    burst(ctx, pre, t, 'bandpass', Math.min(2600, p.crack * 0.75), 1.2, 0.035, p.crackLvl * 0.9, 'pink');
    // chesty mid body that small speakers reproduce well
    burst(ctx, pre, t, 'bandpass', 520 * v(4), 0.8, p.barkDecay * 2.6, p.barkLvl * 1.8, 'pink');
    sweep(bark.f.frequency, t, p.bark * v(3) * 1.3, p.bark * 0.6, p.barkDecay);
    // low boom body (noise lowpassed)
    const boom = burst(ctx, low, t, 'lowpass', p.boom, 0.9, p.boomDecay, p.boomLvl * 0.6, 'brown');
    sweep(boom.f.frequency, t, p.boom * 1.5, p.boom * 0.4, p.boomDecay);
    if (upgraded) {
      // added sub weight + a short electric sizzle tied to the overcharge
      thud(ctx, low, t, 70, 28, p.thump[2] * 1.6, 0.8);
      const z = burst(ctx, pre, t + 0.01, 'bandpass', 1300, 3, 0.15, 0.18, 'white');
      const lfo = osc(ctx, 'sine', 70, t, 0.2);
      const lg = gain(ctx, 600);
      chain(lfo, lg);
      lg.connect(z.f.frequency);
    }
    // 5. tail — distant low-passed echo with slow decay
    const tailF = filt(ctx, 'lowpass', p.tailLp * 1.7, 0.6);
    const tailG = gain(ctx, 0);
    perc(tailG.gain, t + 0.02, p.tailLvl, 0.03, p.tail);
    chain(noiseSrc(ctx, 'pink', t, p.tail + 0.2), tailF, tailG, out);
    const echo = ctx.createDelay(1);
    echo.delayTime.value = 0.11 + (variation % 3) * 0.02;
    const echoG = gain(ctx, 0.22);
    const echoF = filt(ctx, 'lowpass', 900, 0.5);
    pre.connect(echo); chain(echo, echoF, echoG, out);

    // 4. mechanical action
    const md = p.mechDelay ?? 0.05;
    switch (p.mech) {
      case 'slide':
        ping(ctx, out, t + md, 2400, 12, 0.18, 0.05);
        ping(ctx, out, t + md + 0.025, 1800, 10, 0.14, 0.04);
        break;
      case 'pump':
        burst(ctx, out, t + md, 'bandpass', 900, 2, 0.08, 0.35, 'pink');
        ping(ctx, out, t + md + 0.07, 1500, 10, 0.3, 0.06);
        burst(ctx, out, t + md + 0.16, 'bandpass', 1100, 2, 0.07, 0.35, 'pink');
        ping(ctx, out, t + md + 0.22, 1900, 12, 0.35, 0.07);
        break;
      case 'bolt':
        ping(ctx, out, t + md, 1700, 9, 0.3, 0.06);
        burst(ctx, out, t + md + 0.05, 'bandpass', 1300, 3, 0.12, 0.22, 'pink');
        ping(ctx, out, t + md + 0.24, 2100, 12, 0.32, 0.07);
        burst(ctx, out, t + md + 0.28, 'bandpass', 1000, 3, 0.1, 0.22, 'pink');
        ping(ctx, out, t + md + 0.4, 1500, 10, 0.35, 0.08);
        break;
      case 'thunk':
        thud(ctx, out, t, 220, 80, 0.08, 0.6);
        burst(ctx, out, t, 'bandpass', 600, 1.5, 0.12, 0.5, 'pink');
        break;
      case 'arc': {
        // electrical arc: noise through a rapidly wobbling bandpass + filtered buzz + sub whoomp
        const n = noiseSrc(ctx, 'white', t, 0.9);
        const bp = filt(ctx, 'bandpass', 1400, 4);
        const ag = gain(ctx, 0);
        perc(ag.gain, t, 0.55, 0.004, 0.7);
        const lfo = osc(ctx, 'sawtooth', 37, t, 0.9);
        const lfoG = gain(ctx, 900);
        chain(lfo, lfoG); lfoG.connect(bp.frequency);
        chain(n, bp, ag, out);
        const buzz = osc(ctx, 'sawtooth', upgraded ? 58 : 75, t, 0.8);
        const bf = filt(ctx, 'lowpass', 700, 2);
        const bg = gain(ctx, 0);
        perc(bg.gain, t, 0.35, 0.01, 0.6);
        chain(buzz, bf, bg, out);
        const sub = osc(ctx, 'sine', 90, t, 0.6);
        sweep(sub.frequency, t, 95, 26, 0.45);
        const sg = gain(ctx, 0);
        perc(sg.gain, t, 1.0, 0.01, 0.5);
        chain(sub, sg, out);
        break;
      }
    }
  });
}

// ---------------------------------------------------------------- mechanical one-shots
export type MechSound =
  | 'magOut' | 'magIn' | 'boltBack' | 'boltFwd' | 'slideRelease' | 'shellIn' | 'pump' | 'cylOpen' | 'cylClose'
  | 'clipPing' | 'clipIn' | 'breakOpen' | 'breakClose' | 'beltOpen' | 'beltIn' | 'drumOut' | 'drumIn'
  | 'dryFire' | 'swap' | 'adsIn' | 'casing' | 'shellCasing' | 'knife' | 'chargeUp';

export function renderMech(kind: MechSound, variation: number): Promise<AudioBuffer> {
  const r = (a: number) => 1 + Math.sin(variation * 3.7 + a) * 0.06;
  return render(kind === 'clipPing' ? 0.9 : kind === 'chargeUp' ? 1.0 : 0.45, (ctx, out) => {
    const t = 0.002;
    const cloth = (tt: number, lvl: number, dur = 0.12) => burst(ctx, out, tt, 'bandpass', 700 * r(9), 0.8, dur, lvl, 'pink', dur * 0.3);
    switch (kind) {
      case 'magOut':
        ping(ctx, out, t, 1900 * r(1), 10, 0.5, 0.05);
        burst(ctx, out, t + 0.02, 'bandpass', 1100, 2, 0.12, 0.35, 'pink');
        thud(ctx, out, t + 0.02, 300, 120, 0.05, 0.3);
        break;
      case 'magIn':
        burst(ctx, out, t, 'bandpass', 1200, 2, 0.06, 0.3, 'pink');
        ping(ctx, out, t + 0.05, 1600 * r(2), 9, 0.7, 0.06);
        thud(ctx, out, t + 0.05, 260, 90, 0.06, 0.5);
        break;
      case 'boltBack':
        ping(ctx, out, t, 1500 * r(3), 8, 0.5, 0.05);
        burst(ctx, out, t + 0.01, 'bandpass', 1300, 3, 0.1, 0.3, 'pink');
        break;
      case 'boltFwd': case 'slideRelease':
        burst(ctx, out, t, 'bandpass', 1200, 3, 0.05, 0.25, 'pink');
        ping(ctx, out, t + 0.04, 2000 * r(4), 12, 0.7, 0.07);
        thud(ctx, out, t + 0.04, 320, 110, 0.05, 0.4);
        break;
      case 'shellIn':
        burst(ctx, out, t, 'bandpass', 900, 2, 0.05, 0.3, 'pink');
        ping(ctx, out, t + 0.03, 1250 * r(5), 7, 0.45, 0.05);
        thud(ctx, out, t + 0.03, 240, 100, 0.04, 0.35);
        break;
      case 'pump':
        burst(ctx, out, t, 'bandpass', 900, 2, 0.08, 0.45, 'pink');
        ping(ctx, out, t + 0.07, 1500, 10, 0.5, 0.06);
        burst(ctx, out, t + 0.16, 'bandpass', 1100, 2, 0.07, 0.45, 'pink');
        ping(ctx, out, t + 0.22, 1900, 12, 0.6, 0.07);
        break;
      case 'cylOpen':
        ping(ctx, out, t, 2100 * r(6), 14, 0.5, 0.06);
        burst(ctx, out, t + 0.03, 'bandpass', 1500, 4, 0.12, 0.2);
        break;
      case 'cylClose':
        burst(ctx, out, t, 'bandpass', 1000, 2, 0.04, 0.2, 'pink');
        ping(ctx, out, t + 0.02, 1700, 12, 0.7, 0.07);
        thud(ctx, out, t + 0.02, 280, 100, 0.05, 0.4);
        // ratchet spin
        for (let i = 0; i < 4; i++) ping(ctx, out, t + 0.12 + i * 0.035, 2600, 18, 0.12, 0.02);
        break;
      case 'clipPing': // the iconic en-bloc ejection ring — kept warm, not piercing
        burst(ctx, out, t, 'bandpass', 1200, 2, 0.03, 0.4, 'pink');
        ping(ctx, out, t + 0.01, 2350 * r(7), 40, 0.9, 0.55);
        ping(ctx, out, t + 0.01, 3500 * r(7), 30, 0.25, 0.35);
        break;
      case 'clipIn':
        burst(ctx, out, t, 'bandpass', 1100, 2, 0.08, 0.35, 'pink');
        ping(ctx, out, t + 0.06, 1400, 8, 0.5, 0.05);
        thud(ctx, out, t + 0.06, 250, 90, 0.05, 0.5);
        break;
      case 'breakOpen':
        ping(ctx, out, t, 1300 * r(8), 7, 0.5, 0.06);
        thud(ctx, out, t, 200, 80, 0.08, 0.5);
        burst(ctx, out, t + 0.05, 'bandpass', 2000, 4, 0.05, 0.15);
        break;
      case 'breakClose':
        thud(ctx, out, t, 260, 90, 0.07, 0.7);
        ping(ctx, out, t, 1600, 9, 0.6, 0.07);
        break;
      case 'beltOpen':
        ping(ctx, out, t, 1400, 8, 0.5, 0.06);
        burst(ctx, out, t + 0.03, 'bandpass', 1700, 3, 0.2, 0.25);
        break;
      case 'beltIn':
        for (let i = 0; i < 6; i++) ping(ctx, out, t + i * 0.035, 1900 + i * 60, 14, 0.18, 0.025);
        thud(ctx, out, t + 0.25, 260, 90, 0.06, 0.6);
        ping(ctx, out, t + 0.25, 1500, 9, 0.6, 0.07);
        break;
      case 'drumOut':
        thud(ctx, out, t, 220, 80, 0.07, 0.5);
        burst(ctx, out, t, 'bandpass', 800, 2, 0.15, 0.35, 'pink');
        break;
      case 'drumIn':
        thud(ctx, out, t, 240, 80, 0.08, 0.7);
        ping(ctx, out, t + 0.01, 1300, 8, 0.5, 0.06);
        for (let i = 0; i < 3; i++) ping(ctx, out, t + 0.12 + i * 0.05, 2200, 16, 0.15, 0.02);
        break;
      case 'dryFire':
        ping(ctx, out, t, 2200 * r(10), 10, 0.5, 0.025);
        break;
      case 'swap':
        cloth(t, 0.4, 0.2);
        ping(ctx, out, t + 0.12, 1500 * r(11), 8, 0.35, 0.05);
        thud(ctx, out, t + 0.12, 260, 100, 0.05, 0.3);
        break;
      case 'adsIn':
        cloth(t, 0.35, 0.12);
        thud(ctx, out, t + 0.05, 220, 110, 0.03, 0.15);
        break;
      case 'casing':
        ping(ctx, out, t, 2300 * r(12), 22, 0.4, 0.09);
        ping(ctx, out, t + 0.07 + variation * 0.01, 2900 * r(13), 25, 0.2, 0.05);
        break;
      case 'shellCasing':
        thud(ctx, out, t, 400, 200, 0.03, 0.3);
        ping(ctx, out, t, 1300 * r(14), 8, 0.3, 0.06);
        break;
      case 'knife': {
        const s = burst(ctx, out, t, 'bandpass', 900, 1.2, 0.2, 0.5, 'pink', 0.08);
        sweep(s.f.frequency, t, 600, 2400, 0.2);
        break;
      }
      case 'chargeUp': {
        const o = osc(ctx, 'sine', 80, t, 0.9);
        sweep(o.frequency, t, 80, 320, 0.8);
        const g = gain(ctx, 0);
        perc(g.gain, t, 0.4, 0.6, 0.3);
        chain(o, filt(ctx, 'lowpass', 800), g, out);
        break;
      }
    }
  });
}

// ---------------------------------------------------------------- impacts & explosions
export type ImpactSound = 'flesh' | 'head' | 'chip' | 'wall' | 'metal' | 'wood' | 'water' | 'explosion' | 'bodyfall' | 'meleeHit' | 'cage' | 'arcZap' | 'gib';

export function renderImpact(kind: ImpactSound, variation: number): Promise<AudioBuffer> {
  const r = (a: number) => 1 + Math.sin(variation * 5.1 + a) * 0.08;
  const dur = kind === 'explosion' ? 2.6 : kind === 'bodyfall' ? 0.7 : 0.5;
  return render(dur, (ctx, out) => {
    const t = 0.002;
    switch (kind) {
      case 'flesh':
        thud(ctx, out, t, 180 * r(1), 60, 0.07, 0.45);
        burst(ctx, out, t, 'bandpass', 1050 * r(1), 1.0, 0.05, 0.55, 'pink');
        burst(ctx, out, t, 'bandpass', 650 * r(2), 1.2, 0.06, 0.5, 'pink');
        burst(ctx, out, t + 0.01, 'lowpass', 1200, 0.7, 0.1, 0.25, 'brown');
        break;
      case 'head':
        thud(ctx, out, t, 220, 70, 0.06, 0.45);
        burst(ctx, out, t, 'bandpass', 1300 * r(3), 1.2, 0.04, 0.6, 'pink');
        burst(ctx, out, t, 'bandpass', 950 * r(3), 1.5, 0.05, 0.6, 'pink');
        burst(ctx, out, t + 0.005, 'bandpass', 2000, 2, 0.03, 0.25);
        burst(ctx, out, t + 0.02, 'lowpass', 900, 0.7, 0.15, 0.3, 'brown');
        break;
      case 'chip': {
        // electrical pop: sharp band-limited snap + resonant zap + crackle tail
        burst(ctx, out, t, 'bandpass', 1600 * r(4), 1.5, 0.015, 0.9);
        ping(ctx, out, t, 1150 * r(5), 6, 0.6, 0.09);
        const n = noiseSrc(ctx, 'white', t, 0.35);
        const bp = filt(ctx, 'bandpass', 1800, 3);
        const g = gain(ctx, 0);
        perc(g.gain, t + 0.01, 0.4, 0.002, 0.3);
        const am = osc(ctx, 'square', 31, t, 0.35);
        const amG = gain(ctx, 0.5);
        chain(am, amG); amG.connect(g.gain);
        chain(n, bp, filt(ctx, 'lowpass', 4000), g, out);
        thud(ctx, out, t, 120, 50, 0.08, 0.5);
        break;
      }
      case 'wall':
        burst(ctx, out, t, 'bandpass', 1300 * r(6), 1, 0.03, 0.6, 'pink');
        burst(ctx, out, t + 0.01, 'lowpass', 700, 0.7, 0.12, 0.35, 'brown');
        thud(ctx, out, t, 260, 120, 0.03, 0.3);
        break;
      case 'metal':
        burst(ctx, out, t, 'bandpass', 1800, 1.5, 0.02, 0.6);
        ping(ctx, out, t, 1650 * r(7), 30, 0.5, 0.25);
        ping(ctx, out, t, 2700 * r(8), 25, 0.2, 0.15);
        break;
      case 'wood':
        burst(ctx, out, t, 'bandpass', 900 * r(9), 1.2, 0.05, 0.6, 'pink');
        ping(ctx, out, t, 420 * r(10), 4, 0.5, 0.08);
        break;
      case 'water':
        burst(ctx, out, t, 'bandpass', 800, 0.8, 0.15, 0.6, 'pink', 0.01);
        for (let i = 0; i < 3; i++) ping(ctx, out, t + 0.05 + i * 0.04, 700 + i * 200, 6, 0.2, 0.06);
        break;
      case 'explosion': {
        const pre = gain(ctx, 1);
        chain(pre, shaper(ctx, 3), filt(ctx, 'lowpass', 5000), out);
        thud(ctx, pre, t, 110, 26, 0.6, 1.0);
        thud(ctx, pre, t, 60, 22, 1.0, 0.8);
        burst(ctx, pre, t, 'bandpass', 1800, 0.8, 0.03, 0.7);
        const b = burst(ctx, pre, t, 'lowpass', 1500, 0.7, 1.4, 1.0, 'brown', 0.005);
        sweep(b.f.frequency, t, 2200, 160, 1.6);
        burst(ctx, pre, t + 0.05, 'bandpass', 500, 0.8, 0.8, 0.5, 'pink');
        // debris patter
        for (let i = 0; i < 10; i++) burst(ctx, out, t + 0.3 + Math.random() * 1.2, 'bandpass', 1000 + Math.random() * 1500, 3, 0.02, 0.08 * Math.random());
        break;
      }
      case 'bodyfall':
        thud(ctx, out, t, 140 * r(11), 45, 0.15, 0.6);
        burst(ctx, out, t, 'bandpass', 700, 1, 0.12, 0.45, 'pink');
        burst(ctx, out, t, 'lowpass', 600, 0.7, 0.2, 0.5, 'brown');
        thud(ctx, out, t + 0.12, 110, 40, 0.1, 0.5);
        burst(ctx, out, t + 0.12, 'bandpass', 500, 1, 0.1, 0.25, 'pink');
        break;
      case 'meleeHit':
        thud(ctx, out, t, 200, 60, 0.08, 0.55);
        burst(ctx, out, t, 'bandpass', 900, 1.0, 0.07, 0.6, 'pink');
        burst(ctx, out, t, 'bandpass', 700, 1, 0.08, 0.7, 'pink');
        burst(ctx, out, t + 0.01, 'bandpass', 1500 * r(12), 2, 0.05, 0.3);
        break;
      case 'cage':
        ping(ctx, out, t, 950 * r(13), 18, 0.8, 0.35);
        ping(ctx, out, t, 1420 * r(14), 20, 0.4, 0.25);
        burst(ctx, out, t, 'bandpass', 2000, 2, 0.02, 0.5);
        thud(ctx, out, t, 300, 150, 0.05, 0.4);
        break;
      case 'arcZap': {
        const n = noiseSrc(ctx, 'white', t, 0.4);
        const bp = filt(ctx, 'bandpass', 1600 * r(15), 5);
        const g = gain(ctx, 0);
        perc(g.gain, t, 0.7, 0.003, 0.3);
        const lfo = osc(ctx, 'sawtooth', 45, t, 0.4);
        const lg = gain(ctx, 800);
        chain(lfo, lg); lg.connect(bp.frequency);
        chain(n, bp, g, out);
        thud(ctx, out, t, 100, 40, 0.1, 0.5);
        break;
      }
      case 'gib':
        thud(ctx, out, t, 160, 50, 0.1, 0.8);
        burst(ctx, out, t, 'lowpass', 900, 0.7, 0.18, 0.8, 'brown');
        burst(ctx, out, t + 0.03, 'bandpass', 600, 1, 0.12, 0.5, 'pink');
        break;
    }
  });
}

export const _ctxType = null as unknown as Ctx;
