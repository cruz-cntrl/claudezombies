// Playwright screenshot sweep: iPhone 16 landscape (852x393 CSS px, DPR 3) in WebKit.
// Usage: node scripts/shots.mjs [baseUrl] [filter]
import { webkit } from 'playwright';
import fs from 'node:fs';

const base = process.argv[2] || 'http://localhost:4173/';
const filter = process.argv[3] || '';
fs.mkdirSync('shots', { recursive: true });

const wait = (ms) => new Promise((r) => setTimeout(r, ms));

const shots = [
  { name: 'title', q: 'safe=1&debug=1', wait: 'title', after: async () => {} },
  { name: 'menu', q: 'safe=1&debug=1', wait: 'title', after: async (p) => { await p.mouse.click(400, 200); await wait(800); } },
  { name: 'ingame', q: 'safe=1&debug=1&autostart=1', wait: 'playing', after: async (p) => { await wait(1500); } },
  { name: 'pause', q: 'safe=1&debug=1&autostart=1', wait: 'playing', after: async (p) => { await p.evaluate(() => window.app.pause()); await wait(500); } },
  ...(process.env.EXTRA ? JSON.parse(process.env.EXTRA) : []),
];

const browser = await webkit.launch();
const ctx = await browser.newContext({
  viewport: { width: 852, height: 393 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
let failures = 0;
for (const s of shots) {
  if (filter && !s.name.includes(filter)) continue;
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  const t0 = Date.now();
  await page.goto(base + '?' + s.q, { waitUntil: 'load' });
  try {
    await page.waitForFunction((st) => window.app && window.app.state === st, s.wait, { timeout: 60000 });
  } catch (e) { errors.push('timeout waiting for state ' + s.wait); }
  const loadMs = Date.now() - t0;
  if (s.after) await s.after(page);
  if (s.eval) await page.evaluate(s.eval);
  await wait(s.delay ?? 600);
  await page.screenshot({ path: `shots/${s.name}.png` });
  // reserved-zone self-check: any visible interactive/HUD element overlapping it?
  const overlaps = await page.evaluate(() => {
    const z = document.getElementById('reserved-zone').getBoundingClientRect();
    const out = [];
    document.querySelectorAll('#hud *, #controls *, .interact, .screen button, .screen .btn').forEach((el) => {
      const r = el.getBoundingClientRect();
      const st = getComputedStyle(el);
      if (r.width === 0 || r.height === 0 || st.display === 'none' || st.visibility === 'hidden' || st.opacity === '0') return;
      if (r.right > z.left + 0.5 && r.bottom > z.top + 0.5 && r.left < z.right && r.top < z.bottom) out.push((el.className || el.tagName) + ' ' + JSON.stringify([r.left | 0, r.top | 0, r.right | 0, r.bottom | 0]));
    });
    return out;
  });
  const info = await page.evaluate(() => {
    const el = document.querySelector('.hud-fps');
    return el ? el.textContent : '';
  });
  console.log(`[${s.name}] load ${loadMs}ms ${info}`);
  if (overlaps.length) { console.log('  RESERVED ZONE OVERLAP:', overlaps); failures++; }
  if (errors.length) { console.log('  ERRORS:', errors.slice(0, 8)); failures++; }
  await page.close();
}
await browser.close();
process.exit(failures ? 1 : 0);
