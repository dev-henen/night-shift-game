import * as THREE from 'three';
import { instance } from '../engine/assets.js';
import { WEAPONS, makeWeaponMesh } from './weapons.js';

const COLORS = { health: 0x44ff77, ammo: 0xffcc33, weapon: 0x55ccff };
const ringGeo = new THREE.RingGeometry(0.42, 0.55, 32).rotateX(-Math.PI / 2);
const beamGeo = new THREE.CylinderGeometry(0.4, 0.55, 1.6, 16, 1, true).translate(0, 0.8, 0);

export class Pickup {
  /** kind: 'health' | 'ammo' | 'weapon'; for weapons, `weapon` is the weapon id. */
  constructor(game, kind, pos, { weapon, templates, life = Infinity } = {}) {
    this.game = game;
    this.kind = kind;
    this.weapon = weapon;
    this.life = life;
    this.t = Math.random() * 6;
    this.object = new THREE.Group();
    this.object.position.set(pos.x, 0, pos.z);
    const color = COLORS[kind];
    const ring = new THREE.Mesh(ringGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.8, side: THREE.DoubleSide, depthWrite: false }));
    ring.position.y = 0.03;
    this.object.add(ring);
    const beam = new THREE.Mesh(beamGeo, new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.12, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false }));
    this.object.add(beam);
    this.beam = beam;
    this.ring = ring;

    this.item = new THREE.Group();
    let model;
    if (kind === 'weapon') {
      model = makeWeaponMesh(weapon, templates[weapon]);
      model.rotation.y = Math.PI / 2;
      model.scale.setScalar(1.6);
    } else {
      model = instance(templates[kind]);
      const s = templates[kind].userData.size;
      model.scale.setScalar(0.45 / Math.max(s.x, s.y, s.z));
    }
    this.item.add(model);
    this.item.position.y = 0.8;
    this.object.add(this.item);
    game.scene.add(this.object);
  }

  update(dt) {
    this.t += dt;
    this.life -= dt;
    this.item.rotation.y += dt * 1.8;
    this.item.position.y = 0.8 + Math.sin(this.t * 3) * 0.1;
    this.beam.material.opacity = 0.1 + Math.sin(this.t * 4) * 0.04;
    if (this.life < 4) this.object.visible = Math.floor(this.life * 6) % 2 === 0;

    const p = this.game.player;
    if (!p.alive) return this.life > 0;
    const d = Math.hypot(p.pos.x - this.object.position.x, p.pos.z - this.object.position.z);
    if (d < 1.1 && this.collect(p)) return false;
    return this.life > 0;
  }

  collect(p) {
    const { game } = this;
    let ok = false;
    if (this.kind === 'health') {
      ok = p.heal(35);
      if (ok) game.hud.toast('+35 HEALTH', '#6f6');
    } else if (this.kind === 'ammo') {
      ok = p.addAmmoPack();
      if (ok) game.hud.toast('AMMO', '#fc3');
    } else {
      const fresh = p.give(this.weapon);
      ok = true;
      game.hud.toast(fresh ? `NEW WEAPON: ${WEAPONS[this.weapon].name.toUpperCase()}` : `${WEAPONS[this.weapon].name.toUpperCase()} AMMO`, '#5cf');
      if (fresh) game.hud.weaponUnlocked(this.weapon);
    }
    if (ok) {
      game.audio.play(this.kind === 'weapon' ? 'weapon' : 'pickup');
      this.dispose();
    }
    return ok;
  }

  dispose() {
    this.game.scene.remove(this.object);
  }
}
