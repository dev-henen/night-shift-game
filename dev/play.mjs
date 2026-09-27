// Dev helper: boots a level in headless Chromium, lets it run, and screenshots it.
// Usage: node dev/play.mjs <level> <outPrefix> [seconds=6] [script]
//   script: JS evaluated in the page every second, with `g` = the game (e.g. "g.player.camYaw += 0.5")
import { chromium } from 'playwright';

const [, , level = '1', out = 'shot', secs = '6', script = '', extra = ''] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist', '--autoplay-policy=no-user-gesture-required'] });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
const errors = [];
page.on('console', (m) => {
  const t = m.text();
  if (/GPU stall|FBXLoader|\[vite\]|Download the React/.test(t)) return;
  if (m.type() === 'error' || m.type() === 'warning') errors.push(`${m.type()}: ${t}`);
});
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
const t0 = Date.now();
await page.goto(`${process.env.BASE ?? "http://localhost:5173/"}?level=${level}&auto=1&god=${process.env.GOD ?? 1}${extra}`);
await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 90000 }).catch(() => errors.push('timeout: never reached playing'));
if (process.env.BOT) {
  // Test bot: aims at the nearest living enemy's chest and fires.
  await page.evaluate(() => {
    const g = window.__game;
    setInterval(() => {
      const p = g.player;
      if (!p || g.state !== 'playing') return;
      let best = null;
      let bd = 1e9;
      for (const e of g.enemies) {
        if (!e.alive || e.state === 'spawn') continue;
        const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
        if (d < bd) { bd = d; best = e; }
      }
      g.input.mouse.left = false;
      if (!best) return;
      const cam = g.camera.position;
      const tx = best.pos.x - cam.x;
      const tz = best.pos.z - cam.z;
      const ty = best.pos.y + best.height * 0.6 - cam.y;
      p.camYaw = Math.atan2(tx, tz);
      p.camPitch = Math.atan2(ty, Math.hypot(tx, tz));
      g.input.mouse.left = true;
      g.input.mouse.leftPressed = true;
      if (bd < 2.5 && Math.random() < 0.3) g.input.justPressed.add('KeyF');
    }, 120);
  });
}
console.log(`loaded in ${((Date.now() - t0) / 1000).toFixed(1)}s`);
for (let i = 0; i < +secs; i++) {
  if (script) await page.evaluate((s) => { const g = window.__game; new Function('g', s)(g); }, script).catch((e) => errors.push(`script: ${e.message}`));
  await page.waitForTimeout(1000);
  if (i === Math.floor(+secs / 2)) await page.screenshot({ path: `${out}_a.png` });
}
await page.screenshot({ path: `${out}_b.png` });
const info = await page.evaluate(() => {
  const g = window.__game;
  const r = g.renderer.info.render;
  return {
    state: g.state, wave: g.waveIndex, enemies: g.enemies.length, alive: g.enemies.filter((e) => e.alive).length,
    player: g.player && [g.player.pos.x.toFixed(1), g.player.pos.z.toFixed(1), Math.round(g.player.health)],
    calls: r.calls, tris: r.triangles, colliders: g.world.boxes.length,
    fps: g.fpsSample,
  };
});
console.log(JSON.stringify(info));
if (errors.length) console.log(errors.slice(0, 15).join('\n'));
await browser.close();
