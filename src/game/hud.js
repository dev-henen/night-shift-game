import * as THREE from 'three';
import { WEAPONS } from './weapons.js';

const $ = (id) => document.getElementById(id);

export class Hud {
  constructor() {
    this.el = $('hud');
    this.els = {
      levelName: $('level-name'), objective: $('objective'), wave: $('wave'), enemiesLeft: $('enemies-left'),
      boss: $('boss'), bossFill: $('boss-fill'), score: $('score'), combo: $('combo'),
      hpText: $('hp-text'), hpFill: $('hp-fill'), roll: $('roll-ready'),
      slots: $('slots'), weaponName: $('weapon-name'), ammo: $('ammo'), mag: $('mag'), reserve: $('reserve'), reload: $('reload-hint'),
      crosshair: $('crosshair'), hitmarker: $('hitmarker'), dmgDirs: $('dmg-dirs'), vignette: $('vignette'), lowhp: $('lowhp'),
      center: $('center-msg'), toasts: $('toasts'), exit: $('exit-marker'),
    };
    this.hitT = 0;
    this.vignetteT = 0;
    this.messageT = 0;
    this.last = {};
  }

  show(v) {
    this.el.classList.toggle('hidden', !v);
  }

  set(key, el, value, prop = 'textContent') {
    if (this.last[key] === value) return;
    this.last[key] = value;
    el[prop] = value;
  }

  setLevel(name, objective) {
    this.els.levelName.textContent = name;
    this.objective(objective);
  }

  objective(text) {
    this.els.objective.textContent = text;
  }

  message(title, sub = '', dur = 2.5) {
    this.els.center.querySelector('h1').textContent = title;
    this.els.center.querySelector('p').textContent = sub;
    this.els.center.classList.add('show');
    this.messageT = dur;
  }

  toast(text, color = '#fff') {
    const d = document.createElement('div');
    d.className = 'toast';
    d.textContent = text;
    d.style.color = color;
    this.els.toasts.appendChild(d);
    setTimeout(() => d.remove(), 2300);
  }

  weaponUnlocked(id) {
    this.message(WEAPONS[id].name.toUpperCase(), `press ${WEAPONS[id].slot} to equip`, 2.2);
  }

  hit(kind) {
    const h = this.els.hitmarker;
    h.className = kind;
    h.style.opacity = 1;
    this.hitT = kind === 'kill' ? 0.3 : 0.15;
  }

  hurt(amount, angle) {
    this.vignetteT = Math.min(0.8, 0.25 + amount / 40);
    if (angle === null) return;
    const d = document.createElement('div');
    d.className = 'dmg-dir';
    d.style.transform = `rotate(${-angle}rad)`;
    this.els.dmgDirs.appendChild(d);
    requestAnimationFrame(() => { d.style.opacity = 0; });
    setTimeout(() => d.remove(), 700);
  }

  boss(enemy) {
    this.bossEnemy = enemy;
    this.els.boss.classList.toggle('hidden', !enemy);
  }

  clearTransient() {
    this.els.toasts.innerHTML = '';
    this.els.dmgDirs.innerHTML = '';
    this.els.center.classList.remove('show');
    this.els.exit.classList.add('hidden');
    this.boss(null);
    this.messageT = 0;
    this.last = {};
  }

  update(dt, game) {
    const p = game.player;
    const { els } = this;
    if (!p) return;
    const hp = Math.ceil(p.health);
    this.set('hp', els.hpText, String(hp));
    this.set('hpw', els.hpFill.style, `${(p.health / p.maxHealth) * 100}%`, 'width');
    els.lowhp.style.opacity = p.alive && p.health < 30 ? String(1 - p.health / 30) : '0';
    this.set('roll', els.roll.style, p.rollCooldown > 0 ? '0.25' : '1', 'opacity');

    const w = p.weapon;
    const a = p.ammo[p.current];
    this.set('wname', els.weaponName, w.name.toUpperCase());
    this.set('mag', els.mag, String(a.mag));
    this.set('res', els.reserve, a.reserve === Infinity ? '∞' : String(a.reserve));
    els.ammo.classList.toggle('low', a.mag <= Math.ceil(w.mag / 4));
    els.reload.classList.toggle('hidden', !(p.reloadT > 0));
    const slots = p.owned.map((id) => `${WEAPONS[id].slot}:${id === p.current}`).join();
    if (this.last.slots !== slots) {
      this.last.slots = slots;
      els.slots.innerHTML = p.owned.map((id) => `<span class="${id === p.current ? 'on' : ''}">${WEAPONS[id].slot} ${WEAPONS[id].name}</span>`).join('');
    }

    // Crosshair gap follows the current spread.
    const gap = 5 + p.muzzleSpread * 260;
    els.crosshair.style.setProperty('--gap', `${gap.toFixed(1)}px`);
    els.crosshair.classList.toggle('enemy', !!game.aimEnemy);
    els.crosshair.style.opacity = p.alive && p.meleeT < 0 ? '1' : '0.2';

    this.set('score', els.score, game.stats.score.toLocaleString());
    this.set('combo', els.combo, game.combo > 1 ? `x${game.combo} COMBO` : '');

    const wv = game.waveInfo();
    this.set('wave', els.wave, wv.title);
    this.set('left', els.enemiesLeft, wv.sub);
    if (this.bossEnemy) this.set('bossw', els.bossFill.style, `${Math.max(0, this.bossEnemy.hp / this.bossEnemy.maxHp) * 100}%`, 'width');

    this.hitT -= dt;
    if (this.hitT <= 0) els.hitmarker.style.opacity = 0;
    this.vignetteT = Math.max(0, this.vignetteT - dt * 1.5);
    els.vignette.style.opacity = String(this.vignetteT);
    if (this.messageT > 0) {
      this.messageT -= dt;
      if (this.messageT <= 0) els.center.classList.remove('show');
    }

    // Exit marker (projected to screen, clamped to the edges).
    if (game.exit && game.exitActive) {
      const v = new THREE.Vector3(game.exit.x, 2, game.exit.z).project(game.camera);
      const behind = v.z > 1;
      let x = behind ? -v.x : v.x;
      let y = behind ? -v.y : v.y;
      const m = Math.max(Math.abs(x), Math.abs(y));
      if (behind || m > 0.9) { x = (x / m) * 0.9; y = (y / m) * 0.9; }
      els.exit.classList.remove('hidden');
      els.exit.style.left = `${(x * 0.5 + 0.5) * 100}%`;
      els.exit.style.top = `${(-y * 0.5 + 0.5) * 100}%`;
      const dist = Math.round(Math.hypot(game.exit.x - p.pos.x, game.exit.z - p.pos.z));
      this.set('exitd', els.exit.querySelector('em'), `${dist} m`);
    } else {
      els.exit.classList.add('hidden');
    }
  }
}
