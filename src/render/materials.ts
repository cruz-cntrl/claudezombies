import * as THREE from 'three';
import { LIGHTING } from '../config/lighting';

/**
 * Baked-lighting materials. Static geometry carries a `bake` vertex attribute holding
 * pre-computed irradiance (lights + AO). It is injected as indirect diffuse light so dynamic
 * point lights (muzzle flash, player lamp, flickers) still add on top at full strength.
 * Instanced dynamic objects (zombies, boards) use a per-instance `instBake` attribute sampled
 * from the light-probe grid each frame.
 */
export function withBake<T extends THREE.Material>(mat: T, mode: 'vertex' | 'instance'): T {
  const attr = mode === 'vertex' ? 'bake' : 'instBake';
  mat.onBeforeCompile = (shader) => {
    shader.vertexShader = shader.vertexShader
      .replace('#include <common>', `#include <common>\nattribute vec3 ${attr};\nvarying vec3 vBake;`)
      .replace('#include <begin_vertex>', `#include <begin_vertex>\nvBake = ${attr};`);
    shader.fragmentShader = shader.fragmentShader
      .replace('#include <common>', '#include <common>\nvarying vec3 vBake;')
      .replace('#include <lights_fragment_maps>', `#include <lights_fragment_maps>\nirradiance += vBake * ${LIGHTING.bakeScale.toFixed(3)};`);
  };
  mat.customProgramCacheKey = () => 'bake-' + mode;
  return mat;
}

export interface SurfaceTextures {
  map: THREE.Texture;
  normalMap: THREE.Texture;
  roughnessMap: THREE.Texture;
}

export function bakedStandard(tex: SurfaceTextures | null, opts: THREE.MeshStandardMaterialParameters = {}) {
  const m = new THREE.MeshStandardMaterial({
    color: 0xffffff,
    roughness: 1,
    metalness: 0,
    vertexColors: true,
    ...(tex ? { map: tex.map, normalMap: tex.normalMap, roughnessMap: tex.roughnessMap } : {}),
    ...opts,
  });
  if (tex) m.normalScale.set(1, 1);
  return withBake(m, 'vertex');
}
