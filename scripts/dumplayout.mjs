// Print part of a map layout: node scripts/dumplayout.mjs <map> x0 y0 x1 y1
import { webkit } from 'playwright';
const [map, x0, y0, x1, y1] = process.argv.slice(2);
const browser = await webkit.launch();
const page = await (await browser.newContext()).newPage();
await page.goto(`http://localhost:4173/?map=${map}&screen=menu`);
await page.waitForFunction(() => window.app && window.app.backdrop, null, { timeout: 120000 });
const rows = await page.evaluate(([x0, y0, x1, y1]) => window.app.backdrop.def.layout.slice(+y0, +y1 + 1).map((r, k) => String(+y0 + k).padStart(3) + ' ' + r.slice(+x0, +x1 + 1)), [x0, y0, x1, y1]);
console.log('    ' + Array.from({ length: x1 - x0 + 1 }, (_, i) => String((+x0 + i) % 10)).join(''));
console.log(rows.join('\n'));
await browser.close();
