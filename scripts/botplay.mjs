// Faster-than-real-time bot playtest. Usage: node scripts/botplay.mjs [map] [difficulty] [maxSimMinutes] [skill 0..1]
import { webkit } from 'playwright';
const [map = 'ravenmoor', diff = 'normal', mins = '20', skill = '0.6'] = process.argv.slice(2);
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 640, height: 300 }, deviceScaleFactor: 1 })).newPage();
const errors = [];
page.on('pageerror', (e) => errors.push(String(e)));
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
await page.goto(`http://localhost:4173/?autostart=1&map=${map}&difficulty=${diff}&quality=low`);
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 60000 });
const res = await page.evaluate(async ({ mins, skill }) => {
  const app = window.app, g = app.game, input = app.input, p = g.player, ws = g.weapons;
  app.loop.stop();
  input.usingTouch = true;
  g.__hits = 0; const origDZ = g.combat.damageZombie.bind(g.combat); g.combat.damageZombie = (...a) => { g.__hits++; return origDZ(...a); };
  const dt = 1 / 60;
  const grid = g.world.grid;
  let target = null, retarget = 0, aimErrY = 0, aimErrP = 0, t = 0;
  const log = [];
  let lastRound = 0, nanCount = 0, maxWalkErr = 0;
  const gauss = () => (Math.random() + Math.random() + Math.random() - 1.5) * 1.15;
  const errDeg = 2.6 - skill * 2.0;
  const stepLimit = mins * 60 * 60;
  const roundTimes = {};
  const dmgLog = { window: 0, chase: 0, attack: 0, other: 0, total: 0 };
  let shots = 0, hits = 0;
  const diag = { steps: 0, target: 0, onTarget: 0, fire: 0, states: {}, mag0: 0 };
  
  window.__dmg = dmgLog;
  for (let step = 0; step < stepLimit && !g.over; step++) {
    t += dt;
    // ---- perception / target selection
    retarget -= dt;
    if (retarget <= 0 || !target || !target.alive) {
      retarget = 0.35 - skill * 0.15;
      let best = null, bd = 1e9;
      for (const z of g.zombies.all()) {
        if (!z.alive || z.state === 'emerge') continue;
        const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z);
        if (d > 26 || !grid.los(p.pos.x, p.pos.z, z.x, z.z)) continue;
        const w = d * (z.state === 'outside' || z.state === 'window' ? 1.4 : 1);
        if (w < bd) { bd = w; best = z; }
      }
      if (best !== target) { aimErrY = (gauss() * errDeg * Math.PI) / 180; aimErrP = (gauss() * errDeg * Math.PI) / 180; }
      target = best;
    }
    input.moveX = 0; input.moveY = 0; input.sprint = false; input.fire = false;
    if (target) {
      const aimHead = skill > 0.5 && Math.hypot(target.x - p.pos.x, target.z - p.pos.z) < 12;
      const pt = aimHead ? target.head : target.neck;
      const dx = pt.x - p.pos.x, dy = pt.y - g.camPos.y, dz = pt.z - p.pos.z;
      const hd = Math.hypot(dx, dz);
      const wantYaw = Math.atan2(-dx, -dz) + aimErrY, wantPitch = Math.atan2(dy, hd) + aimErrP;
      let dyaw = wantYaw - p.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
      const turn = Math.min(1, dt * (6 + skill * 8));
      input.lookDX -= dyaw * turn; input.lookDY -= (wantPitch - p.pitch) * turn;
      aimErrY *= 0.995; aimErrP *= 0.995;
      const onTarget = Math.abs(dyaw) < 0.06 && Math.abs(wantPitch - p.pitch) < 0.06;
      diag.target++; if (onTarget) diag.onTarget++;
      if (onTarget) { input.fire = true; diag.fire++; }
      // kite: back away from close threats, strafe a little
      if (hd < 3.2 && target.state === 'chase') { input.moveY = -1; input.moveX = Math.sin(t * 0.7); }
      if (hd < 1.3 && Math.random() < 0.02) input.press('melee');
    } else {
      // idle: reload, repair the nearest broken window, buy stuff
      if (ws.current && ws.current.mag < ws.current.stats.mag && ws.current.reserve > 0) input.press('reload');
      let goal = null;
      const homeZone = grid.zoneAt(grid.start.i, grid.start.j);
      for (const it of g.interact.list) {
        if (grid.zoneAtPos(it.x, it.z) !== homeZone || !grid.los(p.pos.x, p.pos.z, it.x, it.z)) continue;
        const l = it.label();
        if (!l || l.cant || !it.can()) continue;
        const txt = l.text;
        const want = /Rebuild/.test(txt) || (/^Buy/.test(txt) && ws.slots.length < 2 && g.economy.points > 1500) || (/Ammo/.test(txt) && ws.current && ws.current.reserve < ws.current.stats.reserve * 0.3)
          || (/power/.test(txt)) || (/Ironhide|Quickhands|Rapidfire/.test(txt) && g.economy.points > 4500);
        if (!want) continue;
        const d = Math.hypot(it.x - p.pos.x, it.z - p.pos.z) + (/Rebuild/.test(txt) ? 0 : 6);
        if (!goal || d < goal.d) goal = { it, d };
      }
      if (goal) {
        const dx = goal.it.x - p.pos.x, dz = goal.it.z - p.pos.z;
        const yaw = Math.atan2(-dx, -dz);
        let dyaw = yaw - p.yaw; while (dyaw > Math.PI) dyaw -= 2 * Math.PI; while (dyaw < -Math.PI) dyaw += 2 * Math.PI;
        input.lookDX -= dyaw * 0.2;
        if (Math.hypot(dx, dz) > 0.8) { input.moveY = 1; } else { input.interactHeld = true; }
        // follow the flow field around walls toward the goal (cheap: use direct + slide)
      } else input.interactHeld = false;
    }
    if (target) input.interactHeld = false;
    input.consume('pause');
    diag.steps++; diag.states[ws.state] = (diag.states[ws.state] || 0) + 1; if (ws.current && ws.current.mag === 0) diag.mag0++;
    const magBefore = ws.current ? ws.current.mag : 0;
    const hpBefore = p.hp;
    g.update(dt);
    if (ws.current && ws.current.mag < magBefore) shots += magBefore - ws.current.mag;
    if (p.hp < hpBefore && !p.downed) {
      dmgLog.total++;
      let near = null, nd = 1e9;
      for (const z of g.zombies.all()) { const d = Math.hypot(z.x - p.pos.x, z.z - p.pos.z); if (d < nd) { nd = d; near = z; } }
      if (near) dmgLog[near.window && (near.state === 'window' || near.state === 'attack') && near.x !== undefined && nd > 1.7 ? 'window' : near.state === 'attack' ? 'attack' : 'other']++;
    }
    if ((step & 3) === 0) g.render(1, dt * 4);
    // integrity checks
    for (const z of g.zombies.all()) if (!isFinite(z.x) || !isFinite(z.z)) nanCount++;
    if (!isFinite(p.pos.x)) nanCount++;
    if (g.rounds.round !== lastRound) { roundTimes[g.rounds.round] = +(t / 60).toFixed(1); lastRound = g.rounds.round; }
  }
  return {
    round: g.rounds.round, over: g.over, simMinutes: +(t / 60).toFixed(1), kills: p.stats.kills, head: p.stats.headshots, chip: p.stats.chipKills,
    points: g.economy.points, earned: p.stats.pointsEarned, downs: p.stats.downs, weapons: ws.slots.map((w) => w.name), perks: [...p.perks],
    diag, shots, hitEvents: g.__hits || 0, dmg: dmgLog,
    stuckLog: g.zombies.stuckLog.slice(0, 8), player: [p.pos.x.toFixed(1), p.pos.z.toFixed(1)],
    doors: [...g.world.doors.values()].filter((d) => d.open).length, stuckRespawns: g.zombies.stuckRespawns, nan: nanCount, roundStartMinute: roundTimes,
  };
}, { mins: +mins, skill: +skill });
console.log(JSON.stringify(res));
if (errors.length) console.log('ERRORS', errors.slice(0, 10));
await browser.close();
