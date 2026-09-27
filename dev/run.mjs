// Dev helper: plays a level to completion with an auto-aim bot (god mode) and reports progress.
// Usage: node dev/run.mjs <level> [maxSeconds=240]
import { chromium } from 'playwright';

const [, , level = '1', maxS = '240'] = process.argv;
const browser = await chromium.launch({ args: ['--use-angle=d3d11', '--enable-gpu', '--ignore-gpu-blocklist'] });
const page = await browser.newPage({ viewport: { width: 960, height: 540 } });
const errors = [];
page.on('console', (m) => { if (m.type() === 'error') errors.push(m.text()); });
page.on('pageerror', (e) => errors.push(`pageerror: ${e.message}\n${e.stack}`));
await page.goto(`http://localhost:5173/?level=${level}&auto=1&god=1`);
await page.waitForFunction(() => window.__game?.state === 'playing', null, { timeout: 90000 });
await page.evaluate(() => {
  const g = window.__game;
  const THREE_V = g.camera.position.constructor;
  setInterval(() => {
    const p = g.player;
    if (!p || g.state !== 'playing') return;
    if (g.exitActive) {
      // Walk (teleport in steps) to the exit.
      const dx = g.exit.x - p.pos.x;
      const dz = g.exit.z - p.pos.z;
      const d = Math.hypot(dx, dz);
      p.pos.x += (dx / d) * Math.min(d, 1.5);
      p.pos.z += (dz / d) * Math.min(d, 1.5);
      return;
    }
    let best = null;
    let bd = 1e9;
    const eye = p.pos.clone().setY(1.5);
    for (const e of g.enemies) {
      if (!e.alive || e.state === 'spawn') continue;
      const d = Math.hypot(e.pos.x - p.pos.x, e.pos.z - p.pos.z);
      const vis = g.world.lineOfSight(eye, new THREE_V(e.pos.x, e.height * 0.8, e.pos.z));
      const score = d + (vis ? 0 : 100);
      if (score < bd) { bd = score; best = e; }
    }
    g.input.mouse.left = false;
    if (!best || bd > 100) return;
    const cam = g.camera.position;
    const tx = best.pos.x - cam.x;
    const tz = best.pos.z - cam.z;
    const ty = best.pos.y + best.height * 0.8 - cam.y;
    p.camYaw = Math.atan2(tx, tz);
    p.camPitch = Math.atan2(ty, Math.hypot(tx, tz));
    g.input.mouse.left = true;
    g.input.mouse.leftPressed = true;
    if (bd < 2.5 && Math.random() < 0.3) g.input.justPressed.add('KeyF');
  }, 100);
});
const t0 = Date.now();
let lastKills = -1;
let lastProgress = Date.now();
while ((Date.now() - t0) / 1000 < +maxS) {
  await page.waitForTimeout(5000);
  const s = await page.evaluate(() => {
    const g = window.__game;
    return {
      state: g.state, wave: g.waveIndex, queue: g.queue.length, kills: g.stats.kills, fps: g.fpsSample,
      exit: g.exitActive, player: `${g.player.pos.x.toFixed(1)},${g.player.pos.z.toFixed(1)}`,
      alive: g.enemies.filter((e) => e.alive).map((e) => { const eye = g.player.pos.clone().setY(1.5); const t = e.pos.clone().setY(e.height * 0.6); const dir = t.clone().sub(eye); const len = dir.length(); dir.normalize(); const hit = g.world.raycast(eye, dir, len); const box = g.world.boxes.find((b) => { const r = (b2) => b2; return false; }); return `${e.type}:${e.state}@${e.pos.x.toFixed(1)},${e.pos.y.toFixed(1)},${e.pos.z.toFixed(1)} los=${e.los} ray=${hit === Infinity ? 'clear' : hit.toFixed(1) + '/' + len.toFixed(1)}`; }),
    };
  });
  const t = ((Date.now() - t0) / 1000).toFixed(0);
  console.log(`${t}s p=${s.player} state=${s.state} wave=${s.wave} q=${s.queue} kills=${s.kills} fps=${s.fps} exit=${s.exit} alive=[${s.alive.join(' ')}]`);
  if (s.state === 'complete' || s.state === 'victory') break;
  if (s.kills !== lastKills) { lastKills = s.kills; lastProgress = Date.now(); }
  if (Date.now() - lastProgress > 45000 && !s.exit) { console.log('STUCK: no kills for 45s'); break; }
}
await page.screenshot({ path: process.env.OUT ?? 'run.png' });
if (errors.length) console.log(errors.slice(0, 10).join('\n'));
await browser.close();
