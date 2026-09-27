import * as THREE from 'three';
import { makeCharacter } from './characters.js';
import { makeWeaponMesh } from './weapons.js';
import { dampAngle } from './player.js';

// model: one or more character keys (picked at random)
export const ENEMY_TYPES = {
  killer: { model: ['killer'], hp: 70, speed: 3.5, damage: 13, reach: 1.7, attackTime: 1.0, style: 'chop', radius: 0.4, score: 100 },
  slasher: { model: ['killer01'], hp: 60, speed: 4.3, damage: 11, reach: 1.6, attackTime: 0.85, style: 'chop', radius: 0.4, score: 110 },
  crawler: { model: ['monster6', 'monster7'], hp: 42, speed: 5.8, damage: 9, reach: 1.5, attackTime: 0.7, style: 'claw', radius: 0.4, score: 120, zombie: 1, lean: 0.35 },
  thug: { model: ['thug1', 'thug2', 'thug3'], hp: 60, speed: 3.1, damage: 9, reach: 1.5, attackTime: 0.9, style: 'punch', radius: 0.4, score: 150, ranged: { fire: [0.9, 1.7], keep: [7, 14], bulletSpeed: 24, damage: 8, spread: 0.05 } },
  potman: { model: ['manpot'], hp: 110, speed: 3.9, damage: 16, reach: 1.7, attackTime: 0.9, style: 'punch', radius: 0.45, score: 180 },
  brute: { model: ['clown', 'smiles'], hp: 240, speed: 2.9, damage: 26, reach: 2.1, attackTime: 1.3, style: 'slam', radius: 0.55, score: 400, heavy: true },
  hulk: { model: ['monster8'], hp: 650, speed: 3.3, damage: 32, reach: 2.6, attackTime: 1.3, style: 'slam', radius: 0.75, score: 1200, heavy: true, zombie: 0.5 },
};

const _v = new THREE.Vector3();
const _flow = { x: 0, z: 0 };

export class Enemy {
  constructor(game, type, template, gunTemplate) {
    this.game = game;
    this.type = type;
    this.def = ENEMY_TYPES[type] ?? type;
    Object.assign(this, makeCharacter(template));
    this.pos = this.object.position;
    this.vel = new THREE.Vector3();
    this.knock = new THREE.Vector3();
    const hpScale = game.difficulty.health;
    this.maxHp = this.hp = this.def.hp * hpScale;
    this.alive = true;
    this.state = 'spawn';
    this.stateT = 0;
    this.phase = Math.random() * 10;
    this.time = Math.random() * 10;
    this.yaw = 0;
    this.attackT = -1;
    this.attackHit = false;
    this.hitT = 0;
    this.fireT = 1 + Math.random();
    this.strafe = Math.random() < 0.5 ? 1 : -1;
    this.strafeT = 0;
    this.deadT = 0;
    this.speedMul = 0.9 + Math.random() * 0.2;
    this.scale = this.height / 1.8;
    if (gunTemplate) {
      this.gun = makeWeaponMesh('makarov', gunTemplate);
      game.scene.add(this.gun);
    }
  }

  get headPos() {
    return _v.set(this.pos.x, this.pos.y + this.height * 0.9, this.pos.z);
  }

  spawnAt(x, z) {
    this.pos.set(x, -this.height, z);
    this.state = 'spawn';
    this.stateT = 0;
    const p = this.game.player.pos;
    this.yaw = Math.atan2(p.x - x, p.z - z);
    this.object.rotation.y = this.yaw;
    this.game.effects.dust(new THREE.Vector3(x, 0.1, z), 0x2a2622, 25, 1.2);
    this.game.effects.decal(new THREE.Vector3(x, 0, z), 0.9, 0x120c08, 12);
    if (Math.random() < 0.6) this.game.audio.play('growl', this.pos);
  }

  knockback(dir, force) {
    if (this.def.heavy) force *= 0.3;
    this.knock.addScaledVector(dir, force);
  }

  takeDamage(amount, dir, { head, melee } = {}) {
    if (!this.alive) return false;
    this.hp -= amount;
    this.hitT = 0.3;
    // Big hits interrupt attacks (not for heavies unless it's a melee hit).
    const stagger = amount >= this.maxHp * 0.3 || (melee && !this.def.heavy) || (head && !this.def.heavy);
    if (stagger && this.state !== 'spawn') {
      this.state = 'stagger';
      this.stateT = 0;
      this.attackT = -1;
    }
    if (dir) this.knockback(_v.copy(dir).setY(0).normalize(), Math.min(4, amount / 12));
    if (this.hp <= 0) {
      this.die(dir);
      return true;
    }
    return false;
  }

  die(dir) {
    this.alive = false;
    this.state = 'dead';
    this.deadT = 0;
    this.fallDir = dir ? Math.atan2(dir.x, dir.z) - this.yaw : 0;
    if (this.gun) this.gun.visible = false;
    this.game.audio.play('death', this.pos);
    this.game.effects.decal(this.pos, 0.7 * this.scale, 0x3a0000, 25);
  }

  dispose() {
    this.game.scene.remove(this.object);
    if (this.gun) this.game.scene.remove(this.gun);
  }

  update(dt) {
    this.time += dt;
    this.stateT += dt;
    this.hitT = Math.max(0, this.hitT - dt);
    const { player, world } = this.game;

    if (this.state === 'dead') {
      this.deadT += dt;
      const k = Math.min(1, this.deadT * 2.2);
      const e = k * k;
      this.body.rotation.x = -e * Math.PI / 2;
      this.body.position.y = e * 0.12;
      this.pos.addScaledVector(this.knock, dt);
      this.knock.multiplyScalar(Math.max(0, 1 - dt * 5));
      if (this.deadT > 5) this.pos.y -= dt * 0.5;
      this.rig.pose({ move: { x: 0, z: 0 }, phase: 0, time: this.time, attack: -1, dead: true });
      return;
    }

    if (this.state === 'spawn') {
      const k = Math.min(1, this.stateT / 1.1);
      this.pos.y = -this.height * (1 - k) * (1 - k);
      if (Math.random() < 0.3) this.game.effects.burst(this.pos.clone().setY(0.1), { count: 1, color: 0x2a2622, speed: 1.5, size: 0.3, life: 0.6, gravity: 2 });
      this.rig.pose({ move: { x: 0, z: 0 }, phase: 0, time: this.time, attack: -1, zombie: 0.8, lean: -0.2 });
      if (k >= 1) {
        this.pos.y = 0;
        this.state = 'chase';
      }
      return;
    }

    const toP = new THREE.Vector3().subVectors(player.pos, this.pos).setY(0);
    const dist = toP.length();
    toP.divideScalar(dist || 1);
    const eye = this.pos.clone().setY(this.height * 0.85);
    const target = player.pos.clone().setY(1.3);
    // LOS checks are relatively costly; refresh a few times a second.
    if (!this.losT || this.time > this.losT) {
      this.los = world.lineOfSight(eye, target);
      this.losT = this.time + 0.2 + Math.random() * 0.15;
    }

    const move = new THREE.Vector3();
    let speed = this.def.speed * this.speedMul;
    let faceYaw = Math.atan2(toP.x, toP.z);
    const ranged = this.def.ranged;

    if (this.state === 'stagger') {
      speed = 0;
      if (this.stateT > 0.35) this.state = 'chase';
    } else if (this.state === 'attack') {
      speed = 0;
      this.attackT = this.stateT / this.def.attackTime;
      if (!this.attackHit && this.attackT > 0.55) {
        this.attackHit = true;
        const fwd = new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw));
        if (player.alive && dist < this.def.reach + 0.5 && fwd.dot(toP) > 0.3) {
          player.damage(this.def.damage, this.pos);
          this.game.audio.play('hit', player.pos);
        }
      }
      // Slowly track the player during windup only.
      if (this.attackT > 0.45) faceYaw = this.yaw;
      if (this.attackT >= 1) {
        this.state = 'chase';
        this.attackT = -1;
      }
    } else if (player.alive) {
      // chase
      if (dist < this.def.reach && this.los) {
        this.state = 'attack';
        this.stateT = 0;
        this.attackT = 0;
        this.attackHit = false;
      } else if (ranged && this.los && dist < ranged.keep[1] + 4) {
        // Hold distance and strafe while shooting.
        this.strafeT -= dt;
        if (this.strafeT <= 0) {
          this.strafe = -this.strafe;
          this.strafeT = 1 + Math.random() * 2;
        }
        const side = new THREE.Vector3(toP.z, 0, -toP.x).multiplyScalar(this.strafe);
        move.copy(side).multiplyScalar(0.6);
        if (dist < ranged.keep[0]) move.addScaledVector(toP, -1);
        else if (dist > ranged.keep[1]) move.addScaledVector(toP, 1);
        speed *= 0.7;
        this.fireT -= dt;
        if (this.fireT <= 0 && dist < ranged.keep[1] + 4) {
          this.fireT = ranged.fire[0] + Math.random() * (ranged.fire[1] - ranged.fire[0]);
          this.shoot(target);
        }
      } else if (this.los && dist < 18) {
        move.copy(toP);
      } else if (world.flowDir(this.pos, _flow)) {
        move.set(_flow.x, 0, _flow.z);
      } else {
        move.copy(toP);
      }
      if (!(ranged && this.los) && move.lengthSq() > 0.01) faceYaw = Math.atan2(move.x, move.z);
      if (ranged && this.los) faceYaw = Math.atan2(toP.x, toP.z);
    } else {
      speed = 0;
    }

    // Separation from other enemies.
    for (const o of this.game.enemies) {
      if (o === this || !o.alive || o.state === 'spawn') continue;
      const dx = this.pos.x - o.pos.x;
      const dz = this.pos.z - o.pos.z;
      const min = this.def.radius + o.def.radius + 0.15;
      const d2 = dx * dx + dz * dz;
      if (d2 < min * min && d2 > 1e-6) {
        const d = Math.sqrt(d2);
        const push = (min - d) / d;
        move.x += dx * push * 1.5;
        move.z += dz * push * 1.5;
      }
    }
    if (move.lengthSq() > 1) move.normalize();

    const accel = 1 - Math.exp(-dt * 8);
    this.vel.lerp(move.multiplyScalar(speed), accel);
    this.pos.addScaledVector(this.vel, dt);
    this.pos.addScaledVector(this.knock, dt);
    this.knock.multiplyScalar(Math.max(0, 1 - dt * 6));
    world.collide(this.pos, this.def.radius);
    // Keep out of the player.
    const pd = Math.hypot(this.pos.x - player.pos.x, this.pos.z - player.pos.z);
    const minD = this.def.radius + 0.35;
    if (pd < minD && pd > 1e-4) {
      this.pos.x = player.pos.x + ((this.pos.x - player.pos.x) / pd) * minD;
      this.pos.z = player.pos.z + ((this.pos.z - player.pos.z) / pd) * minD;
    }

    this.yaw = dampAngle(this.yaw, faceYaw, 8, dt);
    this.object.rotation.y = this.yaw;

    const sp = Math.hypot(this.vel.x, this.vel.z);
    this.phase += (sp * dt / (1.5 * this.scale)) * Math.PI * 2;
    const cy = Math.cos(this.yaw);
    const sy = Math.sin(this.yaw);
    const lx = (this.vel.x * cy - this.vel.z * sy) / (3.5 * this.scale);
    const lz = (this.vel.x * sy + this.vel.z * cy) / (3.5 * this.scale);
    const aimRanged = ranged && this.los && this.state === 'chase' ? 1 : 0;
    this.rig.pose({
      move: { x: lx, z: lz },
      run: sp > 4.5,
      phase: this.phase,
      time: this.time,
      attack: this.attackT,
      attackStyle: this.def.style,
      zombie: aimRanged ? 0 : (this.def.zombie ?? 0),
      lean: this.def.lean ?? 0,
      hit: this.hitT * 2.5,
      aim: aimRanged,
      aimPitch: Math.atan2(1.3 - this.height * 0.8, Math.max(1, dist)),
    });

    if (this.gun) {
      this.object.updateMatrixWorld(true);
      this.rig.worldPos('rHand', this.gun.position);
      this.gun.rotation.set(0, this.yaw, 0);
      this.gun.visible = true;
    }
  }

  shoot(target) {
    const { game } = this;
    const muzzle = this.gun ? this.gun.position.clone().add(new THREE.Vector3(Math.sin(this.yaw), 0, Math.cos(this.yaw)).multiplyScalar(0.2)) : this.pos.clone().setY(1.4);
    const r = this.def.ranged;
    // Lead slightly toward where the player is moving, with inaccuracy.
    const aim = target.clone().addScaledVector(game.player.vel, 0.15);
    const dir = aim.sub(muzzle).normalize();
    dir.x += (Math.random() - 0.5) * r.spread * 2;
    dir.y += (Math.random() - 0.5) * r.spread;
    dir.z += (Math.random() - 0.5) * r.spread * 2;
    dir.normalize();
    game.spawnProjectile(muzzle, dir.multiplyScalar(r.bulletSpeed), r.damage, this);
    game.effects.muzzleFlash(muzzle, 0.35);
    game.audio.play('enemyShot', muzzle);
  }
}
