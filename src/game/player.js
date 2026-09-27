import * as THREE from 'three';
import { WEAPONS, MELEE, makeWeaponMesh } from './weapons.js';
import { instance } from '../engine/assets.js';

const WALK = 4.4;
const SPRINT = 7;
const AIM_WALK = 2.8;
const RADIUS = 0.35;
const ROLL_TIME = 0.42;
const ROLL_SPEED = 10.5;

const _v = new THREE.Vector3();
const _v2 = new THREE.Vector3();
const _q = new THREE.Quaternion();
const _e = new THREE.Euler();
const _m = new THREE.Matrix4();
const UP = new THREE.Vector3(0, 1, 0);

export class Player {
  constructor(game, character, weaponTemplates, batTemplate) {
    this.game = game;
    Object.assign(this, character); // object, body, model, rig, height
    this.pos = this.object.position;
    this.vel = new THREE.Vector3();
    this.yaw = 0;
    this.camYaw = 0;
    this.camPitch = -0.1;
    this.maxHealth = 100;
    this.health = 100;
    this.alive = true;
    this.phase = 0;
    this.time = 0;
    this.aimBlend = 1;
    this.zoom = 0;
    this.recoil = 0;
    this.fireCooldown = 0;
    this.reloadT = 0;
    this.switchT = 0;
    this.meleeT = -1;
    this.meleeCooldown = 0;
    this.meleeHit = false;
    this.rollT = 0;
    this.rollCooldown = 0;
    this.rollDir = new THREE.Vector3();
    this.hurtT = 0;
    this.deadT = 0;
    this.spreadBloom = 0;
    this.target = new THREE.Vector3();
    this.camDist = 3.2;

    this.owned = [];
    this.ammo = {};
    this.current = null;
    this.gunMeshes = {};
    for (const [id, tpl] of Object.entries(weaponTemplates)) {
      const mesh = makeWeaponMesh(id, tpl);
      mesh.visible = false;
      game.scene.add(mesh);
      this.gunMeshes[id] = mesh;
    }
    this.bat = instance(batTemplate);
    this.bat.visible = false;
    game.scene.add(this.bat);

    this.flashlight = null;
  }

  get weapon() {
    return WEAPONS[this.current];
  }

  give(id, ammo) {
    const w = WEAPONS[id];
    if (!this.owned.includes(id)) {
      this.owned.push(id);
      this.owned.sort((a, b) => WEAPONS[a].slot - WEAPONS[b].slot);
      this.ammo[id] = { mag: w.mag, reserve: w.reserve === Infinity ? Infinity : (ammo ?? w.reserve) };
      this.equip(id);
      return true;
    }
    if (w.reserve !== Infinity) this.ammo[id].reserve += ammo ?? w.pickupAmmo;
    return false;
  }

  equip(id) {
    if (!this.owned.includes(id) || id === this.current) return;
    if (this.current) this.lastWeapon = this.current;
    this.current = id;
    this.reloadT = 0;
    this.switchT = 0.3;
    this.game.audio.play('switch');
    for (const [k, m] of Object.entries(this.gunMeshes)) m.visible = k === id;
  }

  addAmmoPack() {
    // Ammo packs top up every owned non-pistol weapon.
    let any = false;
    for (const id of this.owned) {
      const w = WEAPONS[id];
      if (w.reserve === Infinity) continue;
      this.ammo[id].reserve += w.pickupAmmo;
      any = true;
    }
    return any;
  }

  heal(n) {
    if (this.health >= this.maxHealth) return false;
    this.health = Math.min(this.maxHealth, this.health + n);
    return true;
  }

  damage(amount, from) {
    if (!this.alive || this.rollT > 0 || this.game.god) return;
    amount *= this.game.difficulty.damage;
    this.health -= amount;
    this.hurtT = 0.25;
    this.game.stats.damageTaken += amount;
    this.game.audio.play('hurt');
    this.game.shake(0.25 + amount / 60);
    this.game.hud.hurt(amount, from ? Math.atan2(from.x - this.pos.x, from.z - this.pos.z) - this.camYaw : null);
    this.game.effects.blood(_v.copy(this.pos).setY(1.3), null, 0.6);
    if (this.health <= 0) {
      this.health = 0;
      this.alive = false;
      this.deadT = 0;
      for (const m of Object.values(this.gunMeshes)) m.visible = false;
      this.game.onPlayerDeath();
    }
  }

  // --- per-frame ------------------------------------------------------------------------------

  update(dt) {
    this.time += dt;
    const { input } = this.game;
    if (!this.alive) {
      this.deadT += dt;
      this.body.rotation.x = -Math.min(1, this.deadT * 2) * Math.PI / 2;
      this.body.position.y = Math.min(1, this.deadT * 2) * 0.15;
      this.rig.pose({ move: { x: 0, z: 0 }, phase: 0, time: this.time, attack: -1, dead: true });
      this.updateCamera(dt);
      return;
    }

    // Look
    const sens = 0.0022 * input.sensitivity * (this.zoom > 0.5 ? 0.6 : 1);
    this.camYaw -= input.mouse.dx * sens;
    this.camPitch -= input.mouse.dy * sens;
    // Keyboard look (arrow keys turn, PageUp/PageDown or I/K tilt).
    const kl = input.keyLook();
    const turnRate = 2.6 * input.sensitivity * (this.zoom > 0.5 ? 0.5 : 1);
    this.camYaw -= kl.x * turnRate * dt;
    this.camPitch += kl.y * turnRate * 0.6 * dt;
    if (input.lastLook !== 'mouse') this.aimAssist(dt, input.fireHeld() || input.aimHeld());
    this.camPitch = THREE.MathUtils.clamp(this.camPitch, -1.1, 0.75);

    // Timers
    this.fireCooldown -= dt;
    this.meleeCooldown -= dt;
    this.rollCooldown -= dt;
    this.switchT = Math.max(0, this.switchT - dt);
    this.hurtT = Math.max(0, this.hurtT - dt);
    this.recoil = Math.max(0, this.recoil - dt * 6);
    this.spreadBloom = Math.max(0, this.spreadBloom - dt * 2.5);

    // Weapon switching
    for (const id of this.owned) if (input.pressed(`Digit${WEAPONS[id].slot}`)) this.equip(id);
    if (input.actionPressed('lastWeapon') && this.lastWeapon) this.equip(this.lastWeapon);
    const cycle = input.mouse.wheel || (input.actionPressed('nextWeapon') ? 1 : 0);
    if (cycle) {
      const i = this.owned.indexOf(this.current);
      this.equip(this.owned[(i + cycle + this.owned.length) % this.owned.length]);
    }

    // Movement
    const ax = input.moveAxis();
    const fwd = _v.set(Math.sin(this.camYaw), 0, Math.cos(this.camYaw));
    const right = _v2.set(-Math.cos(this.camYaw), 0, Math.sin(this.camYaw));
    const wish = new THREE.Vector3().addScaledVector(fwd, ax.z).addScaledVector(right, ax.x);
    if (wish.lengthSq() > 1) wish.normalize();
    const aiming = input.aimHeld() && this.rollT <= 0;
    const sprinting = input.sprintHeld() && ax.z > 0.3 && !aiming && this.meleeT < 0;
    this.zoom = THREE.MathUtils.damp(this.zoom, aiming ? 1 : 0, 12, dt);

    if (input.actionPressed('roll') && this.rollCooldown <= 0 && this.rollT <= 0) {
      this.rollT = ROLL_TIME;
      this.rollCooldown = 0.85;
      this.rollDir.copy(wish.lengthSq() > 0.01 ? wish : fwd.clone().negate()).normalize();
      this.reloadT = 0;
      this.game.audio.play('dodge');
    }

    if (this.rollT > 0) {
      this.rollT -= dt;
      const k = this.rollT / ROLL_TIME;
      this.vel.copy(this.rollDir).multiplyScalar(ROLL_SPEED * (0.4 + 0.6 * k));
    } else {
      const speed = sprinting ? SPRINT : aiming ? AIM_WALK : WALK;
      const target = wish.multiplyScalar(speed);
      const accel = 1 - Math.exp(-dt * 12);
      this.vel.lerp(target, accel);
    }
    this.pos.addScaledVector(this.vel, dt);
    this.game.world.collide(this.pos, RADIUS);

    const speedNow = Math.hypot(this.vel.x, this.vel.z);
    const prevPhase = this.phase;
    this.phase += (speedNow * dt / 1.5) * Math.PI * 2;
    if (Math.floor(prevPhase / Math.PI) !== Math.floor(this.phase / Math.PI) && speedNow > 1) this.game.audio.play('step');

    // Aim target: first thing under the crosshair.
    this.updateCamera(dt);
    const cam = this.game.camera;
    const camDir = cam.getWorldDirection(new THREE.Vector3());
    const hit = this.game.hitscan(cam.position, camDir, 200);
    // Nothing under the crosshair (open sky) still needs a finite aim point.
    this.target.copy(cam.position).addScaledVector(camDir, THREE.MathUtils.clamp(hit.t, 4, 200));

    // Face the aim target (or the move direction when sprinting).
    const shoulder = _v.copy(this.pos).setY(1.45);
    const toT = new THREE.Vector3().subVectors(this.target, shoulder);
    let desiredYaw = Math.atan2(toT.x, toT.z);
    if (sprinting && speedNow > 1) desiredYaw = Math.atan2(this.vel.x, this.vel.z);
    if (this.rollT > 0) desiredYaw = Math.atan2(this.rollDir.x, this.rollDir.z);
    this.yaw = dampAngle(this.yaw, desiredYaw, sprinting || this.rollT > 0 ? 10 : 22, dt);
    this.object.rotation.y = this.yaw;
    const aimPitch = Math.atan2(toT.y, Math.hypot(toT.x, toT.z));

    // Actions
    const w = this.weapon;
    const ammo = this.ammo[this.current];
    if (input.actionPressed('melee') && this.meleeCooldown <= 0 && this.rollT <= 0) {
      this.meleeT = 0;
      this.meleeHit = false;
      this.meleeCooldown = MELEE.cooldown;
      this.reloadT = 0;
      this.game.audio.play('swing');
    }
    if (this.meleeT >= 0) {
      this.meleeT += dt / MELEE.time;
      if (!this.meleeHit && this.meleeT >= MELEE.hitAt) {
        this.meleeHit = true;
        this.doMelee();
      }
      if (this.meleeT >= 1) this.meleeT = -1;
    }

    const busy = this.rollT > 0 || this.meleeT >= 0 || this.switchT > 0 || sprinting;
    if (this.reloadT > 0) {
      this.reloadT -= dt;
      if (this.reloadT <= 0) {
        const need = w.mag - ammo.mag;
        const take = Math.min(need, ammo.reserve);
        ammo.mag += take;
        if (ammo.reserve !== Infinity) ammo.reserve -= take;
        this.game.audio.play('reloadDone');
      }
    } else if (input.actionPressed('reload') && ammo.mag < w.mag && ammo.reserve > 0 && !busy) {
      this.startReload();
    }

    const trigger = w.auto ? input.fireHeld() : input.firePressed();
    if (trigger && !busy && this.reloadT <= 0 && this.fireCooldown <= 0) {
      if (ammo.mag > 0) this.fire(w, ammo);
      else if (ammo.reserve > 0) this.startReload();
      else if (input.firePressed()) this.game.audio.play('empty');
    }
    // Auto-switch away from a fully empty weapon.
    if (ammo.mag === 0 && ammo.reserve === 0 && this.reloadT <= 0 && this.fireCooldown < -0.4) this.equip('pistol');

    // Pose
    const toLocal = (v) => ({ x: v.x * Math.cos(this.yaw) - v.z * Math.sin(this.yaw), z: v.x * Math.sin(this.yaw) + v.z * Math.cos(this.yaw) });
    const lm = toLocal(this.vel);
    const reloading = this.reloadT > 0;
    const aimTarget = sprinting || this.rollT > 0 || this.switchT > 0 ? 0 : reloading ? 0.45 : 1;
    this.aimBlend = THREE.MathUtils.damp(this.aimBlend, aimTarget, 14, dt);
    this.rig.pose({
      move: { x: lm.x / WALK, z: lm.z / WALK },
      run: sprinting,
      phase: this.phase,
      time: this.time,
      aim: this.meleeT >= 0 ? 0 : this.aimBlend,
      aimPitch: reloading ? aimPitch - 0.5 : aimPitch,
      twoHanded: w.twoHanded,
      recoil: this.recoil,
      attack: this.meleeT,
      attackStyle: 'swing',
      crouch: this.rollT > 0 ? 1 : 0,
      lean: this.rollT > 0 ? 0.6 : 0,
      hit: this.hurtT * 2,
      headPitch: aimPitch * 0.5,
    });
    this.body.rotation.x = 0;
    this.placeHeldItems(aimPitch);
  }

  /**
   * Aim assist for keyboard and touch players: gently pulls the camera onto the nearest visible
   * enemy close to the crosshair (pitch always, yaw only while firing/aiming).
   */
  aimAssist(dt, engaged) {
    const { game } = this;
    const cam = game.camera.position;
    let best = null;
    let bestScore = Infinity;
    for (const e of game.enemies) {
      if (!e.alive || e.state === 'spawn') continue;
      const tx = e.pos.x - cam.x;
      const tz = e.pos.z - cam.z;
      const dist = Math.hypot(tx, tz);
      if (dist > 35) continue;
      let dy = Math.atan2(tx, tz) - this.camYaw;
      dy = Math.atan2(Math.sin(dy), Math.cos(dy));
      const cone = 0.12 + 1.2 / Math.max(dist, 1); // wider when close
      if (Math.abs(dy) > cone) continue;
      if (!e.los) continue;
      const score = Math.abs(dy) * 10 + dist * 0.05;
      if (score < bestScore) { bestScore = score; best = { e, dy, dist }; }
    }
    if (!best) return;
    const { e, dy, dist } = best;
    const pitch = Math.atan2(e.pos.y + e.height * 0.7 - cam.y, dist);
    this.camPitch += (pitch - this.camPitch) * (1 - Math.exp(-dt * 6));
    if (engaged) this.camYaw += dy * (1 - Math.exp(-dt * 5));
  }

  startReload() {
    this.reloadT = this.weapon.reload;
    this.game.audio.play('reload');
  }

  fire(w, ammo) {
    const { game } = this;
    ammo.mag--;
    this.fireCooldown = w.rate;
    this.recoil = Math.min(1, this.recoil + w.recoil);
    this.camPitch += w.kick * (0.6 + Math.random() * 0.4);
    this.camYaw += (Math.random() - 0.5) * w.kick * 0.6;
    game.shake(w.recoil * 0.12);
    game.audio.play(w.sound);
    game.stats.shots++;

    const gun = this.gunMeshes[this.current];
    gun.updateMatrixWorld(true);
    const muzzle = new THREE.Vector3(0, 0, gun.userData.muzzle).applyMatrix4(gun.matrixWorld);
    game.effects.muzzleFlash(muzzle, w.flash);

    const spread = this.muzzleSpread;
    this.spreadBloom = Math.min(2.5, this.spreadBloom + (w.auto ? 0.35 : 0.6));

    const baseDir = new THREE.Vector3().subVectors(this.target, muzzle).normalize();
    let hitAny = false;
    const hitEnemies = new Map();
    for (let i = 0; i < w.pellets; i++) {
      const dir = baseDir.clone();
      dir.x += (Math.random() - 0.5) * 2 * spread;
      dir.y += (Math.random() - 0.5) * 2 * spread;
      dir.z += (Math.random() - 0.5) * 2 * spread;
      dir.normalize();
      const hit = game.hitscan(muzzle, dir, 160);
      const end = muzzle.clone().addScaledVector(dir, Math.min(hit.t, 160));
      if (i < 4) game.effects.tracer(muzzle, end);
      if (hit.enemy) {
        hitAny = true;
        const e = hit.enemy;
        const rec = hitEnemies.get(e) ?? { damage: 0, head: false, point: end, dir };
        rec.damage += w.damage * (hit.head ? 2.2 : 1);
        rec.head ||= hit.head;
        hitEnemies.set(e, rec);
        game.effects.blood(end, dir.clone().multiplyScalar(-0.3).add(dir), w.pellets > 1 ? 0.4 : 1);
      } else if (hit.t < 160) {
        game.effects.sparks(end, dir.clone().negate());
        if (Math.random() < 0.3) game.audio.play('ricochet', end);
      }
    }
    for (const [e, r] of hitEnemies) game.damageEnemy(e, r.damage, r.dir, { head: r.head, point: r.point, weapon: w.id });
    if (hitAny) game.stats.hits++;
  }

  doMelee() {
    const { game } = this;
    const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
    let hit = false;
    for (const e of game.enemies) {
      if (!e.alive) continue;
      const d = new THREE.Vector3().subVectors(e.pos, this.pos).setY(0);
      const dist = d.length();
      if (dist > MELEE.range + e.def.radius) continue;
      d.normalize();
      if (d.dot(fwd) < MELEE.arc && dist > e.def.radius + 0.4) continue;
      hit = true;
      game.damageEnemy(e, MELEE.damage, d, { melee: true, point: e.pos.clone().setY(1.4), weapon: 'bat' });
      e.knockback(d, 5);
    }
    if (hit) {
      game.audio.play('bonk', this.pos);
      game.shake(0.3);
    }
  }

  placeHeldItems(aimPitch) {
    this.object.updateMatrixWorld(true);
    const hand = this.rig.worldPos('rHand', new THREE.Vector3());
    const fore = this.rig.worldPos('rFore', new THREE.Vector3());
    const gun = this.gunMeshes[this.current];
    const swinging = this.meleeT >= 0;
    gun.visible = this.alive && !swinging;
    if (gun.visible) {
      gun.position.copy(hand);
      // Blend between pointing at the aim target and following the forearm.
      const aimQ = _q.setFromEuler(_e.set(-aimPitch, this.yaw, 0, 'YXZ')).clone();
      const armDir = _v.subVectors(hand, fore).normalize();
      const armQ = new THREE.Quaternion().setFromRotationMatrix(_m.lookAt(new THREE.Vector3(), armDir.negate(), UP));
      gun.quaternion.copy(armQ).slerp(aimQ, this.aimBlend);
      if (this.reloadT > 0) gun.rotateZ(0.6);
    }
    this.bat.visible = swinging;
    if (swinging) {
      const dir = _v.subVectors(hand, fore).normalize();
      this.bat.position.copy(hand);
      this.bat.quaternion.setFromUnitVectors(UP, dir);
      this.bat.translateY(-0.1);
    }
  }

  updateCamera(dt) {
    const cam = this.game.camera;
    const pitch = this.camPitch;
    const yaw = this.camYaw;
    const f3 = new THREE.Vector3(Math.sin(yaw) * Math.cos(pitch), Math.sin(pitch), Math.cos(yaw) * Math.cos(pitch));
    const right = new THREE.Vector3(-Math.cos(yaw), 0, Math.sin(yaw));
    const pivot = new THREE.Vector3(this.pos.x, this.pos.y + 1.7, this.pos.z);
    const shoulder = THREE.MathUtils.lerp(0.85, 0.6, this.zoom);
    const dist = THREE.MathUtils.lerp(3.3, 1.7, this.zoom) + (this.alive ? 0 : 2);
    const shoulderPt = pivot.clone().addScaledVector(right, shoulder);
    // Keep the shoulder point itself out of walls.
    const sideHit = this.game.world.raycast(pivot, right, shoulder + 0.2);
    if (sideHit < shoulder + 0.2) shoulderPt.copy(pivot).addScaledVector(right, Math.max(0, sideHit - 0.25));
    const back = f3.clone().negate();
    const hit = this.game.world.raycast(shoulderPt, back, dist + 0.3);
    const want = Math.min(dist, hit - 0.3);
    // Pull in instantly, ease back out.
    this.camDist = want < this.camDist ? want : THREE.MathUtils.damp(this.camDist, want, 6, dt);
    cam.position.copy(shoulderPt).addScaledVector(back, Math.max(0.2, this.camDist));
    cam.rotation.set(pitch, yaw + Math.PI, 0, 'YXZ');
    cam.fov = THREE.MathUtils.lerp(70, 52, this.zoom);
    cam.updateProjectionMatrix();
  }

  get muzzleSpread() {
    const w = this.weapon;
    const moving = Math.hypot(this.vel.x, this.vel.z) / WALK;
    return w.spread * (1 - this.zoom * 0.55) * (1 + moving * 0.8) + this.spreadBloom * w.spread;
  }
}

function dampAngle(a, b, lambda, dt) {
  let d = b - a;
  while (d > Math.PI) d -= Math.PI * 2;
  while (d < -Math.PI) d += Math.PI * 2;
  return a + d * (1 - Math.exp(-lambda * dt));
}

export { dampAngle };
