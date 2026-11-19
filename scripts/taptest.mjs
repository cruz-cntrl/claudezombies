// Menu tap reliability: real touch taps (WebKit, iPhone viewport) through title → menu → map select.
import { webkit } from 'playwright';
const browser = await webkit.launch();
const ctx = await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 3, isMobile: true, hasTouch: true });
const page = await ctx.newPage();
await page.goto('http://localhost:4173/?debug=1');
await page.waitForFunction(() => window.app && window.app.state === 'title', null, { timeout: 120000 });
const screen = () => page.evaluate(() => (document.querySelector('#screens .h1')?.textContent || document.querySelector('#screens .title-logo')?.textContent || '').trim() + ' | ' + window.app.state);
const results = [];
// tap the title exactly where the main menu's "Settings" button will appear (ghost-click bait)
await page.waitForTimeout(500);
await page.touchscreen.tap(120, 205);
await page.waitForTimeout(400);
results.push(['after title tap', await screen(), await page.evaluate(() => [...document.querySelectorAll('#screens .btn')].map((b) => b.textContent).join(','))]);
// tap Play
const play = await page.evaluate(() => { const r = [...document.querySelectorAll('#screens .btn')].find((b) => b.textContent === 'Play').getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; });
await page.touchscreen.tap(play[0], play[1]);
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/mapselect.png' });
results.push(['after Play', await screen(), await page.evaluate(() => [...document.querySelectorAll('#screens .card .ct')].map((c) => c.textContent).join(','))]);
// tap the locked/unlocked asylum card, then the grounds card
const cards = await page.evaluate(() => [...document.querySelectorAll('#screens .card')].map((c) => { const r = c.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height - 20, c.className]; }));
await page.touchscreen.tap(cards[1][0], cards[1][1]);
await page.waitForTimeout(300);
results.push(['after asylum card', cards[1][2], await screen()]);
await page.touchscreen.tap(cards[0][0], cards[0][1]);
await page.waitForTimeout(400);
results.push(['after grounds card', await screen(), await page.evaluate(() => document.querySelector('#screens .h1, #screens .h2')?.textContent)]);
for (const r of results) console.log(JSON.stringify(r));
await page.screenshot({ path: 'shots/tap_final.png' });
await browser.close();
