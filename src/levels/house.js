import * as THREE from 'three';

// Level 4: a dark two-bedroom house built on the PSX interior kit's 4 m grid.
// Tile centers: x = -10 + 4i (i = 0..5), z = 8 - 4j (j = 0..4, north to south).

const COLS = 6;
const ROWS = 5;
const tx = (i) => -10 + 4 * i;
const tz = (j) => 8 - 4 * j;

// Room of each tile, row by row (north first).
const PLAN = [
  'AABCCC',
  'AABCCC',
  'HHHHHH',
  'LLLKKK',
  'LLLKKK',
];
const ROOMS = {
  A: { floor: 'floorCarpet', wall: 'Wallpaper', name: 'bedroom' },
  B: { floor: 'floorTiles', wall: 'Tiles', name: 'bathroom' },
  C: { floor: 'floorWood2', wall: 'Wallpaper2', name: 'master bedroom' },
  H: { floor: 'floorWood', wall: 'Plaster2', name: 'hallway' },
  L: { floor: 'floorWood', wall: 'Wallpaper', name: 'living room' },
  K: { floor: 'floorTiles', wall: 'Plaster', name: 'kitchen' },
};
// Doorways, as "i,j,side" of the tile that builds the edge (shared edges are built from the
// north / west tile, so interior doors are always S or E sides).
const DOORS = new Set(['1,1,S', '2,1,S', '4,1,S', '0,2,S', '1,2,S', '4,2,S', '2,4,E', '1,4,S']);
const SIDES = { N: [0, -1, 0], S: [0, 1, Math.PI], E: [1, 0, Math.PI / 2], W: [-1, 0, -Math.PI / 2] };
const G = { center: false, doubleSide: true };
const h = (n) => `house/${n}.glb`;

export default {
  id: 4,
  name: 'The Holloway House',
  subtitle: '41 Holloway Lane · 3:10 AM',
  brief: 'The trail of bodies ends at a family home on the edge of town. The power is cut. Use your flashlight, check every room, and do not let them corner you.',
  objective: 'Purge the house',
  mood: 3,
  flashlight: true,
  startWeapons: ['pistol', 'shotgun', 'rifle'],
  waves: [
    { enemies: { slasher: 4, crawler: 3 }, maxAlive: 5, title: 'you are not alone' },
    { enemies: { brute: 2, slasher: 4, potman: 2 }, maxAlive: 6 },
    { enemies: { brute: 2, crawler: 6, hulk: 1 }, maxAlive: 7, title: 'it is in the house' },
  ],

  async build(kit) {
    const { world } = kit;
    world.setBounds(-12, 12, -10, 10);
    kit.atmosphere({ sky: 0x020304, fog: 0x040507, density: 0.045 });
    kit.hemi(0x3a4666, 0x0c0906, 0.35);
    const moon = kit.moon(0x7f95d8, 1.1, new THREE.Vector3(-22, 14, 10), 18);
    moon.shadow.mapSize.set(1024, 1024);

    const room = (i, j) => (i < 0 || j < 0 || i >= COLS || j >= ROWS ? null : PLAN[j][i]);
    const jobs = [];
    const piece = (name, x, z, rot = 0) => jobs.push(kit.place(h(name), x, z, { rot, collide: false, opts: G }));

    // Floors, ceilings, walls
    for (let j = 0; j < ROWS; j++) {
      for (let i = 0; i < COLS; i++) {
        const r = ROOMS[room(i, j)];
        const x = tx(i);
        const z = tz(j);
        piece(r.floor, x, z);
        piece('ceilingPlaster', x, z);
        for (const [side, [di, dj, rot]] of Object.entries(SIDES)) {
          const other = room(i + di, j + dj);
          if (other === room(i, j)) continue;
          // Shared interior edges are built once, from the north / west tile.
          if (other && (side === 'N' || side === 'W')) continue;
          const door = DOORS.has(`${i},${j},${side}`);
          const exterior = !other;
          const windowed = exterior && !door && (i + j) % 2 === 0;
          const type = door ? 'wallDoor' : windowed ? 'wallWindow' : 'wall';
          const skin = exterior ? 'Plaster' : r.wall;
          piece(`${type}${skin}`, x, z, rot);
          // Collider along the edge (split around doorways).
          const ex = x + di * 2;
          const ez = z - dj * 2;
          const along = di === 0; // edge runs along x
          const segs = door ? [[-1.5, 1], [1.5, 1]] : [[0, 4]];
          for (const [off, len] of segs) {
            if (along) world.addRect(ex + off, ez, len, 0.3, 4);
            else world.addRect(ex, ez + off, 0.3, len, 4);
          }
        }
      }
    }
    // Keep the camera under the ceiling.
    world.addBox(-12, 12, -10, 10, 3.9, 4.4);

    // Furniture (kit props face +Z).
    const prop = (name, x, z, rot = 0, opt = {}) => jobs.push(kit.place(h(name), x, z, { rot, shrink: 0.08, ...opt }));
    // Bedroom A
    prop('bed', -9.5, 8.6, Math.PI);
    prop('cabinetHigh', -5.2, 9.4, Math.PI);
    prop('carpet', -8, 5.5, 0, { collide: false });
    prop('teddybear', -7.2, 8.8, 2.5, { collide: false });
    prop('tableLamp', -11.4, 6.6, Math.PI / 2, { collide: false });
    prop('radiator', -11.6, 4, Math.PI / 2);
    // Bathroom
    prop('bathtub', -2, 8.9, Math.PI);
    prop('toilet', -3.4, 4.2, Math.PI / 2);
    prop('bathroomSink', -0.5, 5.2, -Math.PI / 2);
    prop('washingMachine', -0.6, 7, -Math.PI / 2);
    // Master bedroom
    prop('bed2', 7.5, 8.7, Math.PI);
    prop('sideboard', 11.4, 5, -Math.PI / 2);
    prop('tv', 11.4, 5, -Math.PI / 2, { y: 0.9, collide: false });
    prop('couchSmall', 2.2, 7.5, Math.PI / 2);
    prop('bookshelf', 1.2, 3.2, Math.PI / 2);
    prop('carpet2', 7, 5, 0, { collide: false });
    prop('lamp', 4.8, 9.4, 0, { collide: false });
    prop('plant', 11.2, 9.2, 0);
    // Hallway
    prop('shelves', -1, 1.6, Math.PI);
    prop('plant2', -11.4, 1.4, 0);
    prop('box', 4, -1.4, 0.4);
    prop('box2', 4.6, -1.5, 0.1);
    prop('box3', 8.7, 1.5, 1.2);
    prop('clock', 1.8, 1.7, Math.PI, { collide: false });
    // Living room
    prop('couchBig', -7, -8.8, 0);
    prop('couchSmall', -10.9, -6.3, Math.PI / 2);
    prop('tableSmall', -7, -6.9, 0);
    prop('sideboard', -7, -3, Math.PI);
    prop('tv', -7, -3, Math.PI, { y: 0.9, collide: false });
    prop('carpet', -6.5, -7, 0, { collide: false });
    prop('bookshelf', -1, -9.4, 0);
    prop('lamp', -11.2, -9.2, 0, { collide: false });
    prop('painting', -3, -9.95, 0, { y: 1.4, collide: false });
    // Kitchen
    prop('fridge', 11.1, -9.2, 0);
    prop('oven', 9.2, -9.4, 0);
    prop('cabinetLow', 7.9, -9.4, 0);
    prop('cabinetSink', 6.6, -9.4, 0);
    prop('cabinetLow', 5.3, -9.4, 0);
    prop('table', 6.5, -5.5, 0);
    prop('chair', 5.2, -5.5, Math.PI / 2, { collide: false });
    prop('chair2', 7.8, -5.5, -Math.PI / 2, { collide: false });
    prop('trashBin', 11.3, -3, 0);
    prop('trashBag', 10.2, -2.8, 0, { collide: false });
    await Promise.all(jobs);

    // Lights: a few weak, flickering practicals and the TV glow.
    kit.point(-11, 1.2, 6.6, 0xffa860, 5, 7, { flicker: 0.6 });
    kit.point(4.8, 1.6, 9, 0xffa860, 4, 6, { flicker: 0.3 });
    kit.point(0, 3.4, 0, 0xffd9a0, 5, 9, { flicker: 1 });
    kit.point(-11, 1.6, -9, 0xffa860, 4, 7, { flicker: 0.5 });
    const tv = kit.point(-7, 1.4, -3.8, 0x6d8cff, 6, 7);
    let t = 0;
    kit.onUpdate((dt) => {
      t += dt;
      tv.intensity = 4 + Math.sin(t * 17) * 1.5 + Math.sin(t * 5.3) * 2;
      tv.color.setHSL(0.6 + Math.sin(t * 0.7) * 0.05, 0.7, 0.6);
    });
    kit.point(11, 1.2, -8.3, 0xe8f4ff, 3, 4, { flicker: 0.2 }); // open fridge

    // Blood smears for atmosphere (effects exist once the level is running).
    let smeared = false;
    kit.onUpdate((dt, game) => {
      if (!smeared) {
        smeared = true;
        for (const [x, z, r] of [[-6, 0, 1.2], [-6.5, -2, 0.8], [3, 4, 0.9], [9, -6, 1.4], [-2, 7, 0.7]]) game.effects.decal({ x, z }, r, 0x2a0000, 1e9);
      }
    });

    const spawns = [];
    for (let j = 0; j < ROWS; j++) for (let i = 0; i < COLS; i++) spawns.push({ x: tx(i), z: tz(j) });
    return {
      playerStart: { x: 10, z: 0, yaw: -Math.PI / 2 },
      spawns,
      exit: { x: -6, z: -9 },
      pickups: [
        { kind: 'health', x: -2, z: 6 },
        { kind: 'health', x: 9, z: -3.5 },
        { kind: 'ammo', x: -10, z: 0 },
        { kind: 'ammo', x: 3, z: 9 },
        { kind: 'ammo', x: -3, z: -5 },
      ],
    };
  },
};
