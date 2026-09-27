// Dev helper: checks keyboard-only and touchscreen controls in headless Chromium.
// Usage: node dev/input-test.mjs <outPrefix>
import { chromium } from 'playwright';

const out = process.argv[2] ?? 'input';
const base = process.env.BASE ?? 'http://localhost:5173/';
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const errors = [];
const state = (page) => page.evaluate(() => {
  const g = window.__game;
  const p = g.player;
  return { x: +p.pos.x.toFixed(2), z: +p.pos.z.toFixed(2), yaw: +p.camYaw.toFixed(2), pitch: +p.camPitch.toFixed(2), shots: g.stats.shots, weapon: p.current, state: g.state, aim: +p.zoom.toFixed(2), roll: p.rollCooldown > 0 };
});
const check = (label, ok, detail) => console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  ${detail ?? ''}`);

// --- keyboard only -------------------------------------------------------------------------------
{
  const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?level=3&god=1`);
  await page.waitForSelector('#btn-start:not(.hidden)', { timeout: 60000 });
  await page.keyboard.press('Enter'); // Start with the keyboard
  await page.waitForFunction(() => window.__game.state === 'playing');
  const s0 = await state(page);
  await page.keyboard.down('ArrowUp');
  await page.waitForTimeout(700);
  await page.keyboard.up('ArrowUp');
  const s1 = await state(page);
  check('ArrowUp moves forward', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, JSON.stringify([s0.x, s0.z, s1.x, s1.z]));
  await page.keyboard.down('ArrowLeft');
  await page.waitForTimeout(400);
  await page.keyboard.up('ArrowLeft');
  const s2 = await state(page);
  check('ArrowLeft turns', s2.yaw > s1.yaw + 0.3, `${s1.yaw} -> ${s2.yaw}`);
  await page.keyboard.down('PageUp');
  await page.waitForTimeout(300);
  await page.keyboard.up('PageUp');
  const s3 = await state(page);
  check('PageUp looks up', s3.pitch > s2.pitch, `${s2.pitch} -> ${s3.pitch}`);
  await page.keyboard.press('KeyJ');
  await page.waitForTimeout(200);
  const s4 = await state(page);
  check('J fires', s4.shots > s3.shots, `${s3.shots} -> ${s4.shots}`);
  await page.keyboard.press('Tab');
  await page.waitForTimeout(400);
  const s5 = await state(page);
  check('Tab switches weapon', s5.weapon !== s4.weapon, `${s4.weapon} -> ${s5.weapon}`);
  await page.keyboard.press('KeyP');
  await page.waitForTimeout(200);
  check('P pauses', (await state(page)).state === 'paused');
  await page.keyboard.press('ArrowDown');
  const focused = await page.evaluate(() => document.activeElement?.dataset?.action);
  check('Arrow keys move menu focus', focused === 'restart', `focused=${focused}`);
  await page.keyboard.press('ArrowUp');
  await page.keyboard.press('Enter'); // Resume button
  await page.waitForTimeout(500);
  check('Enter on Resume resumes', (await state(page)).state === 'playing');
  await page.screenshot({ path: `${out}_keys.png` });
  await page.close();
}

// --- touch ---------------------------------------------------------------------------------------
{
  const ctx = await browser.newContext({ viewport: { width: 844, height: 390 }, hasTouch: true, isMobile: true, deviceScaleFactor: 2 });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => errors.push(e.message));
  await page.goto(`${base}?level=1&god=1`);
  await page.waitForSelector('#btn-start:not(.hidden)', { timeout: 60000 });
  await page.tap('#btn-start');
  await page.waitForFunction(() => window.__game.state === 'playing');
  const visible = await page.evaluate(() => !document.getElementById('touch').classList.contains('hidden') && document.body.classList.contains('touch'));
  check('touch controls shown', visible);
  const cdp = await ctx.newCDPSession(page);
  const touch = (type, pts) => cdp.send('Input.dispatchTouchEvent', { type, touchPoints: pts.map(([x, y], i) => ({ x, y, id: i + 1 })) });

  const s0 = await state(page);
  // Left thumb: joystick pushed up.
  await touch('touchStart', [[150, 260]]);
  for (let i = 1; i <= 6; i++) { await touch('touchMove', [[150, 260 - i * 8]]); await page.waitForTimeout(16); }
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${out}_touch.png` });
  await touch('touchEnd', []);
  const s1 = await state(page);
  check('joystick moves player', Math.hypot(s1.x - s0.x, s1.z - s0.z) > 1, JSON.stringify([s0.x, s0.z, s1.x, s1.z]));
  // Right thumb: drag to look.
  await touch('touchStart', [[560, 200]]);
  for (let i = 1; i <= 8; i++) { await touch('touchMove', [[560 - i * 15, 200]]); await page.waitForTimeout(16); }
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const s2 = await state(page);
  check('drag right side looks', Math.abs(s2.yaw - s1.yaw) > 0.1, `${s1.yaw} -> ${s2.yaw}`);
  // Fire button.
  const fire = await page.locator('.tbtn.fire').boundingBox();
  await touch('touchStart', [[fire.x + fire.width / 2, fire.y + fire.height / 2]]);
  await page.waitForTimeout(150);
  await touch('touchEnd', []);
  await page.waitForTimeout(100);
  const s3 = await state(page);
  check('FIRE button shoots', s3.shots > s2.shots, `${s2.shots} -> ${s3.shots}`);
  // Aim toggle and roll.
  await page.locator('.tbtn.aim').tap();
  await page.waitForTimeout(400);
  check('AIM toggles zoom', (await state(page)).aim > 0.5);
  await page.locator('.tbtn.roll').tap();
  await page.waitForTimeout(100);
  check('ROLL button dodges', (await state(page)).roll);
  await page.locator('.tbtn.pause').tap();
  await page.waitForTimeout(200);
  check('pause button pauses', (await state(page)).state === 'paused');
  await page.screenshot({ path: `${out}_touchpause.png` });
  await page.locator('[data-action=resume]').tap();
  await page.waitForTimeout(300);
  check('resume on touch', (await state(page)).state === 'playing');
  await page.screenshot({ path: `${out}_touch2.png` });
  await ctx.close();
}
if (errors.length) console.log('errors:\n' + errors.join('\n'));
await browser.close();
