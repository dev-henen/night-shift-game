import * as THREE from 'three';
import { Enemy, ENEMY_TYPES } from './enemies.js';

ENEMY_TYPES.boss = {
  model: ['creature'], hp: 4200, speed: 3.3, damage: 24, reach: 3.7, attackTime: 1.25, style: 'claw',
  radius: 1.1, score: 5000, heavy: true, boss: true, lean: 0.15,
};

const SLAM_RADIUS = 7.5;

/** The Creature: claw swipes up close, leap-slams from range, summons minions at 70% / 35%. */
export class Boss extends Enemy {
  constructor(game, template) {
    super(game, 'boss', template);
    this.leapCooldown = 5;
    this.summons = [0.7, 0.35];
    this.enraged = false;
    this.leapFrom = new THREE.Vector3();
    this.leapTo = new THREE.Vector3();
    // A red glow around the head so the dark silhouette stays readable.
    this.glow = new THREE.PointLight(0xff2a10, 14, 9, 1.5);
    this.glow.position.set(0, this.height * 0.85, 0.8);
    this.object.add(this.glow);
  }

  spawnAt(x, z) {
    super.spawnAt(x, z);
    this.introDone = false;
  }

  takeDamage(amount, dir, opts) {
    if (this.state === 'intro' || this.state === 'roar') amount *= 0.2;
    // Bosses don't get knocked around or staggered by bullets.
    const s = this.state;
    const died = super.takeDamage(amount, null, opts);
    if (!died && s !== 'stagger' && this.state === 'stagger') this.state = s;
    if (!this.enraged && this.hp < this.maxHp * 0.35) {
      this.enraged = true;
      this.speedMul = 1.35;
      this.def = { ...this.def, attackTime: this.def.attackTime * 0.8 };
    }
    return died;
  }

  special(state) {
    this.state = state;
    this.stateT = 0;
    this.attackT = -1;
    this.vel.set(0, 0, 0);
  }

  update(dt) {
    const { game } = this;
    const player = game.player;
    if (this.state === 'spawn' && this.stateT + dt >= 1.1 && !this.introDone) {
      super.update(dt);
      this.introDone = true;
      this.special('intro');
      game.audio.play('roar', this.pos);
      game.shake(1);
      return;
    }
    if (!this.alive || this.state === 'spawn') return super.update(dt);

    this.time += dt;
    this.stateT += dt;
    this.hitT = Math.max(0, this.hitT - dt);
    this.leapCooldown -= dt;
    const toP = new THREE.Vector3().subVectors(player.pos, this.pos).setY(0);
    const dist = toP.length();

    // Summon phases interrupt whatever is going on.
    if (this.summons.length && this.hp < this.maxHp * this.summons[0] && !['leap', 'roar'].includes(this.state)) {
      this.summons.shift();
      this.special('roar');
      game.audio.play('roar', this.pos);
      game.shake(1.2);
      game.spawnMinions(this.enraged ? 6 : 4);
      // Resupply so the fight stays winnable.
      for (const kind of ['health', 'ammo']) {
        const at = game.pickSpawn(6);
        if (at) game.addPickup(kind, at, { life: 40 });
      }
    }

    const base = { move: { x: 0, z: 0 }, phase: this.phase, time: this.time, attack: -1, hit: this.hitT };
    switch (this.state) {
      case 'intro':
      case 'roar': {
        const k = Math.min(1, this.stateT / 0.4);
        this.rig.pose({ ...base, attack: 0.42 * k, attackStyle: 'slam', lean: -0.35 * k, headPitch: -0.5 * k });
        if (Math.random() < 0.5) game.shake(0.15);
        if (this.stateT > 2.2) this.special('chase');
        return;
      }
      case 'leapPrep': {
        this.yaw = Math.atan2(toP.x, toP.z);
        this.object.rotation.y = this.yaw;
        this.rig.pose({ ...base, crouch: Math.min(1, this.stateT * 2), attack: 0.3, attackStyle: 'slam', lean: 0.3 });
        if (this.stateT > 0.7) {
          this.leapFrom.copy(this.pos);
          this.leapTo.copy(player.pos).addScaledVector(player.vel, 0.35);
          const b = game.world.bounds;
          this.leapTo.x = THREE.MathUtils.clamp(this.leapTo.x, b.minX + 3, b.maxX - 3);
          this.leapTo.z = THREE.MathUtils.clamp(this.leapTo.z, b.minZ + 3, b.maxZ - 3);
          this.special('leap');
          game.effects.dust(this.pos.clone().setY(0.1), 0x3a3530, 20, 2);
        }
        return;
      }
      case 'leap': {
        const T = 0.95;
        const k = Math.min(1, this.stateT / T);
        this.pos.lerpVectors(this.leapFrom, this.leapTo, k);
        this.pos.y = Math.sin(k * Math.PI) * 5;
        this.rig.pose({ ...base, crouch: 0.2, attack: 0.45, attackStyle: 'slam', lean: 0.2 });
        if (k >= 1) {
          this.pos.y = 0;
          game.world.collide(this.pos, this.def.radius);
          this.land();
          this.special('recover');
        }
        return;
      }
      case 'recover':
        this.rig.pose({ ...base, attack: 0.62, attackStyle: 'slam', crouch: Math.max(0, 1 - this.stateT * 1.5), lean: 0.4 });
        if (this.stateT > 0.9) this.special('chase');
        return;
      case 'chase':
        if (this.leapCooldown <= 0 && dist > 8 && dist < 30) {
          this.leapCooldown = this.enraged ? 4 + Math.random() * 2 : 6 + Math.random() * 3;
          this.special('leapPrep');
          game.audio.play('growl', this.pos);
          return;
        }
        break;
      default:
    }
    // Normal chase / claw attack handled by the base enemy; undo the double time step.
    this.time -= dt;
    this.stateT -= dt;
    super.update(dt);
  }

  die(dir) {
    super.die(dir);
    this.glow.intensity = 0;
  }

  land() {
    const { game } = this;
    game.audio.play('slam', this.pos);
    game.shake(1.4);
    game.effects.shockwave(this.pos, SLAM_RADIUS * 2, 0xff5522, 0.55);
    game.effects.shockwave(this.pos, SLAM_RADIUS * 1.3, 0xffaa55, 0.4);
    game.effects.dust(this.pos.clone().setY(0.2), 0x3a3530, 60, 4);
    game.effects.decal(this.pos, 2.5, 0x15100c, 20);
    const p = game.player;
    const d = Math.hypot(p.pos.x - this.pos.x, p.pos.z - this.pos.z);
    if (d < SLAM_RADIUS) {
      p.damage(30 * (1 - d / SLAM_RADIUS) + 10, this.pos);
      const push = new THREE.Vector3(p.pos.x - this.pos.x, 0, p.pos.z - this.pos.z).normalize().multiplyScalar(9);
      p.vel.add(push);
    }
  }
}
