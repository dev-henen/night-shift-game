import * as THREE from 'three';
import { rng } from './kit.js';

// Level 3: one floor of an office tower (VNB office set). Private offices along the north
// wall, an open-plan cubicle farm in the middle, reception and a break area to the south.

const W = 16; // half-width (x)
const D = 12; // half-depth (z)
const H = 3; // ceiling height
const OFFICE = { texture: 'office/palette.png', scale: 0.01 };
const FLOOR = { ...OFFICE, tint: 0x6a6e76 };
const WALL = { ...OFFICE, tint: 0xa9adb4 };
const o = (name) => `office/${name}.fbx`;

export default {
  id: 3,
  name: 'Kessler Tower',
  subtitle: '14th floor · 1:55 AM',
  brief: 'The calls led here: a corporate floor that should be empty. It is not. These ones carry guns — use the desks for cover. Security left an M14 at the reception desk.',
  objective: 'Clear the floor',
  mood: 2,
  startWeapons: ['pistol', 'shotgun'],
  waves: [
    { enemies: { thug: 4, killer: 3 }, maxAlive: 6, title: 'armed and waiting' },
    { enemies: { thug: 6, slasher: 4, potman: 1 }, maxAlive: 8 },
    { enemies: { thug: 6, killer: 4, hulk: 1 }, maxAlive: 9, title: 'the big one is loose' },
  ],

  async build(kit) {
    const { world } = kit;
    const rand = rng(33);
    world.setBounds(-W, W, -D, D);
    kit.atmosphere({ sky: 0x05070a, fog: 0x0b0e14, density: 0.02 });
    kit.hemi(0x8c96aa, 0x2a2622, 0.45);
    kit.ambient(0x303848, 0.3);

    const jobs = [];
    const place = (name, x, z, opt = {}) => jobs.push(kit.place(o(name), x, z, { opts: OFFICE, ...opt }));

    // Floor tiles
    const floor = [];
    for (let x = -W + 1; x < W; x += 2) for (let z = -D + 1; z < D; z += 2) floor.push({ x, z });
    jobs.push(kit.scatter(o('Floor'), floor, { opts: FLOOR }));

    // Outer walls (instanced) + colliders
    const walls = [];
    const wallAlt = [];
    for (let x = -W + 1; x < W; x += 2) {
      (rand() < 0.2 ? wallAlt : walls).push({ x, z: D + 0.1, rot: 0 }, { x, z: -D - 0.1, rot: 0 });
    }
    for (let z = -D + 1; z < D; z += 2) {
      if (z === -1) continue; // elevator
      (rand() < 0.2 ? wallAlt : walls).push({ x: W + 0.1, z, rot: Math.PI / 2 }, { x: -W - 0.1, z, rot: Math.PI / 2 });
    }
    walls.push({ x: -W - 0.1, z: -1, rot: Math.PI / 2 });
    jobs.push(kit.scatter(o('Wall_Standard'), walls, { opts: WALL }), kit.scatter(o('Wall_Standard_Alt_1'), wallAlt, { opts: WALL }));
    world.addRect(0, D + 0.1, W * 2 + 1, 0.4, H);
    world.addRect(0, -D - 0.1, W * 2 + 1, 0.4, H);
    world.addRect(W + 0.1, 0, 0.4, D * 2 + 1, H);
    world.addRect(-W - 0.1, 0, 0.4, D * 2 + 1, H);

    // Private offices along the north wall: partitions at x = -8, 0, 8; front wall at z = 4
    // with one 2 m doorway per office.
    const inner = [];
    const doors = new Set([-13, -5, 3, 11]);
    for (let x = -W + 1; x < W; x += 2) {
      if (doors.has(x)) continue;
      inner.push({ x, z: 4, rot: 0 });
      world.addRect(x, 4, 2, 0.3, H);
    }
    for (const px of [-8, 0, 8]) {
      for (let z = 5; z < D; z += 2) inner.push({ x: px, z, rot: Math.PI / 2 });
      world.addRect(px, 8, 0.3, 8, H);
    }
    jobs.push(kit.scatter(o('Wall_Standard'), inner, { opts: WALL }));

    // Office furniture
    [-12, -4, 4, 12].forEach((cx, i) => {
      place('Office_Desk_1', cx + 1, 9.5, { rot: Math.PI, shrink: 0.05 });
      place('Chair_A', cx + 1, 10.6, { rot: Math.PI, collide: false });
      place('FileCabinet_Standard', cx - 3, 11.2, { rot: Math.PI });
      place(i % 2 ? 'Nature_Deco' : 'Nature_Deco_2', cx + 3.2, 11.2);
      place('Rug_A', cx, 7.5, { collide: false });
      jobs.push(kit.place('house/bookshelf.glb', cx - 3.4, 7, { rot: Math.PI / 2 }));
      place('Computer_Monitor', cx + 1, 9.3, { y: 0.95, rot: Math.PI, collide: false });
    });

    // Open plan: cubicle clusters as cover.
    for (const [x, z, r] of [[-11, -1.5, 0], [-4, -1.5, 0], [3, -1.5, 0], [10, -1.5, 0], [-11, -7.5, Math.PI], [3, -7.5, Math.PI]]) {
      place('Office_Desk_4_Two', x, z, { rot: r, shrink: 0.05 });
      for (const [dx, dz] of [[-0.6, -1], [0.6, 1]]) place('Computer_Monitor', x + dx, z + dz, { y: 0.95, rot: r + Math.PI / 2, collide: false });
      place('Chair_B', x + 1.5, z - 1, { rot: rand() * 6, collide: false });
      place('Chair_B', x - 1.5, z + 1, { rot: rand() * 6, collide: false });
    }
    // Along the walls
    for (const [name, x, z, r] of [
      ['FileCabinet_Standard', -15.4, 1, Math.PI / 2], ['FileCabinet_Standard', -15.4, 2, Math.PI / 2],
      ['Printer', -15.3, -3, Math.PI / 2], ['Nature_Deco', -15.3, -5, 0], ['Nature_Deco', 15.3, 3, 0],
      ['WhiteBoard_Stand', 7, 2.6, 0], ['Box_A', 7.5, -4.5, 0.3], ['Box_B', 8.2, -4.2, 0], ['Box_A', -7.2, -10.8, 0.2],
      ['TrashBin', -6, 3, 0], ['TrashBin', 13, 2.8, 0], ['AirConditioner_A', -2, 3.4, 0],
    ]) place(name, x, z, { rot: r });

    // Reception (south-west) with the rifle, break area (south-east).
    place('Office_CounterA1', -11, -9.8, { rot: 0 });
    place('Office_CounterA1', 12.5, -11.2, { rot: 0 });
    place('CoffeeMachine', 12.5, -11.2, { y: 0.95, collide: false });
    place('Table_Circular', 12, -7, {});
    for (const a of [0, 2.1, 4.2]) place('Chair_A', 12 + Math.cos(a) * 1.1, -7 + Math.sin(a) * 1.1, { rot: -a - Math.PI / 2, collide: false });
    place('Lamp_1', -14.5, -11, { collide: false });

    // Elevator on the east wall (the exit).
    const elevMat = new THREE.MeshLambertMaterial({ color: 0x8a9099, emissive: 0x111418 });
    for (const dz of [-0.5, 0.5]) {
      const door = new THREE.Mesh(new THREE.BoxGeometry(0.1, 2.4, 0.98), elevMat);
      door.position.set(W + 0.05, 1.2, -1 + dz);
      kit.add(door);
    }
    const frame = new THREE.Mesh(new THREE.BoxGeometry(0.3, 3, 2.3), new THREE.MeshLambertMaterial({ color: 0x2a2d33 }));
    frame.position.set(W + 0.3, 1.5, -1);
    kit.add(frame);
    kit.point(W - 0.6, 2.6, -1, 0x66ff99, 4, 5);

    // Ceiling with light panels
    const ceilTex = kit.canvasTexture(128, (g, s) => {
      g.fillStyle = '#8f8c85';
      g.fillRect(0, 0, s, s);
      for (let i = 0; i < 600; i++) {
        g.fillStyle = `rgba(0,0,0,${Math.random() * 0.08})`;
        g.fillRect(Math.random() * s, Math.random() * s, 2, 2);
      }
      g.strokeStyle = '#6e6b64';
      g.lineWidth = 3;
      g.strokeRect(0, 0, s, s);
    }, 1);
    ceilTex.repeat.set(W, D);
    const ceil = new THREE.Mesh(new THREE.PlaneGeometry(W * 2, D * 2).rotateX(Math.PI / 2), new THREE.MeshLambertMaterial({ map: ceilTex }));
    ceil.position.y = H;
    kit.add(ceil);
    world.addBox(-W, W, -D, D, H, H + 0.3);
    const panelMat = new THREE.MeshBasicMaterial({ color: 0xeaf2ff });
    const panelOff = new THREE.MeshBasicMaterial({ color: 0x3a3d44 });
    let li = 0;
    for (let x = -12; x <= 12; x += 8) for (let z = -8; z <= 8; z += 8) {
      const flicker = li === 2 || li === 7;
      const dead = li === 10;
      const panel = new THREE.Mesh(new THREE.BoxGeometry(1.2, 0.04, 0.6), dead ? panelOff : panelMat);
      panel.position.set(x, H - 0.02, z);
      kit.add(panel);
      if (!dead) kit.point(x, H - 0.4, z, 0xdfe8ff, 7, 11, { flicker: flicker ? 1 : 0 });
      li++;
    }
    // Red emergency lights
    kit.point(-15, 2.6, 11, 0xff2a1a, 6, 8, { flicker: 0.4 });
    kit.point(15, 2.6, -11, 0xff2a1a, 6, 8, { flicker: 0.4 });

    await Promise.all(jobs);

    const spawns = [
      { x: -12, z: 7 }, { x: -4, z: 7 }, { x: 4, z: 7 }, { x: 12, z: 7 },
      { x: 14, z: 1 }, { x: -14, z: -4 }, { x: 0, z: 2 }, { x: 7, z: -10 },
      { x: -2, z: -10 }, { x: 14, z: -4 }, { x: -7, z: -5 }, { x: 0, z: -5 },
    ];
    return {
      playerStart: { x: -14, z: -4.5, yaw: Math.PI / 2 }, // in the aisle between the desk rows
      spawns,
      exit: { x: W - 1.5, z: -1 },
      pickups: [
        { kind: 'weapon', weapon: 'rifle', x: -11, z: -8.4 },
        { kind: 'health', x: 12, z: -9 },
        { kind: 'health', x: -4, z: 10 },
        { kind: 'ammo', x: 12, z: 10 },
        { kind: 'ammo', x: 0, z: -11 },
      ],
    };
  },
};
