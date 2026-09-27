// Dev helper: screenshots the menu, level select and briefing screens.
import { chromium } from 'playwright';
const out = process.argv[2];
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
page.on('pageerror', (e) => console.log('pageerror', e.message));
await page.goto('http://localhost:5173/');
await page.waitForTimeout(1500);
await page.screenshot({ path: `${out}_menu.png` });
await page.click('[data-action=levels]');
await page.waitForTimeout(300);
await page.screenshot({ path: `${out}_levels.png` });
await page.click('[data-action=back]');
await page.click('[data-action=new]');
await page.waitForSelector('#btn-start:not(.hidden)', { timeout: 60000 });
await page.screenshot({ path: `${out}_brief.png` });
await browser.close();
