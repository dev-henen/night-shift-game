import { Input } from './engine/input.js';
import { Audio } from './engine/audio.js';
import { Game, DIFFICULTY } from './game/game.js';
import { Hud } from './game/hud.js';
import { LEVELS } from './levels/index.js';

const $ = (id) => document.getElementById(id);
const SAVE_KEY = 'nightshift.save.v1';

function readSave() {
  try {
    return { unlocked: 1, best: {}, settings: {}, ...JSON.parse(localStorage.getItem(SAVE_KEY) ?? '{}') };
  } catch {
    return { unlocked: 1, best: {}, settings: {} };
  }
}
const save = readSave();
function writeSave() {
  try {
    localStorage.setItem(SAVE_KEY, JSON.stringify(save));
  } catch {
    // Storage unavailable (private mode) — progress just won't persist.
  }
}

const canvas = $('view');
const input = new Input(canvas);
const audio = new Audio();
const hud = new Hud();
const game = new Game(canvas, input, audio, hud);
window.__game = game; // handy for debugging from the console

const settings = { sens: 1, vol: 0.7, diff: 'normal', retro: true, ...save.settings };
function applySettings() {
  input.sensitivity = settings.sens;
  audio.setVolume(settings.vol);
  game.difficulty = DIFFICULTY[settings.diff];
  game.setRetro(settings.retro);
  save.settings = settings;
  writeSave();
}
applySettings();

// --- screens -------------------------------------------------------------------------------------

const SCREENS = ['menu', 'levels', 'controls', 'settings', 'loading', 'pause', 'complete', 'gameover', 'victory'];
let screen = 'menu';
let returnTo = 'menu';
function show(name) {
  screen = name;
  for (const s of SCREENS) $(s).classList.toggle('hidden', s !== name);
  hud.show(name === null || name === 'pause');
  if (name === 'menu') refreshMenu();
  if (name === 'levels') renderLevelCards();
}

function refreshMenu() {
  const next = Math.min(save.unlocked, LEVELS.length);
  $('btn-continue').classList.toggle('hidden', save.unlocked <= 1);
  $('btn-continue').textContent = `Continue — Level ${next}`;
}

function renderLevelCards() {
  const wrap = $('level-cards');
  wrap.innerHTML = '';
  LEVELS.forEach((lv, i) => {
    const b = document.createElement('button');
    b.className = 'level-card';
    const locked = i + 1 > save.unlocked;
    b.disabled = locked;
    const best = save.best[lv.id];
    b.innerHTML = `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${locked ? 'Locked' : lv.name}</span><span class="d">${locked ? 'Clear the previous level' : lv.subtitle}</span><span class="best">${best ? `Best ${best.toLocaleString()}` : ''}</span>`;
    b.onclick = () => startLevel(i);
    wrap.appendChild(b);
  });
}

// --- flow ----------------------------------------------------------------------------------------

let levelIndex = 0;
let loadToken = 0;

async function startLevel(i) {
  audio.unlock();
  levelIndex = i;
  const lv = LEVELS[i];
  show('loading');
  $('load-num').textContent = `LEVEL ${i + 1} OF ${LEVELS.length}`;
  $('load-title').textContent = lv.name;
  $('load-sub').textContent = lv.subtitle;
  $('load-brief').textContent = lv.brief;
  $('load-fill').style.width = '0%';
  $('btn-start').classList.add('hidden');
  $('load-hint').textContent = 'Loading…';
  const token = ++loadToken;
  try {
    await game.load(lv, { onProgress: (p) => { $('load-fill').style.width = `${Math.round(p * 100)}%`; } });
  } catch (err) {
    console.error(err);
    $('load-hint').textContent = `Failed to load: ${err.message}`;
    return;
  }
  if (token !== loadToken) return;
  $('load-fill').style.width = '100%';
  $('load-hint').textContent = 'Click Start — the game captures your mouse. Esc pauses.';
  $('btn-start').classList.remove('hidden');
  $('btn-start').focus();
  if (autostart) begin();
}

function begin() {
  audio.unlock();
  show(null);
  game.start();
  input.lock();
}

async function resume() {
  audio.unlock();
  show(null);
  game.state = 'playing';
  game.clock.update();
  if (!(await input.lock())) {
    // The browser refused (e.g. clicked too soon after Esc) — stay paused.
    game.state = 'paused';
    show('pause');
  }
}

function pause() {
  if (game.state !== 'playing') return;
  game.state = 'paused';
  show('pause');
}

function quitToMenu() {
  loadToken++;
  audio.stopMusic();
  input.unlock();
  game.unload();
  game.state = 'menu';
  show('menu');
}

input.onLockChange = (locked) => {
  if (!locked && game.state === 'playing') pause();
};

game.onStateChange = (state) => {
  input.unlock();
  const lv = LEVELS[levelIndex];
  if (state === 'dead') {
    const tips = [
      'Dodge roll (Space) makes you briefly invulnerable.',
      'Headshots deal more than double damage.',
      'The bat (F) staggers most enemies — great when surrounded.',
      'Thugs keep their distance. Break line of sight to reload.',
      'Enemies drop health more often when you are hurt.',
    ];
    $('gameover-tip').textContent = tips[Math.floor(Math.random() * tips.length)];
    show('gameover');
  }
  if (state === 'complete' || state === 'victory') {
    const r = game.results();
    save.unlocked = Math.max(save.unlocked, Math.min(LEVELS.length, levelIndex + 2));
    save.best[lv.id] = Math.max(save.best[lv.id] ?? 0, r.total);
    writeSave();
    const html = statsHtml(r);
    if (state === 'victory') {
      $('victory-stats').innerHTML = html;
      show('victory');
    } else {
      $('complete-title').textContent = `${lv.name} cleared`;
      $('complete-stats').innerHTML = html;
      $('btn-next').classList.toggle('hidden', levelIndex + 1 >= LEVELS.length);
      show('complete');
    }
  }
};

function statsHtml(r) {
  const t = Math.round(r.time);
  const rows = [
    ['Time', `${Math.floor(t / 60)}:${String(t % 60).padStart(2, '0')}`],
    ['Kills', r.kills],
    ['Headshots', r.headshots],
    ['Accuracy', `${Math.round(r.acc * 100)}%`],
    ['Damage taken', Math.round(r.damageTaken)],
    ['Kill score', r.score.toLocaleString()],
    ['Time bonus', `+${r.timeBonus.toLocaleString()}`],
    ['Accuracy bonus', `+${r.accBonus.toLocaleString()}`],
  ];
  if (r.noDamage) rows.push(['Untouchable', `+${r.noDamage.toLocaleString()}`]);
  return rows.map(([k, v]) => `<span class="k">${k}</span><span class="v">${v}</span>`).join('') +
    `<span class="k total">Total</span><span class="v total">${r.total.toLocaleString()}</span>`;
}

// --- buttons & keys ------------------------------------------------------------------------------

document.addEventListener('click', (e) => {
  const action = e.target.closest('[data-action]')?.dataset.action;
  if (!action) return;
  audio.unlock();
  switch (action) {
    case 'new': startLevel(0); break;
    case 'continue': startLevel(Math.min(save.unlocked, LEVELS.length) - 1); break;
    case 'levels': show('levels'); break;
    case 'controls': show('controls'); break;
    case 'settings': returnTo = screen; show('settings'); break;
    case 'back': show(screen === 'settings' ? returnTo : 'menu'); break;
    case 'resume': resume(); break;
    case 'restart': startLevel(levelIndex); break;
    case 'next': startLevel(levelIndex + 1); break;
    case 'quit': quitToMenu(); break;
    default:
  }
});
$('btn-start').addEventListener('click', begin);
addEventListener('keydown', (e) => {
  if (e.code === 'Enter' && screen === 'loading' && !$('btn-start').classList.contains('hidden')) begin();
});
canvas.addEventListener('click', () => {
  if (game.state === 'playing' && !input.locked) input.lock();
});

// Settings controls
const bindRange = (id, key, fmt) => {
  const el = $(id);
  const out = $(id.replace('set-', 'out-'));
  el.value = settings[key];
  out.textContent = fmt(settings[key]);
  el.addEventListener('input', () => {
    settings[key] = parseFloat(el.value);
    out.textContent = fmt(settings[key]);
    applySettings();
  });
};
bindRange('set-sens', 'sens', (v) => v.toFixed(2));
bindRange('set-vol', 'vol', (v) => `${Math.round(v * 100)}`);
$('set-diff').value = settings.diff;
$('set-diff').addEventListener('change', (e) => { settings.diff = e.target.value; applySettings(); });
$('set-retro').checked = settings.retro;
$('set-retro').addEventListener('change', (e) => { settings.retro = e.target.checked; applySettings(); });

// Dev shortcuts: ?level=N starts that level directly; &auto=1 skips the Start button; &god=1.
const params = new URLSearchParams(location.search);
const autostart = params.get('auto') === '1';
game.god = params.get('god') === '1';
if (params.get('level')) startLevel(Math.max(0, Math.min(LEVELS.length - 1, parseInt(params.get('level'), 10) - 1)));
else show('menu');
