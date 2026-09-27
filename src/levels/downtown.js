import * as THREE from 'three';
import { buildingRow, policeCar, CARS, brickTexture, V } from './city.js';

// Level 1: a four-way intersection downtown. Streets run out 30 m in each direction,
// lined with buildings; the ends are closed off by more buildings.

const ARM = 39; // how far each street runs from the center

export default {
  id: 1,
  name: 'Downtown',
  subtitle: 'Main & 5th · 11:48 PM',
  brief: 'Dispatch went silent twenty minutes ago. Something is walking the streets with a machete — and it brought friends. Hold the intersection until backup arrives.',
  objective: 'Survive the waves',
  mood: 0,
  startWeapons: ['pistol'],
  waves: [
    { enemies: { killer: 6 }, maxAlive: 5, title: 'they come out of the dark' },
    { enemies: { killer: 6, slasher: 4 }, maxAlive: 7 },
    { enemies: { killer: 6, slasher: 6, potman: 2 }, maxAlive: 9, title: 'hold the line' },
  ],

  async build(kit) {
    const { world } = kit;
    world.setBounds(-ARM, ARM, -ARM, ARM);
    kit.atmosphere({ sky: 0x0b1020, fog: 0x0d1322, density: 0.028 });
    kit.hemi(0x5a6a90, 0x1a1512, 0.9);
    kit.moon(0x9fb4ff, 1.6, new THREE.Vector3(-18, 30, 12));

    // Base ground under everything (no gaps into the void).
    kit.ground(200, 200, { color: 0x151518, y: -0.16 });

    // Streets
    const jobs = [kit.place('city/Street_4WayIntersection.gltf', 0, 0, { collide: false, opts: { center: false }, shadows: false })];
    for (let d = 12; d <= 36; d += 6) {
      for (const s of [1, -1]) {
        jobs.push(kit.place('city/Street_4Lane.gltf', d * s, 0, { collide: false, opts: { center: false }, shadows: false }));
        jobs.push(kit.place('city/Street_4Lane.gltf', 0, d * s, { rot: Math.PI / 2, collide: false, opts: { center: false }, shadows: false }));
      }
    }
    await Promise.all(jobs);

    // Solid city blocks in each quadrant, fronted by building rows.
    const brick = brickTexture(kit);
    brick.repeat.set(8, 3);
    for (const sx of [1, -1]) for (const sz of [1, -1]) {
      kit.box(sx * 24.5, sz * 24.5, 29, 29, 5, 0x2b2220, { map: brick, y: 0 });
    }
    const rows = [];
    for (const s of [1, -1]) {
      // along x arms: fronts at z = ±9 facing the street
      rows.push(buildingRow(kit, { axis: 'x', from: 9.5, to: ARM, edge: 9 * s, facing: V(0, -s), order: [0, 1] }));
      rows.push(buildingRow(kit, { axis: 'x', from: -ARM, to: -9.5, edge: 9 * s, facing: V(0, -s), order: [1, 0] }));
      // along z arms (only the outer part; the inner part is the corner of the x rows)
      rows.push(buildingRow(kit, { axis: 'z', from: 25, to: ARM, edge: 9 * s, facing: V(-s, 0), order: [1] }));
      rows.push(buildingRow(kit, { axis: 'z', from: -ARM, to: -25, edge: 9 * s, facing: V(-s, 0), order: [1] }));
    }
    // Close the far ends of each street.
    rows.push(kit.place('city/Building_Large_2.gltf', ARM + 8.3, 0, { rot: -Math.PI / 2 }));
    rows.push(kit.place('city/Building_Large_2.gltf', -ARM - 8.3, 0, { rot: Math.PI / 2 }));
    rows.push(kit.place('city/Building_Large_2.gltf', 0, ARM + 8.3, { rot: Math.PI }));
    rows.push(kit.place('city/Building_Large_2.gltf', 0, -ARM - 8.3, { rot: 0 }));
    await Promise.all(rows);

    // Street furniture
    const props = [];
    for (let d = 14; d <= 36; d += 11) {
      for (const s of [1, -1]) {
        kit.lamp(d * s, 7.6, { rot: Math.PI });
        kit.lamp(-d * s, -7.6, { rot: 0 });
        kit.lamp(7.6, d * s, { rot: -Math.PI / 2 });
        kit.lamp(-7.6, -d * s, { rot: Math.PI / 2 });
      }
    }
    for (const [x, z] of [[12, 7.8], [-20, -7.8], [7.8, -18], [-7.8, 30], [30, -7.8], [-30, 7.8]]) {
      props.push(kit.place('city/Prop_Bollard.gltf', x, z));
      props.push(kit.place('city/Prop_Bollard.gltf', x + (Math.abs(z) > 7 ? 1.2 : 0), z + (Math.abs(z) > 7 ? 0 : 1.2)));
    }
    for (const [x, z] of [[20, 7.5], [-26, -7.5], [7.5, 20], [-7.5, -26]]) props.push(kit.place('city/Prop_Planter_Single.gltf', x, z));
    for (const [x, z] of [[15, 2], [-4, 20], [26, -3], [-20, 1]]) props.push(kit.place('city/Prop_ManholeCover.gltf', x, z, { collide: false }));

    // Cars: a police cruiser at the intersection, crashes and parked cars as cover.
    props.push(policeCar(kit, -5.5, -7, 0.4));
    props.push(kit.place(CARS.van, 20, -3.5, { rot: Math.PI / 2 + 0.15, shrink: 0.1 }));
    props.push(kit.place(CARS.hatch, 5.5, 14, { rot: 0.3, shrink: 0.1 }));
    props.push(kit.place(CARS.muscle, -18, 4.2, { rot: Math.PI / 2, shrink: 0.1 }));
    props.push(kit.place(CARS.classic, -4, -22, { rot: -0.2, shrink: 0.1 }));
    props.push(kit.place(CARS.pickup, 30, 3.8, { rot: -Math.PI / 2, shrink: 0.1 }));
    props.push(kit.place(CARS.hatch, 3.8, -32, { rot: Math.PI, shrink: 0.1 }));
    // Barricades at the far ends.
    props.push(policeCar(kit, 35, -2, Math.PI / 2 - 0.3));
    props.push(kit.place(CARS.military, -35, 1.5, { rot: Math.PI / 2 + 0.2, shrink: 0.1 }));
    props.push(kit.place(CARS.van, 2, -35.5, { rot: 0.5, shrink: 0.1 }));
    for (const [x, z] of [[9, -9.5], [-12, 8], [25, 8.3]]) props.push(kit.place('house/trashBag.glb', x, z, { collide: false }));
    await Promise.all(props);
    kit.fire(10.5, -8, { scale: 0.9 });
    kit.fire(-26, 6.5, { scale: 0.9 });
    kit.fire(4, 27, { scale: 0.9 });

    const spawns = [];
    for (const s of [1, -1]) {
      for (const lane of [-5, 0, 5]) {
        spawns.push({ x: 34 * s, z: lane }, { x: lane, z: 34 * s });
      }
      spawns.push({ x: 22 * s, z: 7 }, { x: 22 * s, z: -7 }, { x: 7, z: 22 * s }, { x: -7, z: 22 * s });
    }

    return {
      playerStart: { x: 1, z: -2, yaw: 0 },
      spawns,
      exit: { x: 0, z: 34 },
      pickups: [
        { kind: 'health', x: -8, z: 8 },
        { kind: 'health', x: 22, z: -7.5 },
      ],
    };
  },
};
