import * as THREE from 'three';
import type { Game } from '../game';
import { h } from '../core/dom';
import { bus } from '../core/events';
import { audio } from '../audio/audioEngine';
import { save, persist } from '../core/save';
import { FREQUENCIES } from '../config/lore';
import { PERKS, type PerkId } from '../config/perks';
import type { Marker } from '../world/grid';
import { Warden } from '../entities/bosses/warden';
import { MotherTransmitter } from '../entities/bosses/motherTransmitter';
import { rbox, cyl, lathe, box, compose, M, torus } from '../render/geometryKit';
import { jagged } from '../render/fx';
import { pick, randInt } from '../core/math';
import { groundY } from '../world/terrain';

interface Item { id: string; m: Marker; mesh: THREE.Group; glow: THREE.Mesh | null; taken: boolean }

/**
 * Easter eggs for both maps: lore notes, the hidden music track, side secrets and the
 * main quests that summon the bosses. Progress shows in the HUD's EE line.
 */
export class EasterEggs {
  private items = new Map<string, Item>();
  private group = new THREE.Group();
  private valves = 0;
  private valvesInstalled = false;
  private tuned = false;
  private freq = pick(FREQUENCIES);
  private music = 0;
  private songPlayed = false;
  private digits: string[] = Array.from({ length: 4 }, () => String(randInt(0, 9)));
  private relays: { id: string; x: number; z: number; t: number; state: 'idle' | 'charging' | 'locked'; glow: THREE.Mesh }[] = [];
  private codeOk = false;
  private bossSummoned = false;
  private completed = false;
  private stashTaken = false;
  private gagUsed = false;
  private glowMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(0.6, 2.2, 2.4) });
  private relayArcT = 0;
  // Ravenmoor Grounds: flare pistol → three coffin bells → the vigil under the tower
  private flareGun = false;
  private bells = new Set<string>();
  private vigil: { t: number; age: number; x: number; z: number; sprite: THREE.Sprite; arcT: number } | null = null;
  private blackout = false;
  private flareMarker: THREE.Mesh | null = null;
  private lastPower = false;
  readonly mapId: string;

  constructor(private g: Game) {
    this.mapId = g.world.def.id;
    g.world.group.add(this.group);
    for (const m of g.world.grid.markers) {
      if (m.ch === 'e' && m.id) this.setupAnchor(m);
      if (m.ch === 'q' && m.id) this.setupSolid(m);
    }
    this.progress();
  }

  // ---------------------------------------------------------------- visuals
  private itemMesh(kind: string): { g: THREE.Group; glow: THREE.Mesh | null } {
    const grp = new THREE.Group();
    const mat = (c: number, p: THREE.MeshStandardMaterialParameters = {}) => new THREE.MeshStandardMaterial({ color: c, roughness: 0.6, emissive: new THREE.Color(c).multiplyScalar(0.25), ...p });
    let glow: THREE.Mesh | null = null;
    const stand = new THREE.Mesh(compose([[rbox(0.4, 0.75, 0.4, 0.03), M(0, 0.375, 0)]]), mat(0x3a2e24));
    if (kind.startsWith('note') || kind === 'freqnote') {
      const paper = new THREE.Mesh(new THREE.PlaneGeometry(0.22, 0.3), new THREE.MeshStandardMaterial({ color: 0xd8cca8, emissive: 0x2a2416, roughness: 0.9, side: THREE.DoubleSide }));
      paper.rotation.x = -Math.PI / 2 + 0.1; paper.position.y = 0.77; paper.rotation.z = Math.random();
      grp.add(stand, paper);
    } else if (kind.startsWith('valve')) {
      grp.add(stand);
      const tube = new THREE.Mesh(lathe([[0, 0], [0.04, 0.005], [0.045, 0.1], [0.025, 0.14], [0, 0.15]], 10), new THREE.MeshStandardMaterial({ color: 0x405050, transparent: true, opacity: 0.6, roughness: 0.1 }));
      tube.position.y = 0.78;
      glow = new THREE.Mesh(new THREE.CylinderGeometry(0.012, 0.012, 0.08, 6), this.glowMat);
      glow.position.y = 0.84;
      grp.add(tube, glow);
    } else if (kind.startsWith('musicbox')) {
      grp.add(stand);
      const box2 = new THREE.Mesh(compose([[rbox(0.2, 0.1, 0.14, 0.01), M(0, 0.05, 0)], [box(0.21, 0.02, 0.15), M(0, 0.11, -0.04, 0, -0.9)]]), mat(0x6a3a1a));
      box2.position.y = 0.75;
      glow = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.8, 0.6) }));
      glow.position.set(0.12, 0.82, 0);
      grp.add(box2, glow);
    } else if (kind.startsWith('tape')) {
      grp.add(stand);
      const reel = new THREE.Mesh(compose([[cyl(0.12, 0.12, 0.02, 18), null, 0x1a1a1a], [cyl(0.03, 0.03, 0.03, 8), null, 0x888888]]), mat(0xffffff));
      reel.position.y = 0.77;
      glow = new THREE.Mesh(new THREE.TorusGeometry(0.1, 0.006, 4, 24), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 1.2, 0.5) }));
      glow.rotation.x = Math.PI / 2; glow.position.y = 0.79;
      grp.add(reel, glow);
    } else if (kind === 'shelfbook') {
      const book = new THREE.Mesh(new THREE.BoxGeometry(0.05, 0.28, 0.2), new THREE.MeshStandardMaterial({ color: 0x6a1a10, emissive: 0x3a0806, roughness: 0.8 }));
      book.position.y = 1.2; book.rotation.z = 0.25;
      const shelf = new THREE.Mesh(new THREE.BoxGeometry(0.5, 0.04, 0.3), mat(0x4a3220));
      shelf.position.y = 1.05;
      grp.add(shelf, book);
    } else if (kind === 'stash') {
      const crate = new THREE.Mesh(compose([[rbox(0.6, 0.4, 0.4, 0.02), M(0, 0.2, 0)], [box(0.62, 0.05, 0.42), M(0, 0.42, 0), 0x8a1a12]]), mat(0x5a4632));
      grp.add(crate);
    } else if (kind === 'flaregun') {
      grp.add(stand);
      const gun = new THREE.Mesh(compose([[box(0.05, 0.06, 0.2), M(0, 0.04, -0.02)], [cyl(0.028, 0.028, 0.14, 10), M(0, 0.06, -0.15, 0, Math.PI / 2)], [box(0.04, 0.1, 0.05), M(0, -0.02, 0.07, 0, -0.3)]]), mat(0xc0501c));
      gun.position.y = 0.8; gun.rotation.y = 0.6;
      glow = new THREE.Mesh(new THREE.SphereGeometry(0.03, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.4, 0.6, 0.3) }));
      glow.position.set(0, 0.9, -0.1);
      grp.add(gun, glow);
    } else if (kind.startsWith('bell')) {
      const b = new THREE.Mesh(lathe([[0.11, 0], [0.09, 0.03], [0.06, 0.13], [0.0, 0.15]], 12), new THREE.MeshStandardMaterial({ color: 0x9a7a3a, metalness: 0.5, roughness: 0.4, side: THREE.DoubleSide }));
      b.position.set(0.44, 1.55, 0);
      const rope = new THREE.Mesh(new THREE.CylinderGeometry(0.008, 0.008, 1.0, 4), mat(0x5a4a30));
      rope.position.set(0.44, 1.05, 0);
      glow = new THREE.Mesh(new THREE.SphereGeometry(0.025, 8, 6), new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 1.7, 0.6) }));
      glow.position.set(0.44, 1.53, 0);
      grp.add(b, rope, glow);
    } else if (kind === 'beaconBase') {
      const crateM = new THREE.Mesh(compose([[rbox(0.7, 0.45, 0.5, 0.02), M(0, 0.22, 0)], [box(0.72, 0.06, 0.52), M(0, 0.47, 0), 0x8a1a12]]), mat(0x4a3e2c));
      const stake = new THREE.Mesh(compose([[cyl(0.03, 0.03, 1.4, 6), M(0.5, 0.7, 0)], [box(0.3, 0.2, 0.01), M(0.62, 1.3, 0)]]), mat(0xa02818));
      grp.add(crateM, stake);
    } else if (kind === 'radiogag') {
      grp.add(stand);
      const radio = new THREE.Mesh(compose([[rbox(0.32, 0.22, 0.16, 0.04), M(0, 0.11, 0)], [box(0.2, 0.12, 0.01), M(-0.04, 0.12, 0.081), 0x2a2010]]), mat(0x7a4a28));
      radio.position.y = 0.75;
      grp.add(radio);
    }
    if (glow) glow.userData.pulse = true;
    return { g: grp, glow };
  }

  private setupAnchor(m: Marker) {
    const id = m.id!;
    if (id === 'bossSpawn') return;
    const { g: mesh, glow } = this.itemMesh(id);
    mesh.position.set(m.i + 0.5, 0, m.j + 0.5);
    this.group.add(mesh);
    const it: Item = { id, m, mesh, glow, taken: false };
    this.items.set(id, it);
    const g = this.g;
    const at = { x: m.i + 0.5, z: m.j + 0.5 };
    const add = (label: () => { text: string; sub?: string } | null, use: () => void, hold = 0.35) =>
      g.interact.add({ x: at.x, z: at.z, r: 1.5, hold, priority: 0.4, label, can: () => !!label(), use });
    if (id.startsWith('note')) {
      add(() => ({ text: 'Read note', sub: save.notes.includes(id) ? 'Already collected' : 'Lore' }), () => {
        const idx = parseInt(id.slice(4), 10);
        const digit = idx >= 6 && idx <= 9 ? this.digits[idx - 6] : null;
        g.onReadNote?.(id, digit);
        this.progress();
      }, 0);
    } else if (id === 'freqnote') {
      add(() => ({ text: 'Read the engineer’s scrap', sub: 'Note' }), () => {
        this.modal(this.paper('Engineer’s scrap', `The Director talks to the Chorus on his own band: ${this.freq}.\n\nThe set in the theater can still reach it — once the valves are back in and the power is on.\n\nTune it there and you’ll be talking to HIM. God help you if you do.`));
      }, 0);
    } else if (id.startsWith('valve')) {
      add(() => (it.taken ? null : { text: 'Pick up the radio valve', sub: 'Strange glass tube' }), () => {
        it.taken = true; mesh.visible = false; this.valves++;
        audio.play('ui_valve', { bus: 'ui' });
        bus.emit('message', { text: `RADIO VALVE ${this.valves}/3`, duration: 2 });
        this.progress();
      });
    } else if (id.startsWith('musicbox') || id.startsWith('tape')) {
      add(() => (it.taken ? null : { text: id.startsWith('tape') ? 'Thread the reel' : 'Wind the music box', sub: '?' }), () => {
        it.taken = true;
        if (it.glow) it.glow.visible = false;
        this.music++;
        audio.play(id.startsWith('tape') ? 'ui_tape' : 'ui_musicBox', { pos: { x: at.x, y: 1, z: at.z }, vol: 1, priority: 8 });
        if (this.music >= 3 && !this.songPlayed) {
          this.songPlayed = true;
          bus.emit('message', { text: 'SOMETHING STARTS TO PLAY…', duration: 3, color: '#d8a940' });
          (window as any).app?.music.playSong(g.world.def.songId);
        }
      });
    } else if (id === 'shelfbook') {
      add(() => (g.world.doors.get('6')?.open ? null : { text: 'Pull the odd book', sub: '?' }), () => {
        g.world.openDoor('6');
        audio.play('ui_gateOpen', { pos: { x: at.x, y: 1.5, z: at.z }, vol: 0.8, rate: 0.7 });
        bus.emit('message', { text: 'A HIDDEN ROOM', sub: 'The bookshelf swings aside', duration: 3 });
      });
    } else if (id === 'stash') {
      add(() => (this.stashTaken ? null : { text: 'Open the Director’s stash', sub: 'Secret' }), () => {
        this.stashTaken = true;
        g.economy.add(1500, 'stash');
        g.powerups.drop('resupply', at.x + 0.8, at.z, true);
        audio.play('ui_purchase', { bus: 'ui' });
        bus.emit('message', { text: 'THE DIRECTOR’S STASH', sub: '+1500 and fresh ammunition', duration: 3, color: '#d8a940' });
      });
    } else if (id === 'flaregun') {
      add(() => (this.flareGun ? null : { text: 'Take the pilot’s flare pistol', sub: 'One flare left in it' }), () => {
        this.flareGun = true; it.taken = true; mesh.visible = false;
        audio.play('ui_valve', { bus: 'ui' });
        bus.emit('message', { text: 'FLARE PISTOL — ONE FLARE', sub: 'Ring the 3 coffin bells in the graveyard, then fire it at the tower from the asylum steps', duration: 6, color: '#e8823a' });
        this.progress();
      });
    } else if (id.startsWith('bell')) {
      add(() => (this.bells.has(id) ? null : { text: 'Ring the coffin bell', sub: 'Something below might answer' }), () => {
        this.bells.add(id);
        if (it.glow) it.glow.visible = false;
        audio.play('ui_graveBell', { pos: { x: at.x, y: 1.6, z: at.z }, vol: 1, priority: 9 });
        g.rounds.surge += 4 + Math.ceil(g.rounds.round * 0.6);
        if (g.rounds.state !== 'active') g.rounds.startRound(g.rounds.round + 1);
        const n = this.bells.size;
        if (n < 3) bus.emit('message', { text: `THE DEAD ANSWER  ${n}/3`, sub: 'The graves are opening', duration: 3, color: '#d8a940' });
        else {
          bus.emit('message', { text: 'THE TOWER LIGHT STUTTERS', sub: 'It is listening for you now', duration: 4, color: '#4fa8ff' });
          const bc = g.world.setpieces.get('beacon') as { flicker: number } | undefined;
          if (bc) bc.flicker = 5;
          audio.play('ui_eeStep', { bus: 'ui' });
        }
        this.progress();
      }, 0.5);
    } else if (id === 'beaconBase') {
      // a red light pillar marks the firing spot once everything is ready
      const pillar = new THREE.Mesh(new THREE.CylinderGeometry(0.35, 0.6, 14, 12, 1, true),
        new THREE.MeshBasicMaterial({ color: new THREE.Color(2.2, 0.35, 0.2), transparent: true, opacity: 0, blending: THREE.AdditiveBlending, depthWrite: false, side: THREE.DoubleSide }));
      pillar.position.set(at.x, 7, at.z);
      pillar.visible = false;
      this.group.add(pillar);
      this.flareMarker = pillar;
      g.interact.add({ x: at.x, z: at.z, r: 3.6, hold: 0.25, priority: 0.6, label: () => {
        if (this.blackout || this.vigil) return null;
        if (!this.flareGun) return { text: 'Beneath the signal tower', sub: 'Something bright might blind it…' };
        if (this.bells.size < 3) return { text: 'Beneath the signal tower', sub: `It isn’t listening yet (bells ${this.bells.size}/3)` };
        if (!g.powerOn) return { text: 'Beneath the signal tower', sub: 'The estate needs power first' };
        return { text: 'FIRE THE FLARE', sub: 'Hold — then defend the tower base' };
      }, can: () => !this.blackout && !this.vigil && this.flareGun, use: () => {
        if (!this.flareGun || this.bells.size < 3 || !g.powerOn) { audio.play('ui_denied', { bus: 'ui' }); return; }
        this.startVigil(at.x, at.z);
      } });
    } else if (id === 'radiogag') {
      add(() => (this.gagUsed ? { text: 'Fiddle with the broken radio', sub: 'It seems pleased with itself' } : { text: 'Fiddle with the broken radio', sub: '?' }), () => {
        audio.play('ui_radioLaugh', { pos: { x: at.x, y: 1, z: at.z }, vol: 1, priority: 8 });
        if (!this.gagUsed) { this.gagUsed = true; g.economy.add(115, 'gag'); }
      }, 0);
    }
  }

  private setupSolid(m: Marker) {
    const g = this.g;
    const id = m.id!;
    const at = { x: m.i + 0.5 + Math.sin(m.facing) * 0.9, z: m.j + 0.5 + Math.cos(m.facing) * 0.9 };
    if (id === 'console') {
      g.interact.add({
        x: at.x, z: at.z, r: 1.6, hold: 0.4, priority: 0.5,
        label: () => {
          if (this.completed || this.bossSummoned) return null;
          if (!this.valvesInstalled) return this.valves >= 3 ? { text: 'Install the radio valves', sub: '3/3' } : { text: 'A dead radio console', sub: `Missing valves (${this.valves}/3)` };
          if (!g.powerOn) return { text: 'The console needs power' };
          return { text: 'Tune the radio', sub: 'Find the right band' };
        },
        can: () => !this.bossSummoned && (this.valvesInstalled ? g.powerOn : this.valves >= 3),
        use: () => {
          if (!this.valvesInstalled) {
            this.valvesInstalled = true;
            audio.play('ui_valve', { bus: 'ui' });
            audio.play('ui_eeStep', { bus: 'ui' });
            bus.emit('message', { text: 'THE CONSOLE HUMS', sub: g.powerOn ? 'Now find the frequency' : 'It needs power', duration: 3 });
            this.progress();
            return;
          }
          this.modal(this.dialUi());
        },
      });
    }
    if (id === 'keypad') {
      g.interact.add({
        x: at.x, z: at.z, r: 1.6, hold: 0, priority: 0.5,
        label: () => (this.completed || this.bossSummoned ? null : { text: 'Use the override keypad', sub: this.relays.every((r) => r.state === 'locked') ? 'Relays locked' : 'Relays offline' }),
        can: () => !this.bossSummoned,
        use: () => this.modal(this.keypadUi()),
      });
    }
    if (id.startsWith('relay')) {
      const glow = new THREE.Mesh(new THREE.SphereGeometry(0.16, 10, 8), new THREE.MeshBasicMaterial({ color: new THREE.Color(0.2, 0.2, 0.2) }));
      glow.position.set(m.i + 0.5, 3.0, m.j + 0.5);
      this.group.add(glow);
      const r = { id, x: m.i + 0.5, z: m.j + 0.5, t: 0, state: 'idle' as const, glow } as EasterEggs['relays'][number];
      this.relays.push(r);
      g.interact.add({
        x: r.x, z: r.z, r: 1.8, hold: 0.5, priority: 0.5,
        label: () => (r.state === 'idle' ? (g.powerOn ? { text: 'Energise the relay pylon', sub: 'Then hold the area for 30 s' } : { text: 'Relay pylon', sub: 'Requires power' }) : null),
        can: () => r.state === 'idle' && g.powerOn && !this.relays.some((q) => q.state === 'charging'),
        use: () => {
          r.state = 'charging'; r.t = 0;
          audio.play('ui_powerOn', { pos: { x: r.x, y: 2, z: r.z }, vol: 0.8, priority: 9 });
          bus.emit('message', { text: 'RELAY CHARGING', sub: 'Stay close — they’re coming', duration: 3, color: '#4ff0e8' });
          g.rounds.surge += 8 + g.rounds.round;
          if (g.rounds.state !== 'active') g.rounds.startRound(g.rounds.round + 1);
        },
      });
    }
  }

  // ---------------------------------------------------------------- modals
  private modal(el: HTMLElement) { this.g.onModal?.(el); }
  private closeModal() { this.g.onModal?.(null); }

  private paper(title: string, body: string): HTMLElement {
    const scr = h('div', { class: 'screen dim', style: 'align-items:center;justify-content:center' },
      h('div', { class: 'note-paper' }, h('h3', null, title), h('div', { style: 'white-space:pre-wrap;font-size:16px' }, body)),
      h('div', { class: 'txt', style: 'margin-top:8px' }, 'Tap anywhere to close'));
    scr.addEventListener('click', () => this.closeModal());
    return scr;
  }

  /** Radio tuning mini-UI: drag around the dial to set 3.00–12.00, then transmit. */
  private dialUi(): HTMLElement {
    let val = 3 + Math.random() * 9;
    const readout = h('div', { class: 'dial-readout' }, val.toFixed(2));
    const needle = h('div', { class: 'needle' });
    const face = h('div', { class: 'dial-face' }, needle);
    const draw = () => { readout.textContent = val.toFixed(2); needle.style.transform = `rotate(${(val - 3) / 9 * 300 - 150 + 180}deg)`; };
    draw();
    let lastA: number | null = null;
    let tick = 0;
    const onMove = (e: PointerEvent) => {
      const r = face.getBoundingClientRect();
      const a = Math.atan2(e.clientY - (r.top + r.height / 2), e.clientX - (r.left + r.width / 2));
      if (lastA !== null) {
        let d = a - lastA; if (d > Math.PI) d -= Math.PI * 2; if (d < -Math.PI) d += Math.PI * 2;
        val = Math.max(3, Math.min(12, val + d * 0.9));
        draw();
        tick += Math.abs(d);
        if (tick > 0.25) { tick = 0; audio.play('ui_tune', { bus: 'ui', vol: 0.4 }); }
      }
      lastA = a;
    };
    face.addEventListener('pointerdown', (e) => { lastA = null; face.setPointerCapture(e.pointerId); onMove(e); });
    face.addEventListener('pointermove', (e) => { if (e.buttons || e.pointerType === 'touch') onMove(e); });
    face.addEventListener('pointerup', () => { lastA = null; });
    const fine = (d: number) => h('button', { class: 'btn small', onclick: () => { val = Math.max(3, Math.min(12, val + d)); draw(); audio.play('ui_tune', { bus: 'ui', vol: 0.4 }); } }, (d > 0 ? '+' : '−') + Math.abs(d).toFixed(2));
    return h('div', { class: 'screen dim', style: 'align-items:center;justify-content:center' },
      h('div', { class: 'h2' }, 'THEATER RADIO CONSOLE'),
      h('div', { class: 'dial-ui' },
        face, readout,
        h('div', { style: 'display:flex;gap:6px' }, fine(-0.05), fine(+0.05)),
        h('div', { style: 'display:flex;gap:8px' },
          h('button', { class: 'btn primary', onclick: () => {
            if (Math.abs(val - parseFloat(this.freq)) < 0.051) {
              this.closeModal();
              this.tuned = true;
              audio.play('ui_eeStep', { bus: 'ui' });
              bus.emit('message', { text: '…YOU ARE ON MY BAND…', sub: 'Hale’s voice crawls out of the static — and seven chips come looking for you', duration: 4, color: '#e2392e' });
              setTimeout(() => this.summonBoss(), 3500);
            } else {
              audio.play('ui_denied', { bus: 'ui' });
              readout.textContent = 'STATIC';
            }
          } }, 'Transmit'),
          h('button', { class: 'btn', onclick: () => this.closeModal() }, 'Leave'))));
  }

  private keypadUi(): HTMLElement {
    let code = '';
    const disp = h('div', { class: 'dial-readout' }, '____');
    const pad = h('div', { class: 'keypad' });
    const upd = () => { disp.textContent = (code + '____').slice(0, 4); };
    for (const k of ['1', '2', '3', '4', '5', '6', '7', '8', '9', 'C', '0', '⏎']) {
      pad.appendChild(h('button', { onclick: () => {
        audio.play('ui_keypad', { bus: 'ui', vol: 0.6 });
        if (k === 'C') code = '';
        else if (k === '⏎') {
          const relaysOk = this.relays.length > 0 && this.relays.every((r) => r.state === 'locked');
          if (code === this.digits.join('') && relaysOk) {
            this.codeOk = true;
            this.closeModal();
            audio.play('ui_eeStep', { bus: 'ui' });
            bus.emit('message', { text: 'OVERRIDE ACCEPTED', sub: 'Something on the roof wakes up', duration: 4, color: '#e2392e' });
            this.progress();
            setTimeout(() => this.summonBoss(), 3000);
            return;
          }
          audio.play('ui_alarm', { bus: 'ui', vol: 0.6 });
          disp.textContent = relaysOk ? 'DENIED' : 'NO RELAY';
          code = '';
          return;
        } else if (code.length < 4) code += k;
        upd();
      } }, k));
    }
    return h('div', { class: 'screen dim', style: 'align-items:center;justify-content:center' },
      h('div', { class: 'h2' }, 'OVERRIDE KEYPAD'),
      h('div', { class: 'dial-ui' }, disp, pad, h('button', { class: 'btn small', onclick: () => this.closeModal() }, 'Leave')));
  }

  // ---------------------------------------------------------------- bosses
  private summonBoss() {
    if (this.bossSummoned) return;
    const g = this.g;
    this.bossSummoned = true;
    const sp = g.world.grid.markers.find((m) => m.id === 'bossSpawn');
    const x = sp ? sp.i + 0.5 : g.player.pos.x + 6, z = sp ? sp.j + 0.5 : g.player.pos.z;
    g.rounds.paused = true;
    g.zombies.chipTint = 1;
    const boss = this.mapId === 'station' ? new MotherTransmitter(g, x, z) : new Warden(g, x, z);
    boss.onDefeated = () => this.victory();
    g.boss = boss;
    g.cutscenes.playBoss(boss);
    this.progress();
  }

  private victory() {
    const g = this.g;
    this.completed = true;
    g.rounds.paused = false;
    g.zombies.chipTint = 0;
    const p = g.player;
    // reward: every perk free (ignores the cap) + free upgrade of the current weapon
    for (const id of Object.keys(PERKS) as PerkId[]) if (!p.perks.has(id)) g.objects.grantPerk(id);
    const w = g.weapons.current;
    if (w && !w.upgraded) { w.upgrade(); g.weapons.vm.setWeapon(w.def.id, true); bus.emit('weaponChanged', {}); }
    const key = this.mapId + ':main';
    if (!save.eeDone.includes(key)) { save.eeDone.push(key); persist(); }
    const title = this.mapId === 'station' ? 'SIGNAL CUT' : this.mapId === 'grounds' ? 'LIGHTS OUT' : 'DEAD AIR';
    bus.emit('message', { text: title, sub: 'Every tonic is yours. Your weapon has been rewired.', duration: 6, color: '#4ff0e8' });
    setTimeout(() => { g.boss?.dispose(); g.boss = null; }, 9000);
    if (this.mapId === 'station') setTimeout(() => this.modal(this.endingCredits()), 6500);
    this.progress();
  }

  private endingCredits(): HTMLElement {
    const scr = h('div', { class: 'screen solid', style: 'align-items:center;justify-content:center;text-align:center' },
      h('div', { class: 'title-logo', style: 'font-size:clamp(30px,9vh,56px)' }, 'SIGNAL CUT'),
      h('div', { class: 'txt', style: 'max-width:520px;margin:10px 0 14px;white-space:pre-wrap' },
        'The Mother Transmitter falls silent. Hale’s voice goes out with it — and so does the Chorus.\n\nAcross the valley, every copper chip goes dark at once. The Tethered do not stop. Without a voice to follow, they are only… quiet.\n\nPROJECT TETHER — TERMINATED\nHalcyon Signal Corps: 0 survivors · 1 witness'),
      h('div', { class: 'txt', style: 'opacity:.7;font-size:12px' }, 'TETHERED · generated entirely in code · thank you for playing'),
      h('button', { class: 'btn primary', style: 'margin-top:14px', onclick: () => this.closeModal() }, 'Keep fighting (endless rounds)'));
    return scr;
  }

  // ---------------------------------------------------------------- grounds: the vigil
  private static VIGIL = 45;
  private startVigil(x: number, z: number) {
    const g = this.g;
    audio.play('ui_flare', { pos: { x, y: 1.5, z }, vol: 1, priority: 10 });
    const mat = new THREE.SpriteMaterial({ color: new THREE.Color(3.2, 0.9, 0.5), transparent: true, depthWrite: false, blending: THREE.AdditiveBlending, fog: false, map: flareTex() });
    const sprite = new THREE.Sprite(mat);
    sprite.scale.setScalar(3);
    sprite.position.set(x, 2, z);
    this.group.add(sprite);
    this.vigil = { t: 0, age: 0, x, z, sprite, arcT: 0 };
    const bc = g.world.setpieces.get('beacon') as { target: number; flicker: number } | undefined;
    if (bc) { bc.target = 0.45; bc.flicker = 2; }
    g.rounds.surge += 14 + g.rounds.round * 2;
    if (g.rounds.state !== 'active') g.rounds.startRound(g.rounds.round + 1);
    bus.emit('message', { text: 'THE FLARE IS UP', sub: `Hold the ground under the tower — ${EasterEggs.VIGIL} s`, duration: 4, color: '#e8823a' });
    this.progress();
  }

  private updateVigil(dt: number) {
    const v = this.vigil!;
    const g = this.g, p = g.player.pos;
    const near = Math.hypot(p.x - v.x, p.z - v.z) < 11 && !g.player.downed;
    v.t = Math.max(0, v.t + (near ? dt : -dt * 0.5));
    const k = v.t / EasterEggs.VIGIL;
    // the flare climbs over the tower, then drifts down as it burns
    const lm = g.world.def.landmark;
    const tx = lm?.x ?? v.x, tz = lm?.z ?? v.z - 10, top = (lm?.y ?? 30) + 6;
    v.age += dt;
    const climb = Math.min(1, v.age * 0.5 + 0.25);
    const y = groundY(v.x, v.z) + 2 + (top - 2) * climb - Math.max(0, k - 0.15) * 14;
    v.sprite.position.set(v.x + (tx - v.x) * climb + Math.sin(g.time * 0.7) * 0.6, y, v.z + (tz - v.z) * climb);
    v.sprite.scale.setScalar(5 + Math.sin(g.time * 23) * 0.6);
    v.arcT -= dt;
    if (v.arcT <= 0) {
      v.arcT = 0.12;
      g.fx.flash(v.sprite.position.x, Math.min(y, 18), v.sprite.position.z, 14 + Math.random() * 6, 0xff5a30);
    }
    if (Math.random() < dt * 3) bus.emit('eeProgress', { text: near ? `HOLD THE TOWER — ${Math.ceil(EasterEggs.VIGIL - v.t)}s` : `GET BACK UNDER THE TOWER! (${Math.ceil(EasterEggs.VIGIL - v.t)}s)` });
    if (v.t >= EasterEggs.VIGIL) this.lightsOut();
  }

  private lightsOut() {
    const g = this.g;
    const v = this.vigil!;
    this.group.remove(v.sprite);
    (v.sprite.material as THREE.SpriteMaterial).dispose();
    this.vigil = null;
    this.blackout = true;
    const bc = g.world.setpieces.get('beacon') as { target: number; level: number } | undefined;
    if (bc) { bc.target = 0; bc.level = 0; }
    audio.play('ui_puKill', { bus: 'ui', vol: 1 });
    g.zombies.killAll((z) => !z.boss);
    g.rounds.surge = 0;
    this.victory();
    setTimeout(() => bus.emit('message', { text: 'NOBODY IS STEERING', sub: 'Blinded, Hale loses the Chorus for a moment. It will find him again — inside.', duration: 5, color: '#4fa8ff' }), 6500);
  }

  // ---------------------------------------------------------------- update
  update(dt: number) {
    const g = this.g, p = g.player.pos;
    const t = g.time;
    if (this.vigil) this.updateVigil(dt);
    if (this.flareMarker) {
      const ready = this.flareGun && this.bells.size >= 3 && g.powerOn && !this.vigil && !this.blackout;
      this.flareMarker.visible = ready;
      if (ready) (this.flareMarker.material as THREE.MeshBasicMaterial).opacity = 0.22 + Math.sin(t * 3) * 0.1;
      if (this.mapId === 'grounds' && g.powerOn !== this.lastPower) { this.lastPower = g.powerOn; this.progress(); }
    }
    for (const it of this.items.values()) if (it.glow && !it.taken) {
      const k = 0.6 + Math.sin(t * 3 + it.m.i) * 0.4;
      (it.glow.material as THREE.MeshBasicMaterial).color.setScalar(k * 2.2);
    }
    // relays
    for (const r of this.relays) {
      const mat = r.glow.material as THREE.MeshBasicMaterial;
      if (r.state === 'locked') { mat.color.setRGB(0.6, 2.4, 2.6); continue; }
      if (r.state === 'idle') { mat.color.setScalar(g.powerOn ? 0.5 + Math.sin(t * 2) * 0.2 : 0.15); continue; }
      const near = Math.hypot(p.x - r.x, p.z - r.z) < 7 && !g.player.downed;
      r.t += near ? dt : -dt * 0.5;
      r.t = Math.max(0, r.t);
      const f = r.t / 30;
      mat.color.setRGB(2.4 * f + 0.4, 1.4 * f + 0.2, 0.2);
      this.relayArcT -= dt;
      if (this.relayArcT <= 0) {
        this.relayArcT = 0.25;
        const top = new THREE.Vector3(r.x, 3.0, r.z);
        g.fx.arc(jagged(top, new THREE.Vector3(r.x + (Math.random() - 0.5) * 3, 0.2, r.z + (Math.random() - 0.5) * 3), 8, 0.3), 0.15, 0.03, 0x80f0ff);
      }
      if (!near && Math.random() < dt * 2) bus.emit('eeProgress', { text: `RELAY ${r.id.slice(5)}: get back to the pylon! (${Math.ceil(30 - r.t)}s)` });
      else if (Math.random() < dt * 4) bus.emit('eeProgress', { text: `RELAY ${r.id.slice(5)} CHARGING — ${Math.ceil(30 - r.t)}s` });
      if (r.t >= 30) {
        r.state = 'locked';
        audio.play('ui_eeStep', { bus: 'ui' });
        const n = this.relays.filter((q) => q.state === 'locked').length;
        bus.emit('message', { text: `RELAY ${n}/3 LOCKED`, duration: 2.5, color: '#4ff0e8' });
        this.progress();
      }
    }
    g.boss?.update(dt);
  }

  private progress() {
    let text = '';
    if (this.completed) text = this.mapId === 'station' ? 'SIGNAL CUT ✓' : this.mapId === 'grounds' ? 'LIGHTS OUT ✓' : 'DEAD AIR ✓';
    else if (this.bossSummoned) text = '';
    else if (this.mapId === 'ravenmoor') {
      if (this.valves > 0 && !this.valvesInstalled) text = `Radio valves ${this.valves}/3`;
      else if (this.valvesInstalled && !this.tuned) text = 'The console waits for a frequency';
    } else if (this.mapId === 'grounds') {
      const g = this.g;
      if (this.vigil || this.blackout) text = '';
      else if (this.flareGun && this.bells.size < 3) text = `Ring the coffin bells in the graveyard (${this.bells.size}/3)`;
      else if (this.flareGun && !g.powerOn) text = 'Turn on the power — the switch is on the groundskeeper’s shed';
      else if (this.flareGun) text = 'Fire the flare from the red marker on the asylum steps';
      else if (this.bells.size === 3) text = 'The tower is listening… the pilot had something bright';
      else if (this.bells.size > 0) text = `Coffin bells ${this.bells.size}/3`;
    } else if (this.mapId === 'station') {
      const locked = this.relays.filter((r) => r.state === 'locked').length;
      if (locked > 0 && locked < 3) text = `Relays ${locked}/3 locked`;
      else if (locked === 3 && !this.codeOk) text = 'Relays locked — the keypad awaits a code';
    }
    bus.emit('eeProgress', { text });
  }

  summary(): string {
    if (this.completed) return this.mapId === 'station' ? 'Signal Cut — complete' : this.mapId === 'grounds' ? 'Lights Out — complete' : 'Dead Air — complete';
    if (this.mapId === 'grounds') return `${this.bells.size}/3 bells${this.flareGun ? ', flare pistol' : ''}${this.vigil ? ', vigil' : ''}`;
    if (this.bossSummoned) return 'Boss reached';
    if (this.mapId === 'station') return `${this.relays.filter((r) => r.state === 'locked').length}/3 relays${this.codeOk ? ', code' : ''}`;
    return `${this.valves}/3 valves${this.valvesInstalled ? ', installed' : ''}${this.tuned ? ', tuned' : ''}`;
  }

  dispose() {
    this.g.world.group.remove(this.group);
    this.g.boss?.dispose();
    this.g.boss = null;
  }
}

void torus;

let flareT: THREE.Texture | null = null;
function flareTex(): THREE.Texture {
  if (flareT) return flareT;
  const c = document.createElement('canvas');
  c.width = c.height = 64;
  const g = c.getContext('2d')!;
  const grd = g.createRadialGradient(32, 32, 0, 32, 32, 32);
  grd.addColorStop(0, 'rgba(255,255,255,1)'); grd.addColorStop(0.2, 'rgba(255,255,255,0.6)'); grd.addColorStop(1, 'rgba(255,255,255,0)');
  g.fillStyle = grd; g.fillRect(0, 0, 64, 64);
  flareT = new THREE.CanvasTexture(c);
  return flareT;
}
