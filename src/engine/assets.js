import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { FBXLoader } from 'three/addons/loaders/FBXLoader.js';
import * as SkeletonUtils from 'three/addons/utils/SkeletonUtils.js';

const BASE = `${import.meta.env.BASE_URL}assets/`;
const BLANK_PNG = 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYAAAAAYAAjCB0C8AAAAASUVORK5CYII=';
// FBX files reference textures by the authors' absolute paths, so FBXLoader's own texture
// requests always fail. We bind textures ourselves (see prepare) and blank those requests.
const fbxManager = new THREE.LoadingManager();
fbxManager.setURLModifier((url) => (/\.(png|jpe?g|tga|bmp)$/i.test(url) ? BLANK_PNG : url));
const gltfLoader = new GLTFLoader();
const fbxLoader = new FBXLoader(fbxManager);
const textureLoader = new THREE.TextureLoader();
let pending = 0;
let done = 0;
let progressCb = null;
const inflight = new Set();
function track(promise) {
  pending++;
  progressCb?.(done / pending);
  inflight.add(promise);
  return promise.finally(() => {
    inflight.delete(promise);
    done++;
    progressCb?.(done / pending);
  });
}

/** Resolves once every model and texture requested so far has finished loading. */
export async function whenIdle() {
  while (inflight.size) await Promise.allSettled([...inflight]);
}

const models = new Map();
const textures = new Map();

export function loadTexture(path, { pixelated = false, repeat } = {}) {
  const key = `${path}|${pixelated}|${repeat}`;
  if (!textures.has(key)) {
    let tex;
    track(new Promise((resolve) => { tex = textureLoader.load(BASE + path, resolve, undefined, resolve); }));
    tex.colorSpace = THREE.SRGBColorSpace;
    if (pixelated) {
      tex.magFilter = THREE.NearestFilter;
      tex.minFilter = THREE.NearestMipmapLinearFilter;
    }
    if (repeat) {
      tex.wrapS = tex.wrapT = THREE.RepeatWrapping;
      tex.repeat.set(repeat, repeat);
    }
    textures.set(key, tex);
  }
  return textures.get(key);
}

// Lambert everywhere: cheap, and it suits the low-poly/PSX art of the packs.
function toLambert(m, map, { fbx, alphaTest, vertexColors, doubleSide, tint }) {
  const lm = new THREE.MeshLambertMaterial({
    name: m.name,
    map: map ?? m.map ?? null,
    color: map || m.map ? 0xffffff : (m.color ?? new THREE.Color(0xffffff)),
    // FBX exports flag many opaque materials as transparent; only trust glTF alpha modes.
    transparent: !fbx && m.transparent,
    opacity: fbx ? 1 : (m.opacity ?? 1),
    alphaTest: fbx ? (alphaTest ?? 0) : m.alphaTest,
    side: doubleSide ? THREE.DoubleSide : m.side,
    // Kits use vertex colors as shader blend masks, not as color; opt in per model.
    vertexColors: !!vertexColors && m.vertexColors,
  });
  if (lm.alphaTest > 0) lm.transparent = false;
  if (tint !== undefined) lm.color.multiply(new THREE.Color(tint));
  return lm;
}

function prepare(root, { texture, textureFor, shadows = true, pixelated = false, alphaTest, vertexColors, doubleSide, tint } = {}, fbx = false) {
  const converted = new Map();
  root.traverse((o) => {
    if (!o.isMesh) return;
    o.castShadow = shadows;
    o.receiveShadow = true;
    const conv = (m) => {
      const map = textureFor?.(o, m) ?? texture;
      const tex = map ? loadTexture(map, { pixelated }) : undefined;
      const key = `${m.uuid}|${map}`;
      if (!converted.has(key)) converted.set(key, toLambert(m, tex, { fbx, alphaTest, vertexColors, doubleSide, tint }));
      return converted.get(key);
    };
    o.material = Array.isArray(o.material) ? o.material.map(conv) : conv(o.material);
  });
  return root;
}

/**
 * Loads a model once and returns a normalized template. Options:
 *  - texture / textureFor(mesh, material): texture path(s) for FBX files
 *  - height: uniform scale so the model is this tall
 *  - center: move pivot to the bbox bottom-center (default true)
 *  - scale: extra uniform scale applied before centering (e.g. 0.01 for cm FBX props)
 *  - tint: color multiplied into every material
 *  - alphaTest / doubleSide / vertexColors: material overrides
 */
export function loadModel(path, opts = {}) {
  const key = `${path}|${JSON.stringify({ ...opts, textureFor: String(opts.textureFor ?? '') })}`;
  if (!models.has(key)) {
    const url = BASE + path;
    const p = (path.endsWith('.fbx') ? fbxLoader.loadAsync(url) : gltfLoader.loadAsync(url).then((g) => g.scene))
      .then((raw) => {
        prepare(raw, opts, path.endsWith('.fbx'));
        const holder = new THREE.Group();
        holder.name = path;
        holder.add(raw);
        if (opts.scale) raw.scale.multiplyScalar(opts.scale);
        if (opts.hide) raw.traverse((o) => { if (o.isMesh && opts.hide.test(o.name)) o.visible = false; });
        holder.updateMatrixWorld(true);
        const box = visibleBox(raw);
        if (opts.height) {
          const s = opts.height / (box.max.y - box.min.y);
          raw.scale.multiplyScalar(s);
          holder.updateMatrixWorld(true);
          box.copy(visibleBox(raw));
        }
        if (opts.center !== false) {
          raw.position.x -= (box.min.x + box.max.x) / 2;
          raw.position.z -= (box.min.z + box.max.z) / 2;
          raw.position.y -= box.min.y;
        }
        holder.updateMatrixWorld(true);
        holder.userData.size = visibleBox(holder).getSize(new THREE.Vector3());
        return holder;
      });
    models.set(key, track(p));
  }
  return models.get(key);
}

function visibleBox(obj) {
  const box = new THREE.Box3();
  obj.updateMatrixWorld(true);
  obj.traverse((o) => {
    if (!o.isMesh || !o.visible) return;
    let hidden = false;
    for (let p = o.parent; p; p = p.parent) if (!p.visible) hidden = true;
    if (hidden) return;
    if (o.isSkinnedMesh) o.computeBoundingBox();
    else if (!o.geometry.boundingBox) o.geometry.computeBoundingBox();
    const b = (o.isSkinnedMesh ? o.boundingBox : o.geometry.boundingBox).clone().applyMatrix4(o.matrixWorld);
    box.union(b);
  });
  return box;
}

/** Clones a template (skinned meshes get their own skeleton). Geometry and materials are shared. */
export function instance(template) {
  let skinned = false;
  template.traverse((o) => { if (o.isSkinnedMesh) skinned = true; });
  const c = skinned ? SkeletonUtils.clone(template) : template.clone();
  c.userData.size = template.userData.size;
  return c;
}

/**
 * Draws many copies of a static template as InstancedMeshes (one per sub-mesh), split into
 * spatial chunks so off-screen chunks are frustum-culled.
 */
export function instanced(template, transforms, { shadows = false, chunk = 24 } = {}) {
  const group = new THREE.Group();
  template.updateMatrixWorld(true);
  const tmp = new THREE.Matrix4();
  const q = new THREE.Quaternion();
  const cells = new Map();
  for (const t of transforms) {
    const key = `${Math.floor(t.x / chunk)},${Math.floor(t.z / chunk)}`;
    if (!cells.has(key)) cells.set(key, []);
    cells.get(key).push(t);
  }
  for (const list of cells.values()) {
    template.traverse((o) => {
      if (!o.isMesh) return;
      const im = new THREE.InstancedMesh(o.geometry, o.material, list.length);
      im.castShadow = shadows;
      im.receiveShadow = true;
      list.forEach((t, i) => {
        q.setFromAxisAngle(THREE.Object3D.DEFAULT_UP, t.rot ?? 0);
        tmp.compose(new THREE.Vector3(t.x, t.y ?? 0, t.z), q, new THREE.Vector3().setScalar(t.scale ?? 1));
        im.setMatrixAt(i, tmp.clone().multiply(o.matrixWorld));
      });
      im.computeBoundingSphere();
      group.add(im);
    });
  }
  return group;
}

export function onProgress(cb) {
  pending = 0;
  done = 0;
  progressCb = cb;
}
