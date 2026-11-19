// ADS check: hip vs aimed view per weapon, with the HUD's aimed reticle visible (shots/ads_<id>.png)
import { webkit } from 'playwright';
const ids = process.argv.slice(2).length ? process.argv.slice(2) : ['warden', 'hollowpoint', 'chatterbox', 'typewriter', 'fieldmarshal', 'ironside', 'vanguard', 'trench', 'coachgun', 'gravedigger', 'marksman', 'thumper', 'disruptor'];
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 })).newPage();
await page.goto('http://localhost:4173/?autostart=1&debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
await page.evaluate(() => {
  const app = window.app, g = app.game;
  app.loop.stop();
  app.touch.setVisible(false);
  document.querySelector('.hud-fps').style.display = 'none';
  g.rounds.paused = true;
  const p = g.player; p.pos.set(11.5, 0, 12.5); p.prevPos.copy(p.pos); p.yaw = 0; p.pitch = -0.05;
  window.pose = (id, ads, sprint = 0) => {
    const ws = g.weapons;
    ws.give(id);
    ws.vm.setWeapon(id, false);
    ws.ads = ads; p.ads = ads;
    ws.state = 'idle';
    for (let k = 0; k < 40; k++) {
      ws.vm.update(1 / 60, { ads, bobPhase: 0, bobAmount: 0, sprint, lookDX: 0, lookDY: 0, reload: null,
        swap: 0, melee: -1, action: -1, throwT: -1, cookT: -1, drink: -1, drinkColor: 0, downed: false, time: 1 });
    }
    g.render(1, 0);
    g.hud.update(0.016);
    app.r.render(1);
  };
});
for (const id of ids) for (const [ads, sprint, tag] of [[0, 0, 'hip'], [1, 0, 'ads'], [0, 1, 'run'], [0.5, 1, 'mix']]) {
  await page.evaluate(([id, ads, sprint]) => window.pose(id, ads, sprint), [id, ads, sprint]);
  await page.screenshot({ path: `shots/ads_${id}_${tag}.png` });
}
await browser.close();
