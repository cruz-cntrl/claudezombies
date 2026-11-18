import * as THREE from 'three';
import { bakedStandard, withBake } from './materials';
import { getSurface, surfaceScale } from './proceduralTextures';
import type { Surface } from '../world/mapTypes';

/**
 * Material registry for static world geometry. Keys:
 *   surf:<Surface>  — textured, baked
 *   plain:<name>    — untextured baked (tinted by vertex colour)
 *   glow            — unlit emissive (vertex colour * HDR boost) for dials, signs, chip racks
 */
const METALLIC: Partial<Record<Surface, number>> = { metal: 0.3, riveted: 0.22, grate: 0.3 };

export class MatLib {
  private mats = new Map<string, THREE.Material>();

  uvScale(key: string): number {
    if (key.startsWith('surf:')) return surfaceScale(key.slice(5) as Surface);
    return 1;
  }

  /** Register a custom baked material (e.g. a poster texture) under a key. */
  register(key: string, m: THREE.Material) { this.mats.set(key, m); }

  get(key: string): THREE.Material {
    let m = this.mats.get(key);
    if (m) return m;
    if (key.startsWith('surf:')) {
      const s = key.slice(5) as Surface;
      m = bakedStandard(getSurface(s), { metalness: METALLIC[s] ?? 0, roughness: 1 });
      if (s === 'water') {
        const mm = m as THREE.MeshStandardMaterial;
        mm.transparent = true; mm.opacity = 0.82; mm.roughness = 0.2; mm.metalness = 0.6;
        mm.depthWrite = false;
      }
    } else if (key === 'glow') {
      m = new THREE.MeshBasicMaterial({ vertexColors: true, color: new THREE.Color(3, 3, 3), fog: true });
    } else {
      const name = key.slice(6);
      const p: THREE.MeshStandardMaterialParameters = { roughness: 0.8, metalness: 0 };
      switch (name) {
        case 'brass': p.roughness = 0.4; p.metalness = 0.5; break;
        case 'chrome': p.roughness = 0.3; p.metalness = 0.55; break;
        case 'glass': p.roughness = 0.08; p.metalness = 0.2; break;
        case 'rubber': p.roughness = 0.95; break;
        case 'fabric': p.roughness = 1; break;
        case 'paper': p.roughness = 0.95; break;
        case 'paint': p.roughness = 0.6; p.metalness = 0.15; break;
        case 'iron': p.roughness = 0.55; p.metalness = 0.35; break;
      }
      m = bakedStandard(null, p);
    }
    this.mats.set(key, m);
    return m;
  }

  /** Instanced dynamic material (zombies, boards) using per-instance baked light. */
  static instanced(params: THREE.MeshStandardMaterialParameters) {
    return withBake(new THREE.MeshStandardMaterial(params), 'instance');
  }

  dispose() {
    for (const m of this.mats.values()) m.dispose();
    this.mats.clear();
  }
}
