import * as THREE from 'three';
import { EffectComposer } from 'three/examples/jsm/postprocessing/EffectComposer.js';
import { RenderPass } from 'three/examples/jsm/postprocessing/RenderPass.js';
import { UnrealBloomPass } from 'three/examples/jsm/postprocessing/UnrealBloomPass.js';
import { ShaderPass } from 'three/examples/jsm/postprocessing/ShaderPass.js';
import { OutputPass } from 'three/examples/jsm/postprocessing/OutputPass.js';
import { RoomEnvironment } from 'three/examples/jsm/environments/RoomEnvironment.js';
import { QUALITY, type QualityPreset } from './quality';
import type { Quality } from '../core/save';

const CompositeShader = {
  uniforms: {
    tDiffuse: { value: null as THREE.Texture | null },
    uTime: { value: 0 },
    uGrain: { value: 0.045 },
    uCA: { value: 0 },
    uDesat: { value: 0 },
    uStatic: { value: 0 },
    uTint: { value: new THREE.Vector3(1, 1, 1) },
    uRes: { value: new THREE.Vector2(1, 1) },
  },
  vertexShader: /* glsl */`
    varying vec2 vUv;
    void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position,1.0); }`,
  fragmentShader: /* glsl */`
    uniform sampler2D tDiffuse; uniform float uTime; uniform float uGrain; uniform float uCA;
    uniform float uDesat; uniform float uStatic; uniform vec3 uTint; uniform vec2 uRes;
    varying vec2 vUv;
    float h(vec2 p){ return fract(sin(dot(p, vec2(12.9898,78.233))) * 43758.5453); }
    void main(){
      vec2 uv = vUv;
      if (uStatic > 0.0) {
        float band = step(0.92 - uStatic*0.3, h(vec2(floor(uv.y*60.0), floor(uTime*24.0))));
        uv.x += band * (h(vec2(uTime, uv.y)) - 0.5) * 0.08 * uStatic;
      }
      vec2 dir = (uv - 0.5);
      float ca = uCA * 0.012;
      vec3 col;
      col.r = texture2D(tDiffuse, uv + dir * ca).r;
      col.g = texture2D(tDiffuse, uv).g;
      col.b = texture2D(tDiffuse, uv - dir * ca).b;
      col *= uTint;
      float l = dot(col, vec3(0.299, 0.587, 0.114));
      col = mix(col, vec3(l) * vec3(1.05, 0.95, 0.9), uDesat);
      float n = h(uv * uRes + fract(uTime * 7.13) * 100.0) - 0.5;
      col += n * uGrain * (0.35 + l);
      if (uStatic > 0.0) {
        float s = h(uv * uRes * 0.5 + uTime * 37.0);
        col = mix(col, vec3(s) * vec3(0.7, 0.9, 1.0), uStatic * 0.45);
      }
      gl_FragColor = vec4(max(col, 0.0), 1.0);
    }`,
};

/**
 * Owns the WebGL renderer, world + viewmodel scenes, post-processing chain and quality tiers.
 */
export class Renderer {
  readonly renderer: THREE.WebGLRenderer;
  readonly scene = new THREE.Scene();
  readonly camera: THREE.PerspectiveCamera;
  readonly vmScene = new THREE.Scene();
  readonly vmCamera: THREE.PerspectiveCamera;
  preset: QualityPreset;
  quality: Quality;
  private composer: EffectComposer | null = null;
  private bloom: UnrealBloomPass | null = null;
  composite: ShaderPass | null = null;
  contextLost = false;
  baseFov = 72;
  vmVisible = true;
  /** Post FX parameters, driven by gameplay */
  fx = { ca: 0, desat: 0, staticJam: 0, tint: new THREE.Vector3(1, 1, 1) };
  onContextRestored: (() => void) | null = null;

  constructor(readonly canvas: HTMLCanvasElement, quality: Quality) {
    this.quality = quality;
    this.preset = QUALITY[quality];
    this.renderer = new THREE.WebGLRenderer({
      canvas,
      antialias: false,
      powerPreference: 'high-performance',
      stencil: false,
      depth: true,
    });
    this.renderer.outputColorSpace = THREE.SRGBColorSpace;
    this.renderer.toneMapping = THREE.ACESFilmicToneMapping;
    this.renderer.toneMappingExposure = 1.15;
    this.renderer.shadowMap.enabled = false;
    this.camera = new THREE.PerspectiveCamera(this.baseFov, 2, 0.05, 120);
    this.vmCamera = new THREE.PerspectiveCamera(58, 2, 0.01, 10);
    this.scene.add(this.camera);
    this.vmScene.add(this.vmCamera);
    // Viewmodel reflections: metals need something to reflect or they read as black.
    const pmrem = new THREE.PMREMGenerator(this.renderer);
    this.vmScene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
    this.vmScene.environmentIntensity = 0.4;
    pmrem.dispose();

    canvas.addEventListener('webglcontextlost', (e) => {
      e.preventDefault();
      this.contextLost = true;
    });
    canvas.addEventListener('webglcontextrestored', () => {
      this.contextLost = false;
      this.setupComposer();
      this.resize();
      this.onContextRestored?.();
    });
    this.setupComposer();
    this.resize();
    window.addEventListener('resize', () => this.resize());
    window.visualViewport?.addEventListener('resize', () => this.resize());
  }

  setQuality(q: Quality) {
    this.quality = q;
    this.preset = QUALITY[q];
    this.setupComposer();
    this.resize();
  }

  private setupComposer() {
    this.composer?.dispose();
    this.composer = null;
    this.bloom = null;
    this.composite = null;
    const p = this.preset;
    if (!p.composer) return;
    const size = this.renderer.getDrawingBufferSize(new THREE.Vector2());
    const rt = new THREE.WebGLRenderTarget(Math.max(1, size.x), Math.max(1, size.y), {
      type: THREE.HalfFloatType,
      samples: p.msaa,
    });
    const composer = new EffectComposer(this.renderer, rt);
    const worldPass = new RenderPass(this.scene, this.camera);
    composer.addPass(worldPass);
    const vmPass = new RenderPass(this.vmScene, this.vmCamera);
    vmPass.clear = false;
    vmPass.clearDepth = true;
    composer.addPass(vmPass);
    if (p.bloom) {
      this.bloom = new UnrealBloomPass(new THREE.Vector2(256, 256), 0.75, 0.45, 0.82);
      composer.addPass(this.bloom);
    }
    this.composite = new ShaderPass(CompositeShader);
    composer.addPass(this.composite);
    composer.addPass(new OutputPass());
    this.composer = composer;
  }

  resize() {
    const w = Math.max(1, window.innerWidth);
    const hgt = Math.max(1, window.innerHeight);
    const pr = Math.min(window.devicePixelRatio || 1, this.preset.pixelRatio);
    this.renderer.setPixelRatio(pr);
    this.renderer.setSize(w, hgt, false);
    this.canvas.style.width = w + 'px';
    this.canvas.style.height = hgt + 'px';
    this.camera.aspect = w / hgt;
    this.camera.updateProjectionMatrix();
    this.vmCamera.aspect = w / hgt;
    this.vmCamera.updateProjectionMatrix();
    if (this.composer) {
      this.composer.setPixelRatio(pr);
      this.composer.setSize(w, hgt);
      if (this.bloom) {
        const s = this.preset.bloomRes;
        this.bloom.resolution.set(w * pr * s, hgt * pr * s);
        this.bloom.setSize(w * pr * s, hgt * pr * s);
      }
      if (this.composite) this.composite.uniforms.uRes.value.set(w * pr, hgt * pr);
    }
  }

  setBloom(strength: number) {
    if (this.bloom) this.bloom.strength = strength;
  }

  render(time: number) {
    if (this.contextLost) return;
    this.vmScene.visible = this.vmVisible;
    if (this.composer && this.composite) {
      const u = this.composite.uniforms;
      u.uTime.value = time;
      u.uCA.value = this.fx.ca;
      u.uDesat.value = this.fx.desat;
      u.uStatic.value = this.fx.staticJam;
      u.uTint.value.copy(this.fx.tint);
      this.composer.render();
    } else {
      const r = this.renderer;
      r.autoClear = true;
      r.render(this.scene, this.camera);
      if (this.vmVisible) {
        r.autoClear = false;
        r.clearDepth();
        r.render(this.vmScene, this.vmCamera);
        r.autoClear = true;
      }
    }
  }

  get info() { return this.renderer.info; }
}
