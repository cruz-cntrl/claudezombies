// Hound pressure: N hounds vs a player who doesn't fight back — time until downed, bites, max simultaneous chargers.
import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 640, height: 300 } })).newPage();
await page.goto('http://localhost:4173/?autostart=1&map=grounds&quality=low');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
for (const n of [3, 5]) {
  const r = await page.evaluate((n) => {
    const app = window.app, g = app.game, p = g.player;
    app.loop.stop(); g.rounds.paused = true;
    for (const z of g.zombies.all()) z.active = false;
    p.downed = false; p.hp = 100; g.invuln = 0; p.pos.set(77.5, 0, 107.5);
    for (let k = 0; k < n; k++) { const a = (k / n) * 6.28; g.zombies.spawn('hound', 200, 'sprinter', { x: 77.5 + Math.cos(a) * 14, z: 107.5 + Math.sin(a) * 14 }); }
    let t = 0, bites = 0, maxCharge = 0, lastHp = 100;
    while (t < 60 && !p.downed) {
      g.update(1 / 60); t += 1 / 60;
      if (p.hp < lastHp - 1) bites++;
      lastHp = p.hp;
      const c = [...g.zombies.hounds].filter((h) => h.active && (h.hunt === 'charge' || h.state === 'attack')).length;
      maxCharge = Math.max(maxCharge, c);
    }
    return { hounds: n, secondsUntilDowned: p.downed ? +t.toFixed(1) : '>60', bites, maxCharging: maxCharge };
  }, n);
  console.log(JSON.stringify(r));
}
await browser.close();
