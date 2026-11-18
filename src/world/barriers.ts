import * as THREE from 'three';
import type { World, WindowVisual } from './mapBuilder';
import { MatLib } from '../render/matLib';
import { getSurface } from '../render/proceduralTextures';
import { compose, rbox, box, M } from '../render/geometryKit';
import { audio } from '../audio/audioEngine';

const BOARDS = 6;
interface Board { on: boolean; t: number; anim: 'none' | 'tear' | 'place'; rest: THREE.Matrix4; tilt: number; y: number }

/** Boarded windows: 6 boards each, torn off by zombies and rebuilt by the player. */
export class Barriers {
  readonly mesh: THREE.InstancedMesh;
  private boards: Board[][] = [];
  private bake: THREE.InstancedBufferAttribute;
  private m = new THREE.Matrix4();
  private p = new THREE.Vector3();
  private q = new THREE.Quaternion();
  private s = new THREE.Vector3(1, 1, 1);
  private e = new THREE.Euler();

  constructor(private world: World, private fx: import('../render/fx').FX) {
    const n = world.windows.length * BOARDS;
    const geo = compose([
      [rbox(1.22, 0.16, 0.045, 0.012), null],
      [box(0.02, 0.02, 0.05), M(-0.5, 0, 0.012), 0x333333],
      [box(0.02, 0.02, 0.05), M(0.5, 0, 0.012), 0x333333],
    ]);
    // board UVs along its length
    const uv = geo.attributes.uv.array as Float32Array;
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < uv.length / 2; i++) { uv[i * 2] = pos[i * 3] * 0.5 + 0.5; uv[i * 2 + 1] = pos[i * 3 + 1] * 0.5 + 0.3; }
    this.bake = new THREE.InstancedBufferAttribute(new Float32Array(Math.max(1, n) * 3), 3);
    geo.setAttribute('instBake', this.bake);
    const wood = getSurface('wood');
    const mat = MatLib.instanced({ map: wood.map, normalMap: wood.normalMap, roughness: 0.85, vertexColors: true });
    this.mesh = new THREE.InstancedMesh(geo, mat, Math.max(1, n));
    this.mesh.frustumCulled = false;
    const probe = { r: 0, g: 0, b: 0 };
    world.windows.forEach((w, wi) => {
      const list: Board[] = [];
      world.baker.sample(w.inside.x, w.inside.z, probe);
      for (let b = 0; b < BOARDS; b++) {
        const tilt = (Math.random() - 0.5) * 0.5;
        const y = 1.08 + b * 0.19 + (Math.random() - 0.5) * 0.04;
        const rest = this.compose(w, 0.43 + (b % 2) * 0.03, y, tilt, 0);
        list.push({ on: true, t: 0, anim: 'none', rest, tilt, y });
        const idx = wi * BOARDS + b;
        this.mesh.setMatrixAt(idx, rest);
        this.mesh.setColorAt(idx, new THREE.Color().setHSL(0.08, 0.3, 0.45 + Math.random() * 0.25));
        this.bake.setXYZ(idx, probe.r * 1.3 + 0.02, probe.g * 1.3 + 0.02, probe.b * 1.3 + 0.02);
      }
      this.boards.push(list);
    });
  }

  private compose(w: WindowVisual, inset: number, y: number, tilt: number, extraPitch: number) {
    const nx = w.cell.nx, nz = w.cell.nz;
    this.p.set(w.center.x + nx * inset, y, w.center.z + nz * inset);
    this.e.set(extraPitch, w.yaw, tilt, 'YXZ');
    this.q.setFromEuler(this.e);
    return new THREE.Matrix4().compose(this.p, this.q, this.s);
  }

  index(w: WindowVisual) { return this.world.windows.indexOf(w); }
  count(w: WindowVisual): number {
    const list = this.boards[this.index(w)];
    return list ? list.filter((b) => b.on).length : 0;
  }

  /** Zombie tears the top-most remaining board. */
  tear(w: WindowVisual): boolean {
    const list = this.boards[this.index(w)];
    if (!list) return false;
    for (let b = BOARDS - 1; b >= 0; b--) {
      const bd = list[b];
      if (bd.on) {
        bd.on = false; bd.anim = 'tear'; bd.t = 0;
        audio.play('z_boardTear', { pos: { x: w.center.x, y: bd.y, z: w.center.z }, vol: 0.9, priority: 5 });
        this.fx.dust(w.center.x, bd.y, w.center.z, -w.cell.nx, 0, -w.cell.nz, 6, 0x6a5a48);
        return true;
      }
    }
    return false;
  }

  /** Player rebuilds the lowest missing board. */
  repair(w: WindowVisual): boolean {
    const list = this.boards[this.index(w)];
    if (!list) return false;
    for (let b = 0; b < BOARDS; b++) {
      const bd = list[b];
      if (!bd.on) {
        bd.on = true; bd.anim = 'place'; bd.t = 0;
        audio.play('z_boardPlace', { pos: { x: w.center.x, y: bd.y, z: w.center.z }, vol: 0.9, priority: 6 });
        return true;
      }
    }
    return false;
  }

  fortifyAll() {
    for (const w of this.world.windows) while (this.repair(w)) { /* rebuild all */ }
  }

  update(dt: number) {
    let dirty = false;
    this.world.windows.forEach((w, wi) => {
      const list = this.boards[wi];
      for (let b = 0; b < BOARDS; b++) {
        const bd = list[b];
        if (bd.anim === 'none') continue;
        dirty = true;
        bd.t += dt;
        const idx = wi * BOARDS + b;
        if (bd.anim === 'tear') {
          const k = Math.min(1, bd.t / 0.55);
          const out = -0.3 - k * 1.2;
          const y = bd.y - k * k * bd.y * 0.95;
          this.mesh.setMatrixAt(idx, this.compose(w, out, Math.max(0.05, y), bd.tilt + k * 1.4, k * 1.2));
          if (k >= 1) { bd.anim = 'none'; this.mesh.setMatrixAt(idx, this.m.makeScale(0, 0, 0)); }
        } else {
          const k = Math.min(1, bd.t / 0.22);
          const inset = 0.43 + (1 - k) * 0.6;
          const y = bd.y * k + 0.3 * (1 - k);
          this.mesh.setMatrixAt(idx, this.compose(w, inset + (b % 2) * 0.03 * k, y, bd.tilt * k, (1 - k) * 0.8));
          if (k >= 1) { bd.anim = 'none'; this.mesh.setMatrixAt(idx, bd.rest); }
        }
      }
    });
    if (dirty) this.mesh.instanceMatrix.needsUpdate = true;
  }
}
