import * as THREE from 'three';

/** Procedural night / storm sky dome with drifting clouds, moon and lightning flash uniform. */
export function createSky(kind: 'night' | 'storm' | 'dusk', fogColor: number): THREE.Mesh {
  const mat = new THREE.ShaderMaterial({
    side: THREE.BackSide,
    depthWrite: false,
    fog: false,
    uniforms: {
      uTime: { value: 0 },
      uFlash: { value: 0 },
      uStorm: { value: kind === 'storm' ? 1 : 0 },
      uDusk: { value: kind === 'dusk' ? 1 : 0 },
      uHorizon: { value: new THREE.Color(fogColor) },
    },
    vertexShader: /* glsl */`
      varying vec3 vDir;
      void main(){ vDir = normalize(position); vec4 p = projectionMatrix * modelViewMatrix * vec4(position,1.0); gl_Position = p.xyww; }`,
    fragmentShader: /* glsl */`
      uniform float uTime; uniform float uFlash; uniform float uStorm; uniform float uDusk; uniform vec3 uHorizon;
      varying vec3 vDir;
      float hash(vec2 p){ return fract(sin(dot(p, vec2(127.1,311.7))) * 43758.5453); }
      float noise(vec2 p){ vec2 i=floor(p), f=fract(p); f=f*f*(3.0-2.0*f);
        return mix(mix(hash(i),hash(i+vec2(1,0)),f.x), mix(hash(i+vec2(0,1)),hash(i+vec2(1,1)),f.x), f.y); }
      float fbm(vec2 p){ float s=0.0, a=0.5; for(int i=0;i<5;i++){ s+=noise(p)*a; p*=2.03; a*=0.5; } return s; }
      vec3 duskSky(vec3 d){
        // just after sunset: the sun is ~4 degrees under the western (-x) horizon
        float h = clamp(d.y, 0.0, 1.0);
        vec3 sunDir = normalize(vec3(-1.0, -0.07, 0.25));
        float toward = max(dot(normalize(vec3(d.x, 0.0, d.z) + 1e-4), normalize(vec3(sunDir.x, 0.0, sunDir.z))), 0.0);
        vec3 zenith = vec3(0.07, 0.09, 0.2);
        vec3 mid = vec3(0.24, 0.2, 0.34);
        vec3 horizon = mix(uHorizon * 1.05, vec3(0.95, 0.46, 0.24), pow(toward, 3.0));
        vec3 col = mix(horizon, mid, smoothstep(0.0, 0.22, h));
        col = mix(col, zenith, smoothstep(0.18, 0.85, h));
        // afterglow band hugging the western horizon
        col += vec3(1.0, 0.55, 0.25) * pow(toward, 6.0) * exp(-h * 9.0) * 0.55;
        // thin streaky clouds lit pink from below
        vec2 uv = d.xz / (d.y + 0.12) * 1.3;
        float c = fbm(uv * vec2(0.6, 1.8) + vec2(uTime * 0.006, 0.0));
        float cl = smoothstep(0.52, 0.8, c) * smoothstep(0.02, 0.2, h) * (1.0 - smoothstep(0.6, 0.95, h));
        vec3 cloudCol = mix(vec3(0.16, 0.12, 0.2), vec3(0.85, 0.42, 0.36), pow(toward, 2.0) * 0.8 + 0.1);
        col = mix(col, cloudCol, cl * 0.75);
        // first stars, high and opposite the glow
        float s = step(0.9982, hash(floor(d.xz / (d.y + 0.3) * 220.0))) * smoothstep(0.35, 0.9, h) * (1.0 - toward) * (1.0 - cl);
        col += vec3(s) * 0.5;
        return col;
      }
      void main(){
        vec3 d = normalize(vDir);
        if (uDusk > 0.5) { gl_FragColor = vec4(duskSky(d), 1.0);
          #include <colorspace_fragment>
          return; }
        float h = clamp(d.y, 0.0, 1.0);
        vec3 top = mix(vec3(0.012,0.016,0.03), vec3(0.02,0.02,0.028), uStorm);
        vec3 col = mix(uHorizon * 1.1, top, pow(h, 0.45));
        vec2 uv = d.xz / (d.y + 0.15) * 1.6;
        float c = fbm(uv + vec2(uTime * 0.012, uTime * 0.004));
        float c2 = fbm(uv * 2.0 - vec2(uTime * 0.02, 0.0));
        float clouds = smoothstep(0.35, 0.85, c * 0.7 + c2 * 0.4) * smoothstep(0.0, 0.25, h);
        vec3 cloudCol = mix(vec3(0.05,0.055,0.07), vec3(0.08,0.07,0.08), uStorm);
        // moon (night only)
        vec3 md = normalize(vec3(0.5, 0.45, -0.7));
        float m = smoothstep(0.9993, 0.9996, dot(d, md)) * (1.0 - uStorm);
        float glow = pow(max(dot(d, md), 0.0), 60.0) * 0.35 * (1.0 - uStorm);
        col += vec3(0.5,0.55,0.6) * glow;
        col = mix(col, cloudCol + vec3(0.2,0.22,0.3) * glow * 2.0, clouds * 0.85);
        col += vec3(0.9,0.92,0.85) * m * (1.0 - clouds);
        // stars
        float s = step(0.9975, hash(floor(d.xz / (d.y + 0.3) * 220.0))) * h * (1.0 - clouds) * (1.0 - uStorm);
        col += vec3(s) * 0.6;
        col += vec3(0.55,0.6,0.8) * uFlash * (0.4 + clouds * 1.5);
        gl_FragColor = vec4(col, 1.0);
        #include <colorspace_fragment>
      }`,
  });
  const mesh = new THREE.Mesh(new THREE.SphereGeometry(90, 24, 12), mat);
  mesh.renderOrder = -10;
  mesh.frustumCulled = false;
  return mesh;
}
