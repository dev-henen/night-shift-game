// Dev helper: approximate bounds of glTF/GLB files (scene-root transforms applied, from accessor min/max).
import fs from 'node:fs';
import path from 'node:path';
function readJson(f) {
  const b = fs.readFileSync(f);
  if (f.endsWith('.gltf')) return JSON.parse(b.toString());
  const len = b.readUInt32LE(12);
  return JSON.parse(b.subarray(20, 20 + len).toString());
}
for (const f of process.argv.slice(2)) {
  const j = readJson(f);
  const mn = [1e9, 1e9, 1e9], mx = [-1e9, -1e9, -1e9];
  const visit = (ni, s) => {
    const n = j.nodes[ni];
    const sc = n.scale ? n.scale.map((v, i) => v * s[i]) : s;
    if (n.mesh !== undefined) for (const p of j.meshes[n.mesh].primitives) {
      const a = j.accessors[p.attributes.POSITION];
      for (let i = 0; i < 3; i++) { mn[i] = Math.min(mn[i], a.min[i] * sc[i] + (n.translation?.[i] ?? 0)); mx[i] = Math.max(mx[i], a.max[i] * sc[i] + (n.translation?.[i] ?? 0)); }
    }
    (n.children || []).forEach(c => visit(c, sc));
  };
  j.scenes[j.scene ?? 0].nodes.forEach(n => visit(n, [1, 1, 1]));
  const imgs = (j.images || []).map(i => i.uri || '(embedded)').join(',');
  console.log(path.basename(f).padEnd(34), 'size', mx.map((v, i) => (v - mn[i]).toFixed(2)).join(' x '), ' min', mn.map(v => v.toFixed(2)).join(','), ' img:', imgs.slice(0, 120));
}
