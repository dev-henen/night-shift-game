// Dev helper: FPS at full resolution for different anisotropy levels.
import { chromium } from 'playwright';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(`http://localhost:5173/?level=${process.argv[2] ?? 1}&auto=1&god=1`);
await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 90000 });
await page.evaluate(() => { const g = window.__game; g.adaptResolution = () => {}; g.resScale = +(new URLSearchParams(location.search).get('s') ?? 1); g.resize(); g.player.camYaw = 0; g.update = function () {}; });
const measure = () => page.evaluate(() => new Promise((res) => { let n = 0; const t0 = performance.now(); const f = () => { n++; if (performance.now() - t0 < 3000) requestAnimationFrame(f); else res(Math.round(n / 3)); }; requestAnimationFrame(f); }));
for (const a of [8, 4, 1]) {
  await page.evaluate(async (a) => { const m = await import('/src/engine/assets.js'); m.setTextureQuality({ anisotropy: a }); }, a);
  await page.waitForTimeout(1000);
  console.log('aniso', a, 'fps', await measure());
}
for (const sc of [1, 0.75, 0.5]) {
  await page.evaluate((sc) => { const g = window.__game; g.resScale = sc; g.resize(); }, sc);
  await page.waitForTimeout(800);
  console.log('scale', sc, 'fps', await measure());
}
await page.evaluate(() => { const g = window.__game; g.renderer.shadowMap.enabled = false; g.scene.traverse((o) => { if (o.material) [].concat(o.material).forEach((m) => { m.needsUpdate = true; }); }); });
await page.waitForTimeout(800);
console.log('scale 0.5 no shadows fps', await measure());
await browser.close();
