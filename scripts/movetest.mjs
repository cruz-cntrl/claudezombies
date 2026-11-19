// Jump / vault / ladder / tower + zombie-climb checks on the Grounds (simulated input).
import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto('http://localhost:4173/?autostart=1&map=grounds&debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const app = window.app, g = app.game, p = g.player, inp = app.input, log = [];
  app.loop.stop();
  g.invuln = 1e9; g.rounds.paused = true;
  const step = (sec, f) => { for (let i = 0; i < sec * 60; i++) { f?.(); g.update(1 / 60); g.invuln = 1e9; } };
  // 1) jump in place
  let maxY = 0;
  inp.press('jump'); step(1, () => { maxY = Math.max(maxY, p.jumpY); });
  log.push(`jump apex ${maxY.toFixed(2)} m, landed ${p.jumpY === 0}`);
  // 2) vault: find a sandbag/grave cell with floor on both sides along x
  const grid = g.world.grid;
  let spot = null;
  for (let j = 0; j < grid.h && !spot; j++) for (let i = 1; i < grid.w - 1 && !spot; i++) {
    if (grid.vaultable(i, j) && grid.kindAt(i - 1, j) === 1 && grid.kindAt(i + 1, j) === 1 && grid.kindAt(i - 2, j) === 1 && g.world.zoneActive[grid.zoneAt(i - 1, j)]) spot = [i, j];
  }
  if (spot) {
    p.pos.set(spot[0] - 0.75, 0, spot[1] + 0.5); p.prevPos.copy(p.pos); p.yaw = -Math.PI / 2; // face +x
    inp.press('jump'); step(1.2);
    log.push(`vault over cell ${spot}: x ${(spot[0] - 0.75).toFixed(2)} -> ${p.pos.x.toFixed(2)} mode=${p.mode}`);
  } else log.push('no vault spot in the start zone');
  // 3) ladder: walk north into it, climb, step off, walk, come back down
  const L = p.ladders[0];
  p.pos.set(L.bx, 0, L.bz + 1.2); p.prevPos.copy(p.pos); p.yaw = 0; // facing -z (north)
  inp.moveY = 1; step(1.0);
  log.push(`attached: mode=${p.mode} elev=${p.elev.toFixed(2)}`);
  step(3);
  inp.moveY = 0;
  log.push(`after climbing: mode=${p.mode} elev=${p.elev.toFixed(2)} pos=${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}`);
  inp.moveY = 1; step(2); inp.moveY = 0;
  log.push(`walk on platform (rail): pos=${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)} mode=${p.mode} cam=${g.camPos.y.toFixed(2)}`);
  // 4) zombies climb up after you
  g.rounds.paused = false;
  g.zombies.spawn('zombie', 150, 'runner', { x: L.bx + 3, z: L.bz + 4 });
  g.zombies.spawn('zombie', 150, 'runner', { x: L.bx - 3, z: L.bz + 5 });
  g.zombies.spawn('hound', 60, 'sprinter', { x: L.bx + 5, z: L.bz + 2 });
  g.rounds.paused = true;
  const states = [];
  let hpLost = 0; const hp0 = p.hp;
  g.invuln = 0;
  for (let k = 0; k < 14; k++) {
    for (let i = 0; i < 60; i++) { g.update(1 / 60); g.invuln = 0; if (p.hp < hp0) hpLost = hp0 - p.hp; }
    states.push([...g.zombies.all()].filter((z) => z.alive).map((z) => `${z.type[0]}:${z.state}@${z.elev.toFixed(1)}`).join(' '));
  }
  log.push('zombies over 14 s: ' + states.filter((_, i) => i % 3 === 0).join(' | '));
  log.push(`player hp lost on tower: ${hpLost.toFixed(0)} downed=${p.downed}`);
  // 5) come down
  g.invuln = 1e9; for (const z of g.zombies.all()) z.active = false; g.update(1 / 60);
  p.pos.set(L.tx, 0, L.tz); p.prevPos.copy(p.pos); p.yaw = Math.PI; // facing +z (south, toward ladder opening)
  inp.moveY = 1; step(3.6); inp.moveY = 0; // facing away from the ladder, forward = down
  log.push(`down: mode=${p.mode} elev=${p.elev.toFixed(2)} pos=${p.pos.x.toFixed(2)},${p.pos.z.toFixed(2)}`);
  return log;
});
console.log(out.join('\n'));
if (errors.length) console.log('ERRORS', errors.slice(0, 5));
await browser.close();
