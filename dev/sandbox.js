// Dev-only page for checking character poses and weapon alignment.
import * as THREE from 'three';
import { loadCharacter, makeCharacter } from '../src/game/characters.js';
import { loadWeapon, makeWeaponMesh } from '../src/game/weapons.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x445566);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(3, 6, 5); scene.add(dl);
const grid = new THREE.GridHelper(20, 20); scene.add(grid);
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
const view = params.get('view') || 'front';
const d = parseFloat(params.get('dist') || '13');
const camPos = { front: [0, 1.4, d], side: [d, 1.4, 0.5], back: [0, 1.4, -d], three: [d * 0.6, 1.8, d * 0.8] }[view];
cam.position.set(...camPos); cam.lookAt(0, 1.3, 0);

const names = (params.get('chars') || 'player,killer,thug1,monster6,clown,smiles').split(',');
const pose = params.get('pose') || 'idle';
const t = parseFloat(params.get('t') || '0.3');
const chars = [];
for (const [i, n] of names.entries()) {
  const c = makeCharacter(await loadCharacter(n));
  c.object.position.x = (i - (names.length - 1) / 2) * 2.2;
  scene.add(c.object);
  chars.push(c);
}
const gunId = params.get('gun') || 'pistol';
const gun = makeWeaponMesh(gunId, await loadWeapon(gunId));
scene.add(gun);

function state(time) {
  const s = { move: { x: 0, z: 0 }, phase: 0, time, attack: -1, aim: 0, aimPitch: 0 };
  if (pose === 'walk') { s.move = { x: 0, z: 1 }; s.phase = t * Math.PI * 2; }
  if (pose === 'run') { s.move = { x: 0, z: 1.3 }; s.phase = t * Math.PI * 2; s.run = true; }
  if (pose === 'strafe') { s.move = { x: 1, z: 0 }; s.phase = t * Math.PI * 2; }
  if (pose === 'aim') { s.aim = 1; s.twoHanded = gunId !== 'pistol'; }
  if (pose === 'zombie') { s.zombie = 1; s.move = { x: 0, z: 1 }; s.phase = t * Math.PI * 2; }
  if (['chop', 'claw', 'slam', 'punch', 'swing'].includes(pose)) { s.attack = t; s.attackStyle = pose; }
  if (pose === 'dead') s.dead = true;
  return s;
}
await (await import('../src/engine/assets.js')).whenIdle();
for (const c of chars) c.rig.pose(state(0));
scene.updateMatrixWorld(true);
const p = chars[0];
const hand = p.rig.worldPos('rHand');
gun.position.copy(hand);
if (params.get('look') === 'hand') { cam.position.copy(hand).add(new THREE.Vector3(1.2, 0.5, 0.6)); cam.lookAt(hand); }
renderer.render(scene, cam);
window.__ready = true;
gun.updateMatrixWorld(true); const gb = new THREE.Box3().setFromObject(gun); console.log('gun box', gb.min.toArray().map(v=>v.toFixed(2)), gb.max.toArray().map(v=>v.toFixed(2)), 'hand', hand.toArray().map(v=>v.toFixed(2))); gun.traverse(o => o.isMesh && console.log(o.name, o.visible, o.material.opacity, o.material.transparent, o.material.alphaTest));
console.log('rig ok', chars.map((c) => c.rig.ok).join(','));
