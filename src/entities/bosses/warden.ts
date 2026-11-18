import * as THREE from 'three';
import { Boss, type BossPart } from './boss';
import type { Game } from '../../game';
import { BOSS } from '../../config/enemies';
import { audio } from '../../audio/audioEngine';
import { bus } from '../../core/events';
import { clamp, wrapAngle, rand } from '../../core/math';
import { rbox, cyl, sphere, compose, M, box, lathe } from '../../render/geometryKit';

type WState = 'intro' | 'walk' | 'windup' | 'charge' | 'stunned' | 'swipe' | 'screech' | 'dying';

/**
 * THE WARDEN — Ravenmoor's director, a towering figure crowned with dozens of chips.
 * Phase 1: stalks and makes telegraphed charges (stunned after each). Phase 2 (<50%):
 * adds a screech that jams the HUD and summons runners. The crown chips are critical hits.
 */
export class Warden extends Boss {
  private state: WState = 'intro';
  private st = 0;
  private yaw = 0;
  private cdCharge = 4;
  private cdScreech = 8;
  private chargeDir = new THREE.Vector2();
  private hit = false;
  private parts: Record<string, THREE.Object3D> = {};
  private crown: THREE.Mesh[] = [];
  private crownMat: THREE.MeshBasicMaterial;
  private walkPhase = 0;
  private S = 1.75;
  private tmp = new THREE.Vector3();
  private flowDir = { x: 0, z: 0 };

  constructor(g: Game, x: number, z: number) {
    super(g, 'The Warden', BOSS.warden.hp + BOSS.warden.hpPerRound * g.rounds.round);
    this.pos.set(x, 0, z);
    const coat = this.mat(0x1e1c1a, { roughness: 0.9 });
    const skin = this.mat(0x8a8274, { roughness: 0.7 });
    const iron = this.mat(0x3a3836, { metalness: 0.7, roughness: 0.4 });
    const copper = this.mat(0xb06a30, { metalness: 0.8, roughness: 0.35 });
    this.crownMat = new THREE.MeshBasicMaterial({ color: new THREE.Color(3, 0.6, 0.5) });
    const mk = (geo: THREE.BufferGeometry, m: THREE.Material) => { const mesh = new THREE.Mesh(geo, m); mesh.frustumCulled = false; return mesh; };
    const root = new THREE.Group();
    const pelvis = new THREE.Group(); pelvis.position.y = 1.0;
    pelvis.add(mk(compose([[rbox(0.42, 0.3, 0.3, 0.08), M(0, 0, 0)], [lathe([[0.26, 0], [0.34, -0.5], [0.42, -0.95], [0, -0.95]], 10), M(0, 0, 0)]]), coat));
    const torso = new THREE.Group(); torso.position.y = 0.12;
    torso.add(mk(compose([[rbox(0.5, 0.75, 0.32, 0.12), M(0, 0.38, 0)], [rbox(0.62, 0.18, 0.34, 0.08), M(0, 0.72, 0)],
      [box(0.08, 0.6, 0.02), M(0, 0.38, 0.165), 0x3a0a08], [cyl(0.07, 0.08, 0.14, 8), M(0, 0.86, 0), 0x8a8274]]), coat));
    const head = new THREE.Group(); head.position.y = 0.92;
    head.add(mk(compose([[sphere(0.15, 12, 10), M(0, 0.15, 0, 0, 0, 0, 0.85, 1.2, 0.95)], [rbox(0.16, 0.08, 0.12, 0.03), M(0, 0.02, 0.05)],
      [sphere(0.03, 6, 5), M(-0.05, 0.18, 0.12), 0x200404], [sphere(0.03, 6, 5), M(0.05, 0.18, 0.12), 0x200404],
      [box(0.1, 0.02, 0.03), M(0, 0.06, 0.13), 0x0a0404]]), skin));
    // crown of chips
    const crownRing = new THREE.Group(); crownRing.position.y = 0.3;
    const housing = compose([[rbox(0.06, 0.04, 0.05, 0.008), null, 0xb06a30], [cyl(0.008, 0.008, 0.045, 6), M(0, 0.03, 0), 0x666666]]);
    const glowGeo = new THREE.SphereGeometry(0.018, 6, 4);
    for (let k = 0; k < 18; k++) {
      const a = (k / 18) * Math.PI * 2;
      const r = 0.15 + (k % 2) * 0.02;
      const h = mk(housing, copper);
      h.position.set(Math.cos(a) * r, (k % 3) * 0.03, Math.sin(a) * r);
      h.rotation.set(0, -a, 0.5);
      crownRing.add(h);
      const gl = mk(glowGeo, this.crownMat);
      gl.position.set(Math.cos(a) * r, 0.045 + (k % 3) * 0.03, Math.sin(a) * r);
      crownRing.add(gl);
      this.crown.push(gl);
    }
    head.add(crownRing);
    const arm = (side: number) => {
      const sh = new THREE.Group(); sh.position.set(side * 0.33, 0.68, 0);
      sh.add(mk(compose([[rbox(0.13, 0.62, 0.13, 0.05), M(0, -0.3, 0)]]), coat));
      const el = new THREE.Group(); el.position.y = -0.62;
      el.add(mk(compose([[rbox(0.1, 0.6, 0.1, 0.04), M(0, -0.3, 0)], [rbox(0.13, 0.16, 0.06, 0.02), M(0, -0.66, 0)],
        ...[-1, 0, 1].map((f) => [box(0.018, 0.2, 0.018), M(f * 0.04, -0.8, 0.02, 0, 0.3)] as [THREE.BufferGeometry, THREE.Matrix4, number?])]), skin));
      sh.add(el);
      return { sh, el };
    };
    const L = arm(-1), R = arm(1);
    const leg = (side: number) => {
      const hp = new THREE.Group(); hp.position.set(side * 0.13, -0.05, 0);
      hp.add(mk(compose([[rbox(0.16, 0.5, 0.16, 0.06), M(0, -0.25, 0)]]), coat));
      const kn = new THREE.Group(); kn.position.y = -0.5;
      kn.add(mk(compose([[rbox(0.13, 0.48, 0.13, 0.05), M(0, -0.24, 0)], [rbox(0.14, 0.08, 0.28, 0.03), M(0, -0.48, 0.06), 0x1a1612]]), iron));
      hp.add(kn);
      return { hp, kn };
    };
    const LL = leg(-1), RL = leg(1);
    torso.add(head, L.sh, R.sh);
    pelvis.add(torso, LL.hp, RL.hp);
    root.add(pelvis);
    root.scale.setScalar(this.S);
    this.group.add(root);
    this.parts = { root, pelvis, torso, head, armL: L.sh, armR: R.sh, elL: L.el, elR: R.el, legL: LL.hp, legR: RL.hp, knL: LL.kn, knR: RL.kn, crown: crownRing };
    this.spheres = [{ c: new THREE.Vector3(), r: 0.32 * this.S * 0.5, part: 'crit' }, { c: new THREE.Vector3(), r: 0.18 * this.S, part: 'body' }];
    this.capsules = [
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.3 * this.S, part: 'body' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.12 * this.S, part: 'body' },
      { a: new THREE.Vector3(), b: new THREE.Vector3(), r: 0.12 * this.S, part: 'body' },
    ];
    this.yaw = Math.atan2(g.player.pos.x - x, g.player.pos.z - z);
    audio.play('z_wardenRoar', { pos: { x, y: 3, z }, vol: 1, priority: 10, refDist: 10 });
    g.fx.flash(x, 3, z, 40, 0xff4030);
    g.fx.electric(x, 1.5, z, 40, 0xff4030);
  }

  center() { return this.tmp.set(this.pos.x, 2.4, this.pos.z); }

  protected onHurt(_a: number, part: BossPart) {
    if (part === 'crit') for (let k = 0; k < 2; k++) this.g.fx.sparks(this.spheres[0].c.x, this.spheres[0].c.y, this.spheres[0].c.z, 0, 1, 0, 6, 0xff8060, 3);
    if (this.phase === 1 && this.hp < this.maxHp * 0.5) {
      this.phase = 2;
      this.setState('screech');
      bus.emit('message', { text: 'THE WARDEN SCREAMS', sub: 'The broadcast jams your senses', duration: 2.5, color: '#e2392e' });
    }
  }

  private setState(s: WState) { this.state = s; this.st = 0; this.hit = false; }

  update(dt: number) {
    this.time += dt;
    this.st += dt;
    const g = this.g, p = g.player.pos;
    const dx = p.x - this.pos.x, dz = p.z - this.pos.z;
    const dist = Math.hypot(dx, dz);
    const targetYaw = Math.atan2(dx, dz);
    const turn = (rate: number) => { this.yaw += wrapAngle(targetYaw - this.yaw) * Math.min(1, rate * dt); };
    const grid = g.world.grid;
    let moveSpeed = 0;
    const P = this.parts;
    // defaults
    let armL = -0.6, armR = -0.6, elbow = -0.6, lean = 0.25, crouch = 0;
    this.cdCharge -= dt; this.cdScreech -= dt;
    const targetable = !g.player.downed && g.invuln <= 0;
    switch (this.state) {
      case 'intro':
        crouch = Math.max(0, 1 - this.st) * 0.5;
        armL = armR = -2.6 * Math.min(1, this.st);
        turn(3);
        if (this.st > 2.4) this.setState('walk');
        break;
      case 'walk': {
        turn(2.5);
        moveSpeed = BOSS.warden.walkSpeed * (this.phase === 2 ? 1.25 : 1);
        if (dist < 2.6 && targetable) { this.setState('swipe'); audio.play('z_attack', { pos: this.center(), vol: 1, rate: 0.6, priority: 8 }); }
        else if (this.cdCharge <= 0 && dist > 4 && dist < 18 && grid.los(this.pos.x, this.pos.z, p.x, p.z)) this.setState('windup');
        else if (this.phase === 2 && this.cdScreech <= 0) this.setState('screech');
        break;
      }
      case 'windup':
        turn(5);
        crouch = Math.min(1, this.st / 0.9) * 0.6;
        armL = armR = 0.6; lean = 0.7;
        if (this.st > 0.3 && this.st < 0.35) audio.play('z_wardenRoar', { pos: this.center(), vol: 1, priority: 9, rate: 1.2 });
        if (this.st > 0.95) {
          this.chargeDir.set(Math.sin(this.yaw), Math.cos(this.yaw));
          this.setState('charge');
        }
        break;
      case 'charge': {
        lean = 0.9; armL = armR = 0.9;
        const sp = BOSS.warden.chargeSpeed;
        const nx = this.pos.x + this.chargeDir.x * sp * dt, nz = this.pos.z + this.chargeDir.y * sp * dt;
        const blocked = !grid.walkable(Math.floor(nx + this.chargeDir.x * 0.6), Math.floor(nz + this.chargeDir.y * 0.6));
        if (!blocked) { this.pos.x = nx; this.pos.z = nz; }
        this.walkPhase += dt * 16;
        if (Math.random() < 0.6) g.fx.dust(this.pos.x, 0.05, this.pos.z, 0, 1, 0, 2, 0x6a6058);
        if (!this.hit && dist < 1.8 && targetable) {
          this.hit = true;
          g.damagePlayer(BOSS.warden.meleeDamage, this.pos.x, this.pos.z);
          g.player.vel.x += this.chargeDir.x * 9; g.player.vel.y += this.chargeDir.y * 9;
          g.player.shake = 1.2;
        }
        if (blocked || this.st > 1.8) {
          if (blocked) { g.player.shake = Math.max(g.player.shake, 0.8); audio.play('imp_explosion', { pos: this.center(), vol: 0.6, rate: 0.6, priority: 7 }); g.fx.dust(this.pos.x + this.chargeDir.x, 1.5, this.pos.z + this.chargeDir.y, -this.chargeDir.x, 0, -this.chargeDir.y, 30); }
          this.setState('stunned');
          this.cdCharge = this.phase === 2 ? 5 : 7;
        }
        break;
      }
      case 'stunned':
        crouch = 0.4; armL = armR = 0.3; lean = 0.6;
        if (Math.random() < dt * 8) g.fx.electric(this.spheres[0].c.x, this.spheres[0].c.y, this.spheres[0].c.z, 3, 0xff6040);
        if (this.st > 1.7) this.setState('walk');
        break;
      case 'swipe': {
        turn(4);
        const k = this.st / 0.65;
        armR = k < 1 ? -0.6 - k * 2.2 : -2.8 + clamp((this.st - 0.65) / 0.15, 0, 1) * 3.2;
        elbow = k < 1 ? -1.2 * k : -0.2;
        if (!this.hit && this.st > 0.72) {
          this.hit = true;
          if (dist < 3.2 && targetable) g.damagePlayer(70, this.pos.x, this.pos.z);
        }
        if (this.st > 1.2) this.setState('walk');
        break;
      }
      case 'screech':
        armL = armR = -2.8; lean = -0.2;
        if (this.st < dt * 1.5) {
          audio.play('z_wardenScreech', { pos: this.center(), vol: 1, priority: 10, refDist: 12 });
          bus.emit('hudJam', { seconds: BOSS.warden.screechJam });
          g.r.fx.staticJam = 0.9;
          for (let k = 0; k < 4; k++) {
            const c = g.rounds.findFloorCell(5, 14);
            if (c) g.zombies.spawn('zombie', g.rounds.hp * 0.8, 'runner', c);
          }
        }
        if (this.st > 2.2) { this.cdScreech = rand(9, 13); this.setState('walk'); }
        break;
      case 'dying': break;
    }
    if (!this.alive) {
      this.deathT += dt;
      const f = clamp(this.deathT * 1.2, 0, 1);
      P.root.rotation.x = -f * 1.45;
      P.root.position.y = -clamp((this.deathT - 4) * 0.4, 0, 2);
      for (const c of this.crown) (c.material as THREE.MeshBasicMaterial).color.setScalar(Math.max(0, 1 - this.deathT));
      if (this.deathT < 1.2 && Math.random() < 0.5) g.fx.sparks(this.spheres[0].c.x, this.spheres[0].c.y, this.spheres[0].c.z, 0, 1, 0, 5, 0xff8060, 4);
      return;
    }
    // locomotion (flow field when no line of sight)
    if (moveSpeed > 0) {
      let mx = dx / (dist || 1), mz = dz / (dist || 1);
      if (!grid.los(this.pos.x, this.pos.z, p.x, p.z) && g.world.flow.direction(this.pos.x, this.pos.z, this.flowDir)) { mx = this.flowDir.x; mz = this.flowDir.z; }
      this.pos.x += mx * moveSpeed * dt; this.pos.z += mz * moveSpeed * dt;
      this.walkPhase += dt * moveSpeed * 2.2;
    }
    grid.collideCircle(this.pos, 0.7, (i, j) => !grid.walkable(i, j));
    // pose
    const wp = this.walkPhase;
    P.root.position.set(this.pos.x, 0, this.pos.z);
    P.root.rotation.set(0, this.yaw, 0);
    P.pelvis.position.y = 1.0 - crouch * 0.3 - Math.abs(Math.cos(wp)) * 0.05;
    P.torso.rotation.x = lean + Math.sin(this.time * 1.3) * 0.04;
    P.head.rotation.set(-lean * 0.5 + Math.sin(this.time * 2.1) * 0.1, Math.sin(this.time * 0.7) * 0.2, Math.sin(this.time * 1.7) * 0.08);
    P.armL.rotation.set(armL + Math.sin(wp) * 0.3, 0, 0.2);
    P.armR.rotation.set(armR - Math.sin(wp) * 0.3, 0, -0.2);
    P.elL.rotation.x = elbow; P.elR.rotation.x = elbow;
    P.legL.rotation.x = Math.sin(wp) * 0.6 - crouch * 0.5; P.legR.rotation.x = -Math.sin(wp) * 0.6 - crouch * 0.5;
    P.knL.rotation.x = Math.max(0, -Math.sin(wp + 0.5)) * 0.9 + crouch; P.knR.rotation.x = Math.max(0, Math.sin(wp + 0.5)) * 0.9 + crouch;
    P.crown.rotation.y = this.time * 0.6;
    const fl = this.state === 'stunned' ? (Math.random() < 0.5 ? 0.2 : 2.5) : 2 + Math.sin(this.time * 9) * 0.6;
    this.crownMat.color.setRGB(fl * 1.4, fl * 0.3, fl * 0.25);
    this.group.updateMatrixWorld(true);
    // hit shapes
    P.crown.getWorldPosition(this.spheres[0].c);
    this.spheres[0].r = 0.26 * this.S;
    P.head.getWorldPosition(this.spheres[1].c); this.spheres[1].c.y += 0.15 * this.S;
    P.pelvis.getWorldPosition(this.capsules[0].a);
    P.head.getWorldPosition(this.capsules[0].b);
    P.legL.getWorldPosition(this.capsules[1].a); this.capsules[1].b.copy(this.capsules[1].a).setY(0.1);
    P.legR.getWorldPosition(this.capsules[2].a); this.capsules[2].b.copy(this.capsules[2].a).setY(0.1);
    this.lightFromProbe();
  }

  protected die() {
    super.die();
    this.setState('dying');
    audio.play('z_bruteDeath', { pos: this.center(), vol: 1, rate: 0.7, priority: 10 });
    for (let k = 0; k < 4; k++) this.g.fx.electric(this.spheres[0].c.x, this.spheres[0].c.y, this.spheres[0].c.z, 15, 0xff6040);
  }
}
