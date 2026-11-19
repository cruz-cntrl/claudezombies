// Grab frames from a map's opening cutscene (prologue + establishing shot).
// Usage: node scripts/cutscenecheck.mjs <map> → shots/cs_<map>_<n>.png
import { webkit } from 'playwright';
const map = process.argv[2] || 'grounds';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(`http://localhost:4173/?autostart=1&debug=1&cutscenes=1&map=${map}`);
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
const info = await page.evaluate(() => {
  const app = window.app, g = app.game;
  app.loop.stop();
  document.querySelector('.hud-fps').style.display = 'none';
  const cs = g.cutscenes;
  return { active: !!cs.active, total: cs.total };
});
console.log(JSON.stringify(info));
const times = [2, 12, 29.5, 31.5, 33.5, 35.5, 37.5, 39.3];
let t = 0;
for (let n = 0; n < times.length; n++) {
  await page.evaluate((target) => {
    const app = window.app, g = app.game;
    while (g.cutscenes.active && g.cutscenes.t < target) { g.update(1 / 30); app.time += 1 / 30; }
    g.render(1, 1 / 30); app.r.render(app.time);
  }, times[n]);
  await page.screenshot({ path: `shots/cs_${map}_${n}.png` });
}
const after = await page.evaluate(() => ({ active: !!window.app.game.cutscenes.active, hp: window.app.game.player.hp, round: window.app.game.rounds.round }));
console.log(JSON.stringify(after), errors);
await browser.close();
