// Triangle budget per world material key (debug): node scripts/tricount.mjs <map>
import { webkit } from 'playwright';
const map = process.argv[2] || 'grounds';
const browser = await webkit.launch();
const page = await (await browser.newContext({ viewport: { width: 852, height: 393 } })).newPage();
await page.goto(`http://localhost:4173/?autostart=1&debug=1&map=${map}`);
await page.waitForFunction(() => window.app && window.app.state === 'playing', null, { timeout: 120000 });
const out = await page.evaluate(() => {
  const res = {}; let total = 0, meshes = 0;
  window.app.game.world.group.traverse((o) => {
    if (!o.geometry) return;
    meshes++;
    const g = o.geometry; const n = g.index ? g.index.count / 3 : g.attributes.position.count / 3;
    const k = o.name || o.type; res[k] = (res[k] || 0) + Math.round(n); total += n;
  });
  const roof = window.app.game.world.group.children.find((o) => o.name === 'plain:roof');
  return { total: Math.round(total), meshes, roof: roof ? JSON.stringify(roof.geometry.boundingBox) : 'none', top: Object.entries(res).sort((a, b) => b[1] - a[1]).slice(0, 16) };
});
console.log(JSON.stringify(out));
await browser.close();
