import * as THREE from 'three';

// The character packs ship Mixamo skeletons without animation clips, so every
// motion is posed procedurally here. Limbs are posed by *direction* in model
// space (+Z forward, +X = character's left, +Y up), which makes the same poses
// work across T-pose and A-pose rigs with differing bone axes.

const NAMES = {
  hips: 'Hips', spine: 'Spine', spine1: 'Spine1', spine2: 'Spine2', neck: 'Neck', head: 'Head',
  lArm: 'LeftArm', lFore: 'LeftForeArm', lHand: 'LeftHand',
  rArm: 'RightArm', rFore: 'RightForeArm', rHand: 'RightHand',
  lUpLeg: 'LeftUpLeg', lLeg: 'LeftLeg', lFoot: 'LeftFoot',
  rUpLeg: 'RightUpLeg', rLeg: 'RightLeg', rFoot: 'RightFoot',
};
// Bone -> the child whose position defines the bone's pointing direction.
const AIM_CHILD = { lArm: 'lFore', lFore: 'lHand', rArm: 'rFore', rFore: 'rHand', lUpLeg: 'lLeg', lLeg: 'lFoot', rUpLeg: 'rLeg', rLeg: 'rFoot' };
const ORDER = ['hips', 'spine', 'spine1', 'spine2', 'neck', 'head', 'lArm', 'lFore', 'rArm', 'rFore', 'lUpLeg', 'lLeg', 'rUpLeg', 'rLeg'];

const _q = new THREE.Quaternion();
const _q2 = new THREE.Quaternion();
const _v = new THREE.Vector3();
const _m = new THREE.Matrix4();
const _inv = new THREE.Matrix4();
const _s = new THREE.Vector3();
const _p = new THREE.Vector3();

export class Rig {
  /** @param root the character instance (feet at origin, facing +Z) */
  constructor(root) {
    this.root = root;
    this.bones = {};
    root.traverse((o) => {
      if (!o.isBone) return;
      const base = o.name.replace(/^mixamorig:?/, '');
      for (const [k, n] of Object.entries(NAMES)) if (base === n && !this.bones[k]) this.bones[k] = o;
    });
    this.ok = ['hips', 'lArm', 'rArm', 'lUpLeg', 'rUpLeg', 'lLeg', 'rLeg', 'lFore', 'rFore'].every((k) => this.bones[k]);
    if (!this.ok) return;

    root.updateMatrixWorld(true);
    _inv.copy(root.matrixWorld).invert();
    this.bind = {};
    const modelPos = {};
    const modelQ = {};
    for (const [k, b] of Object.entries(this.bones)) {
      _m.multiplyMatrices(_inv, b.matrixWorld);
      const q = new THREE.Quaternion();
      const p = new THREE.Vector3();
      _m.decompose(p, q, _s);
      modelPos[k] = p;
      modelQ[k] = q;
    }
    for (const k of ORDER) {
      const b = this.bones[k];
      if (!b) continue;
      const entry = { local: b.quaternion.clone(), model: modelQ[k] };
      const child = AIM_CHILD[k];
      if (child && this.bones[child]) entry.dir = modelPos[child].clone().sub(modelPos[k]).normalize();
      this.bind[k] = entry;
    }
    this.hipsBindPos = this.bones.hips.position.clone();
    // Height of the hips above the feet in model space (used for bobbing / crouching).
    this.hipHeight = modelPos.hips.y;
    this.cache = new Map();
  }

  // Model-space rotation of any object in the hierarchy, using this frame's local rotations.
  modelQuat(obj) {
    if (obj === this.root || !obj) return _q2.identity().clone();
    let q = this.cache.get(obj);
    if (!q) {
      q = this.modelQuat(obj.parent).multiply(obj.quaternion);
      this.cache.set(obj, q);
    }
    return q.clone();
  }

  /** Point a limb bone along a model-space direction. */
  aim(key, dir) {
    const b = this.bones[key];
    const bind = this.bind[key];
    if (!b || !bind?.dir) return;
    _v.copy(dir).normalize();
    _q.setFromUnitVectors(bind.dir, _v).multiply(bind.model); // desired model rotation
    const parent = this.modelQuat(b.parent).invert();
    b.quaternion.copy(parent.multiply(_q));
    this.cache.set(b, _q.clone());
  }

  /** Apply a model-space rotation offset (euler, radians) on top of the bind pose. */
  offset(key, x = 0, y = 0, z = 0) {
    const b = this.bones[key];
    const bind = this.bind[key];
    if (!b || !bind) return;
    const parent = this.modelQuat(b.parent);
    _q.setFromEuler(new THREE.Euler(x, y, z, 'YXZ'));
    // local = parent^-1 * R * parent * bindLocal
    const q = parent.clone().invert().multiply(_q).multiply(parent).multiply(bind.local);
    b.quaternion.copy(q);
    this.cache.set(b, this.modelQuat(b.parent).multiply(q));
  }

  begin() {
    this.cache.clear();
  }

  /**
   * Full-body pose for one frame. `s` is a plain state object:
   *   move: {x, z} local move dir * speed factor (0..1+), phase: gait phase (radians),
   *   aim: 0..1 blend to aiming, aimPitch: radians, attack: 0..1 progress or -1,
   *   attackStyle: 'chop' | 'claw' | 'slam' | 'punch', hit: 0..1 flinch,
   *   lean: forward lean radians, zombie: arms-forward blend, crouch: 0..1
   */
  pose(s) {
    if (!this.ok) return;
    this.begin();
    const speed = Math.min(1.4, Math.hypot(s.move.x, s.move.z));
    const mdx = speed > 0.01 ? s.move.x / speed : 0;
    const mdz = speed > 0.01 ? s.move.z / speed : 1;
    const ph = s.phase;
    const stride = Math.min(1, speed) * (s.run ? 0.75 : 0.5);

    // Hips / spine
    const bob = speed > 0.05 ? Math.abs(Math.sin(ph)) * 0.05 * Math.min(1, speed) : Math.sin(s.time * 1.6) * 0.008;
    this.bones.hips.position.copy(this.hipsBindPos);
    this.offset('hips', 0, s.hipTwist ?? 0, 0);
    const lean = (s.lean ?? 0) + speed * (s.run ? 0.18 : 0.06) - (s.hit ?? 0) * 0.35;
    const breathe = Math.sin(s.time * 1.8) * 0.02;
    this.offset('spine', lean * 0.5 + breathe, (s.torsoTwist ?? 0) * 0.5, 0);
    this.offset('spine1', lean * 0.3, (s.torsoTwist ?? 0) * 0.3, 0);
    this.offset('spine2', lean * 0.2 - (s.aim ?? 0) * (s.aimPitch ?? 0) * 0.3, (s.torsoTwist ?? 0) * 0.2, 0);
    this.offset('neck', 0, 0, 0);
    this.offset('head', -(s.headPitch ?? 0), s.headYaw ?? 0, 0);

    // Legs: swing along the movement direction, knee bends on the recovering leg.
    for (const [side, sign] of [['l', 1], ['r', -1]]) {
      const a = Math.sin(ph) * stride * sign;
      const knee = Math.max(0, -Math.cos(ph) * sign) * stride * 1.6 + (s.crouch ?? 0) * 0.9;
      const spread = side === 'l' ? 0.06 : -0.06;
      const ta = a + (s.crouch ?? 0) * 0.5;
      this.aim(`${side}UpLeg`, _p.set(mdx * Math.sin(ta) + spread, -Math.cos(ta), mdz * Math.sin(ta)));
      const la = ta - knee;
      this.aim(`${side}Leg`, _p.set(mdx * Math.sin(la) + spread * 0.5, -Math.cos(la), mdz * Math.sin(la)));
    }

    // Arms: relaxed swing, blended to zombie reach / aiming / attack.
    const swing = Math.sin(ph) * stride * 0.9;
    const armDown = (side) => {
      const sign = side === 'l' ? 1 : -1;
      const c = -swing * sign;
      return [
        new THREE.Vector3(0.22 * sign, -Math.cos(c), Math.sin(c)).normalize(),
        new THREE.Vector3(0.12 * sign, -Math.cos(c) * 0.8, Math.sin(c) + 0.35).normalize(),
      ];
    };
    let L = armDown('l');
    let R = armDown('r');

    const z = s.zombie ?? 0;
    if (z > 0) {
      const wob = Math.sin(s.time * 3) * 0.08;
      const zl = [new THREE.Vector3(0.25, -0.05 + wob, 1).normalize(), new THREE.Vector3(0.05, 0.05, 1).normalize()];
      const zr = [new THREE.Vector3(-0.25, -0.05 - wob, 1).normalize(), new THREE.Vector3(-0.05, 0.05, 1).normalize()];
      L = L.map((v, i) => v.lerp(zl[i], z).normalize());
      R = R.map((v, i) => v.lerp(zr[i], z).normalize());
    }

    const aim = s.aim ?? 0;
    if (aim > 0) {
      const p = s.aimPitch ?? 0;
      const fwd = new THREE.Vector3(0, Math.sin(p), Math.cos(p));
      const two = s.twoHanded ?? false;
      const ra = [fwd.clone().add(new THREE.Vector3(-0.25, -0.12, 0)).normalize(), fwd.clone().add(new THREE.Vector3(0.05, 0, 0)).normalize()];
      const la = two
        ? [fwd.clone().add(new THREE.Vector3(0.35, -0.45, 0.1)).normalize(), fwd.clone().add(new THREE.Vector3(-0.6, 0.2, 0)).normalize()]
        : [fwd.clone().add(new THREE.Vector3(0.2, -0.3, 0)).normalize(), fwd.clone().add(new THREE.Vector3(-0.8, 0, 0)).normalize()];
      if (s.recoil) {
        ra[1].y += s.recoil * 0.5;
        ra[1].normalize();
      }
      L = L.map((v, i) => v.lerp(la[i], aim).normalize());
      R = R.map((v, i) => v.lerp(ra[i], aim).normalize());
    }

    if (s.attack >= 0) [L, R] = attackPose(s.attackStyle, s.attack, L, R);

    if (s.dead) {
      L = [new THREE.Vector3(0.9, 0.3, -0.2).normalize(), new THREE.Vector3(0.9, 0.4, 0).normalize()];
      R = [new THREE.Vector3(-0.9, 0.3, -0.2).normalize(), new THREE.Vector3(-0.9, 0.4, 0).normalize()];
    }

    this.aim('lArm', L[0]);
    this.aim('lFore', L[1]);
    this.aim('rArm', R[0]);
    this.aim('rFore', R[1]);
  }

  worldPos(key, out = new THREE.Vector3()) {
    const b = this.bones[key];
    return b ? b.getWorldPosition(out) : out.setFromMatrixPosition(this.root.matrixWorld);
  }
}

const V = (x, y, z) => new THREE.Vector3(x, y, z).normalize();
const lerpPose = (a, b, t) => a.map((v, i) => v.clone().lerp(b[i], t).normalize());
const ease = (t) => t * t * (3 - 2 * t);

// Attack keyframes: windup (0-0.45) -> strike (0.45-0.65) -> recover (0.65-1).
function attackPose(style, t, L, R) {
  const phase = (from, to, a, b) => ease(Math.min(1, Math.max(0, (t - a) / (b - a))));
  let Lw, Rw, Ls, Rs;
  switch (style) {
    case 'claw':
      Lw = [V(0.7, 0.5, -0.2), V(0.4, 0.8, 0.3)];
      Rw = [V(-0.7, 0.5, -0.2), V(-0.4, 0.8, 0.3)];
      Ls = [V(-0.1, -0.2, 1), V(-0.3, -0.6, 1)];
      Rs = [V(0.1, -0.2, 1), V(0.3, -0.6, 1)];
      break;
    case 'slam':
      Lw = [V(0.3, 1, -0.3), V(0.2, 1, -0.4)];
      Rw = [V(-0.3, 1, -0.3), V(-0.2, 1, -0.4)];
      Ls = [V(0.15, -0.5, 1), V(0.1, -1, 0.4)];
      Rs = [V(-0.15, -0.5, 1), V(-0.1, -1, 0.4)];
      break;
    case 'punch':
      Lw = [V(0.3, -0.5, 0.5), V(-0.3, 0.4, 1)];
      Rw = [V(-0.4, -0.2, -0.6), V(0, 0.6, 0.8)];
      Ls = Lw;
      Rs = [V(0, 0.05, 1), V(0, 0.05, 1)];
      break;
    case 'swing': // two-handed bat swing (player melee), right to left
      Lw = [V(-0.4, 0.4, 0.6), V(-0.7, 0.6, 0.3)];
      Rw = [V(-0.9, 0.4, 0.1), V(-0.6, 0.7, 0.3)];
      Ls = [V(0.8, -0.1, 0.6), V(0.9, 0, 0.3)];
      Rs = [V(0.2, -0.1, 1), V(0.8, 0, 0.6)];
      break;
    default: // 'chop': overhead one-handed machete chop with the right arm
      Lw = [V(0.4, -0.6, 0.6), V(0.1, -0.2, 1)];
      Rw = [V(-0.3, 1, -0.4), V(-0.1, 0.9, -0.6)];
      Ls = [V(0.4, -0.9, -0.3), V(0.2, -0.9, 0.2)];
      Rs = [V(-0.1, -0.3, 1), V(0.1, -0.8, 0.8)];
  }
  const w = phase(0, 1, 0, 0.45);
  const s = phase(0, 1, 0.45, 0.62);
  const r = phase(0, 1, 0.7, 1);
  let l2 = lerpPose(L, Lw, w);
  let r2 = lerpPose(R, Rw, w);
  if (s > 0) { l2 = lerpPose(l2, Ls, s); r2 = lerpPose(r2, Rs, s); }
  if (r > 0) { l2 = lerpPose(l2, L, r); r2 = lerpPose(r2, R, r); }
  return [l2, r2];
}
