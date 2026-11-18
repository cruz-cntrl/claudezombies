// In-browser functional smoke test of gameplay systems. Prints a report and any console errors.
import { webkit } from 'playwright';
const base = process.argv[2] || 'http://localhost:4173/';
const map = process.argv[3] || 'ravenmoor';
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(String(e)));
await page.goto(base + `?autostart=1&map=${map}`);
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
const report = await page.evaluate(async () => {
  const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
  const g = window.app.game;
  const out = [];
  g.economy.points = 100000;
  g.invuln = 1e9;
  // open every purchasable door + power + all wall-buys + perks
  const used = [];
  for (let pass = 0; pass < 2; pass++) for (const it of g.interact.list) {
    const lab = it.label();
    if (!lab) continue;
    g.player.pos.set(it.x, 0, it.z);
    if (it.can()) { try { it.use(); used.push(lab.text); } catch (e) { out.push('ERR use ' + lab.text + ': ' + e); } }
    await sleep(30);
    // finish drink / swap animations
    for (let k = 0; k < 200 && g.weapons.state !== 'ready'; k++) await sleep(10);
  }
  out.push('used: ' + used.length + ' → ' + used.slice(0, 40).join(' | '));
  out.push('power: ' + g.powerOn + ' perks: ' + [...g.player.perks].join(','));
  out.push('weapons: ' + g.weapons.slots.map((w) => w.name).join(', '));
  // crate: wait for offer and take it; rewirer: wait and take
  await sleep(4500);
  for (const it of g.interact.list) { const l = it.label(); if (l && /^Take /.test(l.text)) { g.player.pos.set(it.x, 0, it.z); if (it.can()) { it.use(); out.push('took: ' + l.text); } } }
  await sleep(5000);
  for (const it of g.interact.list) { const l = it.label(); if (l && /^Take /.test(l.text)) { g.player.pos.set(it.x, 0, it.z); if (it.can()) { it.use(); out.push('took: ' + l.text); } } }
  out.push('weapons after: ' + g.weapons.slots.map((w) => w.name).join(', '));
  out.push('doors open: ' + [...g.world.doors.values()].filter((d) => d.open).length + '/' + g.world.doors.size);
  // power-ups
  for (const id of ['resupply', 'overload', 'double', 'killsignal', 'fortify']) g.powerups.apply(id);
  out.push('powerups ok, double active: ' + g.powerups.active('double'));
  // rounds: jump to hound round and brute round
  g.rounds.nextHound = 3;
  g.rounds.startRound(3);
  await sleep(8000);
  out.push('hound round: special=' + g.rounds.special + ' alive=' + g.zombies.aliveCount);
  g.zombies.killAll(() => true);
  g.rounds.toSpawn = 0;
  await sleep(500);
  g.rounds.startRound(13);
  g.rounds.spawnBrute();
  await sleep(2500);
  const brutes = [...g.zombies.all()].filter((z) => z.type === 'brute').length;
  out.push('round 13 alive=' + g.zombies.aliveCount + ' brutes=' + brutes);
  // shoot a lot with every weapon
  for (const id of ['chatterbox', 'trench', 'thumper', 'disruptor', 'longshot', 'gravedigger']) {
    g.weapons.give(id);
    for (let k = 0; k < 100 && g.weapons.state !== 'ready'; k++) await sleep(10);
    window.app.input.fire = true; await sleep(700); window.app.input.fire = false; await sleep(100);
    window.app.input.press('reload'); await sleep(400);
  }
  window.app.input.press('melee'); await sleep(600);
  window.app.input.grenadeHeld = true; await sleep(400); window.app.input.grenadeHeld = false; await sleep(3500);
  out.push('kills=' + g.player.stats.kills + ' points=' + g.economy.points + ' fps=' + window.app.loop.fps.toFixed(0));
  return out;
});
console.log(report.join('\n'));
if (errors.length) console.log('CONSOLE ERRORS:\n' + errors.slice(0, 15).join('\n'));
await browser.close();
