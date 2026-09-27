import * as THREE from 'three';

const CELL = 1; // nav grid resolution in meters

/**
 * Static collision (boxes, optionally rotated about Y), ray queries, and a flow field that
 * every enemy follows toward the player.
 *
 * Each box stores its center (cx, cz), half extents (hx, hz), rotation (cos c, sin s) and an
 * axis-aligned envelope (minX..maxZ) used for quick rejection.
 */
export class World {
  constructor() {
    this.boxes = [];
    this.bounds = { minX: -50, maxX: 50, minZ: -50, maxZ: 50 };
  }

  setBounds(minX, maxX, minZ, maxZ) {
    this.bounds = { minX, maxX, minZ, maxZ };
  }

  /** Oriented box: center, half extents in its own frame, rotation about Y. */
  addOriented(cx, cz, hx, hz, rot, minY, maxY) {
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    const ex = Math.abs(c) * hx + Math.abs(s) * hz;
    const ez = Math.abs(s) * hx + Math.abs(c) * hz;
    const b = { cx, cz, hx, hz, c, s, minY, maxY, minX: cx - ex, maxX: cx + ex, minZ: cz - ez, maxZ: cz + ez };
    this.boxes.push(b);
    return b;
  }

  addBox(minX, maxX, minZ, maxZ, minY = 0, maxY = 3) {
    return this.addOriented((minX + maxX) / 2, (minZ + maxZ) / 2, (maxX - minX) / 2, (maxZ - minZ) / 2, 0, minY, maxY);
  }

  /** Box centered at (x, z) with width w (x) and depth d (z). */
  addRect(x, z, w, d, h = 3, y = 0) {
    return this.addBox(x - w / 2, x + w / 2, z - d / 2, z + d / 2, y, y + h);
  }

  /** Collider fitted to an object in its own (unrotated) frame, optionally shrunk. */
  addObject(obj, { shrink = 0, minHeight = 0 } = {}) {
    const rot = obj.rotation.y;
    obj.rotation.y = 0;
    obj.updateMatrixWorld(true);
    const box = new THREE.Box3().setFromObject(obj);
    obj.rotation.y = rot;
    obj.updateMatrixWorld(true);
    if (box.isEmpty()) return null;
    // Box center relative to the pivot, rotated into place.
    const ox = (box.min.x + box.max.x) / 2 - obj.position.x;
    const oz = (box.min.z + box.max.z) / 2 - obj.position.z;
    const c = Math.cos(rot);
    const s = Math.sin(rot);
    return this.addOriented(
      obj.position.x + ox * c + oz * s,
      obj.position.z - ox * s + oz * c,
      Math.max(0.05, (box.max.x - box.min.x) / 2 - shrink),
      Math.max(0.05, (box.max.z - box.min.z) / 2 - shrink),
      rot, box.min.y, Math.max(box.max.y, minHeight),
    );
  }

  /** Pushes a circle (character) out of every box it overlaps. Mutates pos. */
  collide(pos, radius, height = 1.8) {
    const b = this.bounds;
    pos.x = Math.min(b.maxX - radius, Math.max(b.minX + radius, pos.x));
    pos.z = Math.min(b.maxZ - radius, Math.max(b.minZ + radius, pos.z));
    let hit = false;
    for (const box of this.boxes) {
      if (box.maxY < pos.y + 0.35 || box.minY > pos.y + height) continue;
      if (pos.x < box.minX - radius || pos.x > box.maxX + radius || pos.z < box.minZ - radius || pos.z > box.maxZ + radius) continue;
      // Into the box frame (rotate by -rot).
      const dx = pos.x - box.cx;
      const dz = pos.z - box.cz;
      const lx = dx * box.c - dz * box.s;
      const lz = dx * box.s + dz * box.c;
      const nx = Math.max(-box.hx, Math.min(lx, box.hx));
      const nz = Math.max(-box.hz, Math.min(lz, box.hz));
      let px = lx - nx;
      let pz = lz - nz;
      const d2 = px * px + pz * pz;
      if (d2 >= radius * radius) continue;
      hit = true;
      let mx;
      let mz;
      if (d2 > 1e-8) {
        const d = Math.sqrt(d2);
        mx = (px / d) * (radius - d);
        mz = (pz / d) * (radius - d);
      } else {
        // Center is inside the box: exit along the shallowest axis.
        const ex = box.hx + radius - Math.abs(lx);
        const ez = box.hz + radius - Math.abs(lz);
        if (ex < ez) { mx = Math.sign(lx || 1) * ex; mz = 0; } else { mx = 0; mz = Math.sign(lz || 1) * ez; }
      }
      // Back to world (rotate by +rot).
      pos.x += mx * box.c + mz * box.s;
      pos.z += -mx * box.s + mz * box.c;
    }
    return hit;
  }

  /** Distance along a normalized ray to the first box (or the ground plane), or Infinity. */
  raycast(origin, dir, maxDist = 200) {
    let best = maxDist;
    let found = false;
    if (dir.y < -1e-6 && origin.y > 0) {
      const t = -origin.y / dir.y;
      if (t < best) { best = t; found = true; }
    }
    for (const c of this.boxes) {
      const t = rayBox(origin, dir, c, best);
      if (t !== null && t < best) { best = t; found = true; }
    }
    return found ? best : Infinity;
  }

  lineOfSight(a, b) {
    const dir = new THREE.Vector3().subVectors(b, a);
    const len = dir.length();
    if (len < 1e-4) return true;
    dir.divideScalar(len);
    return this.raycast(a, dir, len) === Infinity;
  }

  // --- navigation --------------------------------------------------------------------------------

  buildNav(clearance = 0.45) {
    const b = this.bounds;
    const w = Math.ceil((b.maxX - b.minX) / CELL);
    const h = Math.ceil((b.maxZ - b.minZ) / CELL);
    const blocked = new Uint8Array(w * h);
    for (const c of this.boxes) {
      if (c.minY > 1.5 || c.maxY < 0.3) continue;
      const x0 = Math.max(0, Math.floor((c.minX - clearance - b.minX) / CELL));
      const x1 = Math.min(w - 1, Math.floor((c.maxX + clearance - b.minX) / CELL));
      const z0 = Math.max(0, Math.floor((c.minZ - clearance - b.minZ) / CELL));
      const z1 = Math.min(h - 1, Math.floor((c.maxZ + clearance - b.minZ) / CELL));
      for (let z = z0; z <= z1; z++) for (let x = x0; x <= x1; x++) {
        // Block only if the cell center is within the inflated box (in the box frame).
        const dx = b.minX + (x + 0.5) * CELL - c.cx;
        const dz = b.minZ + (z + 0.5) * CELL - c.cz;
        const lx = dx * c.c - dz * c.s;
        const lz = dx * c.s + dz * c.c;
        if (Math.abs(lx) < c.hx + clearance && Math.abs(lz) < c.hz + clearance) blocked[z * w + x] = 1;
      }
    }
    this.nav = { w, h, blocked, dist: new Float32Array(w * h), queue: new Int32Array(w * h * 8) };
  }

  cellOf(x, z) {
    const b = this.bounds;
    const cx = Math.min(this.nav.w - 1, Math.max(0, Math.floor((x - b.minX) / CELL)));
    const cz = Math.min(this.nav.h - 1, Math.max(0, Math.floor((z - b.minZ) / CELL)));
    return cz * this.nav.w + cx;
  }

  /** Dijkstra-ish BFS (8-connected) from the target over the whole grid. */
  updateFlow(target) {
    if (!this.nav) return;
    const { w, h, blocked, dist, queue } = this.nav;
    dist.fill(Infinity);
    let start = this.cellOf(target.x, target.z);
    if (blocked[start]) start = this.nearestOpen(start);
    let head = 0;
    let tail = 0;
    dist[start] = 0;
    queue[tail++] = start;
    const D = Math.SQRT2;
    while (head < tail) {
      const i = queue[head++];
      const x = i % w;
      const z = (i / w) | 0;
      const di = dist[i];
      for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
        if (!dx && !dz) continue;
        const nx = x + dx;
        const nz = z + dz;
        if (nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
        const j = nz * w + nx;
        if (blocked[j]) continue;
        // No corner cutting past blocked cells.
        if (dx && dz && (blocked[z * w + nx] || blocked[nz * w + x])) continue;
        const nd = di + (dx && dz ? D : 1);
        if (nd < dist[j]) {
          dist[j] = nd;
          if (tail < queue.length) queue[tail++] = j;
        }
      }
    }
  }

  nearestOpen(i) {
    const { w, h, blocked } = this.nav;
    const x0 = i % w;
    const z0 = (i / w) | 0;
    for (let r = 1; r < 12; r++) for (let dz = -r; dz <= r; dz++) for (let dx = -r; dx <= r; dx++) {
      const x = x0 + dx;
      const z = z0 + dz;
      if (x >= 0 && z >= 0 && x < w && z < h && !blocked[z * w + x]) return z * w + x;
    }
    return i;
  }

  /** Direction (unit x/z) an agent at pos should walk to follow the flow field, or null. */
  flowDir(pos, out) {
    if (!this.nav) return null;
    const { w, h, dist, blocked } = this.nav;
    let i = this.cellOf(pos.x, pos.z);
    if (blocked[i] || dist[i] === Infinity) i = this.nearestOpen(i);
    const x = i % w;
    const z = (i / w) | 0;
    let best = dist[i];
    let bx = 0;
    let bz = 0;
    for (let dz = -1; dz <= 1; dz++) for (let dx = -1; dx <= 1; dx++) {
      const nx = x + dx;
      const nz = z + dz;
      if ((!dx && !dz) || nx < 0 || nz < 0 || nx >= w || nz >= h) continue;
      const j = nz * w + nx;
      if (dx && dz && (blocked[z * w + nx] || blocked[nz * w + x])) continue;
      if (dist[j] < best) { best = dist[j]; bx = dx; bz = dz; }
    }
    if (!bx && !bz) return null;
    const b = this.bounds;
    // Steer toward the center of the best neighbor cell (smooths around corners).
    const tx = b.minX + (x + bx + 0.5) * CELL - pos.x;
    const tz = b.minZ + (z + bz + 0.5) * CELL - pos.z;
    const l = Math.hypot(tx, tz) || 1;
    out.x = tx / l;
    out.z = tz / l;
    return out;
  }

  isOpen(x, z) {
    if (!this.nav) return true;
    const b = this.bounds;
    if (x < b.minX + 0.5 || x > b.maxX - 0.5 || z < b.minZ + 0.5 || z > b.maxZ - 0.5) return false;
    return !this.nav.blocked[this.cellOf(x, z)];
  }

  reachable(x, z) {
    return this.nav && this.isOpen(x, z) && this.nav.dist[this.cellOf(x, z)] < Infinity;
  }
}

function rayBox(o, d, c, maxDist) {
  // Transform the ray into the box frame (rotation about Y only).
  const ox = o.x - c.cx;
  const oz = o.z - c.cz;
  const lox = ox * c.c - oz * c.s;
  const loz = ox * c.s + oz * c.c;
  const ldx = d.x * c.c - d.z * c.s;
  const ldz = d.x * c.s + d.z * c.c;
  let tmin = 0;
  let tmax = maxDist;
  for (const [oa, da, mn, mx] of [[lox, ldx, -c.hx, c.hx], [o.y, d.y, c.minY, c.maxY], [loz, ldz, -c.hz, c.hz]]) {
    if (Math.abs(da) < 1e-9) {
      if (oa < mn || oa > mx) return null;
    } else {
      let t1 = (mn - oa) / da;
      let t2 = (mx - oa) / da;
      if (t1 > t2) [t1, t2] = [t2, t1];
      tmin = Math.max(tmin, t1);
      tmax = Math.min(tmax, t2);
      if (tmin > tmax) return null;
    }
  }
  return tmin;
}

/** Ray vs vertical cylinder [y0, y1] of radius r at (cx, cz). Returns t or null. */
export function rayCylinder(o, d, cx, cz, r, y0, y1) {
  const ox = o.x - cx;
  const oz = o.z - cz;
  const a = d.x * d.x + d.z * d.z;
  if (a < 1e-9) return null;
  const b = 2 * (ox * d.x + oz * d.z);
  const c = ox * ox + oz * oz - r * r;
  const disc = b * b - 4 * a * c;
  if (disc < 0) return null;
  const s = Math.sqrt(disc);
  for (const t of [(-b - s) / (2 * a), (-b + s) / (2 * a)]) {
    if (t < 0) continue;
    const y = o.y + d.y * t;
    if (y >= y0 && y <= y1) return t;
  }
  return null;
}

export function raySphere(o, d, center, r) {
  const ox = o.x - center.x;
  const oy = o.y - center.y;
  const oz = o.z - center.z;
  const b = ox * d.x + oy * d.y + oz * d.z;
  const c = ox * ox + oy * oy + oz * oz - r * r;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return t >= 0 ? t : null;
}
