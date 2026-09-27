import * as THREE from 'three';

const MAX_PARTICLES = 1500;

function radialTexture(inner, outer) {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, inner);
  grd.addColorStop(1, outer);
  g.fillStyle = grd;
  g.fillRect(0, 0, 64, 64);
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flashTexture() {
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d');
  g.translate(32, 32);
  for (let i = 0; i < 7; i++) {
    g.rotate((Math.PI * 2) / 7 + Math.random() * 0.3);
    const grd = g.createLinearGradient(0, 0, 30, 0);
    grd.addColorStop(0, 'rgba(255,250,210,1)');
    grd.addColorStop(1, 'rgba(255,150,40,0)');
    g.fillStyle = grd;
    g.beginPath();
    g.moveTo(0, -4);
    g.lineTo(28 + Math.random() * 4, 0);
    g.lineTo(0, 4);
    g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class Effects {
  constructor(scene) {
    this.scene = scene;
    this.dotTex = radialTexture('rgba(255,255,255,1)', 'rgba(255,255,255,0)');

    // Particles: one Points object, CPU-simulated.
    const geo = new THREE.BufferGeometry();
    this.pPos = new Float32Array(MAX_PARTICLES * 3);
    this.pCol = new Float32Array(MAX_PARTICLES * 3);
    this.pSize = new Float32Array(MAX_PARTICLES);
    geo.setAttribute('position', new THREE.BufferAttribute(this.pPos, 3));
    geo.setAttribute('color', new THREE.BufferAttribute(this.pCol, 3));
    geo.setAttribute('size', new THREE.BufferAttribute(this.pSize, 1));
    const mat = new THREE.ShaderMaterial({
      uniforms: { map: { value: this.dotTex }, scale: { value: 400 } },
      vertexShader: `attribute float size; attribute vec3 color; varying vec3 vColor;
        uniform float scale;
        void main(){ vColor=color; vec4 mv=modelViewMatrix*vec4(position,1.0);
          gl_PointSize = size * scale / -mv.z; gl_Position=projectionMatrix*mv; }`,
      fragmentShader: `uniform sampler2D map; varying vec3 vColor;
        void main(){ vec4 t=texture2D(map, gl_PointCoord); if(t.a<0.05) discard; gl_FragColor=vec4(vColor, t.a); }`,
      transparent: true,
      depthWrite: false,
    });
    this.points = new THREE.Points(geo, mat);
    this.points.frustumCulled = false;
    scene.add(this.points);
    this.particles = [];
    for (let i = 0; i < MAX_PARTICLES; i++) this.particles.push({ life: 0 });
    this.nextParticle = 0;

    this.flashMat = new THREE.SpriteMaterial({ map: flashTexture(), blending: THREE.AdditiveBlending, depthWrite: false, transparent: true });
    this.flashes = [];
    this.flashLight = new THREE.PointLight(0xffaa55, 0, 9, 1.5);
    scene.add(this.flashLight);
    this.flashLightT = 0;

    this.tracerMat = new THREE.LineBasicMaterial({ color: 0xffe9a0, transparent: true, opacity: 0.9, blending: THREE.AdditiveBlending });
    this.tracers = [];

    this.decalGeo = new THREE.CircleGeometry(1, 12).rotateX(-Math.PI / 2);
    this.decals = [];

    this.rings = [];
    this.ringGeo = new THREE.RingGeometry(0.85, 1, 48).rotateX(-Math.PI / 2);
  }

  spawn(pos, vel, color, size, life, gravity = 9.8, drag = 0) {
    const p = this.particles[this.nextParticle];
    this.nextParticle = (this.nextParticle + 1) % MAX_PARTICLES;
    p.x = pos.x; p.y = pos.y; p.z = pos.z;
    p.vx = vel.x; p.vy = vel.y; p.vz = vel.z;
    p.r = color.r; p.g = color.g; p.b = color.b;
    p.size = size;
    p.life = p.maxLife = life;
    p.gravity = gravity;
    p.drag = drag;
  }

  burst(pos, { count = 10, color = 0xffffff, speed = 3, size = 0.08, life = 0.5, gravity = 9.8, up = 1, dir = null, spread = 1, drag = 0 }) {
    const c = new THREE.Color(color);
    const v = new THREE.Vector3();
    for (let i = 0; i < count; i++) {
      v.set(Math.random() - 0.5, Math.random() * up, Math.random() - 0.5).normalize().multiplyScalar(speed * (0.3 + Math.random() * 0.7));
      if (dir) v.lerp(dir.clone().multiplyScalar(speed * (0.5 + Math.random() * 0.8)), 1 - spread * 0.5);
      const cc = c.clone().multiplyScalar(0.7 + Math.random() * 0.5);
      this.spawn(pos, v, cc, size * (0.6 + Math.random() * 0.8), life * (0.6 + Math.random() * 0.8), gravity, drag);
    }
  }

  blood(pos, dir, amount = 1) {
    this.burst(pos, { count: Math.round(14 * amount), color: 0x8a0303, speed: 3.5, size: 0.09, life: 0.7, dir, spread: 0.8 });
    this.burst(pos, { count: Math.round(5 * amount), color: 0x4a0000, speed: 1.2, size: 0.18, life: 0.5, gravity: 4 });
  }

  sparks(pos, normal) {
    this.burst(pos, { count: 8, color: 0xffcc66, speed: 5, size: 0.05, life: 0.3, dir: normal, spread: 1.2 });
    this.burst(pos, { count: 4, color: 0x777777, speed: 0.8, size: 0.25, life: 0.6, gravity: -0.5, drag: 1 });
  }

  dust(pos, color = 0x8a7f70, count = 30, radius = 3) {
    for (let i = 0; i < count; i++) {
      const a = Math.random() * Math.PI * 2;
      const v = new THREE.Vector3(Math.cos(a) * radius * 2, Math.random() * 2, Math.sin(a) * radius * 2);
      this.spawn(pos, v, new THREE.Color(color), 0.5 + Math.random() * 0.5, 0.8, -0.5, 2.5);
    }
  }

  muzzleFlash(pos, size = 0.5) {
    const s = new THREE.Sprite(this.flashMat);
    s.position.copy(pos);
    s.scale.setScalar(size * (0.8 + Math.random() * 0.4));
    s.material.rotation = Math.random() * Math.PI;
    this.scene.add(s);
    this.flashes.push({ obj: s, t: 0.05 });
    this.flashLight.position.copy(pos);
    this.flashLight.intensity = 25;
    this.flashLightT = 0.06;
  }

  tracer(from, to, color) {
    const geo = new THREE.BufferGeometry().setFromPoints([from, to]);
    const mat = color ? this.tracerMat.clone() : this.tracerMat;
    if (color) mat.color.set(color);
    const line = new THREE.Line(geo, mat);
    this.scene.add(line);
    this.tracers.push({ obj: line, t: 0.06, own: !!color });
  }

  decal(pos, radius, color = 0x3a0000, life = 30) {
    if (this.decals.length > 60) this.removeDecal(this.decals[0]);
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.85, depthWrite: false, polygonOffset: true, polygonOffsetFactor: -2 });
    const mesh = new THREE.Mesh(this.decalGeo, m);
    mesh.position.set(pos.x, (pos.y ?? 0) + 0.02 + Math.random() * 0.005, pos.z);
    mesh.scale.setScalar(0.01);
    mesh.rotation.y = Math.random() * 6;
    this.scene.add(mesh);
    this.decals.push({ obj: mesh, t: life, grow: radius });
  }

  removeDecal(d) {
    this.scene.remove(d.obj);
    d.obj.material.dispose();
    this.decals.splice(this.decals.indexOf(d), 1);
  }

  shockwave(pos, radius, color = 0xff5522, dur = 0.5) {
    const m = new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9, side: THREE.DoubleSide, blending: THREE.AdditiveBlending, depthWrite: false });
    const mesh = new THREE.Mesh(this.ringGeo, m);
    mesh.position.set(pos.x, 0.1, pos.z);
    this.scene.add(mesh);
    this.rings.push({ obj: mesh, t: 0, dur, radius });
  }

  update(dt) {
    for (let i = 0; i < MAX_PARTICLES; i++) {
      const p = this.particles[i];
      if (p.life <= 0) {
        this.pSize[i] = 0;
        continue;
      }
      p.life -= dt;
      p.vy -= p.gravity * dt;
      if (p.drag) {
        const k = Math.max(0, 1 - p.drag * dt);
        p.vx *= k; p.vy *= k; p.vz *= k;
      }
      p.x += p.vx * dt; p.y += p.vy * dt; p.z += p.vz * dt;
      if (p.y < 0.02) { p.y = 0.02; p.vy *= -0.2; p.vx *= 0.5; p.vz *= 0.5; }
      const f = Math.max(0, p.life / p.maxLife);
      this.pPos[i * 3] = p.x; this.pPos[i * 3 + 1] = p.y; this.pPos[i * 3 + 2] = p.z;
      this.pCol[i * 3] = p.r; this.pCol[i * 3 + 1] = p.g; this.pCol[i * 3 + 2] = p.b;
      this.pSize[i] = p.size * (0.4 + 0.6 * f);
    }
    const g = this.points.geometry;
    g.attributes.position.needsUpdate = true;
    g.attributes.color.needsUpdate = true;
    g.attributes.size.needsUpdate = true;

    this.flashes = this.flashes.filter((f) => {
      f.t -= dt;
      if (f.t <= 0) { this.scene.remove(f.obj); return false; }
      return true;
    });
    this.flashLightT -= dt;
    if (this.flashLightT <= 0) this.flashLight.intensity = 0;

    this.tracers = this.tracers.filter((t) => {
      t.t -= dt;
      if (t.t <= 0) {
        this.scene.remove(t.obj);
        t.obj.geometry.dispose();
        if (t.own) t.obj.material.dispose();
        return false;
      }
      return true;
    });

    for (const d of [...this.decals]) {
      d.t -= dt;
      const s = d.obj.scale.x;
      if (s < d.grow) d.obj.scale.setScalar(Math.min(d.grow, s + dt * d.grow * 1.5));
      if (d.t < 3) d.obj.material.opacity = Math.max(0, (d.t / 3) * 0.85);
      if (d.t <= 0) this.removeDecal(d);
    }

    this.rings = this.rings.filter((r) => {
      r.t += dt;
      const k = r.t / r.dur;
      r.obj.scale.setScalar(0.3 + k * r.radius);
      r.obj.material.opacity = 0.9 * (1 - k);
      if (k >= 1) {
        this.scene.remove(r.obj);
        r.obj.material.dispose();
        return false;
      }
      return true;
    });
  }

  clear() {
    this.particles.forEach((p) => { p.life = 0; });
    [...this.decals].forEach((d) => this.removeDecal(d));
    this.flashes.forEach((f) => this.scene.remove(f.obj));
    this.tracers.forEach((t) => this.scene.remove(t.obj));
    this.rings.forEach((r) => this.scene.remove(r.obj));
    this.flashes = [];
    this.tracers = [];
    this.rings = [];
  }
}
