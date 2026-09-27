import * as THREE from 'three';
import { buildingRow, policeCar, CARS } from './city.js';

// Level 5: the town square under a red sky, walled in by buildings. The Creature waits here.

const S = 22; // half-size of the plaza

export default {
  id: 5,
  name: 'Town Square',
  subtitle: 'Founders Plaza · 4:44 AM',
  brief: 'Every trail ends here. The thing that has been feeding all night is waiting in the square. Dawn is an hour away. Kill it, and the night ends with it.',
  objective: 'Kill the Creature',
  mood: 4,
  startWeapons: ['pistol', 'shotgun', 'rifle'],
  minions: ['crawler', 'slasher'],
  waves: [
    { enemies: { crawler: 6, killer: 4, thug: 2 }, maxAlive: 8, title: 'it sends its children first' },
    { boss: true, enemies: {}, maxAlive: 12, title: 'the end of the night' },
  ],

  async build(kit) {
    const { world } = kit;
    world.setBounds(-S, S, -S, S);
    kit.atmosphere({ sky: 0x1a0606, fog: 0x220808, density: 0.03 });
    kit.hemi(0xa05050, 0x160808, 0.7);
    kit.moon(0xff6040, 1.8, new THREE.Vector3(10, 40, -12), 30);

    // Moon disc
    const moonDisc = new THREE.Mesh(new THREE.CircleGeometry(9, 32), new THREE.MeshBasicMaterial({ color: 0xff4a2a, fog: false }));
    moonDisc.position.set(60, 70, -120);
    moonDisc.lookAt(0, 0, 0);
    kit.add(moonDisc);

    kit.ground(200, 200, { color: 0x1a1414, y: -0.12 });

    // Plaza tiles
    const tiles = [];
    for (let x = -S + 2; x < S; x += 4) for (let z = -S + 2; z < S; z += 4) tiles.push({ x, z });
    const jobs = [kit.scatter('city/Floor_4x4.gltf', tiles, { opts: { center: false } })];

    // Buildings on all four sides, fronts facing the plaza.
    jobs.push(
      buildingRow(kit, { axis: 'x', from: -S - 4, to: S + 4, edge: S, facing: new THREE.Vector3(0, 0, -1), order: [2, 0, 1] }),
      buildingRow(kit, { axis: 'x', from: -S - 4, to: S + 4, edge: -S, facing: new THREE.Vector3(0, 0, 1), order: [0, 2, 1] }),
      buildingRow(kit, { axis: 'z', from: -S, to: S, edge: S, facing: new THREE.Vector3(-1, 0, 0), order: [1, 0] }),
      buildingRow(kit, { axis: 'z', from: -S, to: S, edge: -S, facing: new THREE.Vector3(1, 0, 0), order: [0, 1] }),
    );

    // Central monument: a raised planter ring.
    const stone = new THREE.MeshLambertMaterial({ color: 0x5a5350 });
    const base = new THREE.Mesh(new THREE.CylinderGeometry(3, 3.3, 0.8, 24), stone);
    base.position.y = 0.4;
    const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.6, 0.8, 5, 12), stone);
    pillar.position.y = 3.2;
    base.castShadow = pillar.castShadow = base.receiveShadow = true;
    kit.add(base);
    kit.add(pillar);
    world.addRect(0, 0, 5, 5, 6);

    // Cover: planters, bollards and wrecked cars, some burning.
    for (const [x, z] of [[-10, -8], [10, -8], [-10, 8], [10, 8], [0, -13], [0, 13]]) jobs.push(kit.place('city/Prop_Planter_Single.gltf', x, z));
    for (let a = 0; a < 12; a++) {
      const r = 7;
      jobs.push(kit.place('city/Prop_Bollard.gltf', Math.cos(a / 12 * Math.PI * 2) * r, Math.sin(a / 12 * Math.PI * 2) * r));
    }
    jobs.push(
      policeCar(kit, -14, -15, 0.7),
      kit.place(CARS.van, 15, 12, { rot: 2.2, shrink: 0.1 }),
      kit.place(CARS.hatch, -15, 13, { rot: -0.9, shrink: 0.1 }),
      kit.place(CARS.military, 15, -14, { rot: -0.4, shrink: 0.1 }),
    );
    await Promise.all(jobs);
    kit.fire(15, 10, { barrel: false, scale: 1.8 });
    kit.fire(-15, 11, { barrel: false, scale: 1.5 });
    kit.fire(-6, -17, { scale: 1 });
    kit.fire(18, -2, { scale: 1 });
    for (const [x, z] of [[-18, 0], [0, 18], [18, 5], [-5, -18]]) kit.lamp(x, z, { rot: Math.atan2(-x, -z), color: 0xff9a5a, intensity: 20 });

    // Ash falling.
    kit.onUpdate((dt, game) => {
      if (Math.random() < dt * 30) {
        const p = game.player.pos;
        game.effects.spawn(
          new THREE.Vector3(p.x + (Math.random() - 0.5) * 30, 8 + Math.random() * 4, p.z + (Math.random() - 0.5) * 30),
          new THREE.Vector3(0.4, -0.8, 0.2), new THREE.Color(0x777070), 0.05, 12, 0,
        );
      }
    });

    const spawns = [];
    for (let i = 0; i < 16; i++) {
      const a = (i / 16) * Math.PI * 2;
      spawns.push({ x: Math.cos(a) * 17, z: Math.sin(a) * 17 }, { x: Math.cos(a) * 11, z: Math.sin(a) * 11 });
    }
    return {
      playerStart: { x: 0, z: -16, yaw: 0 },
      spawns,
      bossSpawn: { x: 0, z: 10 },
      exit: { x: 0, z: -18 },
      pickups: [
        { kind: 'health', x: -18, z: -18 },
        { kind: 'health', x: 18, z: 18 },
        { kind: 'ammo', x: 18, z: -18 },
        { kind: 'ammo', x: -18, z: 18 },
        { kind: 'ammo', x: 7, z: -19 },
      ],
    };
  },
};
