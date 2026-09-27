// Dev-only page: lays out kit pieces side by side (raw pivots, no centering) to learn their geometry.
import * as THREE from 'three';
import { loadModel, instance, whenIdle } from '../src/engine/assets.js';

const params = new URLSearchParams(location.search);
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);
const scene = new THREE.Scene();
scene.background = new THREE.Color(0x334455);
scene.add(new THREE.HemisphereLight(0xffffff, 0x444444, 2.5));
const dl = new THREE.DirectionalLight(0xffffff, 1.5); dl.position.set(3, 10, 5); scene.add(dl);
scene.add(new THREE.AxesHelper(3));
const grid = new THREE.GridHelper(100, 100, 0x888888, 0x555555); grid.position.y = 0.02; scene.add(grid);
const models = params.get('m').split(',');
const gap = parseFloat(params.get('gap') || '30');
let x = 0;
for (const m of models) {
  const [path, rot = '0'] = m.split('@');
  const isOffice = path.startsWith('office/');
  const tpl = await loadModel(path, { center: params.get('center') === '1', ...(isOffice ? { texture: 'office/palette.png', scale: 0.01 } : {}) });
  const o = instance(tpl);
  o.position.x = x;
  o.rotation.y = (parseFloat(rot) * Math.PI) / 180;
  scene.add(o);
  x += gap;
}
await whenIdle();
const span = (models.length - 1) * gap;
const cam = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 500);
const h = parseFloat(params.get('h') || String(span * 0.9 + 25));
if (params.get('top') === '1') { cam.position.set(span / 2, h, 0.01); cam.lookAt(span / 2, 0, 0); }
else { cam.position.set(span / 2 + h * 0.3, h * 0.5, h * 0.8); cam.lookAt(span / 2, 0, 0); }
renderer.render(scene, cam);
window.__ready = true;
