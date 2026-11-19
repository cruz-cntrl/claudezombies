// Layout editor: open from pause, drag FIRE + the points counter, try to drop a button into the
// reserved corner, Done, check it persisted across a reload. Screenshots → shots/le_*.png
import { webkit } from 'playwright';
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/?autostart=1&map=grounds&safe=1&debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
await page.waitForTimeout(800);
await page.evaluate(() => window.app.pause());
await page.waitForTimeout(300);
await page.screenshot({ path: 'shots/le_pause.png' });
const btn = await page.evaluate(() => { const b = [...document.querySelectorAll('#screens .btn')].find((x) => x.textContent === 'Customize layout').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
await page.touchscreen.tap(btn[0], btn[1]);
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/le_editor.png' });
const handle = (label) => page.evaluate((label) => { const h = [...document.querySelectorAll('.le-handle')].find((x) => x.textContent === label); const r = h.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, label);
const drag = async (from, to) => { await page.mouse.move(from[0], from[1]); await page.mouse.down(); for (let k = 1; k <= 8; k++) await page.mouse.move(from[0] + (to[0] - from[0]) * k / 8, from[1] + (to[1] - from[1]) * k / 8); await page.mouse.up(); };
await drag(await handle('FIRE'), [600, 300]);
await drag(await handle('Points'), [400, 40]);
await drag(await handle('JUMP'), [835, 385]); // straight into the reserved corner
await page.waitForTimeout(200);
await page.screenshot({ path: 'shots/le_dragged.png' });
const info = await page.evaluate(() => {
  const r = window.app.touch['buttons'].jump.getBoundingClientRect(), z = window.__layoutReserved = (() => { const p = document.getElementById('reserved-zone').getBoundingClientRect(); return p; })();
  return { jumpRect: [r.left, r.top, r.right, r.bottom].map(Math.round), reserved: [z.left, z.top].map(Math.round), overlap: r.right > z.left && r.bottom > z.top, saved: Object.keys(window.save.settings.hudLayout) };
});
console.log(JSON.stringify(info));
const done = await page.evaluate(() => { const b = [...document.querySelectorAll('.le-bar .btn')].find((x) => x.textContent === 'Done').getBoundingClientRect(); return [b.x + b.width / 2, b.y + b.height / 2]; });
await page.touchscreen.tap(done[0], done[1]);
await page.waitForTimeout(300);
console.log('after done:', await page.evaluate(() => [window.app.state, !!document.querySelector('.layout-editor'), document.querySelector('#screens .h1')?.textContent]));
await page.evaluate(() => window.app.resume());
await page.waitForTimeout(500);
await page.screenshot({ path: 'shots/le_ingame.png' });
// persistence
await page.reload();
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
await page.waitForTimeout(500);
console.log('after reload fire at:', await page.evaluate(() => { const r = window.app.touch['buttons'].fire.getBoundingClientRect(); return [Math.round(r.left + r.width / 2), Math.round(r.top + r.height / 2)]; }));
await browser.close();
