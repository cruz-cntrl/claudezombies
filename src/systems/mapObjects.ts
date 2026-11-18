import * as THREE from 'three';
import type { Game } from '../game';
import { GeoBatch, M, box, rbox, cyl, sphere, torus } from '../render/geometryKit';
import { surfaceScale } from '../render/proceduralTextures';
import { WEAPONS, WEAPON_LIST, WONDER_CHANCE, type WeaponDef } from '../config/weapons';
import { PERKS, MAX_PERKS, type PerkId } from '../config/perks';
import { ECONOMY } from '../config/economy';
import { audio, type Voice } from '../audio/audioEngine';
import { bus } from '../core/events';
import { createGunModel } from '../weapons/weaponModels';
import { jagged } from '../render/fx';
import type { Marker } from '../world/grid';
import { pick, randInt } from '../core/math';
import type { Surface } from '../world/mapTypes';

const hex = (n: number) => '#' + n.toString(16).padStart(6, '0');

/** Canvas helpers -------------------------------------------------------------- */
function canvasTex(w: number, h: number, draw: (g: CanvasRenderingContext2D) => void, srgb = true) {
  const c = document.createElement('canvas');
  c.width = w; c.height = h;
  draw(c.getContext('2d')!);
  const t = new THREE.CanvasTexture(c);
  if (srgb) t.colorSpace = THREE.SRGBColorSpace;
  t.anisotropy = 4;
  return t;
}

function chalkLine(g: CanvasRenderingContext2D, pts: [number, number][], w = 5) {
  for (let k = 0; k < 3; k++) {
    g.strokeStyle = `rgba(235,232,220,${0.35 + Math.random() * 0.25})`;
    g.lineWidth = w * (0.7 + Math.random() * 0.6);
    g.lineCap = 'round'; g.lineJoin = 'round';
    g.beginPath();
    pts.forEach(([x, y], i) => { const jx = x + (Math.random() - 0.5) * 3, jy = y + (Math.random() - 0.5) * 3; if (i) g.lineTo(jx, jy); else g.moveTo(jx, jy); });
    g.stroke();
  }
}

/** Chalk outline of a weapon silhouette, by class, with name and price. */
function chalkTexture(def: WeaponDef): THREE.CanvasTexture {
  return canvasTex(512, 256, (g) => {
    g.clearRect(0, 0, 512, 256);
    const c = def.cls;
    const long = c === 'rifle' || c === 'sniper' || c === 'shotgun' || c === 'ar' || c === 'lmg' || c === 'dmr';
    const L = long ? 420 : c === 'pistol' || c === 'revolver' ? 200 : 320;
    const x0 = 256 - L / 2, y = 110;
    // barrel + receiver + stock / grip
    chalkLine(g, [[x0, y], [x0 + L * 0.62, y], [x0 + L * 0.62, y + 22], [x0, y + 22], [x0, y]]);
    chalkLine(g, [[x0 + L * 0.62, y + 6], [x0 + L, y + 6], [x0 + L, y + 14], [x0 + L * 0.62, y + 14]]);
    if (long) chalkLine(g, [[x0, y + 4], [x0 - 70, y + 14], [x0 - 70, y + 50], [x0, y + 24]]);
    if (c === 'pistol' || c === 'revolver' || c === 'smg' || c === 'ar' || c === 'lmg') chalkLine(g, [[x0 + L * 0.18, y + 22], [x0 + L * 0.1, y + 70], [x0 + L * 0.2, y + 72], [x0 + L * 0.28, y + 22]]);
    if (c === 'smg' || c === 'ar' || c === 'dmr' || c === 'lmg') chalkLine(g, [[x0 + L * 0.4, y + 22], [x0 + L * 0.38, y + 80], [x0 + L * 0.46, y + 82], [x0 + L * 0.48, y + 22]]);
    if (c === 'shotgun') chalkLine(g, [[x0 + L * 0.66, y + 14], [x0 + L * 0.66, y + 30], [x0 + L * 0.86, y + 30], [x0 + L * 0.86, y + 14]]);
    if (c === 'sniper') chalkLine(g, [[x0 + L * 0.2, y - 6], [x0 + L * 0.5, y - 6], [x0 + L * 0.5, y - 24], [x0 + L * 0.2, y - 24], [x0 + L * 0.2, y - 6]]);
    g.fillStyle = 'rgba(235,232,220,0.8)';
    g.font = '30px "Special Elite", monospace';
    g.textAlign = 'center';
    g.fillText(def.name.toUpperCase(), 256, 214);
    g.font = '26px "Black Ops One", Impact';
    g.fillText(String(def.cost), 256, 46);
  });
}

function signTexture(title: string, sub: string, color: number): THREE.CanvasTexture {
  return canvasTex(512, 160, (g) => {
    g.fillStyle = '#120d0a'; g.fillRect(0, 0, 512, 160);
    g.strokeStyle = hex(color); g.lineWidth = 8; g.strokeRect(8, 8, 496, 144);
    g.fillStyle = hex(color);
    g.font = '64px "Black Ops One", Impact';
    g.textAlign = 'center';
    g.fillText(title.toUpperCase(), 256, 84);
    g.fillStyle = '#e9e1cc';
    g.font = '26px "Special Elite", monospace';
    g.fillText(sub, 256, 128);
  });
}

// ------------------------------------------------------------------------------
interface PerkMachine { perk: PerkId; pos: THREE.Vector3; sign: THREE.MeshBasicMaterial; light: THREE.Mesh[]; jingleT: number }

/** Builds and runs interactive map objects: doors, power, wall-buys, perks, crate, Rewirer. */
export class MapObjects {
  readonly group = new THREE.Group();
  private machines: PerkMachine[] = [];
  private signMats: THREE.MeshBasicMaterial[] = [];
  // supply crate
  private crateSpots: { m: Marker; group: THREE.Group; lid: THREE.Object3D; beam: THREE.Mesh }[] = [];
  private crateIdx = 0;
  private crateState: 'closed' | 'spinning' | 'offer' | 'teddy' | 'moving' = 'closed';
  private crateT = 0;
  private crateUses = 0;
  private crateLimit = randInt(6, 10);
  private crateResult: WeaponDef | null = null;
  private crateDisplay: THREE.Group = new THREE.Group();
  private crateCycleT = 0;
  private crateShown = '';
  private teddy: THREE.Group | null = null;
  // rewirer
  private rewirer: { pos: THREE.Vector3; state: 'idle' | 'working' | 'offer'; t: number; weapon: import('../weapons/weaponSystem').WeaponInstance | null; display: THREE.Group; coils: THREE.Mesh[] } | null = null;
  private jingleVoice: Voice | null = null;
  private displayCache = new Map<string, THREE.Object3D>();

  constructor(private g: Game) {
    const w = g.world;
    w.group.add(this.group);
    this.group.add(this.crateDisplay);
    const batch = new GeoBatch();
    for (const k of ['surf:wood', 'surf:metal', 'surf:riveted', 'surf:concrete']) batch.uvScale[k] = surfaceScale(k.slice(5) as Surface);
    this.setupDoors();
    for (const m of w.grid.markers) {
      if (m.ch === 'b') this.setupWallBuy(m);
      if (m.ch === 'p') this.setupPerk(m, batch);
      if (m.ch === 's') this.setupPower(m, batch);
      if (m.ch === 'c') this.setupCrateSpot(m, batch);
      if (m.ch === 'r') this.setupRewirer(m, batch);
    }
    for (const [key, geo] of batch.finalize()) {
      if (key !== 'glow') w.baker.bakeGeometry(geo);
      const mesh = new THREE.Mesh(geo, w.matLib.get(key));
      mesh.matrixAutoUpdate = false;
      this.group.add(mesh);
    }
    if (this.crateSpots.length) {
      // start at a random spot (not necessarily the first)
      this.crateIdx = Math.floor(Math.random() * this.crateSpots.length);
      this.showCrateAt(this.crateIdx);
    }
    this.setPowered(false);
  }

  private get eco() { return this.g.economy; }

  private buyLabel(text: string, cost: number) {
    const can = this.eco.can(cost);
    return { text, sub: String(cost), cant: !can };
  }
  private denied = () => audio.play('ui_denied', { bus: 'ui', vol: 0.8 });

  // ---------------------------------------------------------------- doors
  private setupDoors() {
    const g = this.g, w = g.world;
    for (const dd of w.def.doors) {
      const vis = w.doors.get(dd.id);
      if (!vis) continue;
      g.interact.add({
        x: vis.center.x, z: vis.center.z, r: 2.3, hold: ECONOMY.holdBuy,
        label: () => (vis.open ? null : this.buyLabel(`Hold to ${dd.kind === 'debris' ? 'clear debris' : 'open gate'}`, dd.cost)),
        can: () => !vis.open && this.eco.can(dd.cost),
        onDenied: this.denied,
        use: () => {
          if (!this.eco.spend(dd.cost)) return;
          w.openDoor(dd.id);
          g.player.stats.doorsOpened++;
          audio.play('ui_purchase', { bus: 'ui', vol: 0.7 });
          audio.play(dd.kind === 'debris' ? 'ui_debris' : 'ui_gateOpen', { pos: { x: vis.center.x, y: 1.5, z: vis.center.z }, vol: 1, priority: 8 });
          for (let i = 0; i < 4; i++) g.fx.dust(vis.center.x + (Math.random() - 0.5), 0.3 + Math.random() * 2, vis.center.z + (Math.random() - 0.5), 0, 0.5, 0, 8, 0x8a8070);
          bus.emit('doorOpened', { id: dd.id });
        },
      });
    }
  }

  // ---------------------------------------------------------------- power
  private setupPower(m: Marker, batch: GeoBatch) {
    const g = this.g;
    const yaw = m.facing;
    const bx = m.i + 0.5 - Math.sin(yaw) * 0.42, bz = m.j + 0.5 - Math.cos(yaw) * 0.42;
    const base = M(bx, 0, bz, yaw);
    const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => base.clone().multiply(M(x, y, z, ry, rx, rz));
    batch.add('surf:riveted', rbox(0.7, 1.0, 0.25, 0.03), at(0, 1.3, 0), 0x6a6a5a);
    batch.add('plain:paint', box(0.5, 0.1, 0.01), at(0, 1.72, 0.13), 0xa08010);
    for (let i = 0; i < 3; i++) batch.add('plain:rubber', cyl(0.02, 0.02, 2.2, 6), at(-0.2 + i * 0.2, 2.9, -0.05), 0x1a1a1a);
    batch.add('plain:brass', cyl(0.06, 0.06, 0.04, 12), at(0.18, 1.5, 0.14, 0, Math.PI / 2), 0x9a7a3a);
    const lever = new THREE.Group();
    const lm = new THREE.Mesh(new THREE.CylinderGeometry(0.025, 0.025, 0.4, 8), new THREE.MeshStandardMaterial({ color: 0x8a1a12, roughness: 0.5 }));
    lm.position.y = 0.2;
    const knob = new THREE.Mesh(new THREE.SphereGeometry(0.05, 10, 8), new THREE.MeshStandardMaterial({ color: 0x1a1a1a }));
    knob.position.y = 0.42;
    lever.add(lm, knob);
    lever.position.set(bx + Math.sin(yaw) * 0.16 - Math.cos(yaw) * 0.12, 1.2, bz + Math.cos(yaw) * 0.16 + Math.sin(yaw) * 0.12);
    lever.rotation.set(-0.9, yaw, 0, 'YXZ');
    this.group.add(lever);
    g.interact.add({
      x: m.i + 0.5, z: m.j + 0.5, r: 1.8, hold: 0.5, priority: 0.5,
      label: () => (g.powerOn ? null : { text: 'Hold to turn on the power' }),
      can: () => !g.powerOn,
      use: () => {
        g.powerOn = true;
        lever.rotation.x = 0.9;
        audio.play('ui_powerOn', { pos: { x: bx, y: 1.5, z: bz }, vol: 1, priority: 10, refDist: 10 });
        this.setPowered(true);
        bus.emit('powerOn', {});
        bus.emit('message', { text: 'POWER RESTORED', sub: 'Halcyon Tonics and the Rewirer are online', duration: 3.5, color: '#4ff0e8' });
        g.fx.sparks(bx, 1.5, bz, Math.sin(yaw), 0.5, Math.cos(yaw), 30, 0x90e0ff, 5);
      },
    });
  }

  private setPowered(on: boolean) {
    for (const s of this.signMats) s.color.setScalar(on ? 2.2 : 0.18);
    for (const pm of this.machines) for (const l of pm.light) (l.material as THREE.MeshBasicMaterial).color.setScalar(on ? 2.5 : 0.1);
    if (this.rewirer) for (const c of this.rewirer.coils) (c.material as THREE.MeshBasicMaterial).color.setRGB(on ? 0.4 : 0.05, on ? 1.6 : 0.05, on ? 1.8 : 0.05);
  }

  // ---------------------------------------------------------------- wall-buys
  private setupWallBuy(m: Marker) {
    const g = this.g;
    const id = g.world.def.markers.b[m.index];
    const def = WEAPONS[id];
    if (!def) return;
    const yaw = m.facing;
    // chalk on the wall behind the marker cell
    const wx = m.i + 0.5 - Math.sin(yaw) * 0.49, wz = m.j + 0.5 - Math.cos(yaw) * 0.49;
    const mat = new THREE.MeshBasicMaterial({ map: chalkTexture(def), transparent: true, depthWrite: false, color: new THREE.Color(0.75, 0.75, 0.72) });
    const plane = new THREE.Mesh(new THREE.PlaneGeometry(1.6, 0.8), mat);
    plane.position.set(wx, 1.55, wz);
    plane.rotation.y = yaw;
    plane.renderOrder = 1;
    this.group.add(plane);
    g.interact.add({
      x: m.i + 0.5, z: m.j + 0.5, r: 1.6, hold: ECONOMY.holdBuy,
      label: () => {
        const owned = g.weapons.owns(id);
        if (owned) {
          const cost = owned.upgraded ? 2500 : def.ammoCost;
          return this.buyLabel(`Ammo — ${owned.name}`, cost);
        }
        return this.buyLabel(`Buy ${def.name}`, def.cost);
      },
      can: () => {
        const owned = g.weapons.owns(id);
        const cost = owned ? (owned.upgraded ? 2500 : def.ammoCost) : def.cost;
        return this.eco.can(cost) && !g.weapons.busy && !(owned && owned.mag === owned.stats.mag && owned.reserve === owned.stats.reserve);
      },
      onDenied: this.denied,
      use: () => {
        const owned = g.weapons.owns(id);
        const cost = owned ? (owned.upgraded ? 2500 : def.ammoCost) : def.cost;
        if (!this.eco.spend(cost)) return;
        audio.play('ui_purchase', { bus: 'ui', vol: 0.8 });
        audio.play('ui_chalk', { bus: 'ui', vol: 0.5 });
        g.weapons.give(id, owned?.upgraded ?? false);
        if (owned) owned.refill();
      },
    });
  }

  // ---------------------------------------------------------------- perk machines
  private setupPerk(m: Marker, batch: GeoBatch) {
    const g = this.g;
    const perk = g.world.def.markers.p[m.index];
    const def = PERKS[perk];
    if (!def) return;
    const yaw = m.facing;
    const base = M(m.i + 0.5, 0, m.j + 0.5, yaw);
    const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => base.clone().multiply(M(x, y, z, ry, rx, rz));
    // body
    batch.add('plain:paint', rbox(0.86, 1.95, 0.7, 0.06), at(0, 0.975, -0.05), def.color);
    batch.add('plain:paint', rbox(0.9, 0.18, 0.74, 0.05), at(0, 2.02, -0.05), 0x2a2420);
    batch.add('plain:paint', rbox(0.9, 0.1, 0.74, 0.03), at(0, 0.05, -0.05), 0x1a1612);
    // glass front with bottles
    batch.add('plain:glass', box(0.62, 0.9, 0.02), at(0, 1.2, 0.31), 0x203030);
    for (let s = 0; s < 3; s++) for (let i = 0; i < 4; i++) {
      batch.add('plain:glass', cyl(0.028, 0.03, 0.16, 8), at(-0.22 + i * 0.145, 0.86 + s * 0.3, 0.2), def.color);
      batch.add('plain:paint', cyl(0.012, 0.012, 0.04, 6), at(-0.22 + i * 0.145, 0.96 + s * 0.3, 0.2), 0xb8b0a0);
    }
    batch.add('surf:metal', box(0.7, 0.02, 0.4), at(0, 0.77, 0.1), 0x777777);
    batch.add('surf:metal', box(0.7, 0.02, 0.4), at(0, 1.07, 0.1), 0x777777);
    batch.add('surf:metal', box(0.7, 0.02, 0.4), at(0, 1.37, 0.1), 0x777777);
    // coin slot / dispenser
    batch.add('plain:chrome', rbox(0.2, 0.3, 0.06, 0.02), at(0.25, 0.45, 0.31), 0xaaaaaa);
    batch.add('plain:paint', box(0.4, 0.14, 0.08), at(-0.1, 0.32, 0.31), 0x111111);
    // side vents & rivets
    for (let i = 0; i < 5; i++) batch.add('plain:paint', box(0.02, 0.03, 0.5), at(0.44, 0.5 + i * 0.12, -0.05), 0x111111);
    for (let i = 0; i < 6; i++) batch.add('plain:chrome', sphere(0.012, 6, 4), at(-0.4 + (i % 2) * 0.8, 0.3 + Math.floor(i / 2) * 0.7, 0.32), 0xbbbbbb);
    // sign (canvas texture, glows when powered)
    const signMat = new THREE.MeshBasicMaterial({ map: signTexture(def.name, `HALCYON TONIC · ${def.cost}`, def.color), color: new THREE.Color(0.2, 0.2, 0.2) });
    this.signMats.push(signMat);
    const sign = new THREE.Mesh(new THREE.PlaneGeometry(0.84, 0.26), signMat);
    sign.position.set(m.i + 0.5 + Math.sin(yaw) * 0.325, 1.76, m.j + 0.5 + Math.cos(yaw) * 0.325);
    sign.rotation.y = yaw;
    this.group.add(sign);
    // little indicator bulbs
    const lights: THREE.Mesh[] = [];
    for (let i = 0; i < 3; i++) {
      const lm = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(def.color) }));
      lm.position.set(m.i + 0.5 + Math.sin(yaw) * 0.33 + Math.cos(yaw) * (-0.2 + i * 0.2), 1.62, m.j + 0.5 + Math.cos(yaw) * 0.33 - Math.sin(yaw) * (-0.2 + i * 0.2));
      this.group.add(lm);
      lights.push(lm);
    }
    const pos = new THREE.Vector3(m.i + 0.5 + Math.sin(yaw) * 0.9, 0, m.j + 0.5 + Math.cos(yaw) * 0.9);
    this.machines.push({ perk, pos, sign: signMat, light: lights, jingleT: Math.random() * 20 });
    g.interact.add({
      x: pos.x, z: pos.z, r: 1.4, hold: ECONOMY.holdBuy,
      label: () => {
        if (!g.powerOn) return { text: def.name, sub: 'Requires power', cant: true };
        const p = g.player;
        if (perk === 'secondwind') {
          if (p.secondWindBuys >= (def.maxBuys ?? 3)) return { text: `${def.name}`, sub: 'Sold out', cant: true };
        } else if (p.perks.has(perk)) return { text: def.name, sub: 'Already active', cant: true };
        if (p.perks.size >= MAX_PERKS && !p.perks.has(perk)) return { text: def.name, sub: 'Perk limit reached (4)', cant: true };
        return { ...this.buyLabel(`${def.name} — ${def.desc}`, def.cost) };
      },
      can: () => {
        const p = g.player;
        if (!g.powerOn || g.weapons.busy) return false;
        if (perk === 'secondwind' ? p.secondWindBuys >= 3 : p.perks.has(perk)) return false;
        if (p.perks.size >= MAX_PERKS && !p.perks.has(perk)) return false;
        return this.eco.can(def.cost);
      },
      onDenied: this.denied,
      use: () => {
        if (!this.eco.spend(def.cost)) return;
        audio.play('ui_purchase', { bus: 'ui', vol: 0.8 });
        audio.play('ui_perkJingle_' + perk, { pos: { x: pos.x, y: 1.5, z: pos.z }, bus: 'music', vol: 0.7, priority: 7 });
        g.weapons.startDrink(def.color, () => this.grantPerk(perk));
      },
    });
  }

  grantPerk(perk: PerkId) {
    const p = this.g.player;
    p.perks.add(perk);
    if (perk === 'secondwind') { p.secondWindBuys++; p.selfRevives = Math.min(3 + this.g.difficulty.selfRevives, p.selfRevives + 1); }
    if (perk === 'ironhide') { p.maxHp = p.maxHealth; p.hp = p.maxHp; }
    bus.emit('perksChanged', {});
    bus.emit('message', { text: PERKS[perk].name.toUpperCase(), sub: PERKS[perk].desc, duration: 2.5, color: hex(PERKS[perk].color) });
  }

  // ---------------------------------------------------------------- supply crate
  private setupCrateSpot(m: Marker, batch: GeoBatch) {
    const yaw = m.facing + Math.PI / 2;
    const group = new THREE.Group();
    group.position.set(m.i + 0.5, 0, m.j + 0.5);
    group.rotation.y = yaw;
    // base platform (always visible: a stained pallet marks every potential spot)
    const base = M(m.i + 0.5, 0, m.j + 0.5, yaw);
    batch.add('surf:wood', box(1.3, 0.08, 0.7), base.clone().multiply(M(0, 0.04, 0)), 0x6a5a40);
    // crate body (dynamic so it can move)
    const k = new GeoBatch();
    k.uvScale = { 'surf:wood': 1.5, 'surf:metal': 1 };
    k.add('surf:wood', rbox(1.2, 0.55, 0.6, 0.02), M(0, 0.36, 0), 0xc0a070);
    for (const x of [-0.58, 0.58]) k.add('surf:metal', box(0.04, 0.58, 0.64), M(x, 0.36, 0), 0x555555);
    k.add('plain:paint', box(0.6, 0.18, 0.005), M(0, 0.4, 0.302), 0x8a1a12);
    const bodyMeshes = this.batchToMeshes(k);
    for (const bm of bodyMeshes) group.add(bm);
    const lid = new THREE.Group();
    const lk = new GeoBatch();
    lk.uvScale = { 'surf:wood': 1.5, 'surf:metal': 1 };
    lk.add('surf:wood', rbox(1.22, 0.1, 0.62, 0.02), M(0, 0.05, 0.31), 0xb09060);
    lk.add('surf:metal', box(1.24, 0.03, 0.05), M(0, 0.02, 0.6), 0x555555);
    for (const lm of this.batchToMeshes(lk)) lid.add(lm);
    lid.position.set(0, 0.63, -0.31);
    group.add(lid);
    // light beam marker
    const beam = new THREE.Mesh(new THREE.CylinderGeometry(0.25, 0.5, 14, 16, 1, true), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.25, 0.8, 0.9), transparent: true, opacity: 0.22, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide, fog: false }));
    beam.position.set(m.i + 0.5, 7, m.j + 0.5);
    this.group.add(group, beam);
    group.visible = false; beam.visible = false;
    this.crateSpots.push({ m, group, lid, beam });
    const g = this.g;
    const idx = this.crateSpots.length - 1;
    g.interact.add({
      x: m.i + 0.5, z: m.j + 0.5, r: 1.7, hold: ECONOMY.holdBuy, priority: 0.3,
      label: () => {
        if (this.crateIdx !== idx) return null;
        if (this.crateState === 'closed') return this.buyLabel('Supply Crate — random weapon', ECONOMY.crateCost);
        if (this.crateState === 'offer' && this.crateResult) return { text: `Take ${this.crateResult.name}`, sub: g.weapons.slots.length >= g.weapons.maxSlots() ? 'Replaces current weapon' : 'Hold to take' };
        return null;
      },
      can: () => {
        if (this.crateIdx !== idx || g.weapons.busy) return false;
        if (this.crateState === 'closed') return this.eco.can(ECONOMY.crateCost);
        return this.crateState === 'offer';
      },
      onDenied: this.denied,
      use: () => {
        if (this.crateState === 'closed') this.openCrate();
        else if (this.crateState === 'offer' && this.crateResult) {
          g.weapons.give(this.crateResult.id);
          audio.play('mech_swap', { bus: 'sfx' });
          this.closeCrate();
        }
      },
    });
  }

  private batchToMeshes(b: GeoBatch): THREE.Mesh[] {
    const out: THREE.Mesh[] = [];
    for (const [key, geo] of b.finalize()) {
      this.g.world.baker.bakeGeometry(geo);
      out.push(new THREE.Mesh(geo, this.g.world.matLib.get(key)));
    }
    return out;
  }

  private showCrateAt(i: number) {
    this.crateSpots.forEach((s, k) => { s.group.visible = k === i; s.beam.visible = k === i; s.lid.rotation.x = 0; });
  }

  private openCrate() {
    if (!this.eco.spend(ECONOMY.crateCost)) return;
    const g = this.g;
    const spot = this.crateSpots[this.crateIdx];
    this.crateUses++;
    this.crateState = 'spinning';
    this.crateT = 0;
    this.crateCycleT = 0;
    audio.play('ui_purchase', { bus: 'ui', vol: 0.8 });
    audio.play('ui_boxOpen', { pos: { x: spot.m.i + 0.5, y: 1, z: spot.m.j + 0.5 }, vol: 1, priority: 8 });
    audio.play('ui_boxJingle', { pos: { x: spot.m.i + 0.5, y: 1, z: spot.m.j + 0.5 }, bus: 'music', vol: 0.8, priority: 8 });
    // roll the result now
    const teddy = this.crateUses >= this.crateLimit && this.crateSpots.length > 1 && Math.random() < 0.55;
    if (teddy) { this.crateResult = null; }
    else {
      const owned = new Set(g.weapons.slots.map((w) => w.def.id));
      if (Math.random() < WONDER_CHANCE && !owned.has('disruptor')) this.crateResult = WEAPONS.disruptor;
      else {
        const pool = WEAPON_LIST.filter((w) => w.boxWeight > 0 && !owned.has(w.id));
        let total = 0;
        for (const w of pool) total += w.boxWeight;
        let r = Math.random() * total;
        this.crateResult = pool[0];
        for (const w of pool) { r -= w.boxWeight; if (r <= 0) { this.crateResult = w; break; } }
      }
    }
  }

  private closeCrate() {
    this.crateState = 'closed';
    this.crateResult = null;
    this.crateDisplay.clear();
    this.crateShown = '';
  }

  private updateCrate(dt: number) {
    if (!this.crateSpots.length) return;
    const spot = this.crateSpots[this.crateIdx];
    const cx = spot.m.i + 0.5, cz = spot.m.j + 0.5;
    this.crateT += dt;
    const lidTarget = this.crateState === 'spinning' || this.crateState === 'offer' || this.crateState === 'teddy' ? -1.9 : 0;
    spot.lid.rotation.x += (lidTarget - spot.lid.rotation.x) * Math.min(1, dt * 6);
    if (this.crateState === 'spinning') {
      this.crateCycleT -= dt;
      const t = this.crateT;
      const rise = Math.min(1, t / 3.5);
      if (this.crateCycleT <= 0) {
        this.crateCycleT = 0.08 + t * 0.06;
        const list = WEAPON_LIST.filter((w) => w.boxWeight > 0);
        this.showDisplay(pick(list).id);
      }
      this.crateDisplay.position.set(cx, 0.75 + rise * 0.55, cz);
      if (Math.random() < dt * 10) this.g.fx.glowPuff(cx + (Math.random() - 0.5) * 0.8, 0.8 + rise * 0.5, cz + (Math.random() - 0.5) * 0.3, 0x60e0ff, 0.25, 0.5);
      if (t > 4) {
        if (!this.crateResult) {
          this.crateState = 'teddy';
          this.crateT = 0;
          this.crateDisplay.clear();
          this.crateShown = '';
          this.teddy ??= this.buildRadioTeddy();
          this.crateDisplay.add(this.teddy);
          audio.play('ui_radioLaugh', { pos: { x: cx, y: 1.3, z: cz }, vol: 1, priority: 9, refDist: 6 });
          this.eco.add(ECONOMY.crateCost, 'refund');
        } else {
          this.showDisplay(this.crateResult.id);
          this.crateState = 'offer';
          this.crateT = 0;
        }
      }
    } else if (this.crateState === 'offer') {
      this.crateDisplay.position.set(cx, 1.3 - Math.max(0, this.crateT - 7) * 0.15, cz);
      if (this.crateT > 10) this.closeCrate();
    } else if (this.crateState === 'teddy') {
      this.crateDisplay.position.set(cx, 1.2 + this.crateT * 0.8, cz);
      this.crateDisplay.rotation.y += dt * 2;
      if (this.crateT > 3.5) {
        this.crateState = 'moving';
        this.crateT = 0;
        this.crateDisplay.clear();
        this.crateShown = '';
        spot.group.visible = false; spot.beam.visible = false;
        this.g.fx.smoke(cx, 0.5, cz, 20, 0.4, 0x8a8a8a, 1);
        bus.emit('message', { text: 'THE CRATE HAS MOVED', duration: 2.5 });
      }
    } else if (this.crateState === 'moving') {
      if (this.crateT > 2) {
        let n = this.crateIdx;
        while (n === this.crateIdx) n = Math.floor(Math.random() * this.crateSpots.length);
        this.crateIdx = n;
        this.crateUses = 0;
        this.crateLimit = randInt(6, 10);
        this.showCrateAt(n);
        this.crateState = 'closed';
      }
    }
    // beam pulse
    (spot.beam.material as THREE.MeshBasicMaterial).opacity = 0.16 + Math.sin(this.g.time * 2) * 0.05;
  }

  private showDisplay(id: string) {
    if (this.crateShown === id) return;
    this.crateShown = id;
    this.crateDisplay.clear();
    let clone = this.displayCache.get(id);
    if (!clone) { clone = createGunModel(id, false).root; this.displayCache.set(id, clone); }
    const wrap = new THREE.Group();
    wrap.add(clone);
    wrap.rotation.y = Math.PI / 2;
    wrap.scale.setScalar(1.4);
    this.crateDisplay.add(wrap);
    this.crateDisplay.rotation.y = this.crateSpots[this.crateIdx].group.rotation.y;
  }

  private buildRadioTeddy(): THREE.Group {
    const k = new GeoBatch();
    k.uvScale = { 'surf:wood': 0.5 };
    k.add('surf:wood', rbox(0.34, 0.26, 0.18, 0.04), M(0, 0, 0), 0x8a5a30);
    k.add('plain:fabric', box(0.2, 0.16, 0.01), M(-0.04, 0, 0.091), 0x2a2010);
    k.add('plain:brass', cyl(0.035, 0.035, 0.02, 10), M(0.11, 0.04, 0.09, 0, Math.PI / 2), 0x9a7a3a);
    k.add('plain:brass', cyl(0.025, 0.025, 0.02, 10), M(0.11, -0.05, 0.09, 0, Math.PI / 2), 0x9a7a3a);
    k.add('plain:chrome', cyl(0.004, 0.004, 0.35, 4), M(0.1, 0.3, 0, 0, 0, 0.3), 0x999999);
    k.add('plain:fabric', torus(0.03, 0.008, 4, 8), M(-0.12, 0.17, 0, 0, Math.PI / 2), 0x5a3a20);
    const g = new THREE.Group();
    for (const [key, geo] of k.finalize()) {
      const bake = new Float32Array(geo.attributes.position.count * 3).fill(0.35);
      geo.setAttribute('bake', new THREE.BufferAttribute(bake, 3));
      g.add(new THREE.Mesh(geo, this.g.world.matLib.get(key)));
    }
    return g;
  }

  // ---------------------------------------------------------------- the Rewirer
  private setupRewirer(m: Marker, batch: GeoBatch) {
    const g = this.g;
    const yaw = m.facing;
    const base = M(m.i + 0.5, 0, m.j + 0.5, yaw);
    const at = (x: number, y: number, z: number, ry = 0, rx = 0, rz = 0) => base.clone().multiply(M(x, y, z, ry, rx, rz));
    batch.add('surf:riveted', rbox(0.95, 1.0, 0.8, 0.04), at(0, 0.5, -0.05), 0x4a4a40);
    batch.add('surf:riveted', rbox(0.95, 0.9, 0.5, 0.04), at(0, 1.45, -0.2), 0x3a3e38);
    batch.add('plain:paint', box(0.6, 0.12, 0.01), at(0, 1.75, 0.06), 0x8a1a12);
    batch.add('plain:glass', box(0.5, 0.35, 0.02), at(0, 1.3, 0.06), 0x203030);
    batch.add('surf:metal', box(0.8, 0.05, 0.5), at(0, 1.02, 0.15), 0x555555);
    for (let i = 0; i < 4; i++) batch.add('plain:brass', cyl(0.05, 0.05, 0.02, 12), at(-0.3 + i * 0.2, 0.7, 0.36, 0, Math.PI / 2), 0x9a7a3a);
    for (const s of [-1, 1]) {
      batch.add('plain:chrome', cyl(0.05, 0.08, 0.9, 10), at(s * 0.38, 2.3, -0.2), 0x777777);
      for (let i = 0; i < 6; i++) batch.add('plain:brass', torus(0.09, 0.015, 5, 14), at(s * 0.38, 2.0 + i * 0.1, -0.2, 0, Math.PI / 2), 0xb06a30);
      batch.add('plain:chrome', sphere(0.11, 10, 8), at(s * 0.38, 2.8, -0.2), 0x888888);
    }
    for (let i = 0; i < 3; i++) batch.add('plain:rubber', cyl(0.025, 0.025, 1.8, 6), at(-0.2 + i * 0.2, 1.0, -0.42, 0, 0.2), 0x151515);
    const coils: THREE.Mesh[] = [];
    for (const s of [-1, 1]) {
      const cm = new THREE.Mesh(new THREE.SphereGeometry(0.06, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.05, 0.05, 0.05) }));
      cm.position.copy(new THREE.Vector3(s * 0.38, 2.8, -0.2).applyMatrix4(base));
      this.group.add(cm);
      coils.push(cm);
    }
    const display = new THREE.Group();
    this.group.add(display);
    const front = new THREE.Vector3(0, 1.15, 0.2).applyMatrix4(base);
    this.rewirer = { pos: front, state: 'idle', t: 0, weapon: null, display, coils };
    const rw = this.rewirer;
    const ix = m.i + 0.5 + Math.sin(yaw) * 0.95, iz = m.j + 0.5 + Math.cos(yaw) * 0.95;
    g.interact.add({
      x: ix, z: iz, r: 1.5, hold: ECONOMY.holdBuy,
      label: () => {
        if (!g.powerOn) return { text: 'The Rewirer', sub: 'Requires power', cant: true };
        if (rw.state === 'working') return null;
        if (rw.state === 'offer' && rw.weapon) return { text: `Take ${rw.weapon.def.upgradedName}`, sub: 'Hold to take' };
        const w = g.weapons.current;
        if (!w) return null;
        if (w.upgraded) return { text: 'The Rewirer', sub: 'Weapon already rewired', cant: true };
        return this.buyLabel(`Rewire ${w.def.name}`, ECONOMY.rewirerCost);
      },
      can: () => {
        if (!g.powerOn || g.weapons.busy) return false;
        if (rw.state === 'offer') return true;
        const w = g.weapons.current;
        return rw.state === 'idle' && !!w && !w.upgraded && this.eco.can(ECONOMY.rewirerCost) && g.weapons.slots.length > 0;
      },
      onDenied: this.denied,
      use: () => {
        if (rw.state === 'offer' && rw.weapon) {
          const w = rw.weapon;
          rw.weapon = null; rw.state = 'idle'; display.clear();
          w.upgrade();
          const ws = g.weapons;
          if (ws.slots.length < ws.maxSlots()) { ws.slots.push(w); ws.beginSwap(ws.slots.length - 1); }
          else { ws.slots[ws.cur] = w; ws.vm.setWeapon(w.def.id, true); }
          bus.emit('weaponChanged', {});
          bus.emit('message', { text: w.def.upgradedName.toUpperCase(), duration: 2.5, color: '#4ff0e8' });
          return;
        }
        if (!this.eco.spend(ECONOMY.rewirerCost)) return;
        const ws = g.weapons;
        const w = ws.current!;
        rw.weapon = w;
        ws.slots.splice(ws.cur, 1);
        if (ws.slots.length === 0) ws.slots.push(new (w.constructor as any)(WEAPONS.warden));
        ws.cur = 0;
        ws.vm.setWeapon(ws.slots[0].def.id, ws.slots[0].upgraded);
        bus.emit('weaponChanged', {});
        rw.state = 'working'; rw.t = 0;
        audio.play('ui_purchase', { bus: 'ui', vol: 0.8 });
        audio.play('ui_rewirer', { pos: { x: front.x, y: 1.5, z: front.z }, vol: 1, priority: 9 });
        const model = createGunModel(w.def.id, false).root;
        model.rotation.y = Math.PI / 2 + yaw;
        model.scale.setScalar(1.3);
        display.add(model);
        display.position.copy(front);
      },
    });
  }

  private updateRewirer(dt: number) {
    const rw = this.rewirer;
    if (!rw) return;
    rw.t += dt;
    if (rw.state === 'working') {
      if (Math.random() < dt * 14) {
        const c = rw.coils[Math.random() < 0.5 ? 0 : 1].position;
        const pts = [c.clone(), rw.pos.clone().add(new THREE.Vector3((Math.random() - 0.5) * 0.3, 0, (Math.random() - 0.5) * 0.3))];
        this.g.fx.arc(jagged(pts[0], pts[1], 7, 0.15), 0.12, 0.02, 0x80f0ff);
        this.g.fx.electric(rw.pos.x, rw.pos.y, rw.pos.z, 3, 0x80f0ff);
      }
      rw.display.rotation.y += dt * 1.5;
      if (rw.t > 4.2) {
        rw.state = 'offer'; rw.t = 0;
        rw.display.clear();
        const model = createGunModel(rw.weapon!.def.id, true).root;
        model.rotation.y = Math.PI / 2;
        model.scale.setScalar(1.3);
        rw.display.add(model);
      }
    } else if (rw.state === 'offer') {
      rw.display.rotation.y += dt * 0.8;
      if (rw.t > 12) {
        // unclaimed: the weapon is lost (classic rule)
        rw.state = 'idle'; rw.weapon = null; rw.display.clear();
      }
    }
  }

  update(dt: number) {
    this.updateCrate(dt);
    this.updateRewirer(dt);
    // perk machine jingles when nearby (powered)
    if (this.g.powerOn) {
      const p = this.g.player.pos;
      for (const pm of this.machines) {
        pm.jingleT -= dt;
        const d = Math.hypot(p.x - pm.pos.x, p.z - pm.pos.z);
        if (pm.jingleT <= 0 && d < 7 && (!this.jingleVoice || !this.jingleVoice.alive)) {
          pm.jingleT = 25 + Math.random() * 20;
          this.jingleVoice = audio.play('ui_perkJingle_' + pm.perk, { pos: { x: pm.pos.x, y: 1.5, z: pm.pos.z }, bus: 'music', vol: 0.55, priority: 4 });
        }
        for (const l of pm.light) (l.material as THREE.MeshBasicMaterial).color.setScalar(1.5 + Math.sin(this.g.time * 3 + l.id) * 1.2);
      }
    }
  }

  dispose() {
    this.g.world.group.remove(this.group);
    audio.stop(this.jingleVoice, 0.2);
  }
}
