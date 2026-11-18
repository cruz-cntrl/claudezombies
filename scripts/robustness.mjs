// Robustness: WebGL context loss/restore, visibility change, portrait rotation, gameplay edge cases, retry leaks.
import { webkit } from 'playwright';
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/?autostart=1&debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const report = [];
// 1. context loss
const lost = await page.evaluate(async () => {
  const gl = window.app.r.renderer.getContext();
  const ext = gl.getExtension('WEBGL_lose_context');
  if (!ext) return 'no extension';
  ext.loseContext();
  await new Promise((r) => setTimeout(r, 500));
  const was = window.app.r.contextLost;
  ext.restoreContext();
  await new Promise((r) => setTimeout(r, 1500));
  return `lost flag=${was} restored=${!window.app.r.contextLost} state=${window.app.state}`;
});
report.push('context: ' + lost);
await page.screenshot({ path: 'shots/robust_context.png' });
const px = await page.evaluate(() => {
  const c = document.createElement('canvas'); c.width = 32; c.height = 16;
  const g = c.getContext('2d'); g.drawImage(document.getElementById('game'), 0, 0, 32, 16);
  const d = g.getImageData(0, 0, 32, 16).data; let s = 0; for (let i = 0; i < d.length; i += 4) s += d[i] + d[i + 1] + d[i + 2];
  return Math.round(s / (32 * 16));
});
report.push('canvas brightness after restore: ' + px);
// 2. visibility change
const vis = await page.evaluate(async () => {
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => true });
  document.dispatchEvent(new Event('visibilitychange'));
  await new Promise((r) => setTimeout(r, 300));
  const st = window.app.state;
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => false });
  document.dispatchEvent(new Event('visibilitychange'));
  return st;
});
report.push('hidden → state ' + vis);
await page.evaluate(() => window.app.resume());
// 3. portrait
await page.setViewportSize({ width: 393, height: 852 });
await sleep(500);
const portrait = await page.evaluate(() => ({ state: window.app.state, overlay: getComputedStyle(document.getElementById('rotate')).display }));
report.push('portrait: ' + JSON.stringify(portrait));
await page.screenshot({ path: 'shots/robust_portrait.png' });
await page.setViewportSize({ width: 852, height: 393 });
await sleep(400);
await page.evaluate(() => window.app.resume());
// 4. edge cases
const edge = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.app.game, out = [];
  g.economy.points = 1e6; g.powerOn = true;
  // drink then get downed mid-drink
  g.weapons.startDrink(0xff0000, () => out.push('drink callback ran'));
  await sleep(400);
  g.player.hp = 1; g.damagePlayer(100, 0, 0);
  out.push('downed during drink: downed=' + g.player.downed + ' state=' + g.weapons.state);
  await sleep(6500);
  out.push('revived: downed=' + g.player.downed + ' weapons=' + g.weapons.slots.length + ' state=' + g.weapons.state);
  // swap spam + reload spam + grenade spam
  g.weapons.give('chatterbox'); await sleep(600);
  for (let i = 0; i < 30; i++) { window.app.input.press('swap'); window.app.input.press('reload'); window.app.input.press('melee'); await sleep(20); }
  window.app.input.grenadeHeld = true; await sleep(100); window.app.input.grenadeHeld = false; await sleep(100);
  window.app.input.grenadeHeld = true; await sleep(3200); window.app.input.grenadeHeld = false; // cook too long → explodes in hand
  await sleep(1500);
  out.push('after spam: state=' + g.weapons.state + ' slots=' + g.weapons.slots.map((w) => w.def.id).join(',') + ' hp=' + Math.round(g.player.hp) + ' downed=' + g.player.downed);
  return out;
});
report.push(...edge);
// 5. retry leak check
const leak = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const counts = [];
  for (let k = 0; k < 3; k++) {
    window.app.game.gameOver();
    await sleep(3000);
    await window.app.startGame(window.app.mapId, 'normal');
    await sleep(1500);
    const info = window.app.r.renderer.info;
    counts.push({ children: window.app.r.scene.children.length, geos: info.memory.geometries, tex: info.memory.textures, voices: window.audio.voices.length });
  }
  return counts;
});
report.push('retry x3: ' + JSON.stringify(leak));
console.log(report.join('\n'));
if (errors.length) console.log('ERRORS:', errors.slice(0, 10));
await browser.close();
