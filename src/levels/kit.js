import * as THREE from 'three';
import { loadModel, loadTexture, instance, instanced } from '../engine/assets.js';

/** Small seeded PRNG so procedural layouts are identical every run. */
export function rng(seed) {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** Helpers levels use to build their scene; everything lands in one group removed on unload. */
export class LevelKit {
  constructor(game) {
    this.game = game;
    this.world = game.world;
    this.group = new THREE.Group();
    game.scene.add(this.group);
    this.updaters = [];
    this.sun = null;
    this.sunOffset = new THREE.Vector3(-18, 30, 12);
  }

  dispose() {
    this.game.scene.remove(this.group);
    this.group.traverse((o) => {
      if (o.isLight && o.shadow?.map) o.shadow.map.dispose();
    });
  }

  add(obj) {
    this.group.add(obj);
    return obj;
  }

  onUpdate(fn) {
    this.updaters.push(fn);
  }

  update(dt, game) {
    for (const fn of this.updaters) fn(dt, game);
  }

  model(path, opts) {
    return loadModel(path, opts);
  }

  /**
   * Places a copy of a model. Options:
   *   rot (y radians), y, scale, collide (default true), shrink (collider inset), opts (loader options)
   */
  async place(path, x, z, { rot = 0, y = 0, scale = 1, collide = true, shrink = 0, opts, minHeight = 0, shadows } = {}) {
    const tpl = await loadModel(path, opts);
    const o = instance(tpl);
    o.position.set(x, y, z);
    o.rotation.y = rot;
    o.scale.setScalar(scale);
    if (shadows === false) o.traverse((m) => { m.castShadow = false; });
    this.group.add(o);
    if (collide) this.world.addObject(o, { shrink, minHeight });
    return o;
  }

  /** Many static copies drawn as instanced meshes (no colliders). */
  async scatter(path, transforms, { opts, shadows = false } = {}) {
    if (!transforms.length) return null;
    const tpl = await loadModel(path, opts);
    const g = instanced(tpl, transforms, { shadows });
    this.group.add(g);
    return g;
  }

  // --- environment -------------------------------------------------------------------------------

  atmosphere({ sky, fog, density = 0.03 }) {
    this.game.scene.background = new THREE.Color(sky);
    this.game.scene.fog = new THREE.FogExp2(fog ?? sky, density);
  }

  hemi(sky, ground, intensity) {
    return this.add(new THREE.HemisphereLight(sky, ground, intensity));
  }

  ambient(color, intensity) {
    return this.add(new THREE.AmbientLight(color, intensity));
  }

  /** Shadow-casting directional light that follows the player. */
  moon(color, intensity, offset, size = 28) {
    const l = new THREE.DirectionalLight(color, intensity);
    l.castShadow = true;
    l.shadow.mapSize.set(2048, 2048);
    const c = l.shadow.camera;
    c.left = c.bottom = -size;
    c.right = c.top = size;
    c.near = 1;
    c.far = 120;
    l.shadow.bias = -0.0008;
    l.shadow.normalBias = 0.03;
    if (offset) this.sunOffset.copy(offset);
    this.add(l);
    this.add(l.target);
    this.sun = l;
    return l;
  }

  point(x, y, z, color, intensity, distance = 14, { flicker = 0, shadow = false } = {}) {
    const l = new THREE.PointLight(color, intensity, distance, 1.6);
    l.position.set(x, y, z);
    if (shadow) {
      l.castShadow = true;
      l.shadow.mapSize.set(512, 512);
    }
    this.add(l);
    if (flicker) {
      const base = intensity;
      let t = Math.random() * 10;
      this.onUpdate((dt) => {
        t += dt;
        const n = Math.sin(t * 13) * Math.sin(t * 7.3) * Math.sin(t * 2.1);
        l.intensity = base * (1 - flicker * 0.5 + flicker * 0.5 * n) * (Math.random() < 0.01 * flicker ? 0.1 : 1);
      });
    }
    return l;
  }

  /** Ground plane with a tiled texture or color. */
  ground(w, d, { texture, repeat = 1, color = 0xffffff, x = 0, z = 0, y = 0 } = {}) {
    const mat = new THREE.MeshLambertMaterial({ color });
    if (texture) {
      mat.map = loadTexture(texture, { repeat }).clone();
      mat.map.wrapS = mat.map.wrapT = THREE.RepeatWrapping;
      mat.map.repeat.set(repeat * (w / Math.max(w, d)), repeat * (d / Math.max(w, d)));
      mat.map.needsUpdate = true;
    }
    const m = new THREE.Mesh(new THREE.PlaneGeometry(w, d).rotateX(-Math.PI / 2), mat);
    m.position.set(x, y, z);
    m.receiveShadow = true;
    return this.add(m);
  }

  /** Procedural canvas texture (for ground/walls the packs don't provide). */
  canvasTexture(size, draw, repeat = 1) {
    const c = document.createElement('canvas');
    c.width = c.height = size;
    draw(c.getContext('2d'), size);
    const t = new THREE.CanvasTexture(c);
    t.colorSpace = THREE.SRGBColorSpace;
    t.wrapS = t.wrapT = THREE.RepeatWrapping;
    t.repeat.set(repeat, repeat);
    t.anisotropy = 4;
    return t;
  }

  /** A plain box that also blocks movement. */
  box(x, z, w, d, h, color, { y = 0, collide = true, map, emissive } = {}) {
    const m = new THREE.Mesh(
      new THREE.BoxGeometry(w, h, d),
      new THREE.MeshLambertMaterial({ color, map: map ?? null, emissive: emissive ?? 0x000000 }),
    );
    m.position.set(x, y + h / 2, z);
    m.castShadow = m.receiveShadow = true;
    this.add(m);
    if (collide) this.world.addRect(x, z, w, d, h, y);
    return m;
  }

  /** Invisible wall. */
  wall(x, z, w, d, h = 4) {
    this.world.addRect(x, z, w, d, h);
  }

  /** Street lamp built from primitives, with a warm light. */
  lamp(x, z, { color = 0xffb46b, intensity = 30, height = 5.2, rot = 0 } = {}) {
    const g = new THREE.Group();
    const metal = new THREE.MeshLambertMaterial({ color: 0x1d2025 });
    const pole = new THREE.Mesh(new THREE.CylinderGeometry(0.07, 0.11, height, 8), metal);
    pole.position.y = height / 2;
    const arm = new THREE.Mesh(new THREE.BoxGeometry(0.08, 0.08, 1.2), metal);
    arm.position.set(0, height - 0.1, 0.55);
    const head = new THREE.Mesh(new THREE.BoxGeometry(0.4, 0.14, 0.6), metal);
    head.position.set(0, height - 0.18, 1.05);
    const bulb = new THREE.Mesh(new THREE.BoxGeometry(0.3, 0.04, 0.45), new THREE.MeshBasicMaterial({ color }));
    bulb.position.set(0, height - 0.27, 1.05);
    g.add(pole, arm, head, bulb);
    g.traverse((m) => { if (m.isMesh) m.castShadow = true; });
    g.position.set(x, 0, z);
    g.rotation.y = rot;
    this.add(g);
    this.world.addRect(x, z, 0.3, 0.3, height);
    const lp = new THREE.Vector3(0, height - 0.5, 1.05).applyAxisAngle(THREE.Object3D.DEFAULT_UP, rot).add(g.position);
    this.point(lp.x, lp.y, lp.z, color, intensity, 16, { flicker: Math.random() < 0.25 ? 0.8 : 0 });
    // Fake light pool on the ground.
    const pool = new THREE.Mesh(
      new THREE.CircleGeometry(3.2, 24).rotateX(-Math.PI / 2),
      new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.07, blending: THREE.AdditiveBlending, depthWrite: false }),
    );
    pool.position.set(lp.x, 0.03, lp.z);
    this.add(pool);
    return g;
  }

  /** Burning barrel / fire with flickering light and embers. */
  fire(x, z, { scale = 1, barrel = true } = {}) {
    if (barrel) this.box(x, z, 0.7 * scale, 0.7 * scale, 1 * scale, 0x3b2a1f);
    const light = this.point(x, 1.6 * scale, z, 0xff7a2a, 25 * scale, 12 * scale, { flicker: 0.6 });
    const flames = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0xff8a2a, transparent: true, opacity: 0.85, blending: THREE.AdditiveBlending, depthWrite: false });
    for (let i = 0; i < 5; i++) {
      const f = new THREE.Mesh(new THREE.ConeGeometry(0.22 * scale, 0.8 * scale, 6), mat);
      f.position.set((Math.random() - 0.5) * 0.35 * scale, (barrel ? 1.3 : 0.3) * scale, (Math.random() - 0.5) * 0.35 * scale);
      flames.add(f);
    }
    flames.position.set(x, 0, z);
    this.add(flames);
    let t = Math.random() * 10;
    this.onUpdate((dt, game) => {
      t += dt;
      flames.children.forEach((f, i) => {
        f.scale.y = 0.7 + Math.abs(Math.sin(t * 9 + i * 1.7)) * 0.6;
        f.rotation.y += dt * 2;
      });
      if (Math.random() < dt * 12) {
        game.effects.spawn(new THREE.Vector3(x + (Math.random() - 0.5) * 0.3, (barrel ? 1.5 : 0.5) * scale, z), new THREE.Vector3((Math.random() - 0.5) * 0.4, 1.5 + Math.random(), (Math.random() - 0.5) * 0.4), new THREE.Color(0xffa040), 0.06, 1.4, -0.2);
      }
    });
    return light;
  }

  /** Exit beacon shown once the level is cleared. */
  beacon(x, z) {
    const g = new THREE.Group();
    const mat = new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.25, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide });
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(1.2, 1.2, 40, 24, 1, true), mat);
    beam.position.y = 20;
    const ring = new THREE.Mesh(new THREE.RingGeometry(2, 2.3, 48).rotateX(-Math.PI / 2), new THREE.MeshBasicMaterial({ color: 0x66ccff, transparent: true, opacity: 0.8, side: THREE.DoubleSide }));
    ring.position.y = 0.05;
    g.add(beam, ring);
    g.position.set(x, 0, z);
    const light = new THREE.PointLight(0x66ccff, 30, 14, 1.5);
    light.position.y = 2;
    g.add(light);
    this.add(g);
    let t = 0;
    g.update = (dt) => {
      t += dt;
      mat.opacity = 0.2 + Math.sin(t * 3) * 0.08;
      ring.scale.setScalar(1 + Math.sin(t * 3) * 0.06);
    };
    return g;
  }
}
