import { RATE, render, kick, snare, hat, dirtyBass, guitar, lead, strings, staticBurst, gain, chain, filt, bassAmp, guitarAmp, leadAmp } from './compose';

/**
 * Easter-egg songs: original gritty dark-rock tracks (~2 min) built from distorted
 * bass, power-chord guitar, a singing lead and a synthesized kit.
 */
interface SongSpec {
  bpm: number;
  key: number; // root midi note for the bass
  riff: number[]; // 8 eighth-note bass offsets (-1 = rest)
  verseChords: number[]; // per bar root offsets
  chorusChords: number[];
  melody: [number, number, number][]; // [offset from key+24, start beat, length beats] over 8 bars
  sections: ('intro' | 'verse' | 'chorus' | 'bridge' | 'outro')[];
}

const SONGS: Record<string, SongSpec> = {
  // "Bells Under the Light" — D minor, a slow stomp that keeps breaking into double time
  grounds: {
    bpm: 100, key: 26,
    riff: [0, -1, 0, 7, 5, -1, 3, 5],
    verseChords: [0, 0, 10, 10, 8, 8, 7, 7],
    chorusChords: [0, 3, 10, 5, 0, 3, 8, 7],
    melody: [[7, 0, 2], [8, 2, 1], [7, 3, 1], [5, 4, 4], [3, 8, 2], [5, 10, 2], [7, 12, 4], [12, 16, 2], [10, 18, 1], [8, 19, 1], [7, 20, 4], [5, 24, 2], [3, 26, 2], [2, 28, 4]],
    sections: ['intro', 'verse', 'chorus', 'verse', 'chorus', 'bridge', 'chorus', 'outro'],
  },
  // "Dead Air" — E minor, heavy and swung
  ravenmoor: {
    bpm: 92, key: 28,
    riff: [0, 0, 12, 0, 3, 0, 5, 3],
    verseChords: [0, 0, 3, 5, 0, 0, 7, 5],
    chorusChords: [0, 8, 3, 10, 0, 8, 7, 7],
    melody: [[7, 0, 2], [5, 2, 1], [3, 3, 1], [5, 4, 3], [0, 8, 2], [3, 10, 2], [7, 12, 4], [10, 16, 2], [8, 18, 2], [7, 20, 4], [5, 24, 2], [3, 26, 1], [5, 27, 1], [7, 28, 4]],
    sections: ['intro', 'verse', 'chorus', 'verse', 'bridge', 'chorus', 'outro'],
  },
  // "Cut the Signal" — A minor, driving
  station: {
    bpm: 112, key: 33,
    riff: [0, 0, 0, 3, 0, 0, 5, 7],
    verseChords: [0, 0, 5, 3, 0, 0, 8, 7],
    chorusChords: [0, 5, 8, 7, 0, 5, 3, 7],
    melody: [[12, 0, 1], [10, 1, 1], [7, 2, 2], [8, 4, 2], [7, 6, 2], [5, 8, 3], [3, 11, 1], [5, 12, 4], [12, 16, 1], [10, 17, 1], [12, 18, 2], [15, 20, 4], [14, 24, 2], [12, 26, 2], [10, 28, 4]],
    sections: ['intro', 'verse', 'chorus', 'verse', 'bridge', 'chorus', 'chorus', 'outro'],
  },
};

export function songDuration(id: string) {
  const s = SONGS[id] ?? SONGS.ravenmoor;
  const bar = (60 / s.bpm) * 4;
  return s.sections.length * 8 * bar + 4;
}

export function renderSong(id: string): Promise<AudioBuffer> {
  const s = SONGS[id] ?? SONGS.ravenmoor;
  const beat = 60 / s.bpm, bar = beat * 4;
  const total = songDuration(id);
  return render(total, (ctx, out) => {
    const master = gain(ctx, 0.9);
    const glue = ctx.createDynamicsCompressor();
    glue.threshold.value = -14; glue.ratio.value = 3; glue.attack.value = 0.01; glue.release.value = 0.2;
    chain(master, glue, out);
    const drums = gain(ctx, 0.9), bass = gain(ctx, 0.55), gtr = gain(ctx, 0.42), ld = gain(ctx, 0.32), pad = gain(ctx, 0.35);
    drums.connect(master); pad.connect(master);
    const bassIn = bassAmp(ctx, bass), gtrIn = guitarAmp(ctx, gtr), ldIn = leadAmp(ctx, ld);
    bass.connect(master); gtr.connect(master); ld.connect(master);
    // room for the drums
    const room = ctx.createConvolver();
    const ir = new AudioBuffer({ length: Math.floor(RATE * 0.6), sampleRate: RATE, numberOfChannels: 2 });
    for (let c = 0; c < 2; c++) { const d = ir.getChannelData(c); for (let i = 0; i < d.length; i++) d[i] = (Math.random() * 2 - 1) * Math.pow(1 - i / d.length, 3) * 0.6; }
    room.buffer = ir;
    const rs = gain(ctx, 0.18);
    chain(drums, rs, room, filt(ctx, 'lowpass', 3000), master);
    let t0 = 0.1;
    s.sections.forEach((sec) => {
      const chords = sec === 'chorus' ? s.chorusChords : s.verseChords;
      for (let b = 0; b < 8; b++) {
        const tb = t0 + b * bar;
        const root = s.key + chords[b];
        // drums
        if (sec === 'intro' && b < 4) { if (b % 2 === 1) for (let k = 0; k < 4; k++) hat(ctx, drums, tb + k * beat, 0.12); }
        else if (sec === 'outro' && b >= 4) { if (b === 4) kick(ctx, drums, tb, 1); }
        else {
          const half = sec === 'bridge';
          for (let k = 0; k < 8; k++) {
            const tk = tb + k * beat * 0.5;
            if (k === 0 || k === 3 || (k === 5 && !half)) kick(ctx, drums, tk, 0.95);
            if ((k === 2 || k === 6) && !(half && k === 2)) snare(ctx, drums, tk, 0.8);
            hat(ctx, drums, tk, k % 2 ? 0.07 : 0.12, sec === 'chorus' && k === 7);
          }
          if (b === 7) for (let f = 0; f < 4; f++) snare(ctx, drums, tb + 3 * beat + f * beat * 0.25, 0.4 + f * 0.12);
        }
        // bass riff (8ths)
        if (sec !== 'intro' || b >= 2) {
          for (let k = 0; k < 8; k++) {
            const off = s.riff[k];
            if (off < 0) continue;
            dirtyBass(ctx, bassIn, tb + k * beat * 0.5, root + (sec === 'verse' ? off : 0), beat * 0.45, 0.8);
          }
        }
        // guitar
        if (sec === 'verse') for (let k = 0; k < 8; k++) guitar(ctx, gtrIn, tb + k * beat * 0.5, root + 12, beat * 0.4, 0.5, k % 4 !== 0);
        if (sec === 'chorus' || sec === 'outro') { guitar(ctx, gtrIn, tb, root + 12, bar * 0.98, 0.55); }
        if (sec === 'bridge') { if (b % 2 === 0) guitar(ctx, gtrIn, tb, root + 12, bar * 2, 0.4); }
        // pads under the bridge + chorus
        if (sec === 'bridge' || sec === 'chorus') strings(ctx, pad, tb, [root + 24, root + 31, root + 36], bar, 0.4, 1200, 0.3);
      }
      // lead melody over choruses and the bridge
      if (sec === 'chorus' || sec === 'bridge') {
        for (const [n, st, len] of s.melody) lead(ctx, ldIn, t0 + st * beat, s.key + 24 + n + (sec === 'bridge' ? -5 : 0), len * beat * 0.95, 0.6);
      }
      if (sec === 'intro') staticBurst(ctx, master, t0, 2.5, 0.25);
      t0 += 8 * bar;
    });
    staticBurst(ctx, master, t0 - 1, 3, 0.3);
  }, 2, RATE);
}
