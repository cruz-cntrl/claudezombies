import * as THREE from 'three';
import type { Renderer } from './render/renderer';
import { World } from './world/mapBuilder';
import { Player } from './entities/player';
import type { Input } from './input/input';
import type { MapDef } from './world/mapTypes';
import type { DifficultyDef } from './config/difficulty';

/**
 * One play session on one map. Owns the world and all gameplay systems.
 * The App (main.ts) owns menus, renderer, input and audio across sessions.
 */
export class Game {
  readonly player = new Player();
  time = 0;
  playerLamp: THREE.PointLight;
  paused = false;
  private tmpV = new THREE.Vector3();

  constructor(
    readonly r: Renderer,
    readonly world: World,
    readonly input: Input,
    readonly difficulty: DifficultyDef,
  ) {
    const g = world.grid;
    // face the most open direction from the start cell
    let bestYaw = 0, best = -1;
    for (let k = 0; k < 16; k++) {
      const yaw = (k / 16) * Math.PI * 2;
      const d = g.raycast(g.start.i + 0.5, g.start.j + 0.5, -Math.sin(yaw), -Math.cos(yaw), 30);
      if (d > best) { best = d; bestYaw = yaw; }
    }
    this.player.spawn(g.start.i + 0.5, g.start.j + 0.5, bestYaw);
    this.player.selfRevives = difficulty.selfRevives;
    this.playerLamp = new THREE.PointLight(0xffd8a8, 0.35, 6, 2);
    r.scene.add(this.playerLamp);
  }

  static async load(r: Renderer, def: MapDef, onProgress: (f: number, label: string) => void): Promise<World> {
    const world = new World(def);
    await world.build(onProgress);
    r.scene.add(world.group);
    r.scene.fog = new THREE.FogExp2(def.fogColor, def.fogDensity);
    r.scene.background = new THREE.Color(def.fogColor);
    world.setupLightPool(r.scene, r.preset.practicalLights);
    return world;
  }

  update(dt: number) {
    this.time += dt;
    const p = this.player;
    p.update(dt, this.input, this.world.grid, 1, () => {});
    this.world.flow.update(Math.floor(p.pos.x), Math.floor(p.pos.z));
  }

  render(alpha: number, frameDt: number) {
    const cam = this.r.camera;
    this.player.applyCamera(cam, alpha, this.time);
    const f = this.player.forward(this.tmpV);
    this.playerLamp.position.set(cam.position.x - f.x * 0.6, cam.position.y + 0.35, cam.position.z - f.z * 0.6);
    this.world.update(frameDt, this.time, cam.position, true);
  }

  dispose() {
    this.r.scene.remove(this.world.group);
    this.r.scene.remove(this.playerLamp);
    this.world.dispose();
  }
}
