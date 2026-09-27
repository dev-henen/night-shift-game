import * as THREE from 'three';
import { loadModel, instance } from '../engine/assets.js';

// `yaw` turns each FBX so its barrel points along +Z; `grip` shifts it so the hand sits on the grip.
export const WEAPONS = {
  pistol: {
    id: 'pistol', name: 'M1911', slot: 1, file: 'weapons/pistol.fbx', texture: 'weapons/pistol.png',
    length: 0.24, yaw: -Math.PI / 2, grip: new THREE.Vector3(0, 0.03, 0.04), muzzle: 0.17, hide: /ACP|Shell|Mag_Full/i,
    damage: 34, rate: 0.16, mag: 8, reserve: Infinity, reload: 1.1, spread: 0.01, pellets: 1, auto: false,
    sound: 'pistol', recoil: 0.35, kick: 0.012, twoHanded: false, flash: 0.45,
  },
  shotgun: {
    id: 'shotgun', name: 'Tactical Shotgun', slot: 2, file: 'weapons/shotgun.fbx', texture: 'weapons/shotgun.png',
    length: 0.95, yaw: -Math.PI / 2, grip: new THREE.Vector3(0, 0.02, 0.18), muzzle: 0.62, hide: /Shell/i,
    damage: 15, rate: 0.8, mag: 6, reserve: 30, reload: 1.9, spread: 0.07, pellets: 9, auto: false,
    sound: 'shotgun', recoil: 1, kick: 0.035, twoHanded: true, flash: 0.9, pickupAmmo: 6,
  },
  rifle: {
    id: 'rifle', name: 'M14 Tactical', slot: 3, file: 'weapons/rifle.fbx', texture: 'weapons/rifle.png',
    length: 1.0, yaw: -Math.PI / 2, grip: new THREE.Vector3(0, 0.02, 0.2), muzzle: 0.68, hide: /Bullet|Full_Magazene/i,
    damage: 27, rate: 0.1, mag: 20, reserve: 100, reload: 1.7, spread: 0.018, pellets: 1, auto: true,
    sound: 'rifle', recoil: 0.3, kick: 0.009, twoHanded: true, flash: 0.6, pickupAmmo: 30,
  },
  makarov: {
    id: 'makarov', name: 'Makarov', file: 'weapons/makarov.fbx', texture: 'weapons/makarov.png',
    length: 0.2, yaw: -Math.PI / 2, grip: new THREE.Vector3(0, 0.03, 0.03), muzzle: 0.14, flash: 0.4,
  },
};

export const MELEE = { damage: 55, range: 2.3, arc: Math.cos(THREE.MathUtils.degToRad(60)), time: 0.5, hitAt: 0.5, cooldown: 0.65 };

export function loadWeapon(id) {
  const w = WEAPONS[id];
  return loadModel(w.file, { texture: w.texture, hide: w.hide, pixelated: true, height: undefined, center: true })
    .then((tpl) => {
      // Scale by length (the FBX files are in arbitrary units).
      const size = tpl.userData.size;
      tpl.userData.scaleForLength = w.length / Math.max(size.x, size.z);
      return tpl;
    });
}

/** A weapon mesh wrapped so that +Z is the barrel direction and the origin is the grip. */
export function makeWeaponMesh(id, template) {
  const w = WEAPONS[id];
  const holder = new THREE.Group();
  const m = instance(template);
  m.scale.setScalar(template.userData.scaleForLength);
  m.rotation.y = w.yaw;
  const inner = new THREE.Group();
  inner.add(m);
  // Lift so the model's vertical center sits at the hand, then shift forward.
  inner.position.set(0, -template.userData.size.y * template.userData.scaleForLength * 0.5, 0).add(w.grip);
  holder.add(inner);
  holder.userData.muzzle = w.muzzle;
  return holder;
}

export function loadBat() {
  return loadModel('weapons/bat.glb', { height: 0.95 });
}
