import * as THREE from 'three';
import { getGunModel, buildHand, buildKnife, buildGrenade, buildBottle, animateUpgradedMaterials, type GunModel } from './weaponModels';
import type { ReloadStyle } from '../config/weapons';
import { damp, clamp, smoothstep } from '../core/math';

export interface VmState {
  ads: number;
  bobPhase: number;
  bobAmount: number;
  sprint: number;
  lookDX: number;
  lookDY: number;
  reload: { style: ReloadStyle; t: number; shells?: number } | null;
  swap: number;          // 0 up .. 1 fully lowered
  melee: number;         // -1 or 0..1
  action: number;        // -1 or 0..1 (pump / bolt cycle after a shot)
  throwT: number;        // -1 or 0..1 grenade throw
  cookT: number;         // -1 or 0..1 holding a grenade
  drink: number;         // -1 or 0..1
  drinkColor: number;
  downed: boolean;
  time: number;
}

/**
 * First-person viewmodel: gun + gloved hands + knife + grenade + tonic bottle in the
 * viewmodel scene, animated procedurally (sway, bob, sprint, ADS, recoil, reload, swap, melee).
 */
export class Viewmodel {
  readonly root = new THREE.Group();     // attached to vm camera
  private sway = new THREE.Group();
  private kickG = new THREE.Group();
  private gunHolder = new THREE.Group();
  gun: GunModel | null = null;
  private handR = buildHand(true);
  private handL = buildHand(false);
  private knife = buildKnife();
  private knifeArm = new THREE.Group();
  private nade = buildGrenade();
  private nadeArm = new THREE.Group();
  private bottle: THREE.Group | null = null;
  private bottleArm = new THREE.Group();
  private bottleColor = -1;
  readonly flash: THREE.Mesh;
  private flashT = 0;
  readonly hemi: THREE.HemisphereLight;
  readonly key: THREE.DirectionalLight;
  readonly flashLight: THREE.PointLight;
  private kick = 0;
  private kickRot = 0;
  private kickVel = 0;
  private swayX = 0;
  private swayY = 0;
  private partRest = new Map<THREE.Object3D, { p: THREE.Vector3; r: THREE.Euler; vis: boolean }>();
  scopeActive = false;
  currentId = '';

  constructor(private camera: THREE.PerspectiveCamera, scene: THREE.Scene, flashTex: THREE.Texture) {
    camera.add(this.root);
    this.root.scale.setScalar(1.15);
    this.root.add(this.sway);
    this.sway.add(this.kickG);
    this.kickG.add(this.gunHolder);
    this.hemi = new THREE.HemisphereLight(0xffffff, 0x222222, 1);
    this.key = new THREE.DirectionalLight(0xffe0c0, 0.6);
    this.key.position.set(0.5, 1, 0.3);
    this.flashLight = new THREE.PointLight(0xffb060, 0, 2.5, 2);
    scene.add(this.hemi, this.key);
    camera.add(this.flashLight);
    this.flashLight.position.set(0.1, -0.05, -0.6);
    const fm = new THREE.MeshBasicMaterial({ map: flashTex, transparent: true, blending: THREE.AdditiveBlending, depthWrite: false, color: new THREE.Color(2.2, 1.9, 1.5) });
    this.flash = new THREE.Mesh(new THREE.PlaneGeometry(1, 1), fm);
    this.flash.visible = false;
    this.flash.renderOrder = 10;
    // knife arm
    this.knifeArm.add(this.knife);
    const kh = buildHand(true);
    kh.position.set(0, 0, 0.02);
    this.knifeArm.add(kh);
    this.knifeArm.visible = false;
    this.root.add(this.knifeArm);
    this.nadeArm.add(this.nade);
    const nh = buildHand(false);
    nh.position.set(0, -0.03, 0.03);
    this.nadeArm.add(nh);
    this.nadeArm.visible = false;
    this.root.add(this.nadeArm);
    this.bottleArm.visible = false;
    this.root.add(this.bottleArm);
  }

  setWeapon(id: string, upgraded: boolean) {
    const key = id + (upgraded ? ':up' : '');
    if (key === this.currentId) return;
    this.currentId = key;
    if (this.gun) this.gunHolder.remove(this.gun.root);
    this.gun = getGunModel(id, upgraded);
    this.gunHolder.add(this.gun.root);
    this.gun.root.add(this.handR, this.handL, this.flash);
    this.handR.position.set(0.0, -0.035, 0.03);
    this.handR.rotation.set(0.45, -0.1, 0.05);
    this.partRest.clear();
    for (const p of Object.values(this.gun.parts)) {
      if (p) this.partRest.set(p, { p: p.position.clone(), r: p.rotation.clone(), vis: p.visible });
    }
  }

  fire(kick: number) {
    this.kickVel += kick * 9;
    this.kickRot += kick * 0.11;
    this.flashT = 0.045;
    if (this.gun) {
      this.flash.position.copy(this.gun.muzzle).add(new THREE.Vector3(0, 0, -0.04));
      const s = 0.12 + Math.random() * 0.08 + kick * 0.08;
      this.flash.scale.set(s, s, s);
      this.flash.rotation.z = Math.random() * 6.28;
    }
    this.flashLight.intensity = 6;
  }

  setLighting(r: number, g: number, b: number) {
    const k = 2.6;
    this.hemi.color.setRGB(Math.min(2.5, r * k + 0.32), Math.min(2.5, g * k + 0.3), Math.min(2.5, b * k + 0.28));
    this.hemi.groundColor.setRGB(r * 0.6 + 0.06, g * 0.6 + 0.06, b * 0.6 + 0.06);
    this.key.intensity = 0.9 + (r + g + b) * 0.9;
  }

  update(dt: number, s: VmState) {
    if (!this.gun) return;
    animateUpgradedMaterials(s.time);
    const gun = this.gun;
    // --- base pose: hip <-> ADS
    const ads = smoothstep(0, 1, s.ads);
    const hip = gun.hip;
    const tx = hip.x * (1 - ads);
    const ty = hip.y * (1 - ads) + (-gun.sightY) * ads;
    const tz = hip.z * (1 - ads) + (-gun.adsZ) * ads;
    // sway (lag behind look)
    this.swayX = damp(this.swayX, clamp(-s.lookDX * 2.2, -0.06, 0.06), 10, dt);
    this.swayY = damp(this.swayY, clamp(-s.lookDY * 2.2, -0.05, 0.05), 10, dt);
    const swayK = 1 - ads * 0.8;
    // bob
    const bobK = s.bobAmount * (1 - ads * 0.9);
    const bx = Math.cos(s.bobPhase) * 0.012 * bobK;
    const by = -Math.abs(Math.sin(s.bobPhase)) * 0.012 * bobK;
    const idle = Math.sin(s.time * 1.3) * 0.0025 * (1 - ads * 0.8);
    // sprint
    const sp = s.sprint;
    // swap / downed lowering
    const low = Math.max(s.swap, s.melee >= 0 ? 0.9 : 0, s.throwT >= 0 || s.cookT >= 0 ? 0.7 : 0, s.drink >= 0 ? 1 : 0);
    this.root.position.set(
      tx + bx + this.swayX * swayK + sp * 0.04,
      ty + by + idle + this.swayY * swayK - sp * 0.05 - low * 0.35,
      tz,
    );
    this.root.rotation.set(
      this.swayY * 2 * swayK - sp * 0.25 + low * 0.6,
      this.swayX * 2 * swayK + sp * 0.75,
      this.swayX * -1.2 * swayK + sp * 0.35,
    );
    // recoil spring
    this.kickVel += -this.kick * 220 * dt - this.kickVel * 18 * dt;
    this.kick += this.kickVel * dt;
    this.kickRot = damp(this.kickRot, 0, 12, dt);
    this.kickG.position.set(0, this.kick * 0.15, this.kick * 1);
    this.kickG.rotation.set(this.kickRot * (1 - ads * 0.6), 0, (Math.random() - 0.5) * this.kickRot * 0.2);
    // muzzle flash
    this.flashT -= dt;
    this.flash.visible = this.flashT > 0;
    this.flashLight.intensity = damp(this.flashLight.intensity, 0, 30, dt);
    // reset parts
    for (const [p, r] of this.partRest) { p.position.copy(r.p); p.rotation.copy(r.r); p.visible = r.vis; }
    // left hand default
    const L = this.handL;
    L.position.copy(gun.foreL);
    L.rotation.set(0.25, 0.55, -0.35);
    L.visible = true;
    // gun local pose (reload tilt etc.)
    gun.root.position.set(0, 0, 0);
    gun.root.rotation.set(0, 0, 0);
    if (s.reload) this.animateReload(s.reload.style, s.reload.t, s.reload.shells ?? 0);
    if (s.action >= 0) this.animateAction(s.action);
    // scope
    this.scopeActive = !!gun.scope && s.ads > 0.92 && !s.reload;
    this.gunHolder.visible = !this.scopeActive;
    // knife
    this.knifeArm.visible = s.melee >= 0;
    if (s.melee >= 0) {
      const t = s.melee;
      const swing = t < 0.15 ? -0.6 * (t / 0.15) : t < 0.45 ? -0.6 + 1.9 * ((t - 0.15) / 0.3) : 1.3 - (t - 0.45) * 1.5;
      this.knifeArm.position.set(0.18 - swing * 0.18, -0.12 - (t > 0.6 ? (t - 0.6) * 0.4 : 0), -0.32);
      this.knifeArm.rotation.set(-0.2, 0.6 - swing * 0.9, -0.9 + swing * 0.5);
    }
    // grenade
    this.nadeArm.visible = s.cookT >= 0 || s.throwT >= 0;
    if (this.nadeArm.visible) {
      if (s.throwT >= 0) {
        const t = s.throwT;
        const p = t < 0.3 ? t / 0.3 : 1;
        this.nadeArm.position.set(-0.12 + p * 0.08, -0.08 + p * 0.12 - (t > 0.4 ? (t - 0.4) * 0.8 : 0), -0.3 - p * 0.2);
        this.nadeArm.rotation.set(-0.5 - p * 1.2, 0.2, 0.2);
        this.nade.visible = t < 0.3;
      } else {
        this.nade.visible = true;
        this.nadeArm.position.set(-0.13, -0.1 + Math.sin(s.time * 6) * 0.004, -0.28);
        this.nadeArm.rotation.set(0.6, 0.3, 0.3);
      }
    }
    // tonic bottle
    if (s.drink >= 0) {
      if (this.bottleColor !== s.drinkColor) {
        if (this.bottle) this.bottleArm.remove(this.bottle);
        this.bottle = buildBottle(s.drinkColor);
        this.bottleColor = s.drinkColor;
        const glow = this.bottle.children.find((c) => ((c as THREE.Mesh).material as THREE.MeshStandardMaterial).emissiveIntensity > 1) as THREE.Mesh | undefined;
        if (glow) { const m = (glow.material as THREE.MeshStandardMaterial).clone(); m.emissive.setHex(s.drinkColor); glow.material = m; }
        this.bottleArm.add(this.bottle);
        const bh = buildHand(true);
        bh.position.set(0.02, 0.05, 0.03);
        bh.rotation.set(0, 0, Math.PI / 2);
        this.bottleArm.add(bh);
      }
      this.bottleArm.visible = true;
      const t = s.drink;
      const lift = t < 0.2 ? t / 0.2 : t > 0.85 ? 1 - (t - 0.85) / 0.15 : 1;
      const tilt = t > 0.25 && t < 0.8 ? Math.sin(((t - 0.25) / 0.55) * Math.PI) : 0;
      this.bottleArm.position.set(0.05, -0.32 + lift * 0.22 + tilt * 0.06, -0.3 + tilt * 0.08);
      this.bottleArm.rotation.set(-0.2 + tilt * 1.6, 0, -0.1);
    } else this.bottleArm.visible = false;
    void dt;
  }

  private animateReload(style: ReloadStyle, t: number, shells: number) {
    const gun = this.gun!;
    const root = gun.root, L = this.handL, P = gun.parts;
    const tiltIn = smoothstep(0, 0.15, t) * (1 - smoothstep(0.85, 1, t));
    root.rotation.z = tiltIn * 0.55;
    root.rotation.x = tiltIn * 0.15;
    root.position.y = -tiltIn * 0.03;
    const mag = P.mag;
    const lerp3 = (a: THREE.Vector3, b: THREE.Vector3, k: number) => L.position.lerpVectors(a, b, k);
    const below = gun.magPos.clone().add(new THREE.Vector3(-0.05, -0.25, 0.05));
    switch (style) {
      case 'mag': case 'drum': {
        if (mag) {
          const out = smoothstep(0.15, 0.32, t) * (1 - smoothstep(0.5, 0.68, t));
          mag.position.y -= out * 0.3;
          mag.visible = !(t > 0.32 && t < 0.5);
        }
        if (t > 0.1 && t < 0.75) {
          const k = t < 0.2 ? (t - 0.1) / 0.1 : t < 0.4 ? 1 - (t - 0.2) / 0.2 * 0 : 1;
          lerp3(gun.foreL, gun.magPos, Math.min(1, k));
          if (t > 0.3 && t < 0.5) lerp3(gun.magPos, below, Math.sin(((t - 0.3) / 0.2) * Math.PI));
          L.rotation.set(0.6, 0.3, -0.6);
        }
        const bolt = P.bolt ?? P.slide;
        if (bolt && t > 0.78 && t < 0.92) bolt.position.z += Math.sin(((t - 0.78) / 0.14) * Math.PI) * 0.05;
        break;
      }
      case 'clip': {
        if (mag) {
          mag.visible = t > 0.35 && t < 0.62;
          mag.position.y += (1 - smoothstep(0.35, 0.6, t)) * 0.12;
        }
        if (P.bolt && t > 0.15 && t < 0.3) P.bolt.position.z += 0.05;
        if (P.bolt && t > 0.62 && t < 0.72) P.bolt.position.z += 0.05 * (1 - (t - 0.62) / 0.1);
        if (t > 0.25 && t < 0.7) lerp3(gun.foreL, gun.magPos.clone().add(new THREE.Vector3(0, 0.1, 0)), Math.sin(((t - 0.25) / 0.45) * Math.PI));
        break;
      }
      case 'cylinder': {
        const c = P.cylinder;
        const open = smoothstep(0.1, 0.22, t) * (1 - smoothstep(0.78, 0.9, t));
        if (c) { c.position.x -= open * 0.04; c.rotation.z = open * 0.9; }
        root.rotation.z = tiltIn * 0.9;
        if (t > 0.3 && t < 0.75) lerp3(gun.foreL, gun.magPos, Math.sin(((t - 0.3) / 0.45) * Math.PI));
        break;
      }
      case 'pump': {
        // shell-by-shell; t is per shell progress
        root.rotation.z = 0.35;
        root.rotation.x = 0.12;
        const sh = P.shell;
        if (sh) { sh.visible = t < 0.6; sh.position.set(0, 0.0 - (1 - t) * 0.06, -0.05 + t * 0.04); }
        lerp3(gun.foreL, gun.magPos.clone().add(new THREE.Vector3(0, -0.05, 0)), Math.sin(t * Math.PI));
        void shells;
        break;
      }
      case 'break': {
        const b = P.barrels;
        const open = smoothstep(0.08, 0.2, t) * (1 - smoothstep(0.78, 0.9, t));
        if (b) b.rotation.x = -open * 0.6;
        const sh = P.shell;
        if (sh) { sh.visible = t > 0.4 && t < 0.7; sh.position.set(0, 0.04 + (1 - smoothstep(0.4, 0.65, t)) * 0.08, -0.03); }
        if (t > 0.3 && t < 0.75) lerp3(gun.foreL, gun.magPos.clone().add(new THREE.Vector3(0, 0.05, 0.05)), Math.sin(((t - 0.3) / 0.45) * Math.PI));
        break;
      }
      case 'belt': {
        const c = P.cover;
        const open = smoothstep(0.1, 0.22, t) * (1 - smoothstep(0.7, 0.82, t));
        if (c) c.rotation.x = -open * 1.2;
        if (mag) mag.visible = !(t > 0.25 && t < 0.55);
        root.rotation.z = tiltIn * 0.3;
        if (t > 0.2 && t < 0.75) lerp3(gun.foreL, gun.magPos, Math.sin(((t - 0.2) / 0.55) * Math.PI));
        break;
      }
      case 'bolt': {
        const bolt = P.bolt;
        const open = smoothstep(0.08, 0.18, t) * (1 - smoothstep(0.8, 0.9, t));
        if (bolt) { bolt.rotation.z = open * 1.2; bolt.position.z += open * 0.06; }
        if (t > 0.2 && t < 0.8) lerp3(gun.foreL, gun.magPos.clone().add(new THREE.Vector3(0.0, 0.06, 0)), 0.5 + 0.5 * Math.sin(t * 30) * 0.2);
        break;
      }
    }
  }

  /** Post-shot cycle: pump, bolt or slide. */
  private animateAction(t: number) {
    const P = this.gun!.parts;
    const k = Math.sin(Math.min(1, t) * Math.PI);
    if (P.pump) { P.pump.position.z += k * 0.08; this.handL.position.z += k * 0.08; }
    if (P.bolt && this.gun!.scope) { P.bolt.rotation.z = k * 1.1; P.bolt.position.z += k * 0.05; }
    if (P.slide && t < 0.5) P.slide.position.z += Math.sin(t * 2 * Math.PI) * 0.03;
  }
}
