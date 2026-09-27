// Dev helper: print meshes, bones and animation clips inside FBX files.
import fs from 'node:fs';
globalThis.self = globalThis;
globalThis.document = { createElementNS: () => ({ style: {}, addEventListener() {}, removeEventListener() {}, setAttribute() {} }) };
globalThis.window = globalThis;
const { FBXLoader } = await import('three/examples/jsm/loaders/FBXLoader.js');
const THREE = await import('three');
for (const f of process.argv.slice(2)) {
  if (!fs.existsSync(f)) { console.log("MISSING", f); continue; }
  const buf = fs.readFileSync(f);
  let obj;
  try { obj = new FBXLoader().parse(buf.buffer.slice(buf.byteOffset, buf.byteOffset + buf.byteLength), ''); }
  catch (e) { console.log('ERR', f, e.message); continue; }
  const bones = [], meshes = [];
  obj.traverse(o => { if (o.isBone) bones.push(o.name); if (o.isMesh) meshes.push(`${o.name}${o.isSkinnedMesh ? '(skinned)' : ''}`); });
  const box = new THREE.Box3().setFromObject(obj);
  const s = box.getSize(new THREE.Vector3());
  console.log('==', f.split('/').slice(-2).join('/'), 'size', s.toArray().map(n => n.toFixed(1)).join('x'));
  console.log('  meshes', meshes.slice(0, 8).join(', '));
  console.log('  bones', bones.length, bones.slice(0, 30).join(','));
  const mats = new Set(); obj.traverse(o => { if (o.isMesh) [].concat(o.material).forEach(m => mats.add(`${m.name}:${m.color?.getHexString()}${m.map ? ' map=' + (m.map.name || 'yes') : ''}`)); });
  console.log('  mats', [...mats].slice(0, 10).join(' | '));
  console.log('  clips', obj.animations.map(a => `${a.name}(${a.duration.toFixed(2)}s)`).join(', '));
}
