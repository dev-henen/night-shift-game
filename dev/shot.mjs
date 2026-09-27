// Dev helper: screenshot a page of the running dev server. Usage: node dev/shot.mjs <path+query> <out.png>
import { chromium } from 'playwright';
const [, , url, out, w = '1280', h = '720'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: +w, height: +h } });
page.on('console', (m) => { if (!/GPU stall|THREE.FBXLoader/.test(m.text())) console.log('[console]', m.type(), m.text()); });
page.on('pageerror', (e) => console.log('[pageerror]', e.message));
await page.goto(`http://localhost:5173/${url}`);
await page.waitForFunction(() => window.__ready, null, { timeout: 60000 }).catch(() => console.log('timeout waiting for __ready'));
await page.waitForTimeout(+(process.env.WAIT || 300));
await page.screenshot({ path: out });
await browser.close();
