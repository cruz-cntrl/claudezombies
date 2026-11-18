// Renders every sound in WebKit and reports spectral balance + loudness so harsh / thin /
// mismatched assets can be found without listening. Usage: node scripts/audiocheck.mjs [filter]
import { webkit } from 'playwright';
import fs from 'node:fs';
const filter = process.argv[2] || '';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 } })).newPage();
page.on('pageerror', (e) => console.log('PAGEERROR', String(e)));
await page.goto('http://localhost:4173/?debug=1&screen=menu');
await page.waitForFunction(() => window.app && window.app.state === 'menu', null, { timeout: 60000 });
const rows = await page.evaluate(async (filter) => {
  const audio = window.audio;
  window.app.music.register();
  const names = audio.registeredNames().filter((n) => n.includes(filter));
  const N = 2048;
  const win = new Float32Array(N).map((_, i) => 0.5 - 0.5 * Math.cos((2 * Math.PI * i) / (N - 1)));
  function fft(re, im) {
    const n = re.length;
    for (let i = 1, j = 0; i < n; i++) {
      let bit = n >> 1;
      for (; j & bit; bit >>= 1) j ^= bit;
      j ^= bit;
      if (i < j) { [re[i], re[j]] = [re[j], re[i]]; [im[i], im[j]] = [im[j], im[i]]; }
    }
    for (let len = 2; len <= n; len <<= 1) {
      const ang = (-2 * Math.PI) / len;
      for (let i = 0; i < n; i += len) for (let k = 0; k < len / 2; k++) {
        const wr = Math.cos(ang * k), wi = Math.sin(ang * k);
        const ar = re[i + k + len / 2], ai = im[i + k + len / 2];
        const tr = ar * wr - ai * wi, ti = ar * wi + ai * wr;
        re[i + k + len / 2] = re[i + k] - tr; im[i + k + len / 2] = im[i + k] - ti;
        re[i + k] += tr; im[i + k] += ti;
      }
    }
  }
  const out = [];
  for (const name of names) {
    const t0 = performance.now();
    await audio.ensure(name);
    const ms = performance.now() - t0;
    const bufs = audio.buffers(name);
    if (!bufs) { out.push({ name, err: 'no buffer' }); continue; }
    const b = bufs[0];
    const d = b.getChannelData(0), sr = b.sampleRate;
    let sum = 0, peak = 0;
    for (let i = 0; i < d.length; i++) { sum += d[i] * d[i]; peak = Math.max(peak, Math.abs(d[i])); }
    const rms = Math.sqrt(sum / d.length);
    // short-term loudness (50 ms) max
    const w = Math.floor(sr * 0.05);
    let stMax = 0;
    for (let i = 0; i + w < d.length; i += w) { let s = 0; for (let k = 0; k < w; k++) s += d[i + k] ** 2; stMax = Math.max(stMax, Math.sqrt(s / w)); }
    // spectrum
    const bands = [0, 0, 0, 0, 0]; // <200, 200-1k, 1-4k, 4-8k, >8k
    let cen = 0, tot = 0, phone = 0;
    const re = new Float32Array(N), im = new Float32Array(N);
    for (let off = 0; off + N <= d.length; off += N / 2) {
      for (let i = 0; i < N; i++) { re[i] = d[off + i] * win[i]; im[i] = 0; }
      fft(re, im);
      for (let k = 1; k < N / 2; k++) {
        const f = (k * sr) / N, p = re[k] * re[k] + im[k] * im[k];
        tot += p; cen += p * f;
        if (f > 300) phone += p;
        bands[f < 200 ? 0 : f < 1000 ? 1 : f < 4000 ? 2 : f < 8000 ? 3 : 4] += p;
      }
    }
    const pct = bands.map((x) => Math.round((x / (tot || 1)) * 100));
    out.push({ name, dur: +b.duration.toFixed(2), renderMs: Math.round(ms), rmsDb: +(20 * Math.log10(rms + 1e-9)).toFixed(1), stDb: +(20 * Math.log10(stMax + 1e-9)).toFixed(1), peak: +peak.toFixed(2), centroid: Math.round(cen / (tot || 1)), bands: pct, phoneDb: +(20 * Math.log10(rms + 1e-9) + 10 * Math.log10((phone / (tot || 1)) + 1e-9)).toFixed(1) });
  }
  return out;
}, filter);
fs.writeFileSync('shots/audio_report.json', JSON.stringify(rows, null, 1));
const flag = (r) => {
  const f = [];
  if (r.err) f.push(r.err);
  if (r.centroid > 3200) f.push('BRIGHT');
  if (r.bands && r.bands[4] > 12) f.push('HISS>8k');
  if (r.bands && r.bands[3] + r.bands[4] > 35) f.push('HARSH>4k');
  if (r.peak > 0.95) f.push('PEAK');
  return f.join(' ');
};
for (const r of rows) console.log(`${r.name.padEnd(24)} ${String(r.dur).padStart(6)}s render ${String(r.renderMs).padStart(5)}ms  rms ${String(r.rmsDb).padStart(6)}  phone ${String(r.phoneDb).padStart(6)}  st ${String(r.stDb).padStart(6)}  cen ${String(r.centroid).padStart(5)}  bands ${JSON.stringify(r.bands)}  ${flag(r)}`);
await browser.close();
