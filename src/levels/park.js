import * as THREE from 'three';
import { rng } from './kit.js';
import { CARS } from './city.js';

// Level 2: a clearing in Blackwood Park, ringed by dense forest.

const R = 38; // playable radius

export default {
  id: 2,
  name: 'Blackwood Park',
  subtitle: 'North trailhead · 12:40 AM',
  brief: 'The trail led you off the road and into the trees. Something is crawling through the undergrowth, fast and low. A patrol shotgun is in the trunk of your cruiser — grab it.',
  objective: 'Survive the waves',
  mood: 1,
  startWeapons: ['pistol'],
  waves: [
    { enemies: { crawler: 6, killer: 3 }, maxAlive: 6, title: 'movement in the trees' },
    { enemies: { crawler: 9, slasher: 4 }, maxAlive: 8 },
    { enemies: { crawler: 8, killer: 4, brute: 1 }, maxAlive: 9, title: 'something big is coming' },
  ],

  async build(kit) {
    const { world } = kit;
    const rand = rng(7);
    world.setBounds(-R - 2, R + 2, -R - 2, R + 2);
    kit.atmosphere({ sky: 0x0a1210, fog: 0x0e1813, density: 0.035 });
    kit.hemi(0x6f8f9a, 0x1a2414, 0.8);
    kit.moon(0xb8c8ff, 1.3, new THREE.Vector3(14, 28, -16), 30);

    // Ground: procedural grass/dirt texture.
    const grass = kit.canvasTexture(512, (g, s) => {
      g.fillStyle = '#26361c';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 9000; i++) {
        const h = 80 + Math.random() * 30;
        const l = 12 + Math.random() * 16;
        g.fillStyle = `hsl(${h}, 35%, ${l}%)`;
        const x = Math.random() * s;
        const y = Math.random() * s;
        g.fillRect(x, y, 1 + Math.random() * 2, 3 + Math.random() * 5);
      }
      for (let i = 0; i < 40; i++) {
        g.fillStyle = `rgba(60, 45, 30, ${0.15 + Math.random() * 0.2})`;
        g.beginPath();
        g.arc(Math.random() * s, Math.random() * s, 10 + Math.random() * 40, 0, Math.PI * 2);
        g.fill();
      }
    }, 18);
    const ground = kit.ground(160, 160, { color: 0xffffff });
    ground.material.map = grass;

    // Dirt trail from the clearing to the exit.
    const trail = kit.canvasTexture(128, (g, s) => {
      g.fillStyle = '#3b2f22';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 800; i++) {
        const l = 15 + Math.random() * 15;
        g.fillStyle = `hsl(30, 25%, ${l}%)`;
        g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
    }, 1);
    trail.repeat.set(1, 8);
    const trailMesh = new THREE.Mesh(new THREE.PlaneGeometry(3.2, 34).rotateX(-Math.PI / 2), new THREE.MeshLambertMaterial({ map: trail, transparent: true, opacity: 0.9 }));
    trailMesh.position.set(0, 0.02, -20);
    trailMesh.receiveShadow = true;
    kit.add(trailMesh);

    // Trees: a dense ring at the edge plus scattered trees inside (kept off the trail and clearing).
    const kinds = {
      common: [1, 2, 3, 4, 5].map((i) => `nature/CommonTree_${i}.gltf`),
      pine: [1, 2, 3, 4, 5].map((i) => `nature/Pine_${i}.gltf`),
      twisted: [1, 2, 3].map((i) => `nature/TwistedTree_${i}.gltf`),
      dead: [1, 2, 3, 4, 5].map((i) => `nature/DeadTree_${i}.gltf`),
    };
    // Placements are grouped by model and by whether they cast shadows (only near trees do).
    const placements = new Map();
    const put = (path, t, shadows = false) => {
      const key = `${path}|${shadows}`;
      if (!placements.has(key)) placements.set(key, { path, shadows, list: [] });
      placements.get(key).list.push(t);
    };
    const lowPoly = ['nature/Pine_5.gltf', 'nature/Pine_4.gltf', 'nature/CommonTree_5.gltf', 'nature/CommonTree_3.gltf', 'nature/Pine_2.gltf'];
    const trees = [];
    const clearOf = (x, z, min) => trees.every((t) => (t.x - x) ** 2 + (t.z - z) ** 2 > min * min);
    const pick = (arr) => arr[Math.floor(rand() * arr.length)];
    // Edge ring (three staggered layers, out past the corners of the bounds).
    for (let layer = 0; layer < 3; layer++) {
      const r = R + 1 + layer * 4.5;
      const n = Math.floor((Math.PI * 2 * r) / 4.2);
      for (let i = 0; i < n; i++) {
        const a = (i / n) * Math.PI * 2 + layer * 0.37 + rand() * 0.1;
        const x = Math.cos(a) * (r + rand() * 2);
        const z = Math.sin(a) * (r + rand() * 2);
        if (Math.abs(x) < 3.5 && z < -R + 2 && layer === 0) continue; // trail opening
        trees.push({ x, z });
        put(layer === 0 ? pick(rand() < 0.6 ? kinds.pine : kinds.common) : pick(lowPoly), { x, z, rot: rand() * 6.28, scale: 0.9 + rand() * 0.5 }, layer === 0);
      }
    }
    // Corners beyond the ring.
    for (let i = 0; i < 60; i++) {
      const x = (rand() - 0.5) * 110;
      const z = (rand() - 0.5) * 110;
      if (Math.hypot(x, z) < R + 11) continue;
      put('nature/Pine_5.gltf', { x, z, rot: rand() * 6.28, scale: 1.1 + rand() * 0.6 });
    }
    // Interior trees.
    for (let i = 0; i < 400 && trees.length < 400; i++) {
      const a = rand() * Math.PI * 2;
      const r = 9 + rand() * (R - 12);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if (Math.abs(x) < 4 && z < -4) continue; // trail
      if (!clearOf(x, z, 6.5)) continue;
      trees.push({ x, z, inner: true });
      const set = rand() < 0.15 ? kinds.dead : rand() < 0.2 ? kinds.twisted : rand() < 0.5 ? kinds.pine : kinds.common;
      put(pick(set), { x, z, rot: rand() * 6.28, scale: 0.85 + rand() * 0.4 }, true);
    }
    for (const t of trees) if (t.inner || Math.hypot(t.x, t.z) < R + 4) world.addRect(t.x, t.z, 0.9, 0.9, 6);

    // Rocks (collide), undergrowth (no collision).
    const rocks = [];
    for (let i = 0; i < 24; i++) {
      const a = rand() * Math.PI * 2;
      const r = 7 + rand() * (R - 10);
      const x = Math.cos(a) * r;
      const z = Math.sin(a) * r;
      if ((Math.abs(x) < 4 && z < -3) || !clearOf(x, z, 3)) continue;
      rocks.push(kit.place(`nature/Rock_Medium_${1 + (i % 3)}.gltf`, x, z, { rot: rand() * 6, scale: 0.7 + rand() * 0.7, shrink: 0.35 }));
    }
    const scatterRandom = (paths, n, scaleMin, scaleMax, avoidTrail = true) => {
      for (let i = 0; i < n; i++) {
        const x = (rand() - 0.5) * 2 * (R + 4);
        const z = (rand() - 0.5) * 2 * (R + 4);
        if (avoidTrail && Math.abs(x) < 2 && z < -3) continue;
        put(pick(paths), { x, z, rot: rand() * 6.28, scale: scaleMin + rand() * (scaleMax - scaleMin) });
      }
    };
    scatterRandom(['nature/Grass_Common_Tall.gltf', 'nature/Grass_Common_Short.gltf', 'nature/Grass_Wispy_Tall.gltf'], 550, 0.8, 1.4);
    scatterRandom(['nature/Bush_Common.gltf', 'nature/Bush_Common_Flowers.gltf', 'nature/Fern_1.gltf', 'nature/Plant_1_Big.gltf', 'nature/Plant_7_Big.gltf'], 160, 0.7, 1.3);
    scatterRandom(['nature/Flower_3_Group.gltf', 'nature/Flower_4_Group.gltf', 'nature/Mushroom_Common.gltf'], 90, 0.8, 1.2);

    const leafy = { doubleSide: true };
    await Promise.all([
      ...rocks,
      ...[...placements.values()].map(({ path, shadows, list }) => kit.scatter(path, list, { shadows, opts: /Tree|Pine/.test(path) ? {} : leafy })),
    ]);

    // Campfire in the clearing.
    for (let i = 0; i < 4; i++) {
      const log = kit.box(0, 0, 0.25, 1.4, 0.25, 0x3a2717, { collide: false });
      log.rotation.y = (i / 4) * Math.PI;
      log.position.set(3, 0.12, 3);
    }
    kit.fire(3, 3, { barrel: false, scale: 1.3 });
    world.addRect(3, 3, 1.2, 1.2, 1);
    for (let i = 0; i < 8; i++) {
      const a = (i / 8) * Math.PI * 2;
      await kit.place('nature/Rock_Medium_2.gltf', 3 + Math.cos(a) * 1, 3 + Math.sin(a) * 1, { scale: 0.18, collide: false, rot: a });
    }

    // The player's cruiser, headlights on, at the trailhead.
    await kit.place(CARS.police, -3.5, -9, { rot: Math.PI - 0.3, shrink: 0.1 });
    for (const off of [-0.6, 0.6]) {
      const hl = new THREE.SpotLight(0xfff2cc, 45, 30, 0.45, 0.6, 1.5);
      const base = new THREE.Vector3(off, 0.8, 2.4).applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI - 0.3).add(new THREE.Vector3(-3.5, 0, -9));
      hl.position.copy(base);
      hl.target.position.copy(base).add(new THREE.Vector3(0, -0.6, 10).applyAxisAngle(THREE.Object3D.DEFAULT_UP, Math.PI - 0.3));
      kit.add(hl);
      kit.add(hl.target);
    }

    // Fireflies.
    kit.onUpdate((dt, game) => {
      if (Math.random() < dt * 25) {
        const p = game.player.pos;
        const pos = new THREE.Vector3(p.x + (Math.random() - 0.5) * 30, 0.5 + Math.random() * 2.5, p.z + (Math.random() - 0.5) * 30);
        game.effects.spawn(pos, new THREE.Vector3((Math.random() - 0.5) * 0.4, (Math.random() - 0.3) * 0.3, (Math.random() - 0.5) * 0.4), new THREE.Color(0xd8ff7a), 0.07, 3, 0);
      }
    });

    const spawns = [];
    for (let i = 0; i < 20; i++) {
      const a = (i / 20) * Math.PI * 2;
      spawns.push({ x: Math.cos(a) * 30, z: Math.sin(a) * 30 }, { x: Math.cos(a + 0.15) * 20, z: Math.sin(a + 0.15) * 20 });
    }
    return {
      playerStart: { x: 0, z: -6, yaw: 0 },
      spawns,
      exit: { x: 0, z: -R + 2 },
      pickups: [
        { kind: 'weapon', weapon: 'shotgun', x: -1, z: -5 },
        { kind: 'health', x: -14, z: 12 },
        { kind: 'health', x: 18, z: -10 },
        { kind: 'ammo', x: 12, z: 16 },
      ],
    };
  },
};
