import { webkit } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
for (const map of ['ravenmoor', 'station']) {
  const page = await ctx.newPage();
  const errors = [];
  page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
  page.on('pageerror', (e) => errors.push(String(e)));
  await page.goto(base + `?autostart=1&map=${map}`);
  await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
  const out = await page.evaluate(async (map) => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.app.game, ee = g.ee, log = [];
    g.invuln = 1e9; g.economy.points = 1e6;
    // pick up / use every EE anchor interactable (not notes, which open overlays)
    for (const it of g.interact.list) {
      const l = it.label();
      if (!l || /note|scrap|keypad|Tune|Read/i.test(l.text)) continue;
      if (/valve|music|reel|odd book|stash|broken radio|Install/i.test(l.text)) { g.player.pos.set(it.x, 0, it.z); if (it.can()) { it.use(); log.push('used ' + l.text); } }
    }
    log.push('summary: ' + ee.summary());
    g.powerOn = true;
    if (map === 'station') { for (const r of ee.relays) { r.state = 'locked'; } }
    ee.summonBoss();
    await sleep(3500);
    const b = g.boss;
    log.push('boss: ' + (b && b.name) + ' hp=' + (b && Math.round(b.hp)));
    // stand somewhere sensible, look at boss and screenshot later
    const c = b.center();
    g.player.pos.set(c.x + 7, 0, c.z + 2); g.player.prevPos.copy(g.player.pos);
    g.player.yaw = Math.atan2(-(c.x - g.player.pos.x), -(c.z - g.player.pos.z));
    g.player.pitch = 0.12;
    window.__boss = b;
    return log;
  }, map);
  await new Promise((r) => setTimeout(r, 1200));
  await page.screenshot({ path: `shots/boss_${map}.png` });
  const out2 = await page.evaluate(async () => {
    const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
    const g = window.app.game, b = window.__boss, log = [];
    // break shields (mother) and kill
    for (let i = 0; i < 3; i++) b.damage(1e6, 'shield', i);
    log.push('phase after shields ' + b.phase);
    b.damage(b.maxHp * 0.75, 'body');
    log.push('phase ' + b.phase + ' hp ' + Math.round(b.hp));
    b.damage(1e9, 'crit');
    await sleep(500);
    log.push('alive=' + b.alive + ' perks=' + [...g.player.perks].join(',') + ' weapon=' + g.weapons.current.name);
    log.push('summary: ' + g.ee.summary());
    return log;
  });
  console.log(`== ${map}\n` + [...out, ...out2].join('\n'));
  if (errors.length) console.log('ERRORS:', errors.slice(0, 10));
  await page.close();
}
await browser.close();
