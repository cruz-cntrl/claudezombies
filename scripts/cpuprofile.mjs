// Measures JS time per frame in simulation and render prep at a heavy late round.
import { webkit } from 'playwright';
const map = process.argv[2] || 'ravenmoor';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1 })).newPage();
await page.goto(`http://localhost:4173/?autostart=1&map=${map}&quality=low`);
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
const r = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const app = window.app, g = app.game;
  g.invuln = 1e9; g.economy.points = 1e6;
  for (const d of g.world.doors.keys()) g.world.openDoor(d);
  g.powerOn = true;
  g.weapons.give('chatterbox');
  g.rounds.startRound(30);
  g.rounds.spawnBrute();
  await sleep(12000); // let the horde arrive
  const t = { update: [], gameRender: [], rRender: [] };
  const wrap = (obj, key, arr) => { const f = obj[key].bind(obj); obj[key] = (...a) => { const s = performance.now(); const v = f(...a); arr.push(performance.now() - s); return v; }; };
  wrap(g, 'update', t.update); wrap(g, 'render', t.gameRender); wrap(app.r, 'render', t.rRender);
  app.input.fire = true;
  await sleep(6000);
  app.input.fire = false;
  const stat = (a) => { const s = [...a].sort((x, y) => x - y); return { avg: +(a.reduce((x, y) => x + y, 0) / a.length).toFixed(2), p95: +s[Math.floor(s.length * 0.95)].toFixed(2), max: +s[s.length - 1].toFixed(2), n: a.length }; };
  return { alive: g.zombies.aliveCount, kills: g.player.stats.kills, update: stat(t.update), gameRender: stat(t.gameRender), gpuSubmit: stat(t.rRender), voices: window.app && (await import('/src/audio/audioEngine.ts').catch(() => null)) ? 'n/a' : 'n/a' };
});
console.log(map, JSON.stringify(r));
await browser.close();
