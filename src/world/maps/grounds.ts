import * as THREE from 'three';
import type { MapDef } from '../mapTypes';
import { LayoutBuilder } from '../layoutBuilder';
import { M, box, cyl, rbox, sphere, lathe, cone, torus, GeoBatch } from '../../render/geometryKit';
const MB = M;
import { fountain, truck, generator, lampPost, crate, barrel, bench } from '../props';
import { openGrave, conifer, bareOak, fenceCell, pier, statue, type FenceStyle } from '../outdoorProps';
import { graffitiTexture } from '../../render/canvasArt';
import { bakedStandard } from '../../render/materials';
import { K } from '../grid';
import type { BuildContext } from '../mapBuilder';
import { mulberry32 } from '../../core/math';

/**
 * MAP 0 — RAVENMOOR GROUNDS (3 March 1944, just after sunset)
 * The open estate around the asylum. The building itself is sealed; its signal tower and the
 * blue beacon on top of it are visible from everywhere.
 *
 *              C Graveyard (NW)  │  D Crash Field (N) — the downed courier plane
 *            ────────────────────┤──────────┬──────────────────────
 *              E Groundskeeper's │  ASYLUM  │  B Courtyard (E)
 *                Yard (W/SW)     │ (sealed) ├──────────────────────
 *                                │  A Front Drive (S, start) │ F Chapel (SE)
 *
 * Doors: A→E 1, A→F 2, A→B 3, E→C 4, F→B 5, B→D 6, C→D 7.
 */
/** Layout scale: the estate was designed at 1× and stretched (positions only — set-pieces keep their size). */
const KS = 1.42;
const P = (v: number) => Math.round(5 + (v - 5) * KS);
const EW = P(106), SW = P(90);           // east / south estate walls (west and north are at 5)
const W = EW + 6, H = SW + 6;
const FX = P(39);                        // west fence column (graveyard/yard | everything else)
const FY = P(45);                        // graveyard | yard
const BX0 = FX + 1, BX1 = P(71) - 1;     // the asylum footprint (cells)
const BY0 = P(34), BY1 = P(58) - 1;
const DY = BY0 - 1;                      // crash field | courtyard fence row
const AY = BY1 + 1;                      // courtyard | front drive fence row
const AFX = P(81);                       // front drive | chapel fence column
const CX = (BX0 + BX1 + 1) / 2, CZ = (BY0 + BY1 + 1) / 2; // asylum centre (world)
const GX = Math.round(CX);               // gate / drive centre column
const L = new LayoutBuilder(W, H);
const rng = mulberry32(19440303);
/** Set-piece anchors (top-left cells) */
const PLANE = { x: P(49), z: P(16) };    // fuselage nose cell; interior row is z
const TOMB = { x: P(14), z: P(24) };
const SHED = { x: P(10), z: P(50) };
const GLASS = { x: P(26), z: P(64) };
const CHAPEL = { x: P(88), z: P(66) };
const FOUNT = { x: GX - 1, z: P(69) };

L.outside(0, 0, W - 1, H - 1);
// estate wall
for (let x = 5; x <= EW; x++) { L.set(x, 5, '#'); L.set(x, SW, '#'); }
for (let y = 5; y <= SW; y++) { L.set(5, y, '#'); L.set(EW, y, '#'); }
// zones
L.rect(6, 6, FX - 1, FY - 1, 'C');            // graveyard
L.rect(6, FY + 1, FX - 1, SW - 1, 'E');       // groundskeeper's yard
L.rect(FX + 1, 6, EW - 1, DY - 1, 'D');       // crash field
L.rect(BX0, DY, BX1, DY, 'D');                // strip along the asylum's north face
L.rect(BX1 + 1, BY0, EW - 1, BY1, 'B');       // courtyard
L.rect(BX0, AY, BX1, SW - 1, 'A');            // front drive
L.rect(BX1 + 1, AY + 1, AFX - 1, SW - 1, 'A');
L.rect(AFX + 1, AY + 1, EW - 1, SW - 1, 'F'); // chapel
// fences
for (let x = 6; x < FX; x++) L.set(x, FY, 'f');
for (let y = 6; y < SW; y++) L.set(FX, y, 'f');
for (let x = BX1 + 1; x < EW; x++) { L.set(x, DY, 'f'); L.set(x, AY, 'f'); }
for (let y = AY + 1; y < SW; y++) L.set(AFX, y, 'f');
// the asylum (sealed)
L.rect(BX0, BY0, BX1, BY1, '%');
// gates
const gate = (id: string, cells: [number, number][]) => { for (const [x, y] of cells) L.set(x, y, id); };
const run = (fixed: number, from: number, along: 'x' | 'y') => [0, 1, 2].map((k) => (along === 'x' ? [from + k, fixed] : [fixed, from + k]) as [number, number]);
gate('1', run(FX, P(72), 'y'));
gate('2', run(AFX, P(72), 'y'));
gate('3', run(AY, P(75), 'x'));
gate('4', run(FY, P(20), 'x'));
gate('5', run(AY, P(92), 'x'));
gate('6', run(DY, P(86), 'x'));
gate('7', run(FX, P(18), 'y'));
// windows: barricaded gaps in the estate wall (two per long stretch)
for (const x of [P(44), P(64), P(76)]) L.set(x, SW, 'w');                         // A
L.set(5, P(58), 'w').set(5, P(70), 'w').set(5, P(82), 'w').set(P(22), SW, 'w');    // E
L.set(5, P(14), 'w').set(5, P(30), 'w').set(P(14), 5, 'w').set(P(30), 5, 'w');     // C
for (const x of [P(48), P(62), P(78), P(96)]) L.set(x, 5, 'w');                   // D
L.set(EW, P(14), 'w').set(EW, P(26), 'w');
L.set(EW, P(40), 'w').set(EW, P(52), 'w');                                         // B
L.set(EW, P(68), 'w').set(EW, P(80), 'w').set(P(96), SW, 'w');                     // F
// main gate (closed, decorative) in the south wall
for (let x = GX - 3; x <= GX + 2; x++) L.set(x, SW, '%');

// ---------------------------------------------------------------- A: front drive
L.set(GX, P(77), '*');
for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) L.set(FOUNT.x + x, FOUNT.z + y, 'q', 'fountain');
for (let y = 0; y < 5; y++) for (let x = 0; x < 3; x++) L.set(P(44) + x, P(79) + y, 'q', 'truck');
L.set(BX0 + 4, AY, 'p', 'secondwind');
L.set(GX - 9, AY, 'b', 'warden').set(GX + 10, AY, 'b', 'fieldmarshal');
L.set(P(70), SW - 1, 'c', 'crateA');
for (const [x, y] of [[50, 64], [61, 64], [50, 84], [61, 84], [72, 72], [66, 76], [44, 74]]) L.set(P(x), P(y), 'l');
for (const [x, y] of [[42, 62], [42, 87], [68, 86], [78, 63], [78, 86], [44, 68], [67, 66], [50, 88], [75, 70], [48, 66]]) L.set(P(x), P(y), 'x');
for (const [x, y] of [[62, 80], [63, 80], [48, 73], [73, 80], [70, 68], [52, 76]]) L.set(P(x), P(y), 'o');
L.set(GX - 4, SW - 2, 'e', 'note13').set(P(78), SW - 2, 'e', 'musicbox1').set(GX, AY + 2, 'e', 'beaconBase');

// ---------------------------------------------------------------- B: courtyard
const GZ = { x: P(88), z: P(44) };
for (let y = 0; y < 3; y++) for (let x = 0; x < 3; x++) L.set(GZ.x + x, GZ.z + y, 'q', 'gazebo');
L.set(BX1 + 1, P(40), 'p', 'ironhide');
L.set(BX1 + 1, P(52), 'r');
L.set(EW - 1, P(36), 'b', 'chatterbox');
L.set(EW - 1, P(46), 'c', 'crateB');
for (const [x, y] of [[78, 38], [98, 38], [78, 54], [98, 54], [88, 36]]) L.set(P(x), P(y), 'l');
for (const [x, y] of [[76, 36], [101, 36], [76, 56], [101, 56], [84, 50], [94, 40], [104, 46], [74, 46]]) L.set(P(x), P(y), 'x');
// clipped hedge parterre around the bandstand
{
  const x0 = GZ.x - 7, x1 = GZ.x + 9, y0 = GZ.z - 6, y1 = GZ.z + 8;
  for (let x = x0; x <= x1; x++) if (x < GZ.x - 1 || x > GZ.x + 3) { L.set(x, y0, 'o'); L.set(x, y1, 'o'); }
  for (let y = y0 + 1; y < y1; y++) if (y < GZ.z - 1 || y > GZ.z + 3) { L.set(x0, y, 'o'); L.set(x1, y, 'o'); }
}
L.set(P(98), P(56), 'e', 'musicbox2');

// ---------------------------------------------------------------- C: graveyard
L.rect(TOMB.x, TOMB.z, TOMB.x + 5, TOMB.z + 4, '%');   // mausoleum
for (let y = 10; y < FY - 1; y += 4) for (let x = 9; x < FX - 1; x += 3) {
  if (Math.abs(x - P(21)) <= 1) continue;                                         // central path
  if (y >= TOMB.z - 2 && y <= TOMB.z + 6 && x >= TOMB.x - 2 && x <= TOMB.x + 7) continue; // around the tomb
  if (rng() < 0.8) L.set(x, y, 'o');
}
for (const [x, y] of [[12, 12], [31, 13], [27, 21], [10, 37], [33, 38], [24, 33], [16, 18], [35, 26]]) L.set(P(x), P(y), 'v');
L.set(P(11), P(20) + 1, 'e', 'bell1').set(P(34), P(29) + 1, 'e', 'bell2').set(P(25), P(41) + 1, 'e', 'bell3');
L.set(6, P(30), 'p', 'packmule');
L.set(6, P(40), 'b', 'trench');
L.set(P(26), 6, 'c', 'crateC');
for (const [x, y] of [[16, 9], [29, 26], [16, 38], [33, 9], [8, 22]]) L.set(P(x), P(y) + 1, 'l');
for (const [x, y] of [[7, 7], [37, 7], [20, 16], [7, 25], [37, 22], [30, 43], [13, 43], [24, 8], [36, 34]]) L.set(P(x), P(y), 'x');
L.set(TOMB.x + 3, TOMB.z + 6, 'e', 'note14');

// ---------------------------------------------------------------- D: crash field
// fuselage (two halves, broken behind the wing) — the interior row PLANE.z is walkable
{
  const px = PLANE.x, pz = PLANE.z;
  for (let x = 0; x <= 8; x++) { L.set(px + x, pz - 1, '%'); L.set(px + x, pz + 1, '%'); }
  for (let x = 12; x <= 19; x++) { L.set(px + x, pz - 1, '%'); L.set(px + x, pz + 1, '%'); }
  L.set(px, pz, '%');
  L.rect(px + 24, pz + 4, px + 28, pz + 6, '%');                                  // torn-off tail
  for (let y = 2; y <= 10; y++) for (let x = 5; x <= 7; x++) L.set(px + x, pz + y, 'o'); // starboard wing
  for (let x = -6; x <= 2; x++) for (let y = -8; y <= -6; y++) L.set(px + x, pz + y, 'o'); // port wing
  L.set(px + 2, pz, 'e', 'flaregun').set(px + 17, pz, 'e', 'note11');
  for (const [x, y] of [[44, 21], [70, 12], [60, 25]]) L.set(P(x), P(y), 'v');
}
L.set(EW - 1, P(12), 'p', 'rapidfire');
L.set(P(80), 6, 'b', 'longshot');
L.set(P(62) + 3, 6, 'c', 'crateD');
for (const [x, y] of [[86, 20], [97, 28], [45, 27], [76, 12], [98, 10]]) L.set(P(x), P(y), 'l');
for (let n = 0; n < 34; n++) {
  const x = P(80) + Math.floor(rng() * (EW - P(80) - 1)), y = 8 + Math.floor(rng() * (DY - 10));
  if (L.g[y][x] === 'D') L.set(x, y, 'x');
}
for (let n = 0; n < 8; n++) {
  const x = FX + 3 + Math.floor(rng() * (P(78) - FX)), y = 8 + Math.floor(rng() * (DY - 10));
  if (L.g[y][x] === 'D') L.set(x, y, 'x');
}
for (let x = 0; x < 7; x++) { L.set(P(41) + x, P(29), 'o'); L.set(P(64) + x, P(28) + 1, 'o'); L.set(P(88) + x, P(14), 'o'); }
L.set(P(100), P(8), 'e', 'musicbox3');

// ---------------------------------------------------------------- E: groundskeeper's yard
L.rect(SHED.x, SHED.z, SHED.x + 5, SHED.z + 4, '%');      // tool shed
L.rect(GLASS.x, GLASS.z, GLASS.x + 7, GLASS.z + 4, '%');  // greenhouse
L.set(SHED.x + 6, SHED.z + 2, 's');
L.set(SHED.x + 7, SHED.z - 1, 'q', 'genset').set(SHED.x + 8, SHED.z - 1, 'q', 'genset');
L.set(6, P(66), 'p', 'fleetfoot');
L.set(6, P(84) + 2, 'b', 'typewriter');
L.set(P(30), SW - 1, 'c', 'crateE');
for (const [x, y] of [[21, 51], [12, 71], [30, 80], [20, 60], [34, 72]]) L.set(P(x), P(y), 'l');
for (let y = P(74); y <= SW - 4; y += 4) for (let x = P(19); x <= FX - 3; x += 4) L.set(x + ((y >> 2) % 2 ? 2 : 0), y, 'x'); // orchard
for (const [x, y] of [[8, 48], [24, 50], [36, 55], [8, 60], [20, 62], [36, 62], [9, 74]]) L.set(P(x), P(y), 'x');
for (const [x, y] of [[22, 56], [28, 58], [10, 66]]) L.set(P(x), P(y), 'o');
L.set(SHED.x + 3, SHED.z + 5, 'e', 'note12');

// ---------------------------------------------------------------- F: chapel
L.rect(CHAPEL.x, CHAPEL.z, CHAPEL.x + 8, CHAPEL.z + 6, '%');   // ruined chapel
for (const [x, y] of [[0, 0], [1, 0], [0, 1], [1, 1]]) L.set(P(100) + x, P(82) + y, 'q', 'watertower');
L.set(P(85), P(84), 'q', 'well');
L.set(EW - 1, P(64), 'p', 'quickhands');
L.set(EW - 1, P(76), 'b', 'hollowpoint');
L.set(P(92), SW - 1, 'c', 'crateF');
for (const [x, y] of [[86, 62], [101, 62], [86, 77], [96, 86]]) L.set(P(x), P(y), 'l');
for (let y = CHAPEL.z + 10; y <= SW - 4; y += 2) for (let x = CHAPEL.x; x <= CHAPEL.x + 10; x += 2) if (rng() < 0.65) L.set(x, y, 'o');
for (const [x, y] of [[84, 60], [104, 60], [84, 70], [103, 72], [99, 88], [90, 62], [84, 88]]) L.set(P(x), P(y), 'x');
L.set(CHAPEL.x + 10, CHAPEL.z, 'v').set(P(91), P(80) + 2, 'v');

// ---------------------------------------------------------------- terrain
/** Rolling estate ground: soft hills, the graveyard knoll, a gouge where the plane came down. */
function terrain(x: number, z: number): number {
  let h = 0.85 * Math.sin(x * 0.06 + 1.3) * Math.sin(z * 0.05 + 0.4)
    + 0.5 * Math.sin(x * 0.115 + z * 0.08 + 2.0)
    + 0.3 * Math.sin(z * 0.15 - x * 0.035);
  h += 1.8 * Math.exp(-((x - P(24)) ** 2 + (z - P(35)) ** 2) / 220);   // graveyard knoll
  h += 1.0 * Math.exp(-((x - P(95)) ** 2 + (z - P(18)) ** 2) / 320);   // rise in the hay field
  h -= 1.1 * Math.exp(-((x - (PLANE.x - 6)) ** 2) / 20 - ((z - (PLANE.z + 5)) ** 2) / 10); // impact gouge
  // the valley rises beyond the estate wall
  const out = Math.max(0, 6 - x, x - EW, 6 - z, z - SW);
  h += Math.min(3, out * 0.6);
  return h;
}


// ---------------------------------------------------------------- set-piece helpers
const V3 = (x: number, y: number, z: number) => new THREE.Vector3(x, y, z);
const at = (base: THREE.Matrix4, x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0) => base.clone().multiply(M(x, y, z, ry, rx, rz));

/** Segmented vertical wall panel (keeps baked light smooth across big facades). */
function panel(b: GeoBatch, key: string, x0: number, z0: number, x1: number, z1: number, y0: number, y1: number, tint = 0xffffff) {
  const len = Math.hypot(x1 - x0, z1 - z0);
  const geo = new THREE.PlaneGeometry(len, y1 - y0, Math.max(1, Math.round(len)), Math.max(1, Math.round((y1 - y0) / 1.2)));
  const yaw = Math.atan2(z0 - z1, x1 - x0); // plane faces +z locally; rotate so its normal points left of (x0,z0)→(x1,z1)
  b.add(key, geo, M((x0 + x1) / 2, (y0 + y1) / 2, (z0 + z1) / 2, yaw), tint);
}

/** Hipped roof over a w×d rectangle (centre at origin, eaves at y=0, ridge at height h). */
function hipRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const r = Math.min(hw, hd);
  const rx = hw - r, rz = hd - r; // ridge half-lengths
  const P = [
    [-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd],
    [-rx, h, -rz], [rx, h, -rz], [rx, h, rz], [-rx, h, rz],
  ];
  const tris = [[0, 4, 5], [0, 5, 1], [1, 5, 6], [1, 6, 2], [2, 6, 7], [2, 7, 3], [3, 7, 4], [3, 4, 0]];
  const pos: number[] = [];
  for (const t of tris) for (const i of t) pos.push(...P[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Gable roof: ridge along local X. */
function gableRoof(w: number, d: number, h: number): THREE.BufferGeometry {
  const hw = w / 2, hd = d / 2;
  const P = [[-hw, 0, -hd], [hw, 0, -hd], [hw, 0, hd], [-hw, 0, hd], [-hw, h, 0], [hw, h, 0]];
  const tris = [[0, 5, 1], [0, 4, 5], [3, 2, 5], [3, 5, 4], [0, 3, 4], [1, 5, 2]];
  const pos: number[] = [];
  for (const t of tris) for (const i of t) pos.push(...P[i]);
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.computeVertexNormals();
  return g;
}

/** Inside-out copy of a geometry (for walk-in hulls). */
function inward(g: THREE.BufferGeometry): THREE.BufferGeometry {
  const ng = g.index ? g.toNonIndexed() : g.clone();
  const p = ng.attributes.position.array as Float32Array;
  for (let i = 0; i < p.length; i += 9) {
    for (let k = 0; k < 3; k++) { const t = p[i + 3 + k]; p[i + 3 + k] = p[i + 6 + k]; p[i + 6 + k] = t; }
  }
  ng.deleteAttribute('normal');
  ng.computeVertexNormals();
  return ng;
}

/** A window opening on a facade: stone surround, dark glass, sometimes lit or boarded. */
function facadeWindow(b: GeoBatch, base: THREE.Matrix4, w: number, h: number, kind: number) {
  b.add('surf:stone', box(w + 0.3, 0.14, 0.22), at(base, 0, -h / 2 - 0.07, 0.08), 0x9a968c);      // sill
  b.add('surf:stone', box(w + 0.36, 0.22, 0.18), at(base, 0, h / 2 + 0.11, 0.06), 0x9a968c);      // lintel
  for (const s of [-1, 1]) b.add('surf:stone', box(0.14, h, 0.14), at(base, s * (w / 2 + 0.07), 0, 0.05), 0x8a867c);
  if (kind === 1) {
    b.add('glow', box(w, h, 0.02), at(base, 0, 0, -0.02), 0x5a3a18);                 // a lamp still burns inside
  } else {
    b.add('plain:glass', box(w, h, 0.02), at(base, 0, 0, -0.02), 0x0c1014);
  }
  b.add('surf:wood', box(0.05, h, 0.05), at(base, 0, 0, 0.0), 0x2a2420);               // glazing bars
  b.add('surf:wood', box(w, 0.05, 0.05), at(base, 0, h * 0.18, 0.0), 0x2a2420);
  if (kind === 2) for (let i = 0; i < 3; i++) b.add('surf:wood', box(w + 0.2, 0.18, 0.04), at(base, 0, -h * 0.3 + i * h * 0.3, 0.08, 0, 0, (i - 1) * 0.15), 0x6a5038);
}

// ---------------------------------------------------------------- decorate
function decorate(ctx: BuildContext) {
  const { batch: b, grid, rng: r } = ctx;
  const done = new Set<string>();
  for (const m of grid.markers) {
    if (m.ch !== 'q' || !m.id || done.has(m.id)) continue;
    done.add(m.id);
    if (m.id === 'fountain') fountain(b, M(m.i + 1, 0, m.j + 1), r);
    if (m.id === 'truck') truck(b, M(m.i + 1.5, 0, m.j + 2.5, Math.PI + 0.15), r);
    if (m.id === 'genset') { generator(b, M(m.i + 1, 0, m.j + 0.5, Math.PI), r); ctx.addLight(m.i + 1, 1.6, m.j + 0.5, 0xffb060, 0.5, 4, 0.6, 'none'); }
    if (m.id === 'gazebo') gazebo(b, m.i + 1.5, m.j + 1.5);
    if (m.id === 'watertower') waterTower(b, m.i + 1, m.j + 1);
    if (m.id === 'well') well(b, m.i + 0.5, m.j + 0.5);
  }
  for (const v of grid.vents) openGrave(b, M(v.i + 0.5, 0, v.j + 0.5, r() * Math.PI * 2), r);
  fences(ctx);
  asylum(ctx);
  plane(ctx);
  mausoleum(b, r);
  shed(b);
  greenhouse(b, r);
  chapel(ctx);
  mainGate(ctx);
  drive(b);
  treeLine(ctx);
  // coffin bells (easter egg anchors) get their little gallows
  for (const m of grid.markers) if (m.ch === 'e' && m.id?.startsWith('bell')) {
    const base = M(m.i + 0.5, 0, m.j + 0.5, r() * 6);
    b.add('surf:wood', box(0.08, 1.9, 0.08), at(base, -0.35, 0.95, 0), 0x4a3a2a);
    b.add('surf:wood', box(0.55, 0.07, 0.07), at(base, -0.1, 1.88, 0), 0x4a3a2a);
    b.add('plain:dirt', box(0.9, 0.12, 1.8), at(base, 0.2, 0.06, 0.1), 0x4a3a28); // fresh grave
  }
}

function fences(ctx: BuildContext) {
  const { batch: b, grid, rng: r } = ctx;
  const styleAt = (i: number, j: number): FenceStyle => {
    if (j === FY && i < FX) return 'stone';
    if (i === FX) return j < AY ? 'iron' : 'stone';
    if (j === DY) return 'picket';
    if (j === AY) return 'hedge';
    return 'iron';
  };
  const fenceLike = (i: number, j: number) => !!grid.fence[j * grid.w + i] || grid.kindAt(i, j) === K.DOOR;
  for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
    if (!grid.fence[j * grid.w + i]) continue;
    const ax = fenceLike(i - 1, j) || fenceLike(i + 1, j);
    const az = fenceLike(i, j - 1) || fenceLike(i, j + 1);
    const st = styleAt(i, j);
    if (ax || !az) fenceCell(b, i + 0.5, j + 0.5, true, st, r);
    if (az && (!ax || st !== 'hedge')) fenceCell(b, i + 0.5, j + 0.5, false, st, r);
    // stone piers beside gates and at line ends
    for (const [di, dj] of [[1, 0], [-1, 0], [0, 1], [0, -1]]) {
      if (grid.kindAt(i + di, j + dj) === K.DOOR) pier(b, i + 0.5 + di * 0.5, j + 0.5 + dj * 0.5, st === 'hedge' ? 1.6 : 1.8);
    }
  }
}

/** The sealed asylum: three storeys of brick, a hipped slate roof and the signal tower. */
const ROOF = 11.2, ROOF_H = 8.5, TOWER_TOP = ROOF + 15.5, MAST_TOP = TOWER_TOP + 19, BEACON_Y = MAST_TOP + 3.6;

function asylum(ctx: BuildContext) {
  const b = ctx.batch;
  ctx.registerMaterial('plain:roof', bakedStandard(null, { roughness: 0.85, side: THREE.DoubleSide }));
  const x0 = BX0, x1 = BX1 + 1, z0 = BY0, z1 = BY1 + 1, top = ROOF;
  const cx = CX, cz = CZ;
  const pw0 = GX - 4, pw1 = GX + 4; // porch
  const r = mulberry32(7);
  // walls (faces point outward). Recessed entrance bay on the south front.
  const pz = z1 - 2.2; // porch recess depth
  panel(b, 'surf:brick', x0, z0, x0, z1, 0, top);           // west (normal -x)
  panel(b, 'surf:brick', x1, z1, x1, z0, 0, top);           // east
  panel(b, 'surf:brick', x1, z0, x0, z0, 0, top);           // north
  panel(b, 'surf:brick', x0, z1, pw0, z1, 0, top);           // south, west of the porch
  panel(b, 'surf:brick', pw1, z1, x1, z1, 0, top);           // south, east of the porch
  panel(b, 'surf:brick', pw0, pz, pw1, pz, 0, top);           // porch back wall
  panel(b, 'surf:brick', pw0, z1, pw0, pz, 0, top);           // porch sides
  panel(b, 'surf:brick', pw1, pz, pw1, z1, 0, top);
  // plinth, string courses, cornice
  const band = (y: number, h: number, out: number, tint: number) => {
    b.add('surf:stone', box(x1 - x0 + out * 2, h, out * 2), M(cx, y, z0, 0), tint);
    b.add('surf:stone', box(x1 - x0 + out * 2, h, out * 2), M(cx, y, z1, 0), tint);
    b.add('surf:stone', box(out * 2, h, z1 - z0), M(x0, y, cz), tint);
    b.add('surf:stone', box(out * 2, h, z1 - z0), M(x1, y, cz), tint);
  };
  band(0.45, 0.9, 0.12, 0x8a8880);
  band(3.75, 0.2, 0.08, 0x9a968c);
  band(7.45, 0.2, 0.08, 0x9a968c);
  band(top - 0.2, 0.45, 0.3, 0x9a968c);
  // quoins at the corners
  for (const [qx, qz] of [[x0, z0], [x1, z0], [x0, z1], [x1, z1]]) {
    for (let y = 0.9; y < top - 0.4; y += 0.6) b.add('surf:stone', box(0.5, 0.26, 0.5), M(qx, y + 0.14, qz), 0xa8a49a);
  }
  // windows on every face, three floors
  const floors = [2.1, 5.6, 9.1];
  const winKind = () => { const v = r(); return v < 0.12 ? 1 : v < 0.32 ? 2 : 0; };
  for (let x = x0 + 2; x <= x1 - 2; x += 2.6) for (const y of floors) {
    facadeWindow(b, M(x, y, z0 - 0.02, Math.PI), 1.1, 1.8, winKind());
    if (x < pw0 - 1 || x > pw1 + 1) facadeWindow(b, M(x, y, z1 + 0.02, 0), 1.1, 1.8, winKind());
  }
  for (let z = z0 + 2.2; z <= z1 - 2; z += 2.6) for (const y of floors) {
    facadeWindow(b, M(x0 - 0.02, y, z, -Math.PI / 2), 1.1, 1.8, winKind());
    facadeWindow(b, M(x1 + 0.02, y, z, Math.PI / 2), 1.1, 1.8, winKind());
  }
  for (const y of floors.slice(1)) for (const x of [GX - 2, GX + 2]) facadeWindow(b, M(x, y, pz + 0.02, 0), 1.0, 1.7, winKind());
  // portico: steps, columns, pediment, boarded doors
  for (let s = 0; s < 3; s++) b.add('surf:stone', box(8.6 - s * 0.5, 0.18, 2.2 - s * 0.45), M(GX, 0.09 + s * 0.18, z1 - 1.1 - s * 0.22), 0x9a968c);
  for (const x of [GX - 3.4, GX - 1.2, GX + 1.2, GX + 3.4]) {
    b.add('surf:stone', cyl(0.26, 0.3, 5.6, 12), M(x, 3.1, z1 - 0.4), 0xb0aca2);
    b.add('surf:stone', box(0.72, 0.25, 0.72), M(x, 6.0, z1 - 0.4), 0xa8a49a);
  }
  b.add('surf:stone', box(8.6, 0.6, 2.6), M(GX, 6.4, z1 - 1.0), 0xa8a49a);
  b.add('surf:stone', gableRoof(0.6, 8.6, 1.6), M(GX, 6.7, z1 - 0.5, Math.PI / 2), 0xa8a49a);
  b.add('surf:wood', box(2.4, 3.2, 0.12), M(GX, 1.6 + 0.54, pz + 0.07), 0x3a2a1e);
  for (let i = 0; i < 5; i++) b.add('surf:wood', box(3.0, 0.22, 0.06), M(GX, 0.9 + i * 0.6, pz + 0.16, 0, 0, (r() - 0.5) * 0.3), 0x7a6040);
  b.add('plain:iron', torus(0.25, 0.04, 6, 12), M(GX, 1.9, pz + 0.22), 0x2a2a2a);
  quarantineSign(ctx, GX, 3.9, pz + 0.2);
  // roof
  b.add('plain:roof', hipRoof(x1 - x0 + 1.2, z1 - z0 + 1.2, ROOF_H), M(cx, top, cz), 0x2e3034);
  for (const [chx, chz] of [[x0 + 5, z0 + 5], [x1 - 5, z0 + 5], [x0 + 5, z1 - 5], [x1 - 5, z1 - 5], [cx - 9, cz], [cx + 9, cz]]) {
    b.add('surf:brick', box(0.9, 6.4, 1.4), M(chx, top + 3.2, chz), 0x8a5a48);
    b.add('surf:stone', box(1.1, 0.2, 1.6), M(chx, top + 6.45, chz), 0x7a7870);
  }
  signalTower(ctx, cx, cz, top);
}

function quarantineSign(ctx: BuildContext, x: number, y: number, z: number) {
  const mat = bakedStandard({ map: graffitiTexture('QUARANTINE · BY ORDER', 'rgba(220,210,180,0.92)') } as any, { roughness: 0.8, normalMap: null, roughnessMap: null, polygonOffset: true, polygonOffsetFactor: -2 });
  ctx.registerMaterial('sign:quarantine', mat);
  ctx.batch.add('surf:wood', box(3.4, 0.7, 0.06), M(x, y, z), 0x2a2018);
  ctx.batch.add('sign:quarantine', new THREE.PlaneGeometry(3.2, 0.62), M(x, y, z + 0.035), 0xffffff, 'keep');
}

/** Clock tower + steel lattice mast; the blue beacon on top is an unbaked HDR mesh. */
function signalTower(ctx: BuildContext, cx: number, cz: number, roof: number) {
  const b = ctx.batch;
  const baseTop = TOWER_TOP;
  void roof;
  // stone tower shaft (rises out of the roof)
  b.add('surf:stone', box(6.5, baseTop - roof + 3, 6.5), M(cx, (roof - 3 + baseTop) / 2, cz), 0x9a968c);
  b.add('surf:stone', box(7.1, 0.5, 7.1), M(cx, baseTop, cz), 0x8a8880);
  for (let k = 0; k < 4; k++) {
    const yaw = (k * Math.PI) / 2;
    const fx = Math.sin(yaw), fz = Math.cos(yaw);
    // clock face (dead: the hands stopped at 3:14)
    b.add('surf:stone', cyl(1.25, 1.25, 0.2, 24), M(cx + fx * 3.3, baseTop - 2.4, cz + fz * 3.3, yaw, Math.PI / 2), 0xa8a49a);
    b.add('glow', cyl(1.05, 1.05, 0.05, 24), M(cx + fx * 3.42, baseTop - 2.4, cz + fz * 3.42, yaw, Math.PI / 2), 0x6a6250);
    b.add('plain:iron', box(0.08, 0.75, 0.04), M(cx + fx * 3.48, baseTop - 2.4, cz + fz * 3.48, yaw, 0, -0.45), 0x101010);
    b.add('plain:iron', box(0.1, 0.5, 0.04), M(cx + fx * 3.48, baseTop - 2.4, cz + fz * 3.48, yaw, 0, 1.6), 0x101010);
    // louvred belfry openings
    b.add('plain:iron', box(1.6, 2.4, 0.1), M(cx + fx * 3.27, baseTop - 5.6, cz + fz * 3.27, yaw), 0x141414);
  }
  // belfry stage + pyramid cap
  b.add('surf:stone', box(4.8, 3.0, 4.8), M(cx, baseTop + 1.75, cz), 0x9a968c);
  b.add('plain:slate', cone(3.6, 3.2, 4), M(cx, baseTop + 4.85, cz, Math.PI / 4), 0x2e3034);
  // steel lattice mast
  const m0 = baseTop + 4, m1 = MAST_TOP;
  const legs = 4;
  const legPos = (y: number) => {
    const t = (y - m0) / (m1 - m0);
    const w = 1.5 * (1 - t) + 0.35 * t;
    return [[w, w], [-w, w], [-w, -w], [w, -w]] as [number, number][];
  };
  for (let l = 0; l < legs; l++) {
    const a = legPos(m0)[l], c = legPos(m1)[l];
    const p0 = V3(cx + a[0], m0, cz + a[1]), p1 = V3(cx + c[0], m1, cz + c[1]);
    const len = p0.distanceTo(p1);
    const mid = p0.clone().add(p1).multiplyScalar(0.5);
    const g = cyl(0.07, 0.07, len, 5);
    const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), p1.clone().sub(p0).normalize());
    b.add('plain:iron', g, new THREE.Matrix4().compose(mid, q, V3(1, 1, 1)), 0x2a2c30);
  }
  for (let y = m0 + 1; y < m1; y += 1.5) {
    const P = legPos(y);
    for (let l = 0; l < 4; l++) {
      const a = P[l], c = P[(l + 1) % 4];
      const p0 = V3(cx + a[0], y, cz + a[1]), p1 = V3(cx + c[0], y + 1.5, cz + c[1]);
      const len = p0.distanceTo(p1);
      const q = new THREE.Quaternion().setFromUnitVectors(V3(0, 1, 0), p1.clone().sub(p0).normalize());
      b.add('plain:iron', cyl(0.035, 0.035, len, 4), new THREE.Matrix4().compose(p0.clone().add(p1).multiplyScalar(0.5), q, V3(1, 1, 1)), 0x2a2c30);
    }
  }
  // dish + antenna rods near the top
  b.add('plain:iron', lathe([[0, 0], [0.9, 0.25], [1.0, 0.32]], 14), M(cx + 0.8, m1 - 4, cz, Math.PI / 2, 0, Math.PI / 2), 0x5a5c60);
  b.add('plain:iron', cyl(0.05, 0.05, 3.5, 5), M(cx, m1 + 1.6, cz), 0x2a2c30);
  // the beacon
  const beaconY = BEACON_Y;
  const beaconMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.35, 1.1, 3.4), fog: false });
  const beacon = new THREE.Mesh(new THREE.SphereGeometry(0.55, 16, 12), beaconMat);
  beacon.position.set(cx, beaconY, cz);
  const haloMat = new THREE.SpriteMaterial({ map: haloTexture(), color: new THREE.Color(0.3, 0.7, 2.0), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false });
  const halo = new THREE.Sprite(haloMat);
  halo.scale.setScalar(9);
  halo.position.copy(beacon.position);
  const cage = new THREE.Mesh(new THREE.TorusGeometry(0.7, 0.05, 6, 16), new THREE.MeshStandardMaterial({ color: 0x202224, roughness: 0.6 }));
  cage.position.copy(beacon.position); cage.rotation.x = Math.PI / 2;
  ctx.group.add(beacon, halo, cage);
  // a cool wash of beacon light over the roofs and the drive
  ctx.lights.push({ x: cx, y: beaconY - 8, z: cz, r: 0.08, g: 0.2, b: 0.55, radius: 34, noShadow: true });
  const state = { level: 1, target: 1, flicker: 0 };
  ctx.expose('beacon', state);
  ctx.onUpdate((dt, time) => {
    state.level += (state.target - state.level) * Math.min(1, dt * 1.5);
    const pulse = 0.78 + 0.22 * Math.sin(time * 1.9) + 0.06 * Math.sin(time * 7.3);
    let k = state.level * pulse;
    if (state.flicker > 0) { state.flicker -= dt; if (Math.random() < 0.35) k *= 0.15; }
    beaconMat.color.setRGB(0.35 * k, 1.1 * k, 3.4 * k);
    haloMat.opacity = Math.min(1, k);
    halo.scale.setScalar(7 + 3 * k);
    beacon.visible = k > 0.02;
  });
}

let halo: THREE.Texture | null = null;
function haloTexture(): THREE.Texture {
  if (halo) return halo;
  const c = document.createElement('canvas');
  c.width = c.height = 128;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(64, 64, 0, 64, 64, 64);
  grd.addColorStop(0, 'rgba(255,255,255,1)');
  grd.addColorStop(0.15, 'rgba(255,255,255,0.55)');
  grd.addColorStop(0.45, 'rgba(255,255,255,0.12)');
  grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 128, 128);
  // four soft spikes
  g.globalCompositeOperation = 'lighter';
  g.fillStyle = 'rgba(255,255,255,0.18)';
  g.fillRect(62, 0, 4, 128); g.fillRect(0, 62, 128, 4);
  halo = new THREE.CanvasTexture(c);
  (halo as any).__shared = true;
  return halo;
}

/** The downed Halcyon courier: a twin-engine transport broken behind the wing. Walk-in hull. */
function plane(ctx: BuildContext) {
  const b = ctx.batch;
  // authored around the original nose cell (49,16); shifted to the plane's anchor
  const ox = PLANE.x - 49, oz = PLANE.z - 16;
  const M = (x = 0, y = 0, z = 0, ry = 0, rx = 0, rz = 0, sx = 1, sy = sx, sz = sx) => MB(x + ox, y, z + oz, ry, rx, rz, sx, sy, sz);
  const addLight = (x: number, y: number, z: number, c: number, i: number, rad: number, f: number) => ctx.addLight(x + ox, y, z + oz, c, i, rad, f, 'none');
  const r = mulberry32(31);
  const zc = 16.5, yc = 1.15, R = 1.32;
  const skin = 0x5a6048, belly = 0x4a4c40;
  const hull = (xa: number, xb: number, tilt: number) => {
    const len = xb - xa;
    const g = cyl(R, R, len, 16, true);
    const base = M((xa + xb) / 2, yc, zc, 0, 0, Math.PI / 2 + tilt);
    b.add('plain:paint', g.clone(), base, skin);
    b.add('plain:paint', inward(g), base, 0x3a3c34);
    // floor deck inside
    b.add('surf:wood', box(len, 0.06, 1.0), M((xa + xb) / 2, 0.04, zc), 0x5a4a38);
    // cabin windows down both sides
    for (let x = xa + 0.8; x < xb - 0.5; x += 1.1) for (const s of [-1, 1]) {
      b.add('plain:glass', box(0.42, 0.42, 0.03), M(x, yc + 0.35, zc + s * (R + 0.005)), 0x10161a);
    }
    // ribs (inside)
    for (let x = xa + 0.5; x < xb; x += 1.4) b.add('plain:iron', torus(R - 0.06, 0.04, 4, 16), M(x, yc, zc, Math.PI / 2), 0x2a2a26);
  };
  hull(49.2, 58.4, 0.0);
  hull(60.8, 69.0, 0.04);
  // nose: crumpled cone buried in the gouge, cockpit glazing
  b.add('plain:paint', lathe([[R, 0], [R * 0.95, 0.6], [R * 0.7, 1.4], [R * 0.25, 2.0], [0, 2.1]], 14), M(49.2, yc - 0.15, zc, Math.PI / 2, 0, Math.PI / 2 + 0.25), skin);
  b.add('plain:glass', box(0.9, 0.5, 1.6), M(49.6, yc + 0.85, zc, 0, 0, 0.5), 0x182024);
  // torn skin at the break
  for (let i = 0; i < 9; i++) {
    const a = r() * Math.PI * 2;
    b.add('plain:paint', box(0.9 + r() * 0.6, 0.04, 0.5 + r() * 0.4), M(58.4 + r() * 0.5, yc + Math.sin(a) * R, zc + Math.cos(a) * R, a, r() - 0.5, r() - 0.5), skin);
    b.add('plain:paint', box(0.8 + r() * 0.6, 0.04, 0.5 + r() * 0.4), M(60.8 - r() * 0.5, yc + Math.sin(a) * R, zc + Math.cos(a) * R, a, r() - 0.5, r() - 0.5), skin);
  }
  // seats + cargo inside the rear section (crates of chips)
  for (let x = 61.6; x < 68; x += 1.3) {
    crate(b, M(x, 0.05, zc + 0.75, r()), r);
    if (r() > 0.5) barrel(b, M(x + 0.5, 0.05, zc - 0.85, 0), r);
  }
  // yellow identification band + Halcyon lightning emblem
  b.add('plain:paint', cyl(R + 0.01, R + 0.01, 0.5, 16, true), M(64, yc, zc, 0, 0, Math.PI / 2 + 0.04), 0xa08a30);
  for (const s of [-1, 1]) b.add('glow', box(0.06, 0.7, 0.3), M(66, yc + 0.3, zc + s * (R + 0.02), 0, 0, 0.5), 0x203040);
  // starboard wing, still attached, slumped onto the field
  const wingBase = M(55.3, 0.55, 22.2, 0, 0, 0.0);
  b.add('plain:paint', box(2.6, 0.22, 9.2), at(wingBase, 0, 0, 0, 0.02, 0.06, 0.04), skin);
  b.add('plain:paint', box(2.4, 0.15, 1.2), at(wingBase, 0.2, 0.05, 4.9, 0.3, 0.25, 0.3), skin); // bent tip
  engine(b, at(wingBase, 0, 0.3, -1.6), r);
  // port wing: torn off and flipped near the gouge
  const pw = M(47.2, 0.35, 9.5, Math.PI / 2 + 0.2, 0, Math.PI);
  b.add('plain:paint', box(2.6, 0.22, 8.8), pw, belly);
  engine(b, at(pw, 0, -0.35, -1.4, 0, 0, Math.PI), r);
  // tail section lying on its side
  const tail = M(75.2, 1.0, 21.0, -0.35, 0, 0.5);
  b.add('plain:paint', cyl(1.05, 0.35, 5.0, 14, true), at(tail, 0, 0, 0, 0, 0, Math.PI / 2), skin);
  b.add('plain:paint', box(1.8, 2.6, 0.12), at(tail, 1.6, 1.3, 0), skin);                       // fin
  b.add('plain:paint', box(1.5, 0.1, 5.4), at(tail, 1.8, 0.1, 0), skin);                        // tailplane
  b.add('glow', box(0.5, 0.5, 0.02), at(tail, 1.6, 1.6, 0.07), 0x203040);
  // scattered wreckage + scorch
  for (let i = 0; i < 26; i++) {
    const x = 44 + r() * 34, z = 11 + r() * 16;
    if (ctx.grid.kindAt(Math.floor(x + ox), Math.floor(z + oz)) !== K.FLOOR) continue;
    b.add('plain:paint', box(0.3 + r() * 0.9, 0.04, 0.2 + r() * 0.6), M(x, 0.03, z, r() * 6, r() * 0.4, r() * 0.4), r() > 0.5 ? skin : 0x3a3a34);
  }
  for (let i = 0; i < 7; i++) b.add('plain:dirt', new THREE.CircleGeometry(1.2 + r() * 1.5, 10), M(46 + r() * 30, 0.02, 12 + r() * 12, 0, -Math.PI / 2), 0x16120e);
  // small fires still burning
  for (const [fx, fz] of [[58.6, 18.6], [47.5, 11.2], [74.2, 23.4], [52.5, 13.6]]) {
    b.add('surf:wood', box(0.9, 0.12, 0.12), M(fx, 0.1, fz, r() * 3), 0x1a1410);
    addLight(fx, 0.7, fz, 0xff7a2a, 0.95, 5.5, 0.9);
  }
  addLight(53.5, 2.0, zc, 0xffb070, 0.6, 4.5, 0.4);   // cockpit emergency lamp
  addLight(65.5, 2.0, zc, 0xffb070, 0.6, 4.5, 0.6);
}

function engine(b: GeoBatch, base: THREE.Matrix4, r: () => number) {
  b.add('plain:paint', cyl(0.55, 0.5, 2.4, 12), at(base, 0, 0.1, 0, 0, Math.PI / 2), 0x4a4e40);
  b.add('plain:iron', cyl(0.3, 0.3, 0.2, 10), at(base, 0, 0.1, -1.25, 0, Math.PI / 2), 0x2a2a2a);
  for (let k = 0; k < 3; k++) {
    const a = (k / 3) * Math.PI * 2 + r();
    b.add('plain:iron', box(0.16, 1.5, 0.05), at(base, Math.sin(a) * 0.7, 0.1 + Math.cos(a) * 0.7, -1.35, 0, 0.3, -a + (r() - 0.5) * 0.8), 0x1e1e1e);
  }
}

function mausoleum(b: GeoBatch, r: () => number) {
  const x0 = TOMB.x, x1 = TOMB.x + 6, z0 = TOMB.z, z1 = TOMB.z + 5, h = 3.4;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.add('surf:stone', box(x1 - x0, h, z1 - z0 - 0.6), M(cx, h / 2, cz - 0.3), 0x8a8680);
  b.add('surf:stone', box(x1 - x0 + 0.4, 0.4, z1 - z0 + 0.2), M(cx, 0.2, cz), 0x7a7870);
  b.add('surf:stone', box(x1 - x0 + 0.4, 0.35, z1 - z0 + 0.1), M(cx, h + 0.17, cz), 0x9a968c);
  b.add('surf:stone', gableRoof(z1 - z0 + 0.1, x1 - x0 + 0.4, 1.4), M(cx, h + 0.35, cz, Math.PI / 2), 0x8a8680);
  for (const x of [x0 + 1.1, x1 - 1.1]) b.add('surf:stone', cyl(0.22, 0.26, h, 10), M(x, h / 2, z1 - 0.35), 0xa8a49a);
  b.add('plain:iron', box(1.6, 2.4, 0.08), M(cx, 1.2 + 0.4, z1 - 0.62), 0x1e2220);
  for (let i = 0; i < 7; i++) b.add('plain:iron', box(0.04, 2.3, 0.05), M(cx - 0.7 + i * 0.23, 1.55, z1 - 0.56), 0x2a2e2a);
  statue(b, M(cx, h + 1.2, cz + 0.6, 0, 0, 0), r);
}

function shed(b: GeoBatch) {
  const x0 = SHED.x, x1 = SHED.x + 6, z0 = SHED.z, z1 = SHED.z + 5, h = 2.7;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  for (const [ax, az, bx, bz] of [[x0, z1, x1, z1], [x1, z1, x1, z0], [x1, z0, x0, z0], [x0, z0, x0, z1]] as const) panel(b, 'surf:wood', ax, az, bx, bz, 0, h, 0x8a7458);
  b.add('surf:wood', box(x1 - x0, 0.05, z1 - z0), M(cx, h, cz), 0x5a4834);
  b.add('plain:slate', gableRoof(x1 - x0 + 0.6, z1 - z0 + 0.6, 1.5), M(cx, h, cz), 0x4a3e36);
  b.add('surf:wood', box(1.2, 2.1, 0.06), M(cx - 1.2, 1.05, z1 + 0.04), 0x4a3a2a);
  b.add('plain:glass', box(0.8, 0.6, 0.04), M(cx + 1.4, 1.6, z1 + 0.03), 0x101418);
  for (let i = 0; i < 4; i++) b.add('surf:wood', box(0.06, 1.3, 0.06), M(cx + 0.2 + i * 0.25, 0.9, z1 + 0.1, 0, 0.2, 0), 0x6a5034); // tools against the wall
  b.add('plain:iron', box(0.35, 0.05, 0.25), M(cx + 0.95, 0.25, z1 + 0.25), 0x3a3a38);
}

function greenhouse(b: GeoBatch, r: () => number) {
  const x0 = GLASS.x, x1 = GLASS.x + 8, z0 = GLASS.z, z1 = GLASS.z + 5;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  b.add('surf:brick', box(x1 - x0, 0.7, z1 - z0), M(cx, 0.35, cz), 0x8a5a48);
  for (let x = x0; x <= x1; x += 1) for (const z of [z0, z1]) b.add('plain:iron', box(0.05, 1.8, 0.05), M(x, 1.6, z), 0x2a3028);
  for (let z = z0; z <= z1; z += 1) for (const x of [x0, x1]) b.add('plain:iron', box(0.05, 1.8, 0.05), M(x, 1.6, z), 0x2a3028);
  for (let x = x0; x < x1; x += 1) for (const z of [z0, z1]) if (r() > 0.3) b.add('plain:glass', box(0.95, 1.7, 0.02), M(x + 0.5, 1.6, z), 0x2a3a3a);
  for (let z = z0; z < z1; z += 1) for (const x of [x0, x1]) if (r() > 0.3) b.add('plain:glass', box(0.02, 1.7, 0.95), M(x, 1.6, z + 0.5), 0x2a3a3a);
  b.add('plain:glass', gableRoof(x1 - x0, z1 - z0, 1.4), M(cx, 2.5, cz), 0x24302e);
  for (let x = x0; x <= x1; x += 1) b.add('plain:iron', box(0.05, 0.05, z1 - z0), M(x, 3.2, cz), 0x2a3028);
}

function chapel(ctx: BuildContext) {
  const b = ctx.batch;
  const r = mulberry32(11);
  const x0 = CHAPEL.x, x1 = CHAPEL.x + 9, z0 = CHAPEL.z, z1 = CHAPEL.z + 7;
  const cx = (x0 + x1) / 2, cz = (z0 + z1) / 2;
  const wall = 0x8a867c;
  // ruined side walls: ragged tops
  for (let x = x0; x < x1; x++) for (const z of [z0, z1]) {
    const hh = 3.2 + Math.sin(x * 1.7) * 0.8 + r() * 0.8;
    b.add('surf:stone', box(1.0, hh, 0.7), M(x + 0.5, hh / 2, z + (z === z0 ? 0.35 : -0.35)), wall);
  }
  for (let z = z0; z < z1; z++) for (const x of [x0, x1]) {
    const hh = x === x0 ? 6.2 - Math.abs(z + 0.5 - cz) * 1.4 : 2.5 + r() * 1.5;
    b.add('surf:stone', box(0.7, hh, 1.0), M(x + (x === x0 ? 0.35 : -0.35), hh / 2, z + 0.5), wall);
  }
  // fallen roof beams across the nave
  for (let i = 0; i < 5; i++) b.add('surf:wood', box(0.22, 0.22, z1 - z0 + 0.6), M(x0 + 1.5 + i * 1.6, 2.6 + r() * 1.2, cz, r() * 0.3, r() * 0.4, r() * 0.5), 0x3a2e24);
  // bell tower at the west end
  const tx = x0 + 1.2;
  b.add('surf:stone', box(2.4, 9.5, 2.4), M(tx, 4.75, cz), 0x9a968c);
  b.add('plain:slate', cone(1.9, 3.2, 4), M(tx, 11.1, cz, Math.PI / 4), 0x2e3034);
  for (const s of [-1, 1]) b.add('plain:iron', box(0.04, 1.4, 1.2), M(tx + s * 1.22, 8.2, cz), 0x101010);
  b.add('plain:brass', lathe([[0.55, 0], [0.42, 0.2], [0.3, 0.65], [0, 0.7]], 14), M(tx, 7.6, cz), 0x8a6a2a);
  // rose window (empty) on the gable
  b.add('plain:iron', torus(0.9, 0.08, 6, 20), M(x0 - 0.02, 4.2, cz, Math.PI / 2), 0x1a1a1a);
  ctx.addLight(cx, 1.5, cz, 0xffa050, 0.6, 7, 0.5, 'none'); // candles still lit inside
}

/** The estate's main gate: closed, chained; the road beyond vanishes into the dusk. */
function mainGate(ctx: BuildContext) {
  const b = ctx.batch;
  const gz = SW + 0.5, g0 = GX - 3, g1 = GX + 3, gc = (g0 + g1) / 2;
  for (const x of [g0, g1]) {
    b.add('surf:stone', box(1.1, 3.6, 1.1), M(x + 0.0, 1.8, gz), 0x8a8880);
    b.add('surf:stone', sphere(0.4, 10, 8), M(x, 3.95, gz), 0x9a968c);
    lampPost(b, M(x, 0.0, gz - 1.2), ctx.rng);
    ctx.addLight(x, 2.9, gz - 1.2, 0xffb35a, 1.2, 8, 0.2, 'none');
  }
  for (let i = 0; i < 18; i++) {
    const x = g0 + 0.6 + i * 0.3;
    const top = 2.6 + Math.sin((i / 17) * Math.PI) * 0.5;
    b.add('plain:iron', box(0.04, top, 0.04), M(x, top / 2, gz), 0x1e1e1c);
  }
  for (const y of [0.4, 1.5, 2.4]) b.add('plain:iron', box(5.4, 0.06, 0.05), M(gc, y, gz), 0x1e1e1c);
  b.add('plain:iron', torus(0.3, 0.05, 6, 14), M(gc, 1.4, gz - 0.08), 0x3a3a38);
  // arch sign
  const mat = bakedStandard({ map: graffitiTexture('RAVENMOOR', 'rgba(230,220,190,0.95)') } as any, { roughness: 0.7, normalMap: null, roughnessMap: null, transparent: true, polygonOffset: true, polygonOffsetFactor: -2 });
  ctx.registerMaterial('sign:gate', mat);
  b.add('plain:iron', torus(3.1, 0.07, 4, 24, Math.PI), M(gc, 3.4, gz), 0x1e1e1c);
  b.add('sign:gate', new THREE.PlaneGeometry(3.6, 0.9), M(gc, 4.6, gz - 0.08, Math.PI), 0xffffff, 'keep');
  b.add('sign:gate', new THREE.PlaneGeometry(3.6, 0.9), M(gc, 4.6, gz + 0.08, 0), 0xffffff, 'keep');
}

/** Gravel drive from the gate to the porch, and a loop round the fountain. */
function drive(b: GeoBatch) {
  for (let z = AY; z < SW; z += 1) {
    b.add('surf:concrete', new THREE.PlaneGeometry(4.2, 1.0, 2, 1), M(GX, 0.025, z + 0.5, 0, -Math.PI / 2), 0xd8ccb4);
  }
  const fx = FOUNT.x + 1, fz = FOUNT.z + 1;
  for (let a = 0; a < 28; a++) {
    const t = (a / 28) * Math.PI * 2;
    b.add('surf:concrete', new THREE.PlaneGeometry(1.6, 1.4, 1, 1), M(fx + Math.cos(t) * 3.6, 0.03, fz + Math.sin(t) * 3.6, -t, -Math.PI / 2), 0xd8ccb4);
  }
}

/** Woods beyond the wall + distant hill silhouettes (unbaked, fogged). */
function treeLine(ctx: BuildContext) {
  const b = ctx.batch;
  const r = mulberry32(5);
  for (let i = 0; i < 90; i++) {
    const side = i % 4;
    const t = r();
    const d = 0.3 + r() * 1.4;
    const x = side === 0 ? d : side === 1 ? W - d : 2 + t * (W - 4);
    const z = side === 2 ? d : side === 3 ? H - d : 2 + t * (H - 4);
    (r() > 0.25 ? conifer : bareOak)(b, M(x, 0, z, r() * 6), r);
  }
  // distant ridge line (unfogged silhouette against the afterglow) + a ground skirt out to it
  const mat = new THREE.MeshBasicMaterial({ color: 0x2a2632, fog: false });
  const g = new THREE.BufferGeometry();
  const pos: number[] = [];
  const cx = W / 2, cz = H / 2, n = 64;
  for (let i = 0; i < n; i++) {
    const a0 = (i / n) * Math.PI * 2, a1 = ((i + 1) / n) * Math.PI * 2;
    const R0 = 125, h0 = 6 + 5 * Math.sin(a0 * 3.1) + 3 * Math.sin(a0 * 7.3), h1 = 6 + 5 * Math.sin(a1 * 3.1) + 3 * Math.sin(a1 * 7.3);
    const p = (a: number, y: number) => [cx + Math.cos(a) * R0, y, cz + Math.sin(a) * R0];
    pos.push(...p(a0, -2), ...p(a1, -2), ...p(a1, h1), ...p(a0, -2), ...p(a1, h1), ...p(a0, h0));
  }
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  const hills = new THREE.Mesh(g, mat);
  mat.side = THREE.DoubleSide;
  ctx.group.add(hills);
  const skirtMat = new THREE.MeshBasicMaterial({ color: 0x2c2a2a, fog: true });
  const sk: number[] = [];
  const quad = (ax: number, az: number, bx: number, bz: number) => sk.push(ax, 2.6, az, ax, 2.6, bz, bx, 2.6, bz, ax, 2.6, az, bx, 2.6, bz, bx, 2.6, az);
  quad(-160, -160, 0, H + 160); quad(W, -160, W + 160, H + 160); quad(0, -160, W, 0); quad(0, H, W, H + 160);
  const sg = new THREE.BufferGeometry();
  sg.setAttribute('position', new THREE.Float32BufferAttribute(sk, 3));
  const skirt = new THREE.Mesh(sg, skirtMat);
  skirtMat.side = THREE.DoubleSide;
  ctx.group.add(skirt);
  void bench; void rbox;
}

function gazebo(b: GeoBatch, x: number, z: number) {
  b.add('surf:stone', cyl(2.0, 2.1, 0.5, 8), M(x, 0.25, z, Math.PI / 8), 0x9a968c);
  for (let k = 0; k < 8; k++) {
    const a = (k / 8) * Math.PI * 2;
    b.add('surf:wood', box(0.14, 2.5, 0.14), M(x + Math.cos(a) * 1.75, 1.75, z + Math.sin(a) * 1.75), 0xc0b8a8);
    b.add('surf:wood', box(1.3, 0.07, 0.05), M(x + Math.cos(a + 0.39) * 1.62, 1.2, z + Math.sin(a + 0.39) * 1.62, -a - 0.39 + Math.PI / 2), 0xc0b8a8);
  }
  b.add('plain:slate', cone(2.5, 1.5, 8), M(x, 3.75, z, Math.PI / 8), 0x3a4038);
  b.add('plain:brass', sphere(0.15, 8, 6), M(x, 4.6, z), 0x8a6a2a);
}

function waterTower(b: GeoBatch, x: number, z: number) {
  for (const [sx, sz] of [[-0.9, -0.9], [0.9, -0.9], [-0.9, 0.9], [0.9, 0.9]]) {
    b.add('plain:iron', cyl(0.09, 0.12, 8.6, 6), M(x + sx * 1.05, 4.3, z + sz * 1.05, 0, sz * 0.06, -sx * 0.06), 0x3a3a36);
  }
  for (const y of [2.5, 5.0, 7.4]) b.add('plain:iron', torus(1.25, 0.04, 4, 8), M(x, y, z, Math.PI / 8, Math.PI / 2), 0x3a3a36);
  b.add('surf:wood', cyl(2.0, 2.0, 2.8, 16), M(x, 10.0, z), 0x6a5440);
  for (const y of [9.0, 10.0, 11.0]) b.add('plain:iron', torus(2.02, 0.04, 4, 20), M(x, y, z, 0, Math.PI / 2), 0x2a2a28);
  b.add('plain:slate', cone(2.3, 1.2, 16), M(x, 12.0, z), 0x3a3a36);
  for (let y = 0.4; y < 8.6; y += 0.35) b.add('plain:iron', box(0.45, 0.03, 0.03), M(x + 1.2, y, z + 1.25), 0x2a2a28);
}

function well(b: GeoBatch, x: number, z: number) {
  b.add('surf:stone', cyl(0.75, 0.8, 0.85, 12, true), M(x, 0.42, z), 0x8a8880);
  b.add('plain:dirt', new THREE.CircleGeometry(0.7, 12), M(x, 0.3, z, 0, -Math.PI / 2), 0x050505);
  for (const s of [-1, 1]) b.add('surf:wood', box(0.1, 1.9, 0.1), M(x + s * 0.7, 0.95, z), 0x5a4632);
  b.add('plain:slate', gableRoof(1.8, 1.2, 0.6), M(x, 1.9, z), 0x4a3e36);
  b.add('surf:wood', cyl(0.08, 0.08, 1.4, 8), M(x, 1.5, z, 0, 0, Math.PI / 2), 0x5a4632);
}

export const grounds: MapDef = {
  id: 'grounds',
  name: 'Ravenmoor Grounds',
  subtitle: 'Dusk, 3 March 1944 — outside the walls',
  desc: 'The open estate around the sealed asylum: a front drive, a walled courtyard, the graveyard, a crashed courier plane and a ruined chapel — all under the blue light of the signal tower.',
  layout: L.build(),
  markerIds: L.markerIds,
  zones: [
    { letter: 'A', name: 'Front Drive', floor: 'grass', wall: 'stone', ceiling: null, height: 2.8,
      lightColor: 0xffb35a, lightIntensity: 1.0, ambient: 0x1c1a22, reverb: 'outdoor', theme: 'drive' },
    { letter: 'B', name: 'Courtyard', floor: 'grass', wall: 'stone', ceiling: null, height: 2.8,
      lightColor: 0xffc070, lightIntensity: 1.0, ambient: 0x1c1a22, reverb: 'outdoor', theme: 'garden' },
    { letter: 'C', name: 'Graveyard', floor: 'grass', wall: 'stone', ceiling: null, height: 2.8,
      lightColor: 0xffa860, lightIntensity: 0.9, ambient: 0x18181f, reverb: 'outdoor', theme: 'graveyard' },
    { letter: 'D', name: 'Crash Field', floor: 'dirt', wall: 'stone', ceiling: null, height: 2.8,
      lightColor: 0xffb060, lightIntensity: 1.0, ambient: 0x1c1a20, reverb: 'outdoor', theme: 'field' },
    { letter: 'E', name: 'Groundskeeper’s Yard', floor: 'dirt', wall: 'stone', ceiling: null, height: 2.8,
      lightColor: 0xffb35a, lightIntensity: 1.0, ambient: 0x1c1a20, reverb: 'outdoor', theme: 'yard' },
    { letter: 'F', name: 'Chapel', floor: 'grass', wall: 'stone', ceiling: null, height: 2.8,
      lightColor: 0xffa050, lightIntensity: 0.95, ambient: 0x1a1820, reverb: 'outdoor', theme: 'chapel' },
  ],
  doors: [
    { id: '1', cost: 750, kind: 'door', label: 'Groundskeeper’s Yard' },
    { id: '2', cost: 750, kind: 'door', label: 'Chapel' },
    { id: '3', cost: 1000, kind: 'debris', label: 'Courtyard' },
    { id: '4', cost: 1000, kind: 'door', label: 'Graveyard' },
    { id: '5', cost: 1000, kind: 'door', label: 'Courtyard' },
    { id: '6', cost: 1250, kind: 'door', label: 'Crash Field' },
    { id: '7', cost: 1250, kind: 'door', label: 'Crash Field' },
  ],
  markers: { p: [], b: [], e: [] },
  fogColor: 0x4a4252,
  fogDensity: 0.017,
  outsideSurface: 'grass',
  exterior: 'stone',
  perimeter: 'stone',
  outsideAmbient: 0x1a1820,
  doorStyle: 'gate',
  sky: 'dusk',
  terrain,
  outdoor: { wallHeight: 2.8, gateTop: 1.9 },
  skyLight: { top: 0.85, bottom: 0.32, glow: 0.6, glowDir: [-0.9, 0.35, 0.25] },
  landmark: { x: CX, y: BEACON_Y, z: CZ },
  chipColor: 0x3a8cff,
  songId: 'grounds',
  decorate,
};
