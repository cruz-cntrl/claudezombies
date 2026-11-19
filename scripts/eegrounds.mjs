// Grounds easter egg end-to-end: flare pistol → 3 coffin bells → vigil under the tower → LIGHTS OUT.
import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/?autostart=1&map=grounds&debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const app = window.app, g = app.game, ee = g.ee, log = [];
  app.loop.stop();
  g.invuln = 1e9; g.economy.points = 1e6;
  const step = (sec) => { for (let i = 0; i < sec * 60; i++) { g.update(1 / 60); g.invuln = 1e9; } };
  const find = (re) => g.interact.list.find((it) => { const l = it.label(); return l && re.test(l.text); });
  const useAt = (re) => { const it = find(re); if (!it) return 'missing ' + re; g.player.pos.set(it.x, 0, it.z); g.player.prevPos.copy(g.player.pos); const ok = it.can(); if (ok) it.use(); return (ok ? 'used ' : 'blocked ') + it.label()?.text; };
  log.push('base before: ' + find(/tower/i)?.label()?.sub);
  log.push(useAt(/flare pistol/i));
  for (let i = 0; i < 3; i++) { log.push(useAt(/coffin bell/i)); step(0.5); }
  log.push('summary: ' + ee.summary() + ' surge=' + g.rounds.surge);
  log.push('base w/o power: ' + find(/tower/i)?.label()?.sub);
  g.powerOn = true;
  log.push(useAt(/Fire the flare/i));
  const bc = g.world.setpieces.get('beacon');
  log.push('beacon target during vigil ' + bc.target);
  // hold the ground (stay at the base) for the full vigil
  step(20);
  const v = ee.vigil;
  log.push('vigil t after 20s ' + (v ? v.t.toFixed(1) : 'none'));
  step(27);
  log.push('summary: ' + ee.summary() + ' beacon=' + bc.target + ' alive=' + g.zombies.aliveCount);
  log.push('perks=' + [...g.player.perks].join(','));
  log.push('eeDone=' + JSON.stringify(window.save?.eeDone));
  return log;
});
console.log(out.join('\n'));
await page.evaluate(() => { const app = window.app; app.game.render(1, 0.016); app.r.render(app.time += 0.016); });
await page.screenshot({ path: 'shots/ee_grounds_after.png' });
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
