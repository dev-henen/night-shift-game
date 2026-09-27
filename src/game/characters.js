import * as THREE from 'three';
import { loadModel, instance } from '../engine/assets.js';
import { Rig } from './rig.js';

const char = (name, height, extra = {}) => ({ file: `characters/${name}.fbx`, texture: `characters/${name}.png`, height, ...extra });

export const CHARACTERS = {
  player: char('player', 1.8),
  killer: char('killer', 1.85, { textureFor: (mesh) => (/machete/i.test(mesh.name) ? 'characters/machete.png' : 'characters/killer.png') }),
  killer01: char('killer01', 1.82),
  clown: char('clown', 2.05),
  smiles: char('smiles', 2.25),
  creature: char('creature', 4.4),
  manpot: char('manpot', 1.9),
  thug1: char('thug1', 1.8),
  thug2: char('thug2', 1.8),
  thug3: char('thug3', 1.85),
  monster6: char('monster6', 1.7),
  monster7: char('monster7', 1.85),
  monster8: char('monster8', 2.8),
};

export function loadCharacter(name) {
  const d = CHARACTERS[name];
  return loadModel(d.file, { texture: d.texture, textureFor: d.textureFor, height: d.height, pixelated: true });
}

/**
 * Builds a posable character:
 *   object (position + yaw) > body (tilt / death fall) > model (skinned instance)
 */
export function makeCharacter(template) {
  const object = new THREE.Group();
  const body = new THREE.Group();
  const model = instance(template);
  body.add(model);
  object.add(body);
  const rig = new Rig(model);
  return { object, body, model, rig, height: template.userData.size.y };
}
