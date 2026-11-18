import * as THREE from 'three';

/**
 * Free GPU resources owned by a subtree: geometries, materials and any per-session
 * CanvasTextures. Shared DataTextures (procedural surfaces) are cached globally and kept.
 */
export function disposeTree(root: THREE.Object3D) {
  const mats = new Set<THREE.Material>();
  root.traverse((o) => {
    const m = o as THREE.Mesh;
    if (m.geometry) m.geometry.dispose();
    const mat = (m as any).material as THREE.Material | THREE.Material[] | undefined;
    if (mat) (Array.isArray(mat) ? mat : [mat]).forEach((x) => mats.add(x));
  });
  for (const m of mats) {
    for (const k of ['map', 'alphaMap', 'emissiveMap'] as const) {
      const t = (m as any)[k] as THREE.Texture | null;
      if (t && (t as any).isCanvasTexture) t.dispose();
    }
    m.dispose();
  }
}
