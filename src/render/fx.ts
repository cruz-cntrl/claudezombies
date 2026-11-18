import * as THREE from 'three';
import { withBake } from './materials';

/**
 * Pooled effects: CPU-simulated particles drawn as two Points systems (additive + alpha),
 * instanced decals (bullet holes, blood), instanced shell casings with bounce physics,
 * and billboard ribbon arcs for the Signal Disruptor. Zero allocations per frame.
 */
const PARTICLE_VS = /* glsl */`
  attribute float aSize;
  attribute vec4 aColor;
  varying vec4 vColor;
  uniform float uScale;
  void main() {
    vColor = aColor;
    vec4 mv = modelViewMatrix * vec4(position, 1.0);
    gl_PointSize = aSize * uScale / max(0.1, -mv.z);
    gl_Position = projectionMatrix * mv;
  }`;
const PARTICLE_FS = /* glsl */`
  varying vec4 vColor;
  uniform float uSoft;
  void main() {
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c) * 2.0;
    float a = 1.0 - smoothstep(uSoft, 1.0, d);
    if (a <= 0.01) discard;
    gl_FragColor = vec4(vColor.rgb, vColor.a * a);
  }`;

class ParticleSystem {
  readonly points: THREE.Points;
  private pos: Float32Array;
  private col: Float32Array;
  private size: Float32Array;
  private vel: Float32Array;
  private life: Float32Array;
  private maxLife: Float32Array;
  private base: Float32Array; // r,g,b,a,size,growth,gravity,drag
  private alive = 0;
  private cursor = 0;
  readonly material: THREE.ShaderMaterial;

  constructor(readonly cap: number, additive: boolean) {
    const g = new THREE.BufferGeometry();
    this.pos = new Float32Array(cap * 3);
    this.col = new Float32Array(cap * 4);
    this.size = new Float32Array(cap);
    this.vel = new Float32Array(cap * 3);
    this.life = new Float32Array(cap);
    this.maxLife = new Float32Array(cap);
    this.base = new Float32Array(cap * 8);
    g.setAttribute('position', new THREE.BufferAttribute(this.pos, 3).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aColor', new THREE.BufferAttribute(this.col, 4).setUsage(THREE.DynamicDrawUsage));
    g.setAttribute('aSize', new THREE.BufferAttribute(this.size, 1).setUsage(THREE.DynamicDrawUsage));
    this.material = new THREE.ShaderMaterial({
      vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
      uniforms: { uScale: { value: 300 }, uSoft: { value: additive ? 0.0 : 0.3 } },
      transparent: true, depthWrite: false,
      blending: additive ? THREE.AdditiveBlending : THREE.NormalBlending,
    });
    this.points = new THREE.Points(g, this.material);
    this.points.frustumCulled = false;
    this.points.renderOrder = additive ? 6 : 5;
  }

  spawn(x: number, y: number, z: number, vx: number, vy: number, vz: number, life: number,
    r: number, g: number, b: number, a: number, size: number, growth: number, gravity: number, drag: number) {
    const i = this.cursor;
    this.cursor = (this.cursor + 1) % this.cap;
    this.pos[i * 3] = x; this.pos[i * 3 + 1] = y; this.pos[i * 3 + 2] = z;
    this.vel[i * 3] = vx; this.vel[i * 3 + 1] = vy; this.vel[i * 3 + 2] = vz;
    this.life[i] = life; this.maxLife[i] = life;
    const o = i * 8;
    this.base[o] = r; this.base[o + 1] = g; this.base[o + 2] = b; this.base[o + 3] = a;
    this.base[o + 4] = size; this.base[o + 5] = growth; this.base[o + 6] = gravity; this.base[o + 7] = drag;
    this.alive = Math.max(this.alive, i + 1);
  }

  update(dt: number) {
    const n = this.cap;
    for (let i = 0; i < n; i++) {
      if (this.life[i] <= 0) { this.col[i * 4 + 3] = 0; this.size[i] = 0; continue; }
      this.life[i] -= dt;
      const o = i * 8;
      const t = 1 - Math.max(0, this.life[i]) / this.maxLife[i];
      const drag = Math.exp(-this.base[o + 7] * dt);
      this.vel[i * 3] *= drag; this.vel[i * 3 + 2] *= drag;
      this.vel[i * 3 + 1] = this.vel[i * 3 + 1] * drag - this.base[o + 6] * dt;
      this.pos[i * 3] += this.vel[i * 3] * dt;
      this.pos[i * 3 + 1] += this.vel[i * 3 + 1] * dt;
      this.pos[i * 3 + 2] += this.vel[i * 3 + 2] * dt;
      if (this.pos[i * 3 + 1] < 0.01) { this.pos[i * 3 + 1] = 0.01; this.vel[i * 3 + 1] *= -0.3; this.vel[i * 3] *= 0.6; this.vel[i * 3 + 2] *= 0.6; }
      const fadeIn = Math.min(1, t * 8);
      this.col[i * 4] = this.base[o];
      this.col[i * 4 + 1] = this.base[o + 1];
      this.col[i * 4 + 2] = this.base[o + 2];
      this.col[i * 4 + 3] = this.base[o + 3] * (1 - t) * fadeIn;
      this.size[i] = this.base[o + 4] * (1 + this.base[o + 5] * t);
    }
    const g = this.points.geometry;
    (g.attributes.position as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aColor as THREE.BufferAttribute).needsUpdate = true;
    (g.attributes.aSize as THREE.BufferAttribute).needsUpdate = true;
  }

  clear() { this.life.fill(0); }
}

// ---------------------------------------------------------------- decal atlas
function decalAtlas(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = S * 4; c.height = S;
  const g = c.getContext('2d')!;
  // 0: bullet hole
  let cx = S / 2;
  let grd = g.createRadialGradient(cx, S / 2, 2, cx, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(0,0,0,1)'); grd.addColorStop(0.12, 'rgba(10,8,6,0.95)'); grd.addColorStop(0.25, 'rgba(40,35,30,0.6)'); grd.addColorStop(1, 'rgba(40,35,30,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  for (let i = 0; i < 10; i++) { g.strokeStyle = 'rgba(20,15,10,0.5)'; g.lineWidth = 1; g.beginPath(); g.moveTo(cx, S / 2); const a = Math.random() * 6.28; g.lineTo(cx + Math.cos(a) * S * 0.3, S / 2 + Math.sin(a) * S * 0.3); g.stroke(); }
  // 1: blood splat
  cx = S * 1.5;
  for (let i = 0; i < 26; i++) {
    const a = Math.random() * 6.28, d = Math.random() * S * 0.38, r = 4 + Math.random() * 16 * (1 - d / (S * 0.4));
    g.fillStyle = `rgba(${60 + Math.random() * 30},${4 + Math.random() * 6},${4},${0.8 + Math.random() * 0.2})`;
    g.beginPath(); g.arc(cx + Math.cos(a) * d, S / 2 + Math.sin(a) * d, r, 0, 6.28); g.fill();
  }
  g.fillStyle = 'rgba(55,5,4,0.95)'; g.beginPath(); g.arc(cx, S / 2, S * 0.18, 0, 6.28); g.fill();
  // 2: scorch
  cx = S * 2.5;
  grd = g.createRadialGradient(cx, S / 2, 2, cx, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(5,4,3,0.95)'); grd.addColorStop(0.5, 'rgba(15,12,10,0.6)'); grd.addColorStop(1, 'rgba(20,15,10,0)');
  g.fillStyle = grd; g.fillRect(S * 2, 0, S, S);
  // 3: blood pool / smear
  cx = S * 3.5;
  for (let i = 0; i < 14; i++) {
    g.fillStyle = `rgba(${45 + Math.random() * 20},4,3,0.9)`;
    g.beginPath(); g.ellipse(cx + (Math.random() - 0.5) * S * 0.4, S / 2 + (Math.random() - 0.5) * S * 0.4, S * 0.08 + Math.random() * S * 0.12, S * 0.06 + Math.random() * S * 0.1, Math.random() * 3, 0, 6.28); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function flashTexture(): THREE.CanvasTexture {
  const S = 128;
  const c = document.createElement('canvas');
  c.width = c.height = S;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(S / 2, S / 2, 0, S / 2, S / 2, S / 2);
  grd.addColorStop(0, 'rgba(255,250,220,1)'); grd.addColorStop(0.2, 'rgba(255,190,90,0.9)'); grd.addColorStop(0.5, 'rgba(220,90,20,0.35)'); grd.addColorStop(1, 'rgba(120,30,0,0)');
  g.fillStyle = grd; g.fillRect(0, 0, S, S);
  g.globalCompositeOperation = 'lighter';
  for (let i = 0; i < 7; i++) {
    const a = (i / 7) * Math.PI * 2 + Math.random() * 0.4;
    g.strokeStyle = 'rgba(255,200,120,0.55)'; g.lineWidth = 5 + Math.random() * 4;
    g.beginPath(); g.moveTo(S / 2, S / 2); g.lineTo(S / 2 + Math.cos(a) * S * 0.48, S / 2 + Math.sin(a) * S * 0.48); g.stroke();
  }
  const t = new THREE.CanvasTexture(c);
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

export class FX {
  readonly additive: ParticleSystem;
  readonly alpha: ParticleSystem;
  readonly group = new THREE.Group();
  private decals: THREE.InstancedMesh;
  private decalTile: THREE.InstancedBufferAttribute;
  private decalBake: THREE.InstancedBufferAttribute;
  private decalIdx = 0;
  private casings: THREE.InstancedMesh;
  private cas: { x: number; y: number; z: number; vx: number; vy: number; vz: number; rx: number; ry: number; spin: number; life: number; bounced: boolean; shell: boolean }[] = [];
  private casIdx = 0;
  readonly flashTex = flashTexture();
  readonly muzzleLight: THREE.PointLight;
  private flashT = 0;
  // arcs
  private arcGeo: THREE.BufferGeometry;
  private arcPos: Float32Array;
  private arcCol: Float32Array;
  private arcs: { pts: THREE.Vector3[]; life: number; max: number; width: number; color: THREE.Color }[] = [];
  readonly arcMesh: THREE.Mesh;
  onCasingBounce: ((x: number, y: number, z: number, shell: boolean) => void) | null = null;
  particleScale = 1;
  private m = new THREE.Matrix4();
  private q = new THREE.Quaternion();
  private e = new THREE.Euler();
  private v = new THREE.Vector3();
  private s = new THREE.Vector3(1, 1, 1);

  constructor(decalCount: number, casingCount: number) {
    this.additive = new ParticleSystem(700, true);
    this.alpha = new ParticleSystem(700, false);
    this.group.add(this.additive.points, this.alpha.points);
    // decals
    const dg = new THREE.PlaneGeometry(1, 1);
    this.decalTile = new THREE.InstancedBufferAttribute(new Float32Array(decalCount), 1);
    this.decalBake = new THREE.InstancedBufferAttribute(new Float32Array(decalCount * 3).fill(0.2), 3);
    dg.setAttribute('aTile', this.decalTile);
    dg.setAttribute('instBake', this.decalBake);
    const dm = new THREE.MeshStandardMaterial({
      map: decalAtlas(), transparent: true, depthWrite: false, roughness: 0.6,
      polygonOffset: true, polygonOffsetFactor: -4, polygonOffsetUnits: -4,
    });
    withBake(dm, 'instance');
    const prev = dm.onBeforeCompile;
    dm.onBeforeCompile = (sh, r) => {
      prev.call(dm, sh, r);
      sh.vertexShader = sh.vertexShader
        .replace('#include <common>', '#include <common>\nattribute float aTile;')
        .replace('#include <uv_vertex>', '#include <uv_vertex>\n#ifdef USE_MAP\nvMapUv = vec2((uv.x + aTile) * 0.25, uv.y);\n#endif');
    };
    dm.customProgramCacheKey = () => 'decal';
    this.decals = new THREE.InstancedMesh(dg, dm, decalCount);
    this.decals.frustumCulled = false;
    const zero = new THREE.Matrix4().makeScale(0, 0, 0);
    for (let i = 0; i < decalCount; i++) this.decals.setMatrixAt(i, zero);
    this.decals.renderOrder = 1;
    this.group.add(this.decals);
    // casings
    const cg = new THREE.CylinderGeometry(0.005, 0.005, 0.028, 6);
    cg.rotateZ(Math.PI / 2);
    const cm = new THREE.MeshStandardMaterial({ color: 0xc89a40, metalness: 0.9, roughness: 0.3 });
    this.casings = new THREE.InstancedMesh(cg, cm, casingCount);
    this.casings.frustumCulled = false;
    for (let i = 0; i < casingCount; i++) {
      this.casings.setMatrixAt(i, zero);
      this.cas.push({ x: 0, y: -10, z: 0, vx: 0, vy: 0, vz: 0, rx: 0, ry: 0, spin: 0, life: 0, bounced: true, shell: false });
    }
    this.group.add(this.casings);
    this.muzzleLight = new THREE.PointLight(0xffb060, 0, 9, 2);
    this.group.add(this.muzzleLight);
    // arcs: up to 24 ribbons x 10 segments
    const maxQuads = 24 * 10;
    this.arcPos = new Float32Array(maxQuads * 4 * 3);
    this.arcCol = new Float32Array(maxQuads * 4 * 3);
    const idx: number[] = [];
    for (let q = 0; q < maxQuads; q++) { const b = q * 4; idx.push(b, b + 1, b + 2, b + 2, b + 1, b + 3); }
    this.arcGeo = new THREE.BufferGeometry();
    this.arcGeo.setAttribute('position', new THREE.BufferAttribute(this.arcPos, 3).setUsage(THREE.DynamicDrawUsage));
    this.arcGeo.setAttribute('color', new THREE.BufferAttribute(this.arcCol, 3).setUsage(THREE.DynamicDrawUsage));
    this.arcGeo.setIndex(idx);
    this.arcMesh = new THREE.Mesh(this.arcGeo, new THREE.MeshBasicMaterial({ vertexColors: true, blending: THREE.AdditiveBlending, transparent: true, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    this.arcMesh.frustumCulled = false;
    this.arcMesh.renderOrder = 7;
    this.group.add(this.arcMesh);
  }

  // ------------------------------------------------------------ emitters
  sparks(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, color = 0xffa040, speed = 4) {
    const c = new THREE.Color(color);
    const n = Math.ceil(count * this.particleScale);
    for (let i = 0; i < n; i++) {
      const vx = nx * speed * (0.3 + Math.random()) + (Math.random() - 0.5) * speed;
      const vy = ny * speed * (0.3 + Math.random()) + Math.random() * speed * 0.7;
      const vz = nz * speed * (0.3 + Math.random()) + (Math.random() - 0.5) * speed;
      this.additive.spawn(x, y, z, vx, vy, vz, 0.2 + Math.random() * 0.35, c.r * 3, c.g * 3, c.b * 3, 1, 0.025 + Math.random() * 0.02, -0.5, 9, 1.5);
    }
  }
  dust(x: number, y: number, z: number, nx: number, ny: number, nz: number, count: number, color = 0x8a8070) {
    const c = new THREE.Color(color);
    const n = Math.ceil(count * this.particleScale);
    for (let i = 0; i < n; i++) {
      this.alpha.spawn(x + nx * 0.03, y + ny * 0.03, z + nz * 0.03,
        nx * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6, ny * (0.6 + Math.random()) + Math.random() * 0.4, nz * (0.6 + Math.random()) + (Math.random() - 0.5) * 0.6,
        0.6 + Math.random() * 0.6, c.r * 0.5, c.g * 0.5, c.b * 0.5, 0.45, 0.12 + Math.random() * 0.08, 2.5, 0.4, 3);
    }
  }
  blood(x: number, y: number, z: number, dx: number, dy: number, dz: number, count: number) {
    const n = Math.ceil(count * this.particleScale);
    for (let i = 0; i < n; i++) {
      const sp = 1 + Math.random() * 3;
      this.alpha.spawn(x, y, z, dx * sp + (Math.random() - 0.5) * 1.5, dy * sp + Math.random() * 1.5, dz * sp + (Math.random() - 0.5) * 1.5,
        0.35 + Math.random() * 0.4, 0.22, 0.01, 0.01, 0.95, 0.03 + Math.random() * 0.05, 0.5, 9, 0.5);
    }
    for (let i = 0; i < Math.ceil(n / 3); i++) {
      this.alpha.spawn(x, y, z, dx * 0.5, 0.2, dz * 0.5, 0.5, 0.16, 0.01, 0.01, 0.5, 0.15, 1.5, 0, 4);
    }
  }
  smoke(x: number, y: number, z: number, count: number, size = 0.2, color = 0x6a6a6a, rise = 0.6) {
    const c = new THREE.Color(color);
    for (let i = 0; i < Math.ceil(count * this.particleScale); i++) {
      this.alpha.spawn(x + (Math.random() - 0.5) * 0.1, y, z + (Math.random() - 0.5) * 0.1, (Math.random() - 0.5) * 0.4, rise * (0.5 + Math.random()), (Math.random() - 0.5) * 0.4,
        1.0 + Math.random() * 1.2, c.r * 0.6, c.g * 0.6, c.b * 0.6, 0.35, size, 3, -0.2, 1);
    }
  }
  electric(x: number, y: number, z: number, count: number, color = 0x50f0ff) {
    const c = new THREE.Color(color);
    for (let i = 0; i < Math.ceil(count * this.particleScale); i++) {
      this.additive.spawn(x, y, z, (Math.random() - 0.5) * 5, (Math.random() - 0.3) * 4, (Math.random() - 0.5) * 5,
        0.1 + Math.random() * 0.3, c.r * 4, c.g * 4, c.b * 4, 1, 0.03 + Math.random() * 0.03, -0.6, 6, 2);
    }
  }
  glowPuff(x: number, y: number, z: number, color: number, size: number, life = 0.25) {
    const c = new THREE.Color(color);
    this.additive.spawn(x, y, z, 0, 0, 0, life, c.r * 3, c.g * 3, c.b * 3, 1, size, 1, 0, 0);
  }
  explosion(x: number, y: number, z: number, scale = 1) {
    for (let i = 0; i < 26 * this.particleScale; i++) {
      const a = Math.random() * 6.28, sp = (2 + Math.random() * 6) * scale;
      this.additive.spawn(x, y + 0.2, z, Math.cos(a) * sp, Math.random() * 5 * scale, Math.sin(a) * sp, 0.25 + Math.random() * 0.35, 3.5, 1.6, 0.4, 1, 0.25 * scale + Math.random() * 0.2, 2.5, 3, 4);
    }
    this.sparks(x, y + 0.2, z, 0, 1, 0, 30, 0xffb050, 9);
    this.smoke(x, y + 0.4, z, 16, 0.6 * scale, 0x3a3634, 1.2);
    this.glowPuff(x, y + 0.5, z, 0xff8030, 3 * scale, 0.18);
    this.flash(x, y + 1, z, 30, 0xff9040);
  }

  /** Short world-space light flash (muzzle, explosion). */
  flash(x: number, y: number, z: number, intensity: number, color = 0xffb060) {
    this.muzzleLight.position.set(x, y, z);
    this.muzzleLight.color.setHex(color);
    this.muzzleLight.intensity = intensity;
    this.flashT = 0.06;
  }

  decal(tile: number, x: number, y: number, z: number, nx: number, ny: number, nz: number, size: number, bake?: { r: number; g: number; b: number }) {
    const i = this.decalIdx;
    this.decalIdx = (this.decalIdx + 1) % this.decals.count;
    this.v.set(nx, ny, nz);
    this.q.setFromUnitVectors(UP_Z, this.v);
    this.e.set(0, 0, Math.random() * 6.28);
    const spin = new THREE.Quaternion().setFromEuler(this.e);
    this.q.multiply(spin);
    this.s.set(size, size, size);
    this.v.set(x + nx * 0.01, y + ny * 0.01, z + nz * 0.01);
    this.m.compose(this.v, this.q, this.s);
    this.decals.setMatrixAt(i, this.m);
    this.decals.instanceMatrix.needsUpdate = true;
    this.decalTile.setX(i, tile);
    this.decalTile.needsUpdate = true;
    if (bake) { this.decalBake.setXYZ(i, bake.r, bake.g, bake.b); this.decalBake.needsUpdate = true; }
  }

  casing(x: number, y: number, z: number, vx: number, vy: number, vz: number, shell = false) {
    const c = this.cas[this.casIdx];
    this.casIdx = (this.casIdx + 1) % this.cas.length;
    c.x = x; c.y = y; c.z = z; c.vx = vx; c.vy = vy; c.vz = vz; c.rx = Math.random() * 6; c.ry = Math.random() * 6;
    c.spin = 10 + Math.random() * 20; c.life = 3; c.bounced = false; c.shell = shell;
  }

  arc(pts: THREE.Vector3[], life: number, width: number, color: number) {
    if (this.arcs.length >= 24) this.arcs.shift();
    this.arcs.push({ pts, life, max: life, width, color: new THREE.Color(color) });
  }

  update(dt: number, cam: THREE.Camera) {
    this.additive.update(dt);
    this.alpha.update(dt);
    // muzzle light
    if (this.flashT > 0) { this.flashT -= dt; if (this.flashT <= 0) this.muzzleLight.intensity = 0; else this.muzzleLight.intensity *= 0.6; }
    // casings
    let any = false;
    for (let i = 0; i < this.cas.length; i++) {
      const c = this.cas[i];
      if (c.life <= 0) continue;
      any = true;
      c.life -= dt;
      c.vy -= 9.8 * dt;
      c.x += c.vx * dt; c.y += c.vy * dt; c.z += c.vz * dt;
      c.rx += c.spin * dt; c.ry += c.spin * 0.7 * dt;
      if (c.y < 0.01) {
        c.y = 0.01;
        if (Math.abs(c.vy) > 0.6) { if (!c.bounced) { c.bounced = true; this.onCasingBounce?.(c.x, c.y, c.z, c.shell); } }
        c.vy *= -0.35; c.vx *= 0.5; c.vz *= 0.5; c.spin *= 0.5;
      }
      this.e.set(c.rx, c.ry, 0);
      this.q.setFromEuler(this.e);
      this.v.set(c.x, c.y, c.z);
      this.s.setScalar(c.life > 0 ? (c.shell ? 2.2 : 1) : 0);
      this.m.compose(this.v, this.q, this.s);
      this.casings.setMatrixAt(i, this.m);
    }
    if (any) this.casings.instanceMatrix.needsUpdate = true;
    // arcs → camera-facing ribbons
    let q = 0;
    const cp = cam.position;
    for (let a = this.arcs.length - 1; a >= 0; a--) {
      const arc = this.arcs[a];
      arc.life -= dt;
      if (arc.life <= 0) { this.arcs.splice(a, 1); continue; }
      const k = arc.life / arc.max;
      for (let s = 0; s < arc.pts.length - 1 && q < 240; s++, q++) {
        const p0 = arc.pts[s], p1 = arc.pts[s + 1];
        // side vector = (p1-p0) x (cam - p0)
        const dx = p1.x - p0.x, dy = p1.y - p0.y, dz = p1.z - p0.z;
        const vx = cp.x - p0.x, vy = cp.y - p0.y, vz = cp.z - p0.z;
        let sx = dy * vz - dz * vy, sy = dz * vx - dx * vz, sz = dx * vy - dy * vx;
        const l = Math.hypot(sx, sy, sz) || 1;
        const w = arc.width * (0.6 + Math.random() * 0.8);
        sx = (sx / l) * w; sy = (sy / l) * w; sz = (sz / l) * w;
        const o = q * 12;
        this.arcPos[o] = p0.x - sx; this.arcPos[o + 1] = p0.y - sy; this.arcPos[o + 2] = p0.z - sz;
        this.arcPos[o + 3] = p0.x + sx; this.arcPos[o + 4] = p0.y + sy; this.arcPos[o + 5] = p0.z + sz;
        this.arcPos[o + 6] = p1.x - sx; this.arcPos[o + 7] = p1.y - sy; this.arcPos[o + 8] = p1.z - sz;
        this.arcPos[o + 9] = p1.x + sx; this.arcPos[o + 10] = p1.y + sy; this.arcPos[o + 11] = p1.z + sz;
        const r = arc.color.r * 3 * k, g = arc.color.g * 3 * k, b = arc.color.b * 3 * k;
        for (let v = 0; v < 4; v++) { this.arcCol[o + v * 3] = r; this.arcCol[o + v * 3 + 1] = g; this.arcCol[o + v * 3 + 2] = b; }
      }
    }
    for (let z = q; z < 240; z++) {
      const o = z * 12;
      if (this.arcPos[o] === 0 && this.arcPos[o + 3] === 0) break;
      for (let v = 0; v < 12; v++) this.arcPos[o + v] = 0;
    }
    this.arcGeo.attributes.position.needsUpdate = true;
    this.arcGeo.attributes.color.needsUpdate = true;
    this.arcGeo.setDrawRange(0, Math.max(1, q) * 6);
  }

  clear() {
    this.additive.clear(); this.alpha.clear();
    this.arcs.length = 0;
    for (const c of this.cas) c.life = 0;
  }

  setPixelScale(h: number, fovDeg: number) {
    const s = h / (2 * Math.tan((fovDeg * Math.PI) / 360));
    this.additive.material.uniforms.uScale.value = s;
    this.alpha.material.uniforms.uScale.value = s;
  }
}

const UP_Z = new THREE.Vector3(0, 0, 1);

/** Build a jagged lightning polyline between two points. */
export function jagged(a: THREE.Vector3, b: THREE.Vector3, segs: number, amp: number): THREE.Vector3[] {
  const pts: THREE.Vector3[] = [];
  for (let i = 0; i <= segs; i++) {
    const t = i / segs;
    const p = new THREE.Vector3().lerpVectors(a, b, t);
    if (i > 0 && i < segs) { p.x += (Math.random() - 0.5) * amp; p.y += (Math.random() - 0.5) * amp; p.z += (Math.random() - 0.5) * amp; }
    pts.push(p);
  }
  return pts;
}
