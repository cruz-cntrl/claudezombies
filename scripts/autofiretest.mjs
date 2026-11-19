// Auto-fire while aiming: a zombie straight ahead + aim held (touch) → shots go off without FIRE; none when off-target.
import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 } })).newPage();
await page.goto('http://localhost:4173/?autostart=1&map=grounds');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const app = window.app, g = app.game, p = g.player, inp = app.input, ws = g.weapons;
  app.loop.stop(); g.rounds.paused = true; g.invuln = 1e9;
  for (const z of g.zombies.all()) z.active = false;
  inp.usingTouch = true;
  const run = (label, place) => {
    for (const z of g.zombies.all()) z.active = false;
    p.pos.set(77.5, 0, 107.5); p.prevPos.copy(p.pos); p.yaw = 0; p.pitch = 0;
    ws.current.mag = ws.current.stats.mag;
    if (place) { const z = g.zombies.spawn('zombie', 1e6, 'walker', { x: 77.5, z: 100.5 }); z.setState('chase'); z.y = 0; z.speed = 0; }
    inp.aimHeld = true;
    const mag0 = ws.current.mag;
    for (let i = 0; i < 120; i++) { g.update(1 / 60); g.invuln = 1e9; }
    inp.aimHeld = false;
    for (let i = 0; i < 30; i++) g.update(1 / 60);
    return `${label}: shots=${mag0 - ws.current.mag} ads=${ws.ads.toFixed(2)}`;
  };
  return [run('zombie ahead, aim held 2 s', true), run('nothing ahead, aim held 2 s', false), `aim sens ${window.app.input.aiming} adsSens=${JSON.parse(localStorage.getItem('tethered.v1') || '{}').settings?.adsSens}`];
});
console.log(out.join('\n'));
await browser.close();
