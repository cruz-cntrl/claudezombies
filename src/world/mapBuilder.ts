import * as THREE from 'three';
import { Grid, K, type Marker, type WindowCell } from './grid';
import type { MapDef, Surface, ZoneDef } from './mapTypes';
import { GeoBatch, M, box, rbox, cyl, sphere, torus, cone } from '../render/geometryKit';
import { MatLib } from '../render/matLib';
import { LightBaker, type BakeLight } from '../render/lightingBake';
import { generateSurfaces, surfaceScale } from '../render/proceduralTextures';
import { FlowField } from './flowField';
import { mulberry32, type RNG } from '../core/math';
import { themeProp, DOUBLE_PROPS, LOW_PROPS, lightCage, bookshelf, lampPost } from './props';
import { createSky } from './sky';
import { LIGHTING } from '../config/lighting';
import { HeightField, setTerrain, getTerrain, groundY } from './terrain';

export interface PracticalLight {
  x: number; y: number; z: number;
  color: THREE.Color;
  intensity: number;
  radius: number;
  flicker: number;
  phase: number;
  level: number;
  burst: number;
  bulb: number;
}

export interface DoorVisual {
  id: string;
  kind: 'door' | 'debris' | 'secret';
  group: THREE.Group;
  slide: THREE.Vector3;
  center: THREE.Vector3;
  cells: number[];
  open: boolean;
  t: number;
}

export interface WindowVisual {
  cell: WindowCell;
  center: THREE.Vector3;
  /** point just inside the window (zombie landing spot) */
  inside: THREE.Vector3;
  /** point just outside (where zombies stand to tear boards) */
  outside: THREE.Vector3;
  /** outward spawn point further out */
  spawn: THREE.Vector3;
  yaw: number; // facing inward
}

export interface BuildContext {
  grid: Grid;
  def: MapDef;
  batch: GeoBatch;
  rng: RNG;
  lights: BakeLight[];
  addLight: (x: number, y: number, z: number, color: number, intensity: number, radius: number, flicker?: number, fixture?: 'cage' | 'none') => void;
  /** Per-frame animation for map set-pieces (beacons, fires). */
  onUpdate: (fn: (dt: number, time: number) => void) => void;
  /** World root, for unbaked set-piece meshes (beacons, distant silhouettes) */
  group: THREE.Group;
  /** Publish a set-piece handle for gameplay systems (e.g. the easter egg dims the beacon) */
  expose: (name: string, obj: unknown) => void;
  markers: (ch: string) => Marker[];
  zone: (i: number, j: number) => ZoneDef | null;
  registerMaterial: (key: string, mat: THREE.Material) => void;
}

const WINDOW_SILL = 0.95, WINDOW_TOP = 2.15, DOOR_TOP = 2.5;

export class World {
  readonly grid: Grid;
  readonly group = new THREE.Group();
  readonly matLib = new MatLib();
  baker!: LightBaker;
  flow!: FlowField;
  readonly practicals: PracticalLight[] = [];
  bulbs!: THREE.InstancedMesh;
  readonly doors = new Map<string, DoorVisual>();
  readonly windows: WindowVisual[] = [];
  zoneActive: boolean[];
  sky!: THREE.Mesh;
  waters: THREE.Mesh[] = [];
  private pool: THREE.PointLight[] = [];
  private bakeLights: BakeLight[] = [];
  private wallHeight: Float32Array;
  private updaters: ((dt: number, time: number) => void)[] = [];
  /** Named set-piece handles published by the map's decorate hook */
  readonly setpieces = new Map<string, unknown>();
  /** Ground height field (outdoor maps only) */
  terrain: HeightField | null = null;
  readonly rng: RNG;

  constructor(readonly def: MapDef) {
    this.grid = new Grid(def);
    this.zoneActive = def.zones.map(() => false);
    this.wallHeight = new Float32Array(this.grid.w * this.grid.h);
    this.rng = mulberry32(def.id.length * 977 + 13);
  }

  zoneDef(i: number, j: number): ZoneDef | null {
    const z = this.grid.zoneAt(i, j);
    return z >= 0 ? this.def.zones[z] : null;
  }

  ceilingAt = (x: number, z: number): number => {
    const zd = this.zoneDef(Math.floor(x), Math.floor(z));
    if (!zd) return Infinity;
    return zd.ceiling ? zd.height : Infinity;
  };

  markers(ch: string) { return this.grid.markers.filter((m) => m.ch === ch); }

  async build(onProgress: (f: number, label: string) => void) {
    const def = this.def, g = this.grid;
    // ---- textures
    const surfaces: Surface[] = [def.outsideSurface, def.exterior, def.perimeter, 'wood', 'metal', 'riveted', 'concrete', 'water'];
    for (const z of def.zones) { surfaces.push(z.floor, z.wall); if (z.wainscot) surfaces.push(z.wainscot); if (z.ceiling) surfaces.push(z.ceiling); }
    await generateSurfaces(surfaces, (f) => onProgress(f * 0.45, 'Generating surfaces'));

    const batch = new GeoBatch();
    for (const s of surfaces) batch.uvScale['surf:' + s] = surfaceScale(s);
    for (const k of ['surf:wood', 'surf:metal', 'surf:riveted', 'surf:concrete', 'surf:stone', 'surf:water']) batch.uvScale[k] = surfaceScale(k.slice(5) as Surface);
    const rng = this.rng;

    this.buildTerrain();
    this.computeWallHeights();
    onProgress(0.47, 'Raising walls');
    this.buildStructure(batch);
    this.buildWindows(batch);
    await tick();

    // ---- lights
    const ctx: BuildContext = {
      grid: g, def, batch, rng, lights: this.bakeLights,
      addLight: (x, y, z, color, intensity, radius, flicker = 0, fixture = 'cage') => this.addLight(batch, x, y, z, color, intensity, radius, flicker, fixture),
      markers: (ch) => this.markers(ch),
      zone: (i, j) => this.zoneDef(i, j),
      registerMaterial: (key, mat) => this.matLib.register(key, mat),
      onUpdate: (fn) => this.updaters.push(fn),
      group: this.group,
      expose: (name, obj) => this.setpieces.set(name, obj),
    };
    this.autoLights(ctx);
    onProgress(0.52, 'Furnishing');
    this.buildProps(batch);
    def.decorate?.(ctx);
    await tick();

    // ---- bake
    onProgress(0.6, 'Baking light');
    this.baker = new LightBaker(g, this.bakeLights, (x, z, out) => this.ambientAt(x, z, out), this.ceilingAt, def.skyLight);
    const merged = batch.finalize();
    let n = 0;
    for (const [key, geo] of merged) {
      this.warp(geo);
      if (key !== 'glow') this.baker.bakeGeometry(geo);
      // big open maps: split heavy layers into spatial chunks so off-screen parts are culled
      const pieces = def.outdoor && geo.index && geo.index.count > 45000 ? splitChunks(geo, 48) : [geo];
      for (const pg of pieces) {
        const mesh = new THREE.Mesh(pg, this.matLib.get(key));
        mesh.matrixAutoUpdate = false;
        mesh.name = key;
        if (key === 'surf:water') { mesh.renderOrder = 2; this.waters.push(mesh); }
        this.group.add(mesh);
      }
      onProgress(0.6 + (++n / merged.size) * 0.25, 'Baking light');
      await tick();
    }
    this.buildDoors();
    this.baker.buildProbes();
    onProgress(0.9, 'Settling dust');

    // bulbs
    const bulbGeo = new THREE.SphereGeometry(0.055, 8, 6);
    const bulbMat = new THREE.MeshBasicMaterial({ color: 0xffffff });
    this.bulbs = new THREE.InstancedMesh(bulbGeo, bulbMat, Math.max(1, this.practicals.length));
    const mm = new THREE.Matrix4();
    this.practicals.forEach((p, i) => {
      mm.makeTranslation(p.x, p.y, p.z);
      this.bulbs.setMatrixAt(i, mm);
      this.bulbs.setColorAt(i, p.color.clone().multiplyScalar(3));
    });
    this.bulbs.count = this.practicals.length;
    this.group.add(this.bulbs);

    // sky + water planes
    this.sky = createSky(def.sky, def.fogColor);
    this.group.add(this.sky);
    this.buildWater();
    // start zone active
    const sz = g.zoneAt(g.start.i, g.start.j);
    if (sz >= 0) this.zoneActive[sz] = true;
    this.flow = new FlowField(g);
    onProgress(1, 'Ready');
  }

  // ------------------------------------------------------------------ terrain
  /**
   * Outdoor maps: sample the map's height function at cell corners, flattened to 0 around
   * machines, wall-buys, windows, doors, story anchors and solid set-pieces so those sit level.
   */
  private buildTerrain() {
    const def = this.def, g = this.grid;
    if (!def.terrain) { this.terrain = null; setTerrain(null); return; }
    // distance (cells) to the nearest "keep flat" cell, by multi-source BFS
    const W = g.w, H = g.h;
    const dist = new Float32Array(W * H).fill(1e9);
    const q: number[] = [];
    const seed = (i: number, j: number) => { if (g.inBounds(i, j) && dist[j * W + i] > 0) { dist[j * W + i] = 0; q.push(j * W + i); } };
    for (let j = 0; j < H; j++) for (let i = 0; i < W; i++) {
      const k = g.kindAt(i, j);
      if (k === K.WINDOW || k === K.DOOR || k === K.MACHINE || g.hidden[j * W + i]) seed(i, j);
    }
    for (const m of g.markers) if (m.ch !== 'x' && m.ch !== 'o') seed(m.i, m.j);
    seed(g.start.i, g.start.j);
    for (let h = 0; h < q.length; h++) {
      const c = q[h], i = c % W, j = (c / W) | 0, d = dist[c] + 1;
      for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
        const ni = i + di, nj = j + dj;
        if (!g.inBounds(ni, nj)) continue;
        const o = nj * W + ni;
        if (dist[o] > d) { dist[o] = d; q.push(o); }
      }
    }
    const fn = def.terrain;
    const flat = (x: number, z: number) => {
      // corner (x,z) touches four cells: use the closest of them
      let d = 1e9;
      for (const [ci, cj] of [[x - 1, z - 1], [x, z - 1], [x - 1, z], [x, z]]) if (g.inBounds(ci, cj)) d = Math.min(d, dist[cj * W + ci]);
      const t = Math.max(0, Math.min(1, (d - 1) / 3.5));
      return t * t * (3 - 2 * t);
    };
    this.terrain = new HeightField(W, H, (x, z) => fn(x, z) * flat(x, z));
    setTerrain(this.terrain);
  }

  /** Drape static geometry over the terrain (vertical edges stay vertical: same x,z → same lift). */
  private warp(geo: THREE.BufferGeometry) {
    if (!this.terrain) return;
    const pos = geo.attributes.position.array as Float32Array;
    for (let i = 0; i < pos.length; i += 3) pos[i + 1] += this.terrain.at(pos[i], pos[i + 2]);
    geo.attributes.position.needsUpdate = true;
    geo.computeBoundingSphere();
    geo.computeBoundingBox();
  }

  // ------------------------------------------------------------------ structure
  private isOpenCell(k: number) { return k === K.FLOOR || k === K.PROP || k === K.MACHINE || k === K.LOW || k === K.DOOR; }

  private computeWallHeights() {
    const g = this.grid;
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const k = g.kindAt(i, j);
      if (k !== K.WALL && k !== K.WINDOW) continue;
      let hmax = 0, outside = false;
      for (let dj = -1; dj <= 1; dj++) for (let di = -1; di <= 1; di++) {
        const nk = g.kindAt(i + di, j + dj);
        if (nk === K.OUTSIDE) outside = true;
        const zd = this.isOpenCell(nk) ? this.zoneDef(i + di, j + dj) : null;
        if (zd) hmax = Math.max(hmax, zd.height + (zd.ceiling ? 0.25 : 0));
      }
      if (outside) hmax = this.def.outdoor ? this.def.outdoor.wallHeight : Math.max(hmax, 4.4);
      this.wallHeight[j * g.w + i] = hmax || 4;
    }
  }

  private face(batch: GeoBatch, key: string, i: number, j: number, di: number, dj: number, y0: number, y1: number, tint = 0xffffff) {
    if (y1 - y0 < 0.01) return;
    const segY = Math.max(1, Math.round((y1 - y0) / 0.9));
    const geo = new THREE.PlaneGeometry(1, y1 - y0, 2, segY);
    const yaw = Math.atan2(di, dj);
    batch.add(key, geo, M(i + 0.5 + di * 0.5, (y0 + y1) / 2, j + 0.5 + dj * 0.5, yaw), tint);
  }

  private buildStructure(batch: GeoBatch) {
    const g = this.grid, def = this.def;
    const dirs: [number, number][] = [[1, 0], [-1, 0], [0, 1], [0, -1]];
    for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
      const k = g.kindAt(i, j);
      if (g.hidden[j * g.w + i]) continue; // built by the map's decorate hook
      const zd = this.zoneDef(i, j);
      // floors & ceilings
      if (this.isOpenCell(k) || k === K.WINDOW) {
        if (zd && k !== K.WINDOW) {
          const seg = def.outdoor ? 1 : 2;
          const f = new THREE.PlaneGeometry(1, 1, seg, seg);
          batch.add('surf:' + zd.floor, f, M(i + 0.5, 0, j + 0.5, 0, -Math.PI / 2));
          if (zd.ceiling) {
            const c = new THREE.PlaneGeometry(1, 1, 1, 1);
            batch.add('surf:' + zd.ceiling, c, M(i + 0.5, zd.height, j + 0.5, 0, Math.PI / 2));
          }
        }
      } else if (k === K.OUTSIDE) {
        const f = new THREE.PlaneGeometry(1, 1, 1, 1);
        batch.add('surf:' + def.outsideSurface, f, M(i + 0.5, 0, j + 0.5, 0, -Math.PI / 2));
      }
      if (k === K.WALL) {
        const wh = this.wallHeight[j * g.w + i];
        let needCap = false;
        for (const [di, dj] of dirs) {
          const nk = g.kindAt(i + di, j + dj);
          if (this.isOpenCell(nk)) {
            const nz = this.zoneDef(i + di, j + dj);
            if (!nz) continue;
            if (!nz.ceiling && def.outdoor) {
              // open-air estate wall: plain masonry, no skirting
              this.face(batch, 'surf:' + nz.wall, i, j, di, dj, 0, wh);
              needCap = true;
              continue;
            }
            if (!nz) continue;
            const top = nz.ceiling ? nz.height : wh;
            if (!nz.ceiling) needCap = true;
            if (nz.wainscot) {
              this.face(batch, 'surf:' + nz.wainscot, i, j, di, dj, 0, 1.1);
              this.face(batch, 'surf:' + nz.wall, i, j, di, dj, 1.1, top);
              // rail + baseboard
              batch.add('surf:wood', box(1, 0.07, 0.05), M(i + 0.5 + di * 0.52, 1.1, j + 0.5 + dj * 0.52, Math.atan2(di, dj)), 0x6a5038);
            } else {
              this.face(batch, 'surf:' + nz.wall, i, j, di, dj, 0, top);
            }
            batch.add('surf:wood', box(1, 0.14, 0.04), M(i + 0.5 + di * 0.51, 0.07, j + 0.5 + dj * 0.51, Math.atan2(di, dj)), 0x3a2c20);
            if (nz.ceiling) batch.add('surf:wood', box(1, 0.1, 0.06), M(i + 0.5 + di * 0.52, top - 0.05, j + 0.5 + dj * 0.52, Math.atan2(di, dj)), 0x2e2820);
          } else if (nk === K.OUTSIDE) {
            this.face(batch, 'surf:' + def.exterior, i, j, di, dj, 0, wh);
            needCap = true;
          }
        }
        if (needCap) batch.add('surf:' + def.exterior, box(1.0, 0.2, 1.0), M(i + 0.5, wh + 0.1, j + 0.5), 0x9a9a9a);
      }
      if (k === K.VOID && !def.outdoor) {
        for (const [di, dj] of dirs) {
          if (g.kindAt(i + di, j + dj) === K.OUTSIDE) this.face(batch, 'surf:' + def.perimeter, i, j, di, dj, 0, 5.5, 0xb0b0b0);
        }
      }
    }
    // door lintels & frames (indoor maps; outdoor gates stand free in their fence line)
    if (!def.outdoor) for (const d of g.doors.values()) {
      for (const c of d.cells) {
        const i = c % g.w, j = (c / g.w) | 0;
        let top = 3;
        for (const z of d.zones) { const zd = def.zones[z]; top = Math.max(top, zd.ceiling ? zd.height : 3.2); }
        const zd0 = this.zoneDef(i, j);
        const wallKey = 'surf:' + (zd0?.wall ?? def.exterior);
        batch.add(wallKey, box(1, top - DOOR_TOP, 1), M(i + 0.5, (top + DOOR_TOP) / 2, j + 0.5));
        const alongX = g.solidForPlayer(i - 1, j) && g.solidForPlayer(i + 1, j) && g.kindAt(i - 1, j) !== K.DOOR && g.kindAt(i + 1, j) !== K.DOOR;
        // frame posts where the door meets walls
        for (const s of [-1, 1]) {
          const ni = alongX ? i + s : i, nj = alongX ? j : j + s;
          const nk = g.kindAt(ni, nj);
          if (nk === K.WALL) {
            const px = alongX ? i + 0.5 + s * 0.46 : i + 0.5, pz = alongX ? j + 0.5 : j + 0.5 + s * 0.46;
            batch.add('surf:wood', box(alongX ? 0.08 : 1.06, DOOR_TOP, alongX ? 1.06 : 0.08), M(px, DOOR_TOP / 2, pz), 0x4a3828);
          }
        }
        batch.add('surf:wood', box(alongX ? 1.0 : 1.06, 0.12, alongX ? 1.06 : 1.0), M(i + 0.5, DOOR_TOP + 0.06, j + 0.5), 0x4a3828);
      }
    }
  }

  private buildWindows(batch: GeoBatch) {
    const g = this.grid, def = this.def;
    for (const wc of g.windows) {
      const { i, j, nx, nz } = wc;
      const wh = this.wallHeight[j * g.w + i];
      const zd = def.zones[wc.zone];
      const key = 'surf:' + (zd?.wall ?? def.exterior);
      batch.add(key, box(1, WINDOW_SILL, 1), M(i + 0.5, WINDOW_SILL / 2, j + 0.5));
      batch.add(key, box(1, wh - WINDOW_TOP, 1), M(i + 0.5, (wh + WINDOW_TOP) / 2, j + 0.5));
      const yaw = Math.atan2(nx, nz);
      const cx = i + 0.5, cz = j + 0.5;
      // sill board + frame on the inside
      const inX = cx + nx * 0.5, inZ = cz + nz * 0.5;
      batch.add('surf:wood', box(1.1, 0.06, 0.2), M(inX, WINDOW_SILL, inZ, yaw), 0x5a4530);
      batch.add('surf:wood', box(1.1, 0.1, 0.1), M(inX, WINDOW_TOP, inZ, yaw), 0x5a4530);
      for (const s of [-1, 1]) {
        const ox = Math.cos(yaw) * s * 0.5, oz = -Math.sin(yaw) * s * 0.5;
        batch.add('surf:wood', box(0.08, WINDOW_TOP - WINDOW_SILL, 0.12), M(inX + ox, (WINDOW_SILL + WINDOW_TOP) / 2, inZ + oz, yaw), 0x5a4530);
      }
      // broken frame muntin + glass shards outside
      const outX = cx - nx * 0.3, outZ = cz - nz * 0.3;
      batch.add('surf:wood', box(0.05, WINDOW_TOP - WINDOW_SILL, 0.05), M(outX, (WINDOW_SILL + WINDOW_TOP) / 2, outZ, yaw, 0, 0.12), 0x4a3828);
      batch.add('plain:glass', box(0.3, 0.25, 0.01), M(outX + Math.cos(yaw) * 0.32, WINDOW_TOP - 0.15, outZ - Math.sin(yaw) * 0.32, yaw, 0, 0.4), 0x40504a);
      // window visual record
      this.windows.push({
        cell: wc,
        center: new THREE.Vector3(cx, 1.5, cz),
        inside: new THREE.Vector3(cx + nx * 1.05, 0, cz + nz * 1.05),
        outside: new THREE.Vector3(cx - nx * 1.0, 0, cz - nz * 1.0),
        spawn: this.findSpawn(i, j, -nx, -nz),
        yaw,
      });
      // moonlight spill through window
      const ox = cx - nx * 1.5, oz = cz - nz * 1.5;
      if (!def.skyLight) this.bakeLights.push({ x: ox, y: 2.2, z: oz, r: 0.12, g: 0.16, b: 0.24, radius: 5.5 });
    }
  }

  private findSpawn(i: number, j: number, dx: number, dz: number): THREE.Vector3 {
    const g = this.grid;
    let best = { x: i + 0.5 + dx, z: j + 0.5 + dz };
    for (let s = 1; s <= 5; s++) {
      if (g.kindAt(i + dx * s, j + dz * s) === K.OUTSIDE) best = { x: i + 0.5 + dx * s, z: j + 0.5 + dz * s };
      else break;
    }
    return new THREE.Vector3(best.x, 0, best.z);
  }

  // ------------------------------------------------------------------ lights
  private addLight(batch: GeoBatch, x: number, y0: number, z: number, color: number, intensity: number, radius: number, flicker: number, fixture: 'cage' | 'none') {
    const c = new THREE.Color(color);
    // lights follow the terrain; fixture geometry is warped later, so build it at the flat height
    const y = y0 + groundY(x, z);
    this.bakeLights.push({ x, y, z, r: c.r * intensity * 0.8, g: c.g * intensity * 0.8, b: c.b * intensity * 0.8, radius });
    this.practicals.push({ x, y, z, color: c, intensity, radius, flicker, phase: Math.random() * 100, level: 1, burst: 0, bulb: this.practicals.length });
    if (fixture === 'cage') {
      const ceil = this.ceilingAt(x, z);
      const top = isFinite(ceil) ? ceil : y + 0.6;
      lightCage(batch, M(x, y0, z), this.rng);
      batch.add('plain:rubber', cyl(0.006, 0.006, top - y0, 4), M(x, (top + y0) / 2, z), 0x111111);
    }
  }

  private autoLights(ctx: BuildContext) {
    const g = this.grid, def = this.def;
    const placed: { x: number; z: number }[] = [];
    for (const m of this.markers('l')) {
      const zd = this.zoneDef(m.i, m.j);
      if (!zd) continue;
      const y = zd.ceiling ? Math.min(zd.height - 0.45, 3.3) : 2.9;
      if (!zd.ceiling) lampPost(ctx.batch, M(m.i + 0.5, 0, m.j + 0.5), this.rng);
      ctx.addLight(m.i + 0.5, y, m.j + 0.5, zd.lightColor, zd.lightIntensity * (zd.ceiling ? 1 : 1.4), zd.ceiling ? 8.5 : 9.5, this.rng() < 0.35 ? 0.5 + this.rng() * 0.5 : 0, zd.ceiling ? 'cage' : 'none');
      placed.push({ x: m.i + 0.5, z: m.j + 0.5 });
    }
    // moonlight over open-sky zones and the outside ground (bake only, no fixtures)
    if (def.skyLight) return this.autoCeilingLights(ctx, placed);
    const moon = this.def.sky === 'storm' ? 0x8090b0 : 0x90a8d8;
    const mc = new THREE.Color(moon);
    for (let j = 2; j < g.h; j += 6) for (let i = 2; i < g.w; i += 6) {
      const k = g.kindAt(i, j);
      const zd = this.zoneDef(i, j);
      if (k === K.OUTSIDE || (zd && !zd.ceiling && k !== K.WALL)) {
        const inten = zd ? 0.42 : 0.3;
        this.bakeLights.push({ x: i + 0.5, y: 7, z: j + 0.5, r: mc.r * inten, g: mc.g * inten, b: mc.b * inten, radius: 11, noShadow: true });
      }
    }
    this.autoCeilingLights(ctx, placed);
  }

  private autoCeilingLights(ctx: BuildContext, placed: { x: number; z: number }[]) {
    const g = this.grid, def = this.def;
    def.zones.forEach((zd, zi) => {
      if (!zd.ceiling) return;
      const sp = zd.lightSpacing ?? 5;
      for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) {
        if (g.zoneAt(i, j) !== zi || g.kindAt(i, j) !== K.FLOOR) continue;
        if ((i % sp) !== 2 || (j % sp) !== 2) continue;
        if (placed.some((p) => Math.abs(p.x - i - 0.5) < sp * 0.6 && Math.abs(p.z - j - 0.5) < sp * 0.6)) continue;
        const flick = this.rng() < 0.3 ? 0.4 + this.rng() * 0.6 : 0;
        // tall halls get low-hanging industrial pendants
        const ly = Math.min(zd.height - 0.45, 3.3);
        ctx.addLight(i + 0.5, ly, j + 0.5, zd.lightColor, zd.lightIntensity, zd.height > 4 ? 10.5 : 8.5, flick);
        placed.push({ x: i + 0.5, z: j + 0.5 });
      }
    });
  }

  private ambientAt(x: number, z: number, out: THREE.Color) {
    const g = this.grid;
    const i = Math.floor(x), j = Math.floor(z);
    const k = g.kindAt(i, j);
    const zd = k === K.OUTSIDE || k === K.VOID ? null : this.zoneDef(i, j);
    out.setHex(zd ? zd.ambient : this.def.outsideAmbient);
    out.multiplyScalar(LIGHTING.ambientScale);
    out.r += LIGHTING.ambientLift; out.g += LIGHTING.ambientLift; out.b += LIGHTING.ambientLift * 1.05;
  }

  // ------------------------------------------------------------------ props
  private buildProps(batch: GeoBatch) {
    const g = this.grid;
    const used = new Set<number>();
    for (const m of g.markers) {
      if (m.ch !== 'x' && m.ch !== 'o') continue;
      const id = m.j * g.w + m.i;
      if (used.has(id)) continue;
      used.add(id);
      const zd = this.zoneDef(m.i, m.j);
      const theme = zd?.theme ?? 'test';
      const r = this.rng;
      if (m.ch === 'o') {
        const list = LOW_PROPS[theme] ?? LOW_PROPS.courtyard!;
        list[Math.floor(r() * list.length)](batch, M(m.i + 0.5, 0, m.j + 0.5, m.facing), r);
        continue;
      }
      // try a double prop with a right / down neighbour
      const doubles = DOUBLE_PROPS[theme];
      if (doubles && r() < 0.75) {
        const nb = g.markers.find((o) => o.ch === 'x' && !used.has(o.j * g.w + o.i) &&
          ((o.i === m.i + 1 && o.j === m.j) || (o.i === m.i && o.j === m.j + 1)));
        if (nb) {
          used.add(nb.j * g.w + nb.i);
          const cx = (m.i + nb.i) / 2 + 0.5, cz = (m.j + nb.j) / 2 + 0.5;
          const horizontal = nb.i !== m.i;
          const f = doubles[Math.floor(r() * doubles.length)];
          // long axis of double props is local Z
          const yaw = horizontal ? Math.PI / 2 : 0;
          f(batch, M(cx, 0, cz, yaw + (r() > 0.5 ? Math.PI : 0)), r);
          continue;
        }
      }
      themeProp(theme, r)(batch, M(m.i + 0.5, 0, m.j + 0.5, m.facing), r);
    }
  }

  // ------------------------------------------------------------------ doors
  private buildDoors() {
    const g = this.grid, def = this.def;
    for (const dd of def.doors) {
      const cells = g.doors.get(dd.id);
      if (!cells) continue;
      const batch = new GeoBatch();
      for (const k of ['surf:wood', 'surf:metal', 'surf:riveted', 'surf:concrete']) batch.uvScale[k] = surfaceScale(k.slice(5) as Surface);
      const center = new THREE.Vector3();
      const r = this.rng;
      for (const c of cells.cells) {
        const i = c % g.w, j = (c / g.w) | 0;
        center.x += i + 0.5; center.z += j + 0.5;
        const alongX = g.solidForPlayer(i - 1, j) && g.kindAt(i - 1, j) !== K.DOOR || g.solidForPlayer(i + 1, j) && g.kindAt(i + 1, j) !== K.DOOR;
        const yaw = alongX ? 0 : Math.PI / 2; // slab spans local X
        const base = M(i + 0.5, 0, j + 0.5, yaw);
        if (dd.kind === 'secret') {
          bookshelf(batch, base.clone().multiply(M(0, 0, 0.32)), r);
          bookshelf(batch, base.clone().multiply(M(0, 0, -0.32, Math.PI)), r);
        } else if (dd.kind === 'debris') {
          for (let n = 0; n < 7; n++) {
            const s = 0.3 + r() * 0.45;
            batch.add('surf:concrete', rbox(s, s * 0.7, s, 0.04), base.clone().multiply(M((r() - 0.5) * 0.8, 0.2 + r() * 1.2, (r() - 0.5) * 0.6, r() * 3, r() * 0.6, r() * 0.6)), 0x8a8880);
          }
          for (let n = 0; n < 4; n++) batch.add('surf:wood', box(0.1, 0.06, 1.3), base.clone().multiply(M((r() - 0.5) * 0.7, 0.4 + r() * 1.4, 0, Math.PI / 2 + (r() - 0.5) * 0.6, (r() - 0.5) * 0.8, (r() - 0.5))), 0x7a6040);
          batch.add('plain:fabric', rbox(0.9, 0.3, 0.5, 0.1), base.clone().multiply(M(0, 0.15, 0.1, 0.1)), 0x5e543c);
          batch.add('plain:fabric', rbox(0.8, 0.28, 0.45, 0.1), base.clone().multiply(M(0.05, 0.45, 0.05, -0.1)), 0x6a5e44);
          // a broken chair leg / cabinet poking out
          batch.add('plain:paint', rbox(0.5, 0.9, 0.4, 0.02), base.clone().multiply(M(0.2, 1.3, -0.1, 0.7, 0.4, 0.9)), 0x4c5434);
        } else if (def.doorStyle === 'gate') {
          const top = def.outdoor?.gateTop ?? DOOR_TOP;
          for (let b = 0; b < 9; b++) batch.add('plain:iron', cyl(0.022, 0.022, top, 6), base.clone().multiply(M(-0.44 + b * 0.11, top / 2, 0)), 0x3a3a38);
          if (def.outdoor) for (let b = 0; b < 9; b++) batch.add('plain:iron', cone(0.04, 0.12, 4), base.clone().multiply(M(-0.44 + b * 0.11, top + 0.05, 0)), 0x3a3a38);
          for (const y of [0.25, 1.2, top - 0.2]) batch.add('plain:iron', box(1.0, 0.06, 0.04), base.clone().multiply(M(0, y, 0)), 0x2e2e2c);
          batch.add('plain:iron', torus(0.08, 0.02, 4, 10), base.clone().multiply(M(0, 1.2, 0.06)), 0x555555);
          batch.add('plain:brass', rbox(0.1, 0.12, 0.05, 0.02), base.clone().multiply(M(0, 1.08, 0.08)), 0x9a7a3a);
          batch.add('plain:paper', box(0.32, 0.24, 0.005), base.clone().multiply(M(0.25, 1.55, 0.04, 0, 0, 0.05)), 0xc8b88a);
        } else {
          batch.add('surf:riveted', box(1.0, DOOR_TOP, 0.08), base.clone().multiply(M(0, DOOR_TOP / 2, 0)), 0x9a8a6a);
          for (let s = 0; s < 8; s++) batch.add('surf:metal', box(1.0, 0.03, 0.1), base.clone().multiply(M(0, 0.2 + s * 0.3, 0)), 0x6a6a5a);
          batch.add('plain:paint', box(0.5, 0.12, 0.01), base.clone().multiply(M(0, 1.6, 0.06)), 0xa08010);
          batch.add('plain:paint', box(0.5, 0.12, 0.01), base.clone().multiply(M(0, 1.6, -0.06)), 0xa08010);
        }
      }
      center.multiplyScalar(1 / cells.cells.length);
      center.y = 1.2;
      const group = new THREE.Group();
      for (const [key, geo] of batch.finalize()) {
        this.warp(geo);
        this.baker.bakeGeometry(geo);
        group.add(new THREE.Mesh(geo, this.matLib.get(key)));
      }
      this.group.add(group);
      const c0 = cells.cells[0];
      const ci = c0 % g.w, cj = (c0 / g.w) | 0;
      const along = g.kindAt(ci - 1, cj) === K.WALL || g.kindAt(ci + 1, cj) === K.WALL || g.kindAt(ci - 1, cj) === K.DOOR || g.kindAt(ci + 1, cj) === K.DOOR;
      const slide = along ? new THREE.Vector3(cells.cells.length * 1.0, 0, 0) : new THREE.Vector3(0, 0, cells.cells.length * 1.0);
      this.doors.set(dd.id, { id: dd.id, kind: dd.kind, group, center, cells: cells.cells, open: false, t: 0, slide });
    }
  }

  private buildWater() {
    const g = this.grid;
    this.def.zones.forEach((zd, zi) => {
      if (zd.waterLevel === undefined) return;
      let minI = 1e9, minJ = 1e9, maxI = -1, maxJ = -1;
      for (let j = 0; j < g.h; j++) for (let i = 0; i < g.w; i++) if (g.zoneAt(i, j) === zi) {
        minI = Math.min(minI, i); maxI = Math.max(maxI, i); minJ = Math.min(minJ, j); maxJ = Math.max(maxJ, j);
      }
      if (maxI < 0) return;
      const w = maxI - minI + 1, d = maxJ - minJ + 1;
      const geo = new THREE.PlaneGeometry(w, d, Math.max(1, w), Math.max(1, d));
      geo.rotateX(-Math.PI / 2);
      geo.translate(minI + w / 2, zd.waterLevel, minJ + d / 2);
      const bake = new Float32Array(geo.attributes.position.count * 3);
      const pos = geo.attributes.position.array as Float32Array;
      const col = new Float32Array(geo.attributes.position.count * 3).fill(1);
      for (let v = 0; v < geo.attributes.position.count; v++) {
        this.baker.irradiance(pos[v * 3], pos[v * 3 + 1], pos[v * 3 + 2], 0, 1, 0, bake, v * 3, false);
      }
      const uv = geo.attributes.uv.array as Float32Array;
      for (let v = 0; v < uv.length / 2; v++) { uv[v * 2] = pos[v * 3] / 4; uv[v * 2 + 1] = pos[v * 3 + 2] / 4; }
      geo.setAttribute('bake', new THREE.BufferAttribute(bake, 3));
      geo.setAttribute('color', new THREE.BufferAttribute(col, 3));
      const mesh = new THREE.Mesh(geo, this.matLib.get('surf:water'));
      mesh.renderOrder = 2;
      this.waters.push(mesh);
      this.group.add(mesh);
    });
  }

  // ------------------------------------------------------------------ runtime
  /** Create the dynamic point light pool (count from quality preset). */
  setupLightPool(scene: THREE.Scene, count: number) {
    for (const l of this.pool) scene.remove(l);
    this.pool = [];
    for (let i = 0; i < count; i++) {
      const l = new THREE.PointLight(0xffffff, 0, 9, 2);
      scene.add(l);
      this.pool.push(l);
    }
  }

  private sorted: PracticalLight[] = [];
  update(dt: number, time: number, cam: THREE.Vector3, powerOn: boolean) {
    for (const u of this.updaters) u(dt, time);
    // flicker
    const col = new THREE.Color();
    for (const p of this.practicals) {
      if (p.flicker > 0) {
        p.burst -= dt;
        if (p.burst <= 0 && Math.random() < dt * 0.35 * p.flicker) p.burst = 0.15 + Math.random() * 0.6;
        const base = 0.92 + Math.sin(time * 13 + p.phase) * 0.04 + Math.sin(time * 31 + p.phase * 3) * 0.03;
        p.level = p.burst > 0 ? (Math.random() < 0.5 ? 0.08 : 0.9) : base;
      } else p.level = 0.97 + Math.sin(time * 7 + p.phase) * 0.03;
      void powerOn;
      col.copy(p.color).multiplyScalar(1.2 + 2.6 * p.level);
      this.bulbs.setColorAt(p.bulb, col);
    }
    if (this.bulbs.instanceColor) this.bulbs.instanceColor.needsUpdate = true;
    // assign pool lights to nearest practicals
    if (this.pool.length) {
      this.sorted.length = 0;
      for (const p of this.practicals) this.sorted.push(p);
      const d2 = (p: PracticalLight) => (p.x - cam.x) ** 2 + (p.z - cam.z) ** 2;
      this.sorted.sort((a, b) => d2(a) - d2(b));
      for (let i = 0; i < this.pool.length; i++) {
        const l = this.pool[i];
        const p = this.sorted[i];
        if (!p) { l.intensity = 0; continue; }
        l.position.set(p.x, p.y - 0.1, p.z);
        l.color.copy(p.color);
        const fadeD = Math.sqrt(d2(p));
        const fade = Math.max(0, Math.min(1, (14 - fadeD) / 6));
        l.intensity = p.intensity * 5.5 * p.level * fade;
        l.distance = p.radius;
      }
    }
    // sky follows camera
    this.sky.position.copy(cam);
    (this.sky.material as THREE.ShaderMaterial).uniforms.uTime.value = time;
    for (const w of this.waters) {
      const m = w.material as THREE.MeshStandardMaterial;
      if (m.normalMap) m.normalMap.offset.set(time * 0.01, time * 0.007);
    }
    // door animations
    for (const d of this.doors.values()) {
      if (!d.open || d.t >= 1) continue;
      d.t = Math.min(1, d.t + dt * 1.2);
      const e = d.t * d.t;
      if (d.kind === 'debris') { d.group.position.y = -e * 2.6; d.group.rotation.z = 0; }
      else if (d.kind === 'secret') d.group.position.copy(d.slide).multiplyScalar(Math.min(1, d.t * 1.1) * 0.95);
      else d.group.position.y = e * 2.6;
      if (d.t >= 1 && d.kind !== 'secret') d.group.visible = false;
    }
  }

  openDoor(id: string) {
    const d = this.doors.get(id);
    if (!d || d.open) return;
    d.open = true;
    this.grid.openDoor(id);
    const cells = this.grid.doors.get(id);
    if (cells) for (const z of cells.zones) this.zoneActive[z] = true;
    this.flow.dirty = true;
  }

  dispose() {
    if (this.terrain && getTerrain() === this.terrain) setTerrain(null);
    // world meshes + map objects (chalk, signs, crate parts) + the sky
    this.group.traverse((o) => {
      const m = o as THREE.Mesh;
      if (m.geometry) m.geometry.dispose();
      const mat = (m as any).material as THREE.Material | undefined;
      if (mat && !(mat as any).__shared) {
        const t = (mat as any).map as THREE.Texture | null;
        if (t && (t as any).isCanvasTexture) t.dispose();
      }
    });
    this.matLib.dispose();
  }
}

const tick = () => new Promise((r) => setTimeout(r, 0));

/**
 * Split an indexed geometry into square chunks (by triangle centroid). The chunks share the
 * vertex attributes (uploaded once); each gets its own index and a tight bounding sphere so
 * three.js can frustum-cull it.
 */
function splitChunks(geo: THREE.BufferGeometry, size: number): THREE.BufferGeometry[] {
  const idx = geo.index!.array as ArrayLike<number>;
  const pos = geo.attributes.position.array as Float32Array;
  const buckets = new Map<number, number[]>();
  for (let t = 0; t < idx.length; t += 3) {
    const a = idx[t] * 3, b = idx[t + 1] * 3, c = idx[t + 2] * 3;
    const cx = (pos[a] + pos[b] + pos[c]) / 3, cz = (pos[a + 2] + pos[b + 2] + pos[c + 2]) / 3;
    const key = Math.floor(cz / size + 100) * 1000 + Math.floor(cx / size + 100);
    let arr = buckets.get(key);
    if (!arr) { arr = []; buckets.set(key, arr); }
    arr.push(idx[t], idx[t + 1], idx[t + 2]);
  }
  if (buckets.size <= 1) return [geo];
  const out: THREE.BufferGeometry[] = [];
  const box = new THREE.Box3(), v = new THREE.Vector3();
  for (const list of buckets.values()) {
    const g = new THREE.BufferGeometry();
    for (const name of Object.keys(geo.attributes)) g.setAttribute(name, geo.attributes[name]);
    const maxI = list.reduce((m, x) => (x > m ? x : m), 0);
    g.setIndex(new THREE.BufferAttribute(maxI > 65535 ? new Uint32Array(list) : new Uint16Array(list), 1));
    box.makeEmpty();
    for (const i of list) box.expandByPoint(v.fromArray(pos, i * 3));
    g.boundingBox = box.clone();
    g.boundingSphere = box.getBoundingSphere(new THREE.Sphere());
    out.push(g);
  }
  return out;
}
export { sphere };
