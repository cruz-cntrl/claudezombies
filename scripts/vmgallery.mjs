// Viewmodel gallery: every weapon at hip, ADS and mid-reload. Output: shots/vm_<id>.png (3 panels each)
import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 1 })).newPage();
await page.goto('http://localhost:4173/?autostart=1&debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
await page.evaluate(() => {
  const app = window.app, g = app.game;
  app.loop.stop();
  g.hud.setVisible(false); app.touch.setVisible(false);
  document.querySelector('.hud-fps').style.display = 'none';
  g.rounds.paused = true;
  const p = g.player; p.pos.set(11.5, 0, 12.5); p.prevPos.copy(p.pos); p.yaw = 0; p.pitch = -0.12;
  window.pose = (id, up, mode, t) => {
    const ws = g.weapons;
    ws.vm.setWeapon(id, up);
    for (let k = 0; k < 40; k++) {
      ws.vm.update(1 / 60, { ads: mode === 'ads' ? 1 : 0, bobPhase: 0, bobAmount: 0, sprint: 0, lookDX: 0, lookDY: 0,
        reload: mode === 'reload' ? { style: (window.WEAPONS || {})[id]?.reloadStyle ?? ws.current.def.reloadStyle, t } : null,
        swap: 0, melee: -1, action: -1, throwT: -1, cookT: -1, drink: -1, drinkColor: 0, downed: false, time: 1 });
    }
    g.render(1, 0);
    app.r.render(1);
  };
});
const ids = ['warden', 'hollowpoint', 'chatterbox', 'typewriter', 'fieldmarshal', 'ironside', 'vanguard', 'trench', 'coachgun', 'gravedigger', 'longshot', 'marksman', 'thumper', 'disruptor'];
const styles = { warden: 'mag', hollowpoint: 'cylinder', chatterbox: 'mag', typewriter: 'drum', fieldmarshal: 'clip', ironside: 'mag', vanguard: 'mag', trench: 'pump', coachgun: 'break', gravedigger: 'belt', longshot: 'bolt', marksman: 'mag', thumper: 'break', disruptor: 'mag' };
for (const id of ids) {
  for (const [mode, t] of [['hip', 0], ['ads', 0], ['reload', styles[id] === 'pump' ? 0.5 : 0.42]]) {
    await page.evaluate(([id, mode, t, st]) => { window.WEAPONS = { [id]: { reloadStyle: st } }; window.pose(id, false, mode, t); }, [id, mode, t, styles[id]]);
    await page.screenshot({ path: `shots/vm_${id}_${mode}.png` });
  }
}
await browser.close();
