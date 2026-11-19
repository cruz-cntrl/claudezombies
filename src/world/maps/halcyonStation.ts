import * as THREE from 'three';
import type { MapDef } from '../mapTypes';
import { LayoutBuilder } from '../layoutBuilder';
import { M, box, cyl, rbox, tube, torus, sphere } from '../../render/geometryKit';
import { truck, conveyor, capacitor, lampPost } from '../props';
import { posterMaterials } from '../../render/canvasArt';
import { K } from '../grid';
import type { BuildContext } from '../mapBuilder';

/**
 * MAP 2 — HALCYON SIGNAL STATION (1944)
 *  A Loading Dock (start) → B Chip Assembly → C Generator Hall (power) → E Transmitter Roof
 *  A → D Control Room (keypad) → E
 */
const L = new LayoutBuilder(58, 36);
L.outside(1, 1, 56, 34);
L.room(4, 4, 19, 15, 'D');   // control room
L.room(21, 4, 53, 15, 'E');  // transmitter roof
L.room(4, 17, 19, 31, 'A');  // loading dock
L.room(21, 17, 38, 31, 'B'); // assembly line
L.room(40, 17, 53, 31, 'C'); // generator hall
// windows (8)
L.set(3, 22, 'w').set(10, 32, 'w');   // A
L.set(26, 32, 'w').set(34, 32, 'w');  // B
L.set(54, 24, 'w');                   // C
L.set(3, 9, 'w');                     // D
L.set(30, 3, 'w').set(44, 3, 'w');    // E
// doors
L.set(20, 24, '1').set(20, 25, '1');  // A ↔ B shutter
L.set(39, 23, '2').set(39, 24, '2');  // B ↔ C debris
L.set(10, 16, '3').set(11, 16, '3');  // A ↔ D stairwell shutter
L.set(46, 16, '4').set(47, 16, '4');  // C ↔ E roof access shutter
L.set(20, 9, '5').set(20, 10, '5');   // D ↔ E debris

// --- A: loading dock
L.set(12, 27, '*');
L.set(4, 19, 'b', 'warden').set(19, 29, 'b', 'fieldmarshal');
L.set(4, 30, 'p', 'secondwind');
L.set(15, 31, 'c', 'crateA');
for (let y = 18; y <= 22; y++) for (let x = 7; x <= 9; x++) L.set(x, y, 'q', 'truck');
L.set(16, 18, 'x').set(17, 18, 'x').set(18, 18, 'x').set(18, 19, 'x').set(14, 22, 'x').set(6, 27, 'x').set(6, 28, 'x').set(17, 26, 'x');
L.set(12, 21, 'o').set(15, 25, 'o');
L.set(17, 21, 'e', 'tape1').set(5, 25, 'e', 'note6');
// --- B: assembly line
for (let x = 23; x <= 33; x++) L.set(x, 21, 'q', 'conv');
for (let x = 26; x <= 36; x++) L.set(x, 27, 'q', 'conv');
L.set(22, 18, 'x').set(23, 18, 'x').set(37, 18, 'x').set(37, 31, 'x').set(31, 24, 'x').set(25, 30, 'x');
L.set(21, 30, 'b', 'chatterbox').set(38, 19, 'b', 'trench');
L.set(38, 30, 'p', 'ironhide');
L.set(29, 17, 'c', 'crateB');
L.set(24, 24, 'q', 'relay1');
L.set(36, 23, 'e', 'tape2').set(22, 26, 'e', 'note7');
L.set(34, 25, 'v');
// --- C: generator hall
L.set(53, 28, 's');
L.set(42, 19, 'x').set(44, 19, 'x').set(49, 19, 'x').set(51, 19, 'x').set(42, 29, 'x').set(51, 29, 'x');
L.set(46, 24, 'x').set(47, 24, 'x');
L.set(40, 30, 'p', 'rapidfire').set(53, 18, 'p', 'quickhands');
L.set(45, 31, 'r');
L.set(40, 18, 'b', 'longshot');
L.set(50, 25, 'q', 'relay2');
L.set(52, 21, 'e', 'note8').set(41, 26, 'e', 'tape3');
L.set(49, 31, 'c', 'crateC');
L.set(44, 27, 'v');
// --- D: control room
for (const x of [6, 8, 10, 12]) L.set(x, 4, 'x');
L.set(16, 4, 'x').set(17, 4, 'x').set(18, 4, 'x');
L.set(9, 9, 'x').set(10, 9, 'x').set(14, 9, 'x').set(15, 9, 'x');
L.set(19, 6, 'q', 'keypad');
L.set(4, 14, 'p', 'packmule').set(19, 14, 'p', 'fleetfoot');
L.set(4, 6, 'b', 'typewriter');
L.set(7, 13, 'e', 'note9').set(13, 13, 'e', 'radiogag');
// --- E: transmitter roof
for (const [x, y] of [[36, 9], [37, 9], [36, 10], [37, 10]]) L.set(x, y, 'q', 'antenna');
L.set(26, 6, 'q', 'relay3');
L.set(24, 12, 'x').set(29, 5, 'x').set(44, 8, 'x').set(50, 13, 'x').set(32, 13, 'x').set(47, 5, 'x');
L.set(40, 12, 'o').set(28, 9, 'o').set(42, 6, 'o');
L.set(53, 5, 'b', 'hollowpoint');
L.set(53, 14, 'c', 'crateE');
L.set(34, 6, 'v').set(45, 12, 'v').set(24, 9, 'v');
L.set(51, 10, 'e', 'note10').set(37, 13, 'e', 'bossSpawn');
L.set(25, 13, 'l').set(42, 14, 'l').set(49, 6, 'l').set(31, 8, 'l');

function decorate(ctx: BuildContext) {
  const { batch, grid, rng } = ctx;
  const done = new Set<string>();
  for (const m of grid.markers) {
    if (m.ch !== 'q' || !m.id) continue;
    if (m.id === 'conv') { conveyor(batch, M(m.i + 0.5, 0, m.j + 0.5, Math.PI / 2), rng); continue; }
    if (done.has(m.id)) continue;
    done.add(m.id);
    if (m.id === 'truck') truck(batch, M(m.i + 1.5, 0, m.j + 2.6, Math.PI), rng);
    if (m.id === 'antenna') antenna(ctx, m.i + 1, m.j + 1);
    if (m.id.startsWith('relay')) relayBase(ctx, m.i + 0.5, m.j + 0.5);
    if (m.id === 'keypad') keypadPanel(ctx, m.i + 0.5, m.j + 0.5, m.facing);
  }
  // posters
  posterMaterials().forEach((mat, i) => ctx.registerMaterial('poster' + i, mat));
  let placed = 0;
  for (let j = 1; j < grid.h - 1 && placed < 12; j++) for (let i = 1; i < grid.w - 1 && placed < 12; i++) {
    if (grid.kindAt(i, j) !== K.FLOOR) continue;
    const zd = ctx.zone(i, j);
    if (!zd || !zd.ceiling || rng() > 0.05) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (grid.kindAt(i + di, j + dj) !== K.WALL) continue;
      batch.add('poster' + (placed % 4), new THREE.PlaneGeometry(0.62, 0.87, 2, 2), M(i + 0.5 + di * 0.485, 1.8, j + 0.5 + dj * 0.485, Math.atan2(-di, -dj)), 0xffffff, 'keep');
      placed++;
      break;
    }
  }
  // hazard stripes along the dock edge + overhead cable trays everywhere indoors
  for (let x = 4; x <= 19; x++) batch.add('plain:paint', box(1, 0.01, 0.25), M(x + 0.5, 0.005, 31.4), x % 2 ? 0xc0a020 : 0x151515);
  for (let x = 21; x <= 38; x++) {
    batch.add('surf:metal', box(1.02, 0.06, 0.35), M(x + 0.5, 3.7, 19.5), 0x5a5a50);
    batch.add('plain:rubber', cyl(0.025, 0.025, 1.02, 5), M(x + 0.5, 3.75, 19.4, 0, 0, Math.PI / 2), 0x151515);
    batch.add('plain:rubber', cyl(0.02, 0.02, 1.02, 5), M(x + 0.5, 3.75, 19.6, 0, 0, Math.PI / 2), 0x5a1a10);
  }
  for (let y = 17; y <= 31; y++) batch.add('surf:metal', cyl(0.12, 0.12, 1.02, 10), M(53.4, 4.4, y + 0.5, 0, Math.PI / 2), 0x6a6050);
  // cargo lift in the dock: steel platform, cage rails, chains to the ceiling
  const lx = 15.5, lz = 23.5;
  batch.add('surf:grate', box(2.4, 0.08, 2.4), M(lx, 0.04, lz), 0x9a9a90);
  for (const [sx, sz] of [[-1, -1], [1, -1], [1, 1], [-1, 1]]) {
    batch.add('plain:iron', box(0.08, 4.9, 0.08), M(lx + sx * 1.18, 2.45, lz + sz * 1.18), 0x3a3a34);
    batch.add('plain:iron', cyl(0.02, 0.02, 3.6, 4), M(lx + sx * 0.9, 3.2, lz + sz * 0.9), 0x555550);
  }
  for (const y of [0.5, 1.0]) for (const s of [-1, 1]) {
    batch.add('plain:paint', box(2.4, 0.05, 0.05), M(lx, y, lz + s * 1.18), 0xb09018);
    batch.add('plain:paint', box(0.05, 0.05, 2.4), M(lx + s * 1.18, y, lz), 0xb09018);
  }
  batch.add('surf:riveted', rbox(0.5, 1.2, 0.3, 0.03), M(lx + 1.5, 0.6, lz - 1.0), 0x6a6a5a);
  // big capacitor towers in the generator hall corners
  capacitor(batch, M(41.2, 0, 22.5), rng);
  capacitor(batch, M(52.8, 0, 26.5), rng);
  // roof: beacon posts are added by 'l' markers; parapet light rail
  for (let x = 22; x <= 52; x += 2) batch.add('plain:iron', cyl(0.03, 0.03, 1.1, 5), M(x + 0.5, 0.55, 4.4), 0x2a2a2a);
  void lampPost;
}

function antenna(ctx: BuildContext, cx: number, cz: number) {
  const b = ctx.batch;
  const H = 22;
  const legs = [[-1, -1], [1, -1], [1, 1], [-1, 1]];
  for (const [sx, sz] of legs) b.add('plain:iron', tube([new THREE.Vector3(cx + sx * 0.95, 0, cz + sz * 0.95), new THREE.Vector3(cx + sx * 0.5, H * 0.5, cz + sz * 0.5), new THREE.Vector3(cx + sx * 0.12, H, cz + sz * 0.12)], 0.07, 12, 5), undefined, 0x4a3a30);
  for (let y = 1.5; y < H; y += 1.6) {
    const w = 0.95 - (y / H) * 0.83;
    for (let k = 0; k < 4; k++) {
      const [ax, az] = legs[k], [bx, bz] = legs[(k + 1) % 4];
      b.add('plain:iron', tube([new THREE.Vector3(cx + ax * w, y, cz + az * w), new THREE.Vector3(cx + bx * w, y + 0.8, cz + bz * w)], 0.025, 2, 4), undefined, 0x3a2e26);
    }
  }
  b.add('surf:riveted', rbox(2.2, 0.6, 2.2, 0.05), M(cx, 0.3, cz), 0x5a5a50);
  for (let r = 0; r < 3; r++) b.add('plain:brass', torus(0.6 - r * 0.15, 0.04, 6, 18), M(cx, H - 2 - r * 1.2, cz, 0, Math.PI / 2), 0xb06a30);
  b.add('glow', sphere(0.18, 10, 8), M(cx, H + 0.2, cz), 0xff2010);
  ctx.addLight(cx, H + 0.2, cz, 0xff3020, 1.5, 7, 0.9, 'none');
}

function relayBase(ctx: BuildContext, x: number, z: number) {
  const b = ctx.batch;
  b.add('surf:riveted', rbox(0.9, 0.5, 0.9, 0.04), M(x, 0.25, z), 0x4a5048);
  b.add('plain:iron', cyl(0.08, 0.12, 2.4, 8), M(x, 1.7, z), 0x3a3a38);
  for (let k = 0; k < 5; k++) b.add('plain:glass', cyl(0.18 - k * 0.015, 0.18 - k * 0.015, 0.08, 12), M(x, 1.2 + k * 0.35, z), 0x7a5a3a);
  b.add('plain:brass', sphere(0.14, 10, 8), M(x, 3.0, z), 0xa07a3a);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2;
    b.add('plain:rubber', tube([new THREE.Vector3(x, 0.4, z), new THREE.Vector3(x + Math.cos(a) * 0.8, 0.1, z + Math.sin(a) * 0.8), new THREE.Vector3(x + Math.cos(a) * 1.6, 0.02, z + Math.sin(a) * 1.6)], 0.03, 6, 4), undefined, 0x151515);
  }
}

function keypadPanel(ctx: BuildContext, x: number, z: number, yaw: number) {
  const b = ctx.batch;
  const base = M(x, 0, z, yaw);
  const at = (px: number, py: number, pz: number) => base.clone().multiply(M(px, py, pz));
  b.add('surf:riveted', rbox(0.8, 1.6, 0.5, 0.03), at(0, 0.8, -0.2), 0x4a4e48);
  b.add('plain:paint', box(0.5, 0.6, 0.02), at(0, 1.25, 0.06), 0x1a1a18);
  for (let r = 0; r < 4; r++) for (let c = 0; c < 3; c++) b.add('plain:chrome', box(0.1, 0.1, 0.03), at(-0.13 + c * 0.13, 1.45 - r * 0.13, 0.08), 0x9a9a90);
  b.add('glow', box(0.4, 0.08, 0.01), at(0, 1.62, 0.07), 0x403010);
}

export const halcyonStation: MapDef = {
  id: 'station',
  unlock: { map: 'ravenmoor', round: 5 },
  name: 'Halcyon Signal Station',
  subtitle: '1944 — where the signal comes from',
  desc: 'Riveted steel and humming machinery. A loading dock, the chip assembly line, a generator hall of arcing capacitors, the control room and the transmitter roof.',
  layout: L.build(),
  markerIds: L.markerIds,
  zones: [
    { letter: 'D', name: 'Control Room', floor: 'tile', wall: 'riveted', wainscot: 'wood', ceiling: 'ceilingTile', height: 3.4,
      lightColor: 0xffc890, lightIntensity: 1.25, ambient: 0x12110e, reverb: 'room', theme: 'control', lightSpacing: 5 },
    { letter: 'E', name: 'Transmitter Roof', floor: 'concrete', wall: 'concrete', ceiling: null, height: 3.2,
      lightColor: 0xff4a30, lightIntensity: 0.55, ambient: 0x1c2230, reverb: 'outdoor', theme: 'roof' },
    { letter: 'A', name: 'Loading Dock', floor: 'concrete', wall: 'riveted', ceiling: 'metal', height: 5.0,
      lightColor: 0xffb050, lightIntensity: 2.1, ambient: 0x1e1912, reverb: 'metal', theme: 'dock', lightSpacing: 6 },
    { letter: 'B', name: 'Chip Assembly', floor: 'grate', wall: 'riveted', ceiling: 'metal', height: 4.2,
      lightColor: 0xffb868, lightIntensity: 2.2, ambient: 0x221e16, reverb: 'metal', theme: 'assembly', lightSpacing: 4 },
    { letter: 'C', name: 'Generator Hall', floor: 'concrete', wall: 'concrete', wainscot: 'riveted', ceiling: 'metal', height: 5.5,
      lightColor: 0xffa860, lightIntensity: 1.9, ambient: 0x171a20, reverb: 'metal', theme: 'generator', lightSpacing: 5, steam: true },
  ],
  doors: [
    { id: '1', cost: 750, kind: 'door', label: 'Chip Assembly' },
    { id: '2', cost: 1000, kind: 'debris', label: 'Generator Hall' },
    { id: '3', cost: 1000, kind: 'door', label: 'Control Room' },
    { id: '4', cost: 1250, kind: 'door', label: 'Transmitter Roof' },
    { id: '5', cost: 1250, kind: 'debris', label: 'Transmitter Roof' },
  ],
  markers: { p: [], b: [], e: [] },
  fogColor: 0x0b0d14,
  fogDensity: 0.04,
  outsideSurface: 'concrete',
  exterior: 'concrete',
  perimeter: 'riveted',
  outsideAmbient: 0x10141c,
  doorStyle: 'shutter',
  sky: 'storm',
  chipColor: 0x40e8e0,
  songId: 'station',
  decorate,
};
