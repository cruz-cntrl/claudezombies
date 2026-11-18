import * as THREE from 'three';
import type { MapDef } from '../mapTypes';
import { LayoutBuilder } from '../layoutBuilder';
import { M, box, cyl, rbox } from '../../render/geometryKit';
import { fountain, radioConsole, implantChair, surgicalLamp, pipes, valveWheel } from '../props';
import { posterMaterials, graffitiTexture } from '../../render/canvasArt';
import { K } from '../grid';
import type { BuildContext } from '../mapBuilder';
import { bakedStandard } from '../../render/materials';

/**
 * MAP 1 — RAVENMOOR ASYLUM (1944)
 *  A Reception (start) → B Patient Ward → C Operating Theater → F hidden Records Room
 *  A → D Flooded Boiler Room (power) → E Courtyard ← B
 */
const L = new LayoutBuilder(56, 33);
L.outside(1, 1, 54, 31);
L.room(4, 4, 17, 14, 'A');   // reception
L.room(19, 4, 36, 14, 'B');  // ward
L.room(38, 4, 49, 14, 'C');  // theater
L.room(4, 16, 17, 27, 'D');  // boiler room
L.room(19, 16, 36, 27, 'E'); // courtyard
L.room(38, 16, 45, 21, 'F'); // hidden records room
// windows (8)
L.set(8, 3, 'w').set(3, 10, 'w');          // A
L.set(24, 3, 'w').set(31, 3, 'w');         // B
L.set(50, 9, 'w');                          // C
L.set(3, 22, 'w');                          // D
L.set(24, 28, 'w').set(31, 28, 'w');       // E
// doors
L.set(18, 8, '1').set(18, 9, '1');         // A ↔ B gate
L.set(37, 9, '2').set(37, 10, '2');        // B ↔ C debris
L.set(9, 15, '3').set(10, 15, '3');        // A ↔ D gate (basement)
L.set(27, 15, '4').set(28, 15, '4');       // B ↔ E debris
L.set(18, 22, '5').set(18, 23, '5');       // D ↔ E gate
L.set(41, 15, '6').set(42, 15, '6');       // C ↔ F secret bookshelf

// --- A: reception
L.set(11, 10, '*');
L.set(4, 5, 'b', 'warden').set(17, 12, 'b', 'fieldmarshal');
L.set(4, 13, 'p', 'secondwind');
L.set(13, 4, 'c', 'crateA');
L.set(8, 7, 'x').set(9, 7, 'x').set(15, 4, 'x').set(16, 4, 'x').set(6, 13, 'x').set(14, 13, 'x').set(15, 13, 'x').set(17, 5, 'x');
L.set(16, 7, 'e', 'note1').set(5, 7, 'e', 'musicbox1');
// --- B: ward
L.set(19, 13, 'b', 'chatterbox').set(36, 5, 'b', 'hollowpoint');
L.set(36, 13, 'p', 'ironhide');
L.set(28, 4, 'c', 'crateB');
for (const x of [20, 22, 26, 33]) L.set(x, 4, 'x').set(x, 5, 'x');
for (const x of [21, 23, 31, 33]) L.set(x, 13, 'x').set(x, 14, 'x');
L.set(25, 9, 'x').set(30, 9, 'x').set(35, 9, 'x');
L.set(34, 11, 'e', 'valve1').set(21, 10, 'e', 'freqnote').set(29, 12, 'e', 'note2');
// --- C: theater
L.set(49, 12, 'r');
L.set(38, 5, 'p', 'quickhands').set(38, 13, 'p', 'packmule');
L.set(49, 5, 'b', 'typewriter');
L.set(44, 4, 'q', 'console').set(45, 9, 'q', 'implantchair');
L.set(40, 4, 'x').set(41, 4, 'x').set(47, 4, 'x').set(41, 9, 'x').set(48, 13, 'x');
L.set(43, 14, 'e', 'shelfbook').set(46, 13, 'e', 'note3');
// --- D: boiler room (flooded)
L.set(17, 25, 's');
L.set(4, 26, 'p', 'rapidfire');
L.set(10, 27, 'b', 'trench');
L.set(16, 27, 'c', 'crateD');
L.set(7, 18, 'x').set(7, 19, 'x').set(13, 17, 'x').set(14, 17, 'x').set(15, 20, 'x').set(12, 24, 'x').set(6, 24, 'x').set(4, 17, 'x');
L.set(12, 21, 'v');
L.set(16, 17, 'e', 'valve2').set(5, 20, 'e', 'musicbox2').set(14, 26, 'e', 'note4');
// --- E: courtyard
for (const [x, y] of [[27, 21], [28, 21], [27, 22], [28, 22]]) L.set(x, y, 'q', 'fountain');
L.set(21, 18, 'x').set(34, 18, 'x').set(22, 26, 'x').set(34, 25, 'x');
L.set(25, 18, 'o').set(30, 25, 'o').set(24, 21, 'o');
L.set(36, 26, 'p', 'fleetfoot');
L.set(19, 26, 'b', 'longshot');
L.set(36, 17, 'c', 'crateE');
L.set(23, 23, 'v').set(33, 21, 'v').set(30, 18, 'v');
L.set(25, 24, 'l').set(32, 19, 'l').set(21, 21, 'l');
L.set(20, 17, 'e', 'valve3').set(35, 21, 'e', 'musicbox3').set(28, 24, 'e', 'bossSpawn');
// --- F: hidden records room
L.set(38, 17, 'x').set(38, 18, 'x').set(45, 17, 'x').set(45, 18, 'x').set(38, 20, 'x').set(45, 20, 'x');
L.set(41, 19, 'x').set(42, 19, 'x');
L.set(43, 21, 'e', 'note5').set(40, 21, 'e', 'stash');

function decorate(ctx: BuildContext) {
  const { batch, grid, rng } = ctx;
  const done = new Set<string>();
  for (const m of grid.markers) {
    if (m.ch !== 'q' || !m.id || done.has(m.id)) continue;
    done.add(m.id);
    if (m.id === 'fountain') fountain(batch, M(m.i + 1, 0, m.j + 1), rng);
    if (m.id === 'console') radioConsole(batch, M(m.i + 0.5, 0, m.j + 0.5, m.facing), rng);
    if (m.id === 'implantchair') {
      implantChair(batch, M(m.i + 0.5, 0, m.j + 0.5, m.facing + Math.PI), rng);
      surgicalLamp(batch, M(m.i + 0.5, 3.2, m.j + 1.2), rng);
      ctx.addLight(m.i + 0.5, 3.0, m.j + 1.2, 0xe0f0ff, 1.2, 6, 0.2, 'none');
    }
  }
  // posters + graffiti on interior walls (deterministic picks)
  const pm = posterMaterials();
  pm.forEach((mat, i) => batchRegister(ctx, 'poster' + i, mat));
  let placed = 0;
  for (let j = 1; j < grid.h - 1 && placed < 14; j++) for (let i = 1; i < grid.w - 1 && placed < 14; i++) {
    if (grid.kindAt(i, j) !== K.FLOOR) continue;
    const zd = ctx.zone(i, j);
    if (!zd || !zd.ceiling) continue;
    if (rng() > 0.06) continue;
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (grid.kindAt(i + di, j + dj) !== K.WALL) continue;
      const yaw = Math.atan2(-di, -dj);
      const geo = new THREE.PlaneGeometry(0.62, 0.87, 2, 2);
      batch.add('poster' + (placed % 4), geo, M(i + 0.5 + di * 0.485, 1.75, j + 0.5 + dj * 0.485, yaw, 0, (rng() - 0.5) * 0.08), 0xffffff, 'keep');
      placed++;
      break;
    }
  }
  // boiler room: overhead pipe runs + valve wheels
  for (let x = 5; x <= 16; x += 1) {
    batch.add('surf:metal', cyl(0.08, 0.08, 1.02, 8), M(x + 0.5, 2.85, 16.6, 0, 0, Math.PI / 2), 0x7a6a5a);
    batch.add('surf:metal', cyl(0.05, 0.05, 1.02, 8), M(x + 0.5, 2.6, 16.5, 0, 0, Math.PI / 2), 0x5a4a3a);
  }
  for (let y = 17; y <= 27; y++) batch.add('surf:metal', cyl(0.07, 0.07, 1.02, 8), M(4.45, 2.7, y + 0.5, 0, Math.PI / 2), 0x6a5a4a);
  pipes(batch, M(9.5, 0, 27.4, Math.PI), rng);
  valveWheel(batch, M(4.45, 1.5, 23.5, Math.PI / 2, 0, Math.PI / 2), rng);
  // ward: curtain rails between beds
  for (const x of [21, 27, 32]) {
    batch.add('plain:chrome', box(0.03, 0.03, 2.2), M(x + 0.5, 2.4, 5.6), 0xaaaaaa);
    batch.add('plain:fabric', box(0.02, 1.7, 1.6), M(x + 0.5, 1.5, 5.3, 0, 0, 0.02), 0x7a806c);
  }
  // reception: counter and sign
  batch.add('surf:wood', rbox(2.2, 1.05, 0.5, 0.03), M(9, 0.52, 7.9), 0x7a5a3a);
  // graffiti (unlit decal planes)
  graffiti(ctx, 'THE SIGNAL LIES', 4.02, 2.2, 9.0, Math.PI / 2);
  graffiti(ctx, 'IT SPEAKS IN OUR HEADS', 36.98, 2.1, 12.0, -Math.PI / 2);
  graffiti(ctx, 'DONT LET THEM TUNE YOU', 25.5, 2.4, 14.98, Math.PI);
}

function batchRegister(ctx: BuildContext, key: string, mat: THREE.Material) {
  ctx.registerMaterial(key, mat);
}

function graffiti(ctx: BuildContext, text: string, x: number, y: number, z: number, yaw: number) {
  const mat = bakedStandard({ map: graffitiTexture(text) } as any, { transparent: true, depthWrite: false, roughness: 0.8, normalMap: null, roughnessMap: null, polygonOffset: true, polygonOffsetFactor: -2 });
  const key = 'graffiti:' + text;
  batchRegister(ctx, key, mat);
  ctx.batch.add(key, new THREE.PlaneGeometry(2.4, 0.6, 2, 1), M(x, y, z, yaw), 0xffffff, 'keep');
}

export const ravenmoor: MapDef = {
  id: 'ravenmoor',
  name: 'Ravenmoor Asylum',
  subtitle: '1944 — where the Tethered were kept',
  desc: 'A crumbling military asylum of stone and green tile. Patient ward, operating theater, a flooded boiler room and a rain-soaked courtyard.',
  layout: L.build(),
  markerIds: L.markerIds,
  zones: [
    { letter: 'A', name: 'Reception Hall', floor: 'tile', wall: 'wallpaper', wainscot: 'wood', ceiling: 'ceilingTile', height: 3.6,
      lightColor: 0xffb35a, lightIntensity: 1.5, ambient: 0x16150f, reverb: 'hall', theme: 'reception', lightSpacing: 5 },
    { letter: 'B', name: 'Patient Ward', floor: 'tile', wall: 'plaster', wainscot: 'tileWall', ceiling: 'ceilingTile', height: 3.4,
      lightColor: 0xffc070, lightIntensity: 1.3, ambient: 0x121410, reverb: 'hall', theme: 'ward', lightSpacing: 5 },
    { letter: 'C', name: 'Operating Theater', floor: 'tile', wall: 'tileWall', ceiling: 'ceilingTile', height: 4.0,
      lightColor: 0xd0e4dc, lightIntensity: 0.95, ambient: 0x0e1212, reverb: 'hall', theme: 'theater', lightSpacing: 5 },
    { letter: 'D', name: 'Boiler Room', floor: 'concrete', wall: 'brick', ceiling: 'concrete', height: 3.2,
      lightColor: 0xff9a40, lightIntensity: 1.3, ambient: 0x100d0a, reverb: 'room', theme: 'boiler', lightSpacing: 5, water: true, waterLevel: 0.09, steam: true },
    { letter: 'E', name: 'Courtyard', floor: 'grass', wall: 'stone', ceiling: null, height: 4.6,
      lightColor: 0xa8b8d8, lightIntensity: 0.9, ambient: 0x151b26, reverb: 'outdoor', theme: 'courtyard', rain: true },
    { letter: 'F', name: 'Records Room', floor: 'wood', wall: 'wallpaper', wainscot: 'wood', ceiling: 'plaster', height: 3.0,
      lightColor: 0xffa050, lightIntensity: 0.7, ambient: 0x0e0b08, reverb: 'room', theme: 'library', lightSpacing: 4 },
  ],
  doors: [
    { id: '1', cost: 750, kind: 'door', label: 'Patient Ward' },
    { id: '2', cost: 1000, kind: 'debris', label: 'Operating Theater' },
    { id: '3', cost: 1000, kind: 'door', label: 'Boiler Room' },
    { id: '4', cost: 1250, kind: 'debris', label: 'Courtyard' },
    { id: '5', cost: 1250, kind: 'door', label: 'Courtyard' },
    { id: '6', cost: 0, kind: 'secret', label: 'Records Room' },
  ],
  markers: { p: [], b: [], e: [] },
  fogColor: 0x0a0d0e,
  fogDensity: 0.045,
  outsideSurface: 'dirt',
  exterior: 'stone',
  perimeter: 'brick',
  outsideAmbient: 0x121822,
  doorStyle: 'gate',
  sky: 'night',
  chipColor: 0x40e8e0,
  songId: 'ravenmoor',
  decorate,
};
