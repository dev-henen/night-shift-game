import * as THREE from 'three';

// Shared pieces for the two city levels (Downtown Megakit + car pack).

export const BUILDINGS = ['city/Building_Medium_2_001.gltf', 'city/Building_Small_1.gltf', 'city/Building_Large_2.gltf'];

export const CARS = {
  police: 'cars/police.glb', van: 'cars/van.glb', hatch: 'cars/hatch.glb', muscle: 'cars/muscle.glb',
  pickup: 'cars/pickup.glb', classic: 'cars/classic.glb', military: 'cars/military.glb',
};

/**
 * Lines buildings up along a street edge. Buildings face +Z in the kit.
 * `facing` is the direction the fronts should look toward (unit axis vector).
 * `from`/`to` are positions along the street axis; `edge` is the coordinate of the building fronts.
 */
export async function buildingRow(kit, { axis, from, to, edge, facing, order = [0, 1, 2], gap = 0 }) {
  const tpls = await Promise.all(BUILDINGS.map((b) => kit.model(b)));
  const rot = Math.atan2(facing.x, facing.z);
  let pos = Math.min(from, to);
  const end = Math.max(from, to);
  let i = 0;
  while (pos < end - 6) {
    const idx = order[i % order.length];
    const size = tpls[idx].userData.size;
    const along = size.x; // width along the street after rotation
    if (pos + along > end + 1) {
      // Try the next (maybe smaller) building, otherwise stop.
      if (i > order.length * 2) break;
      i++;
      continue;
    }
    const center = pos + along / 2;
    const depthOff = size.z / 2;
    const x = axis === 'x' ? center : edge - facing.x * depthOff;
    const z = axis === 'x' ? edge - facing.z * depthOff : center;
    await kit.place(BUILDINGS[idx], x, z, { rot, shrink: 0.2 });
    pos += along + gap;
    i++;
  }
}

/** Police car with flashing red/blue light bar. */
export async function policeCar(kit, x, z, rot) {
  const car = await kit.place(CARS.police, x, z, { rot, shrink: 0.1 });
  const red = kit.point(x, 2.2, z, 0xff2020, 0, 12);
  const blue = kit.point(x, 2.2, z, 0x2050ff, 0, 12);
  let t = Math.random() * 3;
  kit.onUpdate((dt) => {
    t += dt;
    const a = Math.floor(t * 6) % 4;
    red.intensity = a === 0 || a === 2 ? 22 : 0;
    blue.intensity = a === 1 || a === 3 ? 22 : 0;
  });
  return car;
}

export function brickTexture(kit) {
  return kit.canvasTexture(256, (g, s) => {
    g.fillStyle = '#2a1d1a';
    g.fillRect(0, 0, s, s);
    for (let y = 0; y < s; y += 16) {
      for (let x = (y / 16) % 2 ? -16 : 0; x < s; x += 32) {
        const l = 26 + Math.random() * 14;
        g.fillStyle = `hsl(10, 30%, ${l}%)`;
        g.fillRect(x + 1, y + 1, 30, 14);
      }
    }
  }, 1);
}

export const V = (x, z) => new THREE.Vector3(x, 0, z);
