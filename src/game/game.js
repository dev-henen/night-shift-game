import * as THREE from 'three';
import { World, rayCylinder, raySphere } from '../engine/world.js';
import { Effects } from '../engine/effects.js';
import { loadModel, whenIdle, onProgress } from '../engine/assets.js';
import { loadCharacter, makeCharacter } from './characters.js';
import { WEAPONS, loadWeapon, loadBat } from './weapons.js';
import { Player } from './player.js';
import { Enemy, ENEMY_TYPES } from './enemies.js';
import { Boss } from './boss.js';
import { Pickup } from './pickups.js';
import { LevelKit } from '../levels/kit.js';

export const DIFFICULTY = {
  easy: { damage: 0.55, health: 0.8, label: 'Rookie' },
  normal: { damage: 1, health: 1, label: 'Officer' },
  hard: { damage: 1.5, health: 1.25, label: 'Veteran' },
};

const MAX_DT = 1 / 30;

export class Game {
  constructor(canvas, input, audio, hud) {
    this.canvas = canvas;
    this.input = input;
    this.audio = audio;
    this.hud = hud;
    this.renderer = new THREE.WebGLRenderer({ canvas, antialias: false, powerPreference: 'high-performance' });
    this.renderer.shadowMap.enabled = true;
    this.renderer.shadowMap.type = THREE.PCFShadowMap;
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.scene = new THREE.Scene();
    this.camera = new THREE.PerspectiveCamera(70, 1, 0.1, 400);
    this.scene.add(this.camera);
    // Soft fill light riding with the camera so the player never turns into a silhouette.
    this.fill = new THREE.PointLight(0xc8d4ff, 12, 10, 1.2);
    this.fill.position.set(0, 0.5, 0.5);
    this.camera.add(this.fill);
    this.effects = new Effects(this.scene);
    this.world = new World();
    this.state = 'menu';
    this.difficulty = DIFFICULTY.normal;
    this.retro = true;
    this.enemies = [];
    this.projectiles = [];
    this.pickups = [];
    this.shakeAmt = 0;
    this.clock = new THREE.Timer();
    this.projGeo = new THREE.CapsuleGeometry(0.05, 0.5, 2, 6).rotateX(Math.PI / 2);
    this.projMat = new THREE.MeshBasicMaterial({ color: 0xffdd66 });
    addEventListener('resize', () => this.resize());
    this.resize();
    this.renderer.setAnimationLoop(() => this.frame());
  }

  setRetro(on) {
    this.retro = on;
    this.canvas.classList.toggle('retro', on);
    this.resize();
  }

  resize() {
    const w = innerWidth;
    const h = innerHeight;
    this.renderer.setPixelRatio(this.retro ? 0.5 : Math.min(devicePixelRatio, 1.5));
    this.renderer.setSize(w, h, false);
    this.camera.aspect = w / h;
    this.camera.updateProjectionMatrix();
  }

  shake(v) {
    this.shakeAmt = Math.min(1.5, this.shakeAmt + v);
  }

  // --- level lifecycle -----------------------------------------------------------------------------

  async load(level, { onProgress: progress } = {}) {
    this.unload();
    this.level = level;
    this.state = 'loading';
    onProgress((p) => progress?.(p));
    this.world = new World();
    this.kit = new LevelKit(this);

    const enemyKinds = new Set();
    for (const w of level.waves) for (const k of Object.keys(w.enemies ?? {})) enemyKinds.add(k);
    for (const k of level.minions ?? []) enemyKinds.add(k);
    if (level.waves.some((w) => w.boss)) enemyKinds.add('boss');
    const chars = new Set(['player']);
    for (const k of enemyKinds) ENEMY_TYPES[k].model.forEach((m) => chars.add(m));

    const [layout, weaponTpls, bat, medkit, ammoBox, charTemplates] = await Promise.all([
      level.build(this.kit),
      Promise.all(['pistol', 'shotgun', 'rifle', 'makarov'].map(async (id) => [id, await loadWeapon(id)])).then(Object.fromEntries),
      loadBat(),
      loadModel('props/medkit.glb'),
      loadModel('house/box.glb'),
      Promise.all([...chars].map(async (c) => [c, await loadCharacter(c)])).then(Object.fromEntries),
    ]);
    this.charTemplates = charTemplates;
    this.weaponTemplates = weaponTpls;
    this.pickupTemplates = { health: medkit, ammo: ammoBox, ...weaponTpls };
    this.layout = layout;
    this.world.buildNav();
    await whenIdle();

    // Player
    const { makarov, ...playerGuns } = weaponTpls;
    this.player = new Player(this, makeCharacter(this.charTemplates.player), playerGuns, bat);
    this.scene.add(this.player.object);
    this.player.pos.set(layout.playerStart.x, 0, layout.playerStart.z);
    this.player.camYaw = this.player.yaw = layout.playerStart.yaw ?? 0;
    for (const id of level.startWeapons) this.player.give(id);
    this.player.equip(level.startWeapons.at(-1));
    this.player.switchT = 0;
    if (level.flashlight) this.addFlashlight();

    for (const p of layout.pickups ?? []) this.addPickup(p.kind, p, { weapon: p.weapon });
    this.exit = layout.exit;
    this.exitActive = false;

    this.stats = { kills: 0, shots: 0, hits: 0, headshots: 0, score: 0, damageTaken: 0, time: 0 };
    this.combo = 0;
    this.lastKill = -10;
    this.time = 0;
    this.waveIndex = -1;
    this.queue = [];
    this.intermission = 3;
    this.flowT = 0;
    this.world.updateFlow(this.player.pos);

    // Warm up: compile shaders by rendering one frame with everything present.
    this.player.update(0);
    this.renderer.compile(this.scene, this.camera);
    this.hud.clearTransient();
    this.hud.setLevel(level.name, level.objective ?? 'Survive the night');
    this.state = 'ready';
  }

  unload() {
    for (const e of this.enemies) e.dispose();
    for (const p of this.pickups) p.dispose();
    for (const pr of this.projectiles) this.scene.remove(pr.mesh);
    this.enemies = [];
    this.pickups = [];
    this.projectiles = [];
    if (this.player) {
      this.scene.remove(this.player.object);
      Object.values(this.player.gunMeshes).forEach((m) => this.scene.remove(m));
      this.scene.remove(this.player.bat);
      this.player = null;
    }
    if (this.flashlight) {
      this.camera.remove(this.flashlight, this.flashlight.target);
      this.flashlight = null;
    }
    this.kit?.dispose();
    this.kit = null;
    this.beacon = null;
    this.effects.clear();
    this.scene.fog = null;
    this.scene.background = null;
  }

  start() {
    this.state = 'playing';
    this.clock.update();
    this.audio.startMusic(this.level.mood ?? 0);
    this.hud.message(this.level.name.toUpperCase(), this.level.subtitle, 3);
  }

  addFlashlight() {
    const l = new THREE.SpotLight(0xfff1d6, 38, 24, 0.5, 0.5, 1.6);
    l.position.set(0.4, -0.3, 0);
    l.castShadow = true;
    l.shadow.mapSize.set(1024, 1024);
    l.shadow.bias = -0.0005;
    this.camera.add(l);
    l.target.position.set(0.4, -0.3, -5);
    this.camera.add(l.target);
    this.flashlight = l;
  }

  // --- waves -------------------------------------------------------------------------------------

  waveInfo() {
    const waves = this.level?.waves ?? [];
    const alive = this.enemies.filter((e) => e.alive).length;
    if (this.exitActive) return { title: 'AREA CLEAR', sub: 'get to the exit' };
    if (this.waveIndex < 0) return { title: 'GET READY', sub: '' };
    const w = waves[this.waveIndex];
    if (w?.boss) return { title: 'FINAL STAND', sub: '' };
    return { title: `WAVE ${this.waveIndex + 1} / ${waves.length}`, sub: `${alive + this.queue.length} hostiles left` };
  }

  nextWave() {
    this.waveIndex++;
    const waves = this.level.waves;
    if (this.waveIndex >= waves.length) {
      this.levelCleared();
      return;
    }
    const w = waves[this.waveIndex];
    this.queue = [];
    for (const [type, n] of Object.entries(w.enemies ?? {})) for (let i = 0; i < n; i++) this.queue.push(type);
    this.queue.sort(() => Math.random() - 0.5);
    if (w.boss) this.queue.unshift('boss');
    this.spawnT = 1;
    this.audio.play('wave');
    this.hud.message(w.boss ? 'THE CREATURE' : `WAVE ${this.waveIndex + 1}`, w.title ?? '', 2.5);
  }

  updateWaves(dt) {
    if (this.exitActive) return;
    if (this.waveIndex < 0 || (this.queue.length === 0 && !this.enemies.some((e) => e.alive))) {
      this.intermission -= dt;
      if (this.intermission <= 0) {
        this.intermission = 4;
        this.nextWave();
      }
      return;
    }
    const w = this.level.waves[this.waveIndex];
    this.spawnT -= dt;
    const alive = this.enemies.filter((e) => e.alive).length;
    if (this.queue.length && this.spawnT <= 0 && alive < (w.maxAlive ?? 8)) {
      const type = this.queue.shift();
      const at = type === 'boss' ? this.layout.bossSpawn : this.pickSpawn();
      if (at) this.spawnEnemy(type, at.x, at.z);
      else this.queue.push(type);
      this.spawnT = w.interval ?? 0.8 + Math.random() * 0.8;
    }
  }

  pickSpawn(minDist = 13) {
    const p = this.player.pos;
    const camDir = this.camera.getWorldDirection(new THREE.Vector3()).setY(0).normalize();
    const cands = this.layout.spawns
      .map((s) => {
        const dx = s.x - p.x;
        const dz = s.z - p.z;
        const d = Math.hypot(dx, dz);
        const inView = (dx * camDir.x + dz * camDir.z) / (d || 1) > 0.5;
        return { s, d, score: (inView ? 0 : 10) + Math.random() * 8 - Math.abs(d - 22) * 0.2 };
      })
      .filter((c) => c.d >= minDist && this.world.reachable(c.s.x, c.s.z))
      .sort((a, b) => b.score - a.score);
    for (const c of cands.slice(0, 4)) {
      for (let i = 0; i < 6; i++) {
        const x = c.s.x + (Math.random() - 0.5) * 3;
        const z = c.s.z + (Math.random() - 0.5) * 3;
        if (this.world.reachable(x, z)) return { x, z };
      }
    }
    return cands[0]?.s ?? null;
  }

  spawnEnemy(type, x, z) {
    const def = ENEMY_TYPES[type];
    const model = def.model[Math.floor(Math.random() * def.model.length)];
    const tpl = this.charTemplates[model];
    const e = type === 'boss' ? new Boss(this, tpl) : new Enemy(this, type, tpl, def.ranged ? this.weaponTemplates.makarov : null);
    this.scene.add(e.object);
    e.spawnAt(x, z);
    this.enemies.push(e);
    if (type === 'boss') this.hud.boss(e);
    return e;
  }

  spawnMinions(n) {
    const kinds = this.level.minions ?? ['crawler'];
    for (let i = 0; i < n; i++) {
      const at = this.pickSpawn(8);
      if (at) this.spawnEnemy(kinds[i % kinds.length], at.x, at.z);
    }
  }

  levelCleared() {
    this.exitActive = true;
    this.audio.play('clear');
    this.hud.message('AREA CLEAR', 'reach the exit', 3);
    this.hud.objective('Reach the exit beacon');
    this.beacon = this.kit.beacon(this.exit.x, this.exit.z);
  }

  // --- combat ------------------------------------------------------------------------------------

  /** First enemy (head or body) or wall along a ray. */
  hitscan(origin, dir, maxDist = 200) {
    const res = { t: this.world.raycast(origin, dir, maxDist), enemy: null, head: false };
    for (const e of this.enemies) {
      if (!e.alive || e.pos.y < -e.height * 0.6) continue;
      const s = e.scale;
      const head = raySphere(origin, dir, e.headPos, 0.16 * s);
      if (head !== null && head < res.t) Object.assign(res, { t: head, enemy: e, head: true });
      const body = rayCylinder(origin, dir, e.pos.x, e.pos.z, e.def.radius * 0.9, e.pos.y, e.pos.y + e.height * 0.84);
      if (body !== null && body < res.t) Object.assign(res, { t: body, enemy: e, head: false });
    }
    return res;
  }

  damageEnemy(e, dmg, dir, { head, point, melee } = {}) {
    const killed = e.takeDamage(dmg, dir, { head, melee });
    this.hud.hit(killed ? 'kill' : head ? 'head' : '');
    if (!melee) this.audio.play(head ? 'headshot' : 'hit', point ?? e.pos);
    if (killed) this.onKill(e, head);
  }

  onKill(e, head) {
    const s = this.stats;
    s.kills++;
    if (head) s.headshots++;
    this.combo = this.time - this.lastKill < 3 ? Math.min(8, this.combo + 1) : 1;
    this.lastKill = this.time;
    const pts = Math.round(e.def.score * this.combo * (head ? 1.5 : 1));
    s.score += pts;
    if (head) this.hud.toast(`HEADSHOT +${pts}`, '#f2c14e');
    this.effects.blood(e.pos.clone().setY(e.height * 0.7), null, 2);

    if (e.def.boss) {
      for (const o of this.enemies) if (o.alive) o.takeDamage(99999);
      this.queue = [];
      this.hud.boss(null);
      this.shake(1.5);
      this.stats.score += 5000;
      setTimeout(() => this.state === 'playing' && this.victory(), 3500);
      return;
    }
    // Drops: more health when the player is hurt; ammo only matters with non-pistol guns.
    const p = this.player;
    const hasAmmoGuns = p.owned.some((id) => WEAPONS[id].reserve !== Infinity);
    const r = Math.random();
    const healthChance = p.health < 40 ? 0.25 : 0.1;
    const ammoChance = hasAmmoGuns ? 0.28 : 0;
    const extra = e.def.heavy ? 0.3 : 0;
    if (r < healthChance + extra * 0.5) this.addPickup('health', e.pos, { life: 25 });
    else if (r < healthChance + ammoChance + extra) this.addPickup('ammo', e.pos, { life: 25 });
  }

  addPickup(kind, pos, opts = {}) {
    this.pickups.push(new Pickup(this, kind, pos, { ...opts, templates: this.pickupTemplates }));
  }

  spawnProjectile(pos, vel, damage, owner) {
    const mesh = new THREE.Mesh(this.projGeo, this.projMat);
    mesh.position.copy(pos);
    mesh.lookAt(pos.clone().add(vel));
    this.scene.add(mesh);
    this.projectiles.push({ mesh, vel, damage, owner, life: 3 });
  }

  updateProjectiles(dt) {
    const p = this.player;
    this.projectiles = this.projectiles.filter((pr) => {
      pr.life -= dt;
      const step = pr.vel.length() * dt;
      const dir = pr.vel.clone().normalize();
      const from = pr.mesh.position.clone();
      const wall = this.world.raycast(from, dir, step);
      // Player: closest approach of this step's segment to the body axis.
      const hitT = rayCylinder(from, dir, p.pos.x, p.pos.z, 0.4, 0, 1.8);
      if (p.alive && hitT !== null && hitT <= step && hitT < wall) {
        p.damage(pr.damage, pr.owner?.pos ?? from);
        this.scene.remove(pr.mesh);
        return false;
      }
      if (wall <= step) {
        this.effects.sparks(from.addScaledVector(dir, wall), dir.clone().negate());
        this.scene.remove(pr.mesh);
        return false;
      }
      pr.mesh.position.addScaledVector(dir, step);
      if (pr.life <= 0) {
        this.scene.remove(pr.mesh);
        return false;
      }
      return true;
    });
  }

  // --- outcomes ----------------------------------------------------------------------------------

  onPlayerDeath() {
    this.audio.play('death');
    this.hud.message('YOU DIED', '', 3);
    setTimeout(() => {
      if (this.state !== 'playing') return;
      this.state = 'dead';
      this.audio.stopMusic();
      this.onStateChange?.('dead');
    }, 2500);
  }

  results() {
    const s = this.stats;
    const acc = s.shots ? s.hits / s.shots : 0;
    const timeBonus = Math.max(0, Math.round(3000 - s.time * 6));
    const accBonus = Math.round(acc * 2000);
    const noDamage = s.damageTaken < 1 ? 2500 : 0;
    return { ...s, acc, timeBonus, accBonus, noDamage, total: s.score + timeBonus + accBonus + noDamage };
  }

  complete() {
    this.state = 'complete';
    this.audio.stopMusic();
    this.audio.play('clear');
    this.onStateChange?.('complete');
  }

  victory() {
    this.state = 'victory';
    this.audio.stopMusic();
    this.onStateChange?.('victory');
  }

  // --- main loop ---------------------------------------------------------------------------------

  frame() {
    this.clock.update();
    const raw = this.clock.getDelta();
    const dt = Math.min(MAX_DT, raw);
    // Smoothed FPS, shown nowhere but useful from the console / tests.
    this.fpsSample = Math.round(THREE.MathUtils.lerp(this.fpsSample ?? 60, 1 / Math.max(raw, 1e-3), 0.05));
    if (this.state === 'playing') this.update(dt);
    else if (this.player && this.state !== 'loading') this.player.updateCamera(0);
    if (this.state !== 'loading' && this.player) this.render();
    this.input.endFrame();
  }

  update(dt) {
    this.time += dt;
    this.stats.time += dt;
    const p = this.player;
    p.update(dt);

    this.flowT -= dt;
    if (this.flowT <= 0) {
      this.world.updateFlow(p.pos);
      this.flowT = 0.25;
    }
    for (const e of this.enemies) e.update(dt);
    this.enemies = this.enemies.filter((e) => {
      if (!e.alive && e.deadT > 7) {
        e.dispose();
        return false;
      }
      return true;
    });
    this.updateProjectiles(dt);
    this.pickups = this.pickups.filter((pk) => {
      const keep = pk.update(dt);
      if (!keep) pk.dispose();
      return keep;
    });
    if (p.alive) this.updateWaves(dt);
    if (this.time - this.lastKill > 3) this.combo = 0;

    if (this.exitActive && p.alive) {
      if (Math.hypot(p.pos.x - this.exit.x, p.pos.z - this.exit.z) < 2.5) this.complete();
      if (this.beacon) this.beacon.update(dt);
    }

    const cam = this.camera;
    const aim = this.hitscan(cam.position, cam.getWorldDirection(new THREE.Vector3()), 120);
    this.aimEnemy = aim.enemy;

    this.kit.update?.(dt, this);
    this.effects.update(dt);
    this.hud.update(dt, this);
    const right = new THREE.Vector3(-Math.cos(p.camYaw), 0, Math.sin(p.camYaw));
    this.audio.setListener(p.pos.x, p.pos.z, right.x, right.z);
  }

  render() {
    const cam = this.camera;
    const saved = cam.position.clone();
    if (this.shakeAmt > 0.001) {
      const s = this.shakeAmt * 0.12;
      cam.position.x += (Math.random() - 0.5) * s;
      cam.position.y += (Math.random() - 0.5) * s;
      cam.position.z += (Math.random() - 0.5) * s;
      this.shakeAmt = Math.max(0, this.shakeAmt * 0.9 - 0.01);
    }
    const sun = this.kit?.sun;
    if (sun && this.player) {
      sun.target.position.copy(this.player.pos);
      sun.position.copy(this.player.pos).add(this.kit.sunOffset);
    }
    this.renderer.render(this.scene, cam);
    cam.position.copy(saved);
  }
}
