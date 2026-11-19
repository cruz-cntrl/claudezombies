import * as THREE from 'three';
import { GeoBatch, M, box, rbox, cyl, sphere, torus, lathe } from '../render/geometryKit';
import { getSurface } from '../render/proceduralTextures';

/**
 * Procedural first-person weapon models. Local space: +X right, +Y up, barrel toward -Z.
 * Origin = right-hand grip. Moving parts (mag, slide, bolt, pump, cylinder, drum, cover,
 * barrels) are separate meshes so the viewmodel can animate them.
 */
export interface GunModel {
  root: THREE.Group;
  parts: Partial<Record<'mag' | 'slide' | 'bolt' | 'pump' | 'cylinder' | 'cover' | 'barrels' | 'shell', THREE.Object3D>>;
  muzzle: THREE.Vector3;
  eject: THREE.Vector3;
  foreL: THREE.Vector3;   // left hand support point
  magPos: THREE.Vector3;  // where the mag sits (for left hand during reload)
  sightY: number;         // height of the sight line above origin
  adsZ: number;           // camera distance to the rear sight while aiming
  hip: THREE.Vector3;     // hip-fire offset of the origin from the camera
  twoHanded: boolean;
  scope?: boolean;
  glow?: THREE.Mesh[];    // emissive bits (disruptor coils)
  materials: THREE.MeshStandardMaterial[];
}

// ---------------------------------------------------------------- materials
type MatKey = 'metal' | 'dark' | 'wood' | 'brass' | 'grip' | 'glow' | 'copper' | 'glass';
let baseMats: Record<MatKey, THREE.MeshStandardMaterial> | null = null;
let upMats: Record<MatKey, THREE.MeshStandardMaterial> | null = null;
let camoTex: THREE.CanvasTexture | null = null;
const upgradedSet = new Set<THREE.Material>();

function makeCamo(): THREE.CanvasTexture {
  const c = document.createElement('canvas');
  c.width = c.height = 256;
  const g = c.getContext('2d')!;
  g.fillStyle = '#000'; g.fillRect(0, 0, 256, 256);
  // circuit-like traces
  g.lineCap = 'round';
  for (let i = 0; i < 70; i++) {
    let x = Math.random() * 256, y = Math.random() * 256;
    g.strokeStyle = `rgba(255,255,255,${0.35 + Math.random() * 0.65})`;
    g.lineWidth = 1 + Math.random() * 2.5;
    g.beginPath(); g.moveTo(x, y);
    for (let s = 0; s < 4; s++) {
      if (Math.random() > 0.5) x += (Math.random() - 0.5) * 80; else y += (Math.random() - 0.5) * 80;
      g.lineTo(x, y);
    }
    g.stroke();
    g.fillStyle = '#fff'; g.beginPath(); g.arc(x, y, 2.5, 0, 6.3); g.fill();
  }
  const t = new THREE.CanvasTexture(c);
  t.wrapS = t.wrapT = THREE.RepeatWrapping;
  t.colorSpace = THREE.SRGBColorSpace;
  return t;
}

function mats(upgraded: boolean): Record<MatKey, THREE.MeshStandardMaterial> {
  if (!upgraded && baseMats) return baseMats;
  if (upgraded && upMats) return upMats;
  const metalT = getSurface('metal'), woodT = getSurface('wood');
  const std = (p: THREE.MeshStandardMaterialParameters) => new THREE.MeshStandardMaterial({ vertexColors: true, ...p });
  const set: Record<MatKey, THREE.MeshStandardMaterial> = {
    metal: std({ map: metalT.map, normalMap: metalT.normalMap, roughnessMap: metalT.roughnessMap, metalness: 0.8, roughness: 0.7, color: 0x6a6c70 }),
    dark: std({ map: metalT.map, normalMap: metalT.normalMap, metalness: 0.7, roughness: 0.55, color: 0x55585e }),
    wood: std({ map: woodT.map, normalMap: woodT.normalMap, roughnessMap: woodT.roughnessMap, metalness: 0, roughness: 1, color: 0xffffff }),
    brass: std({ metalness: 0.85, roughness: 0.35, color: 0xffffff }),
    grip: std({ metalness: 0.05, roughness: 0.75, color: 0xffffff }),
    glow: std({ metalness: 0, roughness: 0.4, color: 0x111111, emissive: 0x40f0e0, emissiveIntensity: 3 }),
    copper: std({ metalness: 0.9, roughness: 0.35, color: 0xffffff }),
    glass: std({ metalness: 0.3, roughness: 0.05, color: 0x223030, transparent: true, opacity: 0.6 }),
  };
  if (upgraded) {
    camoTex ??= makeCamo();
    for (const k of ['metal', 'dark', 'wood', 'grip'] as MatKey[]) {
      const m = set[k];
      m.emissiveMap = camoTex;
      m.emissive = new THREE.Color(0x30d8ff);
      m.emissiveIntensity = 1.4;
      m.color.multiplyScalar(k === 'wood' ? 0.55 : 0.7);
      m.color.lerp(new THREE.Color(0x4a2a60), 0.25);
      upgradedSet.add(m);
    }
    upMats = set;
  } else baseMats = set;
  return set;
}

/** Animate the overcharged camo (called once per frame). */
export function animateUpgradedMaterials(time: number) {
  if (!camoTex) return;
  camoTex.offset.set(time * 0.05, time * 0.13);
  const pulse = 1.1 + Math.sin(time * 4.2) * 0.45 + Math.sin(time * 11.3) * 0.15;
  for (const m of upgradedSet) (m as THREE.MeshStandardMaterial).emissiveIntensity = pulse;
}

// ---------------------------------------------------------------- builder helpers
class Kit {
  b = new GeoBatch();
  constructor() {
    this.b.uvScale = { metal: 0.25, dark: 0.25, wood: 0.35, brass: 1, grip: 0.3, glow: 1, copper: 1, glass: 1 };
  }
  add(k: MatKey, g: THREE.BufferGeometry, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, tint = 0xffffff) {
    this.b.add(k, g, M(x, y, z, ry, rx, rz), tint);
  }
  /** cylinder along Z (barrel) from z0 toward -Z */
  tubeZ(k: MatKey, r: number, len: number, x: number, y: number, z0: number, seg = 12, tint = 0xffffff, r2 = r) {
    this.b.add(k, cyl(r2, r, len, seg), M(x, y, z0 - len / 2, 0, Math.PI / 2), tint);
  }
  build(upgraded: boolean): THREE.Group {
    const g = new THREE.Group();
    const m = mats(upgraded);
    for (const [k, geo] of this.b.finalize()) {
      const mesh = new THREE.Mesh(geo, m[k as MatKey]);
      mesh.frustumCulled = false;
      g.add(mesh);
    }
    return g;
  }
}

function part(fn: (k: Kit) => void, upgraded: boolean, pivot?: THREE.Vector3): THREE.Group {
  const k = new Kit();
  fn(k);
  const inner = k.build(upgraded);
  const g = new THREE.Group();
  if (pivot) { inner.position.copy(pivot).multiplyScalar(-1); g.position.copy(pivot); }
  g.add(inner);
  return g;
}

const V = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);

// ---------------------------------------------------------------- weapon recipes
type Recipe = (up: boolean) => GunModel;

function finish(root: THREE.Group, up: boolean, m: Omit<GunModel, 'root' | 'materials'>): GunModel {
  const ms = Object.values(mats(up));
  return { root, materials: ms, ...m };
}

const RECIPES: Record<string, Recipe> = {
  warden: (up) => {
    const root = part((k) => {
      k.add('dark', rbox(0.032, 0.03, 0.12, 0.006), 0, 0.02, -0.03);
      k.add('grip', rbox(0.03, 0.1, 0.045, 0.008), 0, -0.04, 0.012, 0, -0.22, 0, 0x5a3420);
      k.add('dark', rbox(0.034, 0.1, 0.048, 0.006), 0, -0.04, 0.012, 0, -0.22, 0, 0x333333);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.012, -0.03, Math.PI / 2, 0, Math.PI);
      k.add('metal', box(0.004, 0.018, 0.004), 0, -0.01, -0.025);
      k.tubeZ('dark', 0.009, 0.03, 0, 0.042, -0.155, 10);
    }, up);
    const slide = part((k) => {
      k.add('metal', rbox(0.03, 0.03, 0.2, 0.005), 0, 0.045, -0.06);
      for (let i = 0; i < 7; i++) k.add('dark', box(0.032, 0.022, 0.003), 0, 0.045, 0.02 + i * 0.006);
      k.add('dark', box(0.006, 0.008, 0.006), 0, 0.064, -0.152);
      k.add('dark', box(0.018, 0.008, 0.006), 0, 0.064, 0.03);
      k.add('dark', box(0.006, 0.014, 0.012), 0, 0.055, 0.045);
    }, up);
    root.add(slide);
    const mag = part((k) => { k.add('dark', box(0.022, 0.09, 0.034), 0, -0.06, 0.012, 0, -0.22); k.add('dark', box(0.026, 0.01, 0.04), 0, -0.105, 0.022, 0, -0.22); }, up);
    root.add(mag);
    return finish(root, up, { parts: { slide, mag }, muzzle: V(0, 0.045, -0.17), eject: V(0.02, 0.05, -0.03), foreL: V(-0.01, -0.05, 0.0), magPos: V(0, -0.1, 0.02), sightY: 0.072, adsZ: 0.3, hip: V(0.11, -0.12, -0.33), twoHanded: true });
  },
  hollowpoint: (up) => {
    const root = part((k) => {
      k.add('metal', rbox(0.03, 0.05, 0.09, 0.006), 0, 0.02, -0.02);
      k.tubeZ('metal', 0.011, 0.19, 0, 0.04, -0.06, 12);
      k.add('metal', box(0.012, 0.012, 0.19), 0, 0.054, -0.155);
      k.add('dark', box(0.004, 0.012, 0.01), 0, 0.064, -0.24);
      k.add('wood', rbox(0.03, 0.11, 0.045, 0.012), 0, -0.04, 0.03, 0, -0.35, 0, 0x7a4a2a);
      k.add('dark', torus(0.02, 0.004, 4, 10, Math.PI), 0, -0.012, -0.012, Math.PI / 2, 0, Math.PI);
      k.add('dark', box(0.006, 0.025, 0.012), 0, 0.055, 0.03, 0, 0.5);
    }, up);
    const cylinder = part((k) => {
      k.tubeZ('metal', 0.022, 0.045, 0, 0.032, -0.025, 12);
      for (let i = 0; i < 6; i++) { const a = (i / 6) * Math.PI * 2; k.tubeZ('dark', 0.005, 0.046, Math.cos(a) * 0.013, 0.032 + Math.sin(a) * 0.013, -0.0245, 6); }
    }, up, V(-0.015, 0.012, -0.03));
    root.add(cylinder);
    return finish(root, up, { parts: { cylinder }, muzzle: V(0, 0.04, -0.26), eject: V(0, 0.03, -0.04), foreL: V(-0.01, -0.06, 0.01), magPos: V(-0.03, 0.0, -0.04), sightY: 0.07, adsZ: 0.32, hip: V(0.11, -0.12, -0.33), twoHanded: true });
  },
  chatterbox: (up) => {
    const root = part((k) => {
      k.tubeZ('dark', 0.022, 0.26, 0, 0.03, 0.06, 14);
      k.tubeZ('dark', 0.024, 0.12, 0, 0.03, -0.2, 14);
      for (let i = 0; i < 8; i++) k.tubeZ('metal', 0.0245, 0.006, 0, 0.03, -0.21 - i * 0.014, 14, 0x222222);
      k.tubeZ('dark', 0.008, 0.06, 0, 0.03, -0.32, 8);
      k.add('grip', rbox(0.026, 0.09, 0.04, 0.008), 0, -0.035, 0.03, 0, -0.25, 0, 0x2a2420);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.01, -0.01, Math.PI / 2, 0, Math.PI);
      k.add('metal', cyl(0.004, 0.004, 0.24, 6), 0, 0.0, 0.16, 0, Math.PI / 2 - 0.1);
      k.add('metal', cyl(0.004, 0.004, 0.24, 6), 0, 0.045, 0.16, 0, Math.PI / 2 + 0.05);
      k.add('metal', box(0.03, 0.06, 0.006), 0, 0.02, 0.28);
      k.add('dark', box(0.004, 0.018, 0.006), 0, 0.058, -0.3);
      k.add('dark', box(0.014, 0.012, 0.012), 0, 0.055, 0.04);
      k.add('dark', box(0.03, 0.04, 0.05), 0, 0.0, -0.06);
    }, up);
    const mag = part((k) => k.add('dark', box(0.022, 0.16, 0.03), 0, -0.07, -0.07, 0, 0.05), up);
    const bolt = part((k) => k.add('metal', box(0.03, 0.01, 0.012), 0.03, 0.035, -0.02), up);
    root.add(mag, bolt);
    return finish(root, up, { parts: { mag, bolt }, muzzle: V(0, 0.03, -0.38), eject: V(0.03, 0.04, -0.04), foreL: V(0, -0.08, -0.08), magPos: V(0, -0.13, -0.07), sightY: 0.062, adsZ: 0.42, hip: V(0.11, -0.11, -0.3), twoHanded: true });
  },
  typewriter: (up) => {
    const root = part((k) => {
      k.add('dark', rbox(0.04, 0.05, 0.22, 0.006), 0, 0.03, -0.04);
      k.tubeZ('dark', 0.011, 0.24, 0, 0.035, -0.15, 10);
      for (let i = 0; i < 14; i++) k.tubeZ('metal', 0.017, 0.004, 0, 0.035, -0.16 - i * 0.012, 12, 0x333333);
      k.add('dark', cyl(0.012, 0.015, 0.03, 8), 0, 0.035, -0.4, 0, Math.PI / 2);
      k.add('wood', rbox(0.032, 0.09, 0.045, 0.012), 0, -0.035, 0.035, 0, -0.3, 0, 0x8a5030);
      k.add('wood', rbox(0.03, 0.08, 0.04, 0.012), 0, -0.03, -0.17, 0, -0.1, 0, 0x8a5030);
      for (let i = 0; i < 4; i++) k.add('wood', box(0.034, 0.006, 0.042), 0, -0.01 - i * 0.015, -0.17, 0, -0.1, 0, 0x5a3018);
      k.add('wood', rbox(0.04, 0.07, 0.25, 0.015), 0, 0.005, 0.18, 0, 0.08, 0, 0x8a5030);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.01, -0.0, Math.PI / 2, 0, Math.PI);
      k.add('metal', box(0.012, 0.016, 0.02), 0, 0.062, 0.04);
      k.add('dark', box(0.004, 0.014, 0.006), 0, 0.058, -0.36);
    }, up);
    const mag = part((k) => {
      k.add('dark', cyl(0.07, 0.07, 0.045, 20), 0, -0.06, -0.06, 0, 0, Math.PI / 2);
      k.add('metal', cyl(0.02, 0.02, 0.05, 10), 0, -0.06, -0.06, 0, 0, Math.PI / 2);
    }, up);
    const bolt = part((k) => k.add('metal', sphere(0.008, 8, 6), 0, 0.068, -0.02), up);
    root.add(mag, bolt);
    return finish(root, up, { parts: { mag, bolt }, muzzle: V(0, 0.035, -0.42), eject: V(0.025, 0.05, -0.05), foreL: V(0, -0.07, -0.17), magPos: V(0, -0.06, -0.06), sightY: 0.07, adsZ: 0.3, hip: V(0.11, -0.11, -0.3), twoHanded: true });
  },
  fieldmarshal: (up) => {
    const root = part((k) => {
      k.add('wood', rbox(0.045, 0.05, 0.62, 0.015), 0, 0.0, -0.12, 0, 0, 0, 0x9a6a40);
      k.add('wood', rbox(0.04, 0.03, 0.3, 0.012), 0, 0.045, -0.3, 0, 0, 0, 0x9a6a40);
      k.add('wood', rbox(0.042, 0.09, 0.3, 0.015), 0, -0.01, 0.28, 0, 0.18, 0, 0x9a6a40);
      k.add('metal', rbox(0.036, 0.045, 0.16, 0.006), 0, 0.045, 0.02);
      k.tubeZ('dark', 0.009, 0.42, 0, 0.05, -0.15, 10);
      k.tubeZ('dark', 0.008, 0.3, 0, 0.03, -0.27, 8);
      for (const s of [-1, 1]) k.add('dark', box(0.004, 0.022, 0.012), s * 0.008, 0.07, -0.55);
      k.add('dark', box(0.006, 0.018, 0.006), 0, 0.068, -0.555);
      k.add('dark', rbox(0.02, 0.022, 0.016, 0.004), 0, 0.078, 0.08);
      k.add('metal', torus(0.006, 0.0025, 4, 8), 0, 0.09, 0.08, 0, 0, 0);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.02, 0.06, Math.PI / 2, 0, Math.PI);
      k.add('metal', box(0.05, 0.012, 0.03), 0, 0.0, -0.58);
    }, up);
    const bolt = part((k) => k.add('metal', box(0.02, 0.012, 0.012), 0.028, 0.045, -0.03), up);
    const mag = part((k) => { k.add('brass', box(0.03, 0.03, 0.05), 0, 0.075, 0.0, 0, 0, 0, 0xc09040); }, up);
    mag.visible = false;
    root.add(bolt, mag);
    return finish(root, up, { parts: { bolt, mag }, muzzle: V(0, 0.05, -0.58), eject: V(0, 0.08, 0.01), foreL: V(0, -0.03, -0.3), magPos: V(0, 0.08, 0.0), sightY: 0.088, adsZ: 0.31, hip: V(0.12, -0.12, -0.28), twoHanded: true });
  },
  ironside: (up) => {
    const root = part((k) => {
      k.add('dark', rbox(0.045, 0.07, 0.36, 0.008), 0, 0.025, -0.06);
      k.tubeZ('dark', 0.012, 0.38, 0, 0.04, -0.24, 10);
      k.add('dark', cyl(0.016, 0.02, 0.06, 10), 0, 0.04, -0.64, 0, Math.PI / 2);
      k.add('wood', rbox(0.05, 0.05, 0.22, 0.012), 0, 0.01, -0.33, 0, 0, 0, 0x7a5030);
      for (let i = 0; i < 5; i++) k.add('wood', box(0.052, 0.004, 0.012), 0, -0.01, -0.25 - i * 0.04, 0, 0, 0, 0x4a2a18);
      k.add('wood', rbox(0.045, 0.09, 0.3, 0.015), 0, -0.015, 0.25, 0, 0.12, 0, 0x7a5030);
      k.add('wood', rbox(0.03, 0.08, 0.04, 0.01), 0, -0.05, 0.08, 0, -0.3, 0, 0x7a5030);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.02, 0.04, Math.PI / 2, 0, Math.PI);
      for (const s of [-1, 1]) k.add('metal', cyl(0.004, 0.004, 0.26, 6), s * 0.02, 0.0, -0.5, 0, Math.PI / 2 - 0.08);
      k.add('dark', box(0.004, 0.02, 0.008), 0, 0.066, -0.6);
      k.add('dark', box(0.016, 0.02, 0.012), 0, 0.068, 0.06);
    }, up);
    const mag = part((k) => k.add('dark', box(0.03, 0.09, 0.07), 0, -0.04, -0.06), up);
    const bolt = part((k) => k.add('metal', box(0.014, 0.012, 0.02), -0.03, 0.035, -0.05), up);
    root.add(mag, bolt);
    return finish(root, up, { parts: { mag, bolt }, muzzle: V(0, 0.04, -0.67), eject: V(0.03, 0.05, -0.05), foreL: V(0, -0.02, -0.33), magPos: V(0, -0.08, -0.06), sightY: 0.08, adsZ: 0.32, hip: V(0.12, -0.12, -0.28), twoHanded: true });
  },
  vanguard: (up) => {
    const root = part((k) => {
      k.add('dark', rbox(0.04, 0.06, 0.3, 0.006), 0, 0.03, -0.05);
      k.add('dark', box(0.04, 0.02, 0.2), 0, 0.068, -0.08);
      k.tubeZ('dark', 0.01, 0.2, 0, 0.04, -0.2, 10);
      k.add('wood', rbox(0.042, 0.05, 0.13, 0.012), 0, 0.03, -0.25, 0, 0, 0, 0x6a4026);
      k.add('dark', cyl(0.012, 0.012, 0.03, 10), 0, 0.04, -0.41, 0, Math.PI / 2);
      k.add('dark', torus(0.012, 0.003, 4, 10, Math.PI), 0, 0.075, -0.39, 0, 0, 0);
      k.add('wood', rbox(0.04, 0.08, 0.24, 0.012), 0, 0.01, 0.22, 0, 0.06, 0, 0x6a4026);
      k.add('grip', rbox(0.028, 0.08, 0.04, 0.008), 0, -0.035, 0.04, 0, -0.25, 0, 0x3a2a20);
      k.add('dark', torus(0.02, 0.004, 4, 10, Math.PI), 0, -0.005, 0.0, Math.PI / 2, 0, Math.PI);
      k.add('dark', box(0.014, 0.014, 0.03), 0, 0.085, 0.03);
    }, up);
    const mag = part((k) => {
      for (let i = 0; i < 4; i++) k.add('dark', box(0.024, 0.04, 0.034), 0, -0.015 - i * 0.035, -0.07 - i * i * 0.004, 0, 0.12 + i * 0.08);
    }, up);
    const bolt = part((k) => k.add('metal', box(0.024, 0.008, 0.008), -0.03, 0.06, -0.12), up);
    root.add(mag, bolt);
    return finish(root, up, { parts: { mag, bolt }, muzzle: V(0, 0.04, -0.43), eject: V(0.025, 0.055, -0.05), foreL: V(0, -0.0, -0.25), magPos: V(0, -0.09, -0.08), sightY: 0.1, adsZ: 0.32, hip: V(0.12, -0.13, -0.29), twoHanded: true });
  },
  trench: (up) => {
    const root = part((k) => {
      k.add('dark', rbox(0.042, 0.06, 0.18, 0.006), 0, 0.025, -0.02);
      k.tubeZ('dark', 0.013, 0.48, 0, 0.045, -0.11, 12);
      k.tubeZ('dark', 0.012, 0.38, 0, 0.018, -0.11, 10);
      // perforated heat shield
      k.tubeZ('dark', 0.019, 0.2, 0, 0.048, -0.36, 12, 0x2a2a2a);
      for (let i = 0; i < 6; i++) k.add('metal', box(0.04, 0.003, 0.012), 0, 0.064, -0.28 - i * 0.03, 0, 0, 0, 0x111111);
      k.add('dark', box(0.004, 0.01, 0.006), 0, 0.066, -0.58);
      k.add('wood', rbox(0.042, 0.09, 0.3, 0.015), 0, -0.01, 0.22, 0, 0.16, 0, 0x8a5a34);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.012, 0.04, Math.PI / 2, 0, Math.PI);
      k.add('dark', box(0.03, 0.02, 0.03), 0, 0.03, -0.58);
    }, up);
    const pump = part((k) => {
      k.add('wood', rbox(0.04, 0.04, 0.14, 0.012), 0, 0.015, -0.2, 0, 0, 0, 0x8a5a34);
      for (let i = 0; i < 6; i++) k.add('wood', box(0.042, 0.004, 0.006), 0, 0.0, -0.15 - i * 0.02, 0, 0, 0, 0x4a2a18);
    }, up);
    const shell = part((k) => { k.add('glow', cyl(0.009, 0.009, 0.05, 8), 0, 0, 0, 0, Math.PI / 2); }, up);
    (shell.children[0].children[0] as THREE.Mesh).material = new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.6 });
    shell.visible = false;
    root.add(pump, shell);
    return finish(root, up, { parts: { pump, shell }, muzzle: V(0, 0.045, -0.6), eject: V(0.025, 0.04, -0.03), foreL: V(0, -0.02, -0.2), magPos: V(0, 0.0, -0.06), sightY: 0.07, adsZ: 0.3, hip: V(0.12, -0.12, -0.29), twoHanded: true });
  },
  coachgun: (up) => {
    const root = part((k) => {
      k.add('metal', rbox(0.05, 0.05, 0.1, 0.008), 0, 0.02, -0.0);
      k.add('wood', rbox(0.045, 0.09, 0.32, 0.015), 0, -0.01, 0.22, 0, 0.18, 0, 0x6a3a20);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.015, 0.03, Math.PI / 2, 0, Math.PI);
      for (const s of [-1, 1]) k.add('metal', box(0.006, 0.02, 0.02), s * 0.012, 0.055, 0.04, 0, -0.4);
    }, up);
    const barrels = part((k) => {
      for (const s of [-1, 1]) k.tubeZ('dark', 0.014, 0.5, s * 0.014, 0.035, -0.04, 12);
      k.add('dark', box(0.006, 0.006, 0.5), 0, 0.052, -0.29);
      k.add('wood', rbox(0.05, 0.03, 0.18, 0.012), 0, 0.012, -0.16, 0, 0, 0, 0x6a3a20);
      k.add('brass', sphere(0.004, 6, 4), 0, 0.058, -0.53, 0, 0, 0, 0xc0a040);
    }, up, V(0, 0.02, -0.04));
    root.add(barrels);
    return finish(root, up, { parts: { barrels }, muzzle: V(0, 0.035, -0.55), eject: V(0, 0.04, -0.04), foreL: V(0, -0.01, -0.17), magPos: V(0, 0.03, -0.04), sightY: 0.064, adsZ: 0.3, hip: V(0.12, -0.12, -0.29), twoHanded: true });
  },
  gravedigger: (up) => {
    const root = part((k) => {
      k.add('dark', rbox(0.05, 0.07, 0.3, 0.008), 0, 0.03, -0.0);
      k.tubeZ('dark', 0.03, 0.34, 0, 0.04, -0.15, 14, 0x3a3a3a);
      for (let i = 0; i < 7; i++) for (const s of [-1, 1]) k.add('metal', box(0.012, 0.016, 0.03), s * 0.026, 0.04, -0.18 - i * 0.045, 0, 0, 0, 0x0a0a0a);
      k.tubeZ('dark', 0.01, 0.1, 0, 0.04, -0.49, 10);
      k.add('dark', cyl(0.018, 0.014, 0.04, 10), 0, 0.04, -0.6, 0, Math.PI / 2);
      k.add('wood', rbox(0.04, 0.09, 0.26, 0.012), 0, 0.0, 0.25, 0, 0.1, 0, 0x5a3a24);
      k.add('grip', rbox(0.028, 0.09, 0.04, 0.008), 0, -0.045, 0.06, 0, -0.3, 0, 0x2a2420);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.012, 0.03, Math.PI / 2, 0, Math.PI);
      for (const s of [-1, 1]) k.add('metal', cyl(0.004, 0.004, 0.22, 6), s * 0.025, 0.0, -0.36, 0, Math.PI / 2 - 0.12);
      // ammo box on the left
      k.add('dark', rbox(0.05, 0.1, 0.12, 0.006), -0.06, -0.04, -0.03, 0, 0, 0, 0x4a5030);
      k.add('dark', box(0.004, 0.03, 0.04), 0, 0.085, -0.25);
    }, up);
    const cover = part((k) => {
      k.add('dark', rbox(0.052, 0.022, 0.14, 0.006), 0, 0.075, -0.0);
      k.add('dark', box(0.012, 0.022, 0.02), 0, 0.09, 0.04);
    }, up, V(0, 0.07, 0.07));
    const mag = part((k) => {
      for (let i = 0; i < 8; i++) k.add('brass', cyl(0.004, 0.004, 0.03, 6), -0.03 - i * 0.004, 0.035 - i * 0.008, -0.02, 0, 0, Math.PI / 2, 0xc8a040);
    }, up);
    root.add(cover, mag);
    return finish(root, up, { parts: { cover, mag }, muzzle: V(0, 0.04, -0.62), eject: V(0.03, 0.02, -0.02), foreL: V(-0.03, -0.06, -0.06), magPos: V(-0.06, -0.04, -0.03), sightY: 0.1, adsZ: 0.33, hip: V(0.13, -0.13, -0.3), twoHanded: true });
  },
  longshot: (up) => {
    const root = part((k) => {
      k.add('wood', rbox(0.045, 0.05, 0.62, 0.015), 0, 0.0, -0.14, 0, 0, 0, 0x7a5030);
      k.add('wood', rbox(0.042, 0.1, 0.3, 0.015), 0, -0.015, 0.27, 0, 0.18, 0, 0x7a5030);
      k.add('metal', rbox(0.034, 0.04, 0.16, 0.006), 0, 0.04, 0.02);
      k.tubeZ('dark', 0.01, 0.5, 0, 0.045, -0.06, 10);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.02, 0.06, Math.PI / 2, 0, Math.PI);
      // scope
      k.tubeZ('dark', 0.016, 0.22, 0, 0.1, 0.11, 14);
      k.add('dark', cyl(0.026, 0.016, 0.06, 14), 0, 0.1, -0.13, 0, Math.PI / 2);
      k.add('dark', cyl(0.016, 0.022, 0.04, 14), 0, 0.1, 0.12, 0, Math.PI / 2);
      for (const z of [-0.04, 0.06]) k.add('metal', box(0.02, 0.04, 0.014), 0, 0.072, z);
      k.add('glass', cyl(0.024, 0.024, 0.004, 14), 0, 0.1, -0.162, 0, Math.PI / 2);
    }, up);
    const bolt = part((k) => {
      k.add('metal', cyl(0.004, 0.004, 0.05, 6), 0.03, 0.04, 0.06, 0, 0, Math.PI / 2);
      k.add('metal', sphere(0.009, 8, 6), 0.055, 0.04, 0.06);
    }, up, V(0, 0.04, 0.06));
    root.add(bolt);
    return finish(root, up, { parts: { bolt }, muzzle: V(0, 0.045, -0.56), eject: V(0.025, 0.05, 0.02), foreL: V(0, -0.03, -0.25), magPos: V(0, 0.04, 0.03), sightY: 0.1, adsZ: 0.21, hip: V(0.13, -0.13, -0.29), twoHanded: true, scope: true });
  },
  marksman: (up) => {
    const root = part((k) => {
      k.add('wood', rbox(0.04, 0.045, 0.42, 0.014), 0, 0.0, -0.08, 0, 0, 0, 0x8a5a36);
      k.add('wood', rbox(0.038, 0.085, 0.24, 0.014), 0, -0.01, 0.2, 0, 0.15, 0, 0x8a5a36);
      k.add('wood', rbox(0.034, 0.025, 0.2, 0.01), 0, 0.04, -0.2, 0, 0, 0, 0x8a5a36);
      k.add('metal', rbox(0.03, 0.035, 0.13, 0.005), 0, 0.035, 0.0);
      k.tubeZ('dark', 0.008, 0.36, 0, 0.042, -0.1, 10);
      k.add('dark', box(0.004, 0.018, 0.006), 0, 0.06, -0.44);
      for (const s of [-1, 1]) k.add('dark', box(0.003, 0.016, 0.01), s * 0.008, 0.06, -0.44);
      k.add('dark', box(0.014, 0.016, 0.012), 0, 0.06, 0.05);
      k.add('dark', torus(0.02, 0.004, 4, 10, Math.PI), 0, -0.018, 0.04, Math.PI / 2, 0, Math.PI);
      k.add('metal', box(0.03, 0.03, 0.01), 0, 0.03, -0.31);
    }, up);
    const mag = part((k) => k.add('dark', box(0.02, 0.06, 0.03), 0, -0.035, -0.01, 0, 0.05), up);
    const bolt = part((k) => k.add('metal', box(0.012, 0.01, 0.03), 0.022, 0.04, -0.03), up);
    root.add(mag, bolt);
    return finish(root, up, { parts: { mag, bolt }, muzzle: V(0, 0.042, -0.46), eject: V(0.02, 0.05, -0.0), foreL: V(0, -0.03, -0.2), magPos: V(0, -0.07, -0.01), sightY: 0.072, adsZ: 0.29, hip: V(0.12, -0.12, -0.29), twoHanded: true });
  },
  thumper: (up) => {
    const root = part((k) => {
      k.add('wood', rbox(0.045, 0.1, 0.32, 0.015), 0, -0.01, 0.2, 0, 0.12, 0, 0x7a4a2a);
      k.add('metal', rbox(0.05, 0.06, 0.08, 0.008), 0, 0.02, 0.0);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.015, 0.03, Math.PI / 2, 0, Math.PI);
    }, up);
    const barrels = part((k) => {
      k.tubeZ('dark', 0.03, 0.32, 0, 0.04, -0.04, 16);
      k.tubeZ('metal', 0.024, 0.322, 0, 0.04, -0.039, 16, 0x050505);
      k.add('wood', rbox(0.06, 0.04, 0.16, 0.012), 0, 0.0, -0.17, 0, 0, 0, 0x7a4a2a);
      k.add('dark', box(0.03, 0.035, 0.006), 0, 0.085, -0.08);
      for (let i = 0; i < 4; i++) k.add('metal', box(0.024, 0.002, 0.007), 0, 0.074 + i * 0.008, -0.08);
    }, up, V(0, 0.015, -0.04));
    const shell = part((k) => { k.tubeZ('brass', 0.024, 0.07, 0, 0, 0.0, 12, 0xb08030); k.tubeZ('dark', 0.022, 0.03, 0, 0, -0.07, 12, 0x4a5a30); }, up);
    shell.visible = false;
    root.add(barrels, shell);
    return finish(root, up, { parts: { barrels, shell }, muzzle: V(0, 0.04, -0.36), eject: V(0, 0.05, -0.05), foreL: V(0, -0.03, -0.17), magPos: V(0, 0.04, -0.06), sightY: 0.1, adsZ: 0.3, hip: V(0.13, -0.14, -0.3), twoHanded: true });
  },
  disruptor: (up) => {
    const glowMeshes: THREE.Mesh[] = [];
    const root = part((k) => {
      k.add('brass', rbox(0.06, 0.06, 0.22, 0.01), 0, 0.03, -0.02, 0, 0, 0, 0x9a7a3a);
      k.add('wood', rbox(0.04, 0.09, 0.26, 0.015), 0, -0.0, 0.22, 0, 0.1, 0, 0x5a3a20);
      k.add('grip', rbox(0.03, 0.09, 0.04, 0.01), 0, -0.04, 0.04, 0, -0.25, 0, 0x2a1a10);
      k.add('dark', torus(0.022, 0.004, 4, 10, Math.PI), 0, -0.012, 0.01, Math.PI / 2, 0, Math.PI);
      k.tubeZ('glass', 0.026, 0.3, 0, 0.04, -0.12, 14);
      for (let i = 0; i < 10; i++) k.add('copper', torus(0.03, 0.004, 5, 14), 0, 0.04, -0.14 - i * 0.026, 0, 0, 0, 0xc06a30);
      for (const s of [-1, 1]) k.add('copper', cyl(0.004, 0.002, 0.12, 6), s * 0.02, 0.04 + s * 0.01, -0.47, 0, Math.PI / 2 + s * 0.15, 0, 0xc06a30);
      for (let i = 0; i < 3; i++) {
        k.add('glass', lathe([[0, 0], [0.012, 0.004], [0.013, 0.04], [0.006, 0.05], [0, 0.052]], 8), -0.02 + i * 0.02, 0.06, -0.0 - i * 0.04);
      }
      k.add('dark', rbox(0.03, 0.03, 0.06, 0.005), 0.0, 0.075, 0.07);
    }, up);
    const core = part((k) => {
      k.tubeZ('glow', 0.01, 0.29, 0, 0.04, -0.125, 8);
      for (let i = 0; i < 3; i++) k.add('glow', sphere(0.006, 6, 4), -0.02 + i * 0.02, 0.085, -0.0 - i * 0.04);
    }, up);
    core.traverse((o) => { if ((o as THREE.Mesh).isMesh) glowMeshes.push(o as THREE.Mesh); });
    const mag = part((k) => { k.add('brass', cyl(0.025, 0.025, 0.09, 12), 0, -0.04, -0.09, 0, 0, 0, 0x9a7a3a); k.add('glow', cyl(0.018, 0.018, 0.092, 10), 0, -0.04, -0.09); }, up);
    root.add(core, mag);
    return finish(root, up, { parts: { mag }, muzzle: V(0, 0.04, -0.5), eject: V(0, 0.06, -0.05), foreL: V(0, -0.05, -0.15), magPos: V(0, -0.09, -0.09), sightY: 0.095, adsZ: 0.3, hip: V(0.12, -0.12, -0.3), twoHanded: true, glow: glowMeshes });
  },
};

/** Fresh (uncached) model — for world displays (crate, Rewirer). */
export function createGunModel(id: string, upgraded: boolean): GunModel {
  return (RECIPES[id] ?? RECIPES.warden)(upgraded);
}

const cache = new Map<string, GunModel>();
export function getGunModel(id: string, upgraded: boolean): GunModel {
  const key = id + (upgraded ? ':up' : '');
  let m = cache.get(key);
  if (!m) {
    m = (RECIPES[id] ?? RECIPES.warden)(upgraded);
    if (upgraded && id === 'disruptor' && m.glow) {
      for (const g of m.glow) {
        const mat = (g.material as THREE.MeshStandardMaterial).clone();
        mat.emissive = new THREE.Color(0xff4040);
        g.material = mat;
      }
    }
    cache.set(key, m);
  }
  return m;
}

// ---------------------------------------------------------------- hands & knife
export function buildHand(right: boolean): THREE.Group {
  const k = new Kit();
  const s = right ? 1 : -1;
  // just a short, dark glove cuff — no forearm — so the hands read without filling the screen
  k.add('grip', cyl(0.03, 0.026, 0.11, 10), 0, 0, 0.085, 0, Math.PI / 2, 0, 0x1e1a14);
  k.add('grip', cyl(0.037, 0.037, 0.03, 10), 0, 0, 0.04, 0, Math.PI / 2, 0, 0x2a2218);
  k.add('grip', sphere(0.027, 10, 8), 0, 0, 0.14, 0, 0, 0, 0x1e1a14); // rounded end: no cut-off stump
  // glove palm + fingers wrapping the grip
  k.add('grip', rbox(0.05, 0.07, 0.06, 0.018), 0, 0, 0.0, 0, 0, 0, 0x3a2618);
  for (let i = 0; i < 4; i++) k.add('grip', rbox(0.018, 0.02, 0.05, 0.008), -s * 0.03, 0.025 - i * 0.017, -0.02, 0, 0, 0, 0x34220f);
  k.add('grip', rbox(0.018, 0.018, 0.05, 0.008), s * 0.018, 0.03, -0.035, -s * 0.3, 0, 0, 0x34220f);
  k.add('grip', box(0.052, 0.012, 0.03), 0, 0.0, 0.04, 0, 0, 0, 0x2a1a0c);
  return k.build(false);
}

export function buildKnife(): THREE.Group {
  const k = new Kit();
  k.add('metal', box(0.004, 0.03, 0.19), 0, 0.0, -0.11, 0, 0, 0, 0xcfcfcf);
  k.add('metal', box(0.0045, 0.012, 0.19), 0, 0.016, -0.11, 0, 0, 0, 0x9a9a9a);
  k.add('brass', box(0.05, 0.012, 0.012), 0, 0.0, -0.01, 0, 0, 0, 0xb08a40);
  k.add('wood', rbox(0.026, 0.03, 0.11, 0.01), 0, 0.0, 0.05, 0, 0, 0, 0x4a2a14);
  k.add('brass', sphere(0.016, 8, 6), 0, 0.0, 0.11, 0, 0, 0, 0xb08a40);
  return k.build(false);
}

export function buildGrenade(): THREE.Group {
  const k = new Kit();
  k.add('dark', lathe([[0, -0.045], [0.03, -0.04], [0.036, -0.01], [0.034, 0.025], [0.02, 0.04], [0, 0.042]], 12), 0, 0, 0, 0, 0, 0, 0x4a5236);
  for (let i = 0; i < 4; i++) k.add('dark', torus(0.035, 0.003, 4, 12), 0, -0.03 + i * 0.018, 0, 0, Math.PI / 2, 0, 0x2a2e20);
  k.add('metal', box(0.014, 0.025, 0.012), 0, 0.05, 0, 0, 0, 0, 0x888888);
  k.add('metal', box(0.01, 0.06, 0.008), 0.016, 0.03, 0, 0, 0, 0.2, 0x888888);
  k.add('metal', torus(0.012, 0.002, 4, 10), -0.014, 0.062, 0, 0, 0, 0, 0x999999);
  return k.build(false);
}

export function buildBottle(color: number): THREE.Group {
  const k = new Kit();
  k.add('glass', lathe([[0, 0], [0.03, 0.002], [0.032, 0.09], [0.015, 0.12], [0.011, 0.16], [0.012, 0.17], [0, 0.17]], 12), 0, 0, 0);
  k.add('glow', cyl(0.028, 0.028, 0.08, 10), 0, 0.045, 0, 0, 0, 0, color);
  k.add('grip', cyl(0.0325, 0.0325, 0.05, 12), 0, 0.05, 0, 0, 0, 0, 0xd8cca0);
  return k.build(false);
}
