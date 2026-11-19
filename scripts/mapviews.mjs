// Map preview sweep: teleports the camera around a map and screenshots each view.
// Usage: node scripts/mapviews.mjs <map> [dpr]   → shots/view_<map>_<name>.png
import { webkit } from 'playwright';
const map = process.argv[2] || 'grounds';
const dpr = Number(process.argv[3] || 2);
const P = (v) => Math.round(5 + (v - 5) * 1.42); // grounds layout scale (design → cells)
const VIEWS = {
  grounds: [
    ['aerial', 12, 124, -0.72, -0.62, 48],
    ['start', 77.5, P(78), 0, 0.05],
    ['tower', 77.5, P(72), 0, 0.42],
    ['drive_back', 77.5, P(62), Math.PI, -0.02],
    ['graveyard', P(28), P(40), 0.9, 0.0],
    ['graveyard2', P(10), P(14), -2.4, 0.02],
    ['crash', P(64), P(26), 0.6, 0.02],
    ['plane_inside', 84.5, 21.5, Math.PI / 2, 0.0],
    ['courtyard', P(100), P(56), 0.9, 0.05],
    ['chapel', P(100), P(80), 0.6, 0.08],
    ['yard', P(24), P(58), 1.8, 0.03],
    ['field', P(98), P(30), -2.2, 0.06],
  ],
};
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: dpr })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
const t0 = Date.now();
await page.goto(`http://localhost:4173/?autostart=1&debug=1&map=${map}`);
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
console.log('load ms', Date.now() - t0);
await page.evaluate(() => {
  const app = window.app, g = app.game;
  app.loop.stop();
  app.touch.setVisible(false);
  g.hud.setVisible(false);
  document.querySelector('.hud-fps').style.display = 'none';
  g.rounds.paused = true;
  for (const z of g.zombies.all()) z.alive = false;
  window.view = (x, z, yaw, pitch) => {
    const p = g.player;
    p.pos.set(x, 0, z); p.prevPos.copy(p.pos); p.yaw = yaw; p.pitch = pitch;
    g.weapons.vm.root.visible = false;
    for (let k = 0; k < 3; k++) { g.render(1, 0.016); app.r.render(app.time += 0.016); }
    app.r.renderer.info.reset(); app.r.render(app.time += 0.016);
    const inf = app.r.renderer.info.render;
    return { calls: inf.calls, tris: inf.triangles };
  };
});
for (const [name, x, z, yaw, pitch, eye] of VIEWS[map]) {
  const info = await page.evaluate(([x, z, yaw, pitch, eye]) => { const g = window.app.game; g.player.eye = eye || 1.62; window.app.r.scene.fog.density = eye ? 0.005 : g.world.def.fogDensity; g.fogBase && 0; const r = window.view(x, z, yaw, pitch); return r; }, [x, z, yaw, pitch, eye]);
  await page.screenshot({ path: `shots/view_${map}_${name}.png` });
  console.log(name, JSON.stringify(info));
}
if (errors.length) console.log('ERRORS', errors.slice(0, 8));
await browser.close();
