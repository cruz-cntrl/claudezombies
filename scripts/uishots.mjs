// In-game HUD + touch controls and the pause screen (Grounds), iPhone 16 landscape.
import { webkit } from 'playwright';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 }, deviceScaleFactor: 2, isMobile: true, hasTouch: true })).newPage();
await page.goto('http://localhost:4173/?autostart=1&map=grounds&safe=1');
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
await page.waitForTimeout(1500);
await page.screenshot({ path: 'shots/ui_ingame_grounds.png' });
await page.evaluate(() => { const g = window.app.game; g.world.openDoor('1'); g.world.openDoor('3'); window.app.pause(); });
await page.waitForTimeout(400);
await page.screenshot({ path: 'shots/ui_pause_grounds.png' });
await browser.close();
