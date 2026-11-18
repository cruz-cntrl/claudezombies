/**
 * WEAPON TUNING — every number that defines how a gun plays lives here.
 * Upgraded variants (The Rewirer) override fields from `base` with `upgraded`.
 * Damage values are per bullet / per pellet. Spread is in degrees (cone half-angle).
 */
export type WeaponClass =
  | 'pistol' | 'revolver' | 'smg' | 'rifle' | 'ar' | 'shotgun' | 'lmg' | 'sniper' | 'dmr' | 'launcher' | 'wonder';

export type ReloadStyle = 'mag' | 'cylinder' | 'pump' | 'break' | 'belt' | 'bolt' | 'clip' | 'drum';

export interface WeaponStats {
  damage: number;
  headMult: number;
  rpm: number;
  auto: boolean;
  mag: number;
  reserve: number;
  reloadTac: number;
  reloadEmpty: number;
  /** Shotguns: reload one shell per `reloadTac` seconds. */
  perShellReload?: boolean;
  pellets: number;
  spreadHip: number;
  spreadAds: number;
  recoilUp: number;     // degrees of camera kick per shot
  recoilSide: number;   // +/- random horizontal degrees
  kick: number;         // viewmodel kick amount (0..1)
  falloffStart: number; // metres
  falloffEnd: number;
  minDamageMult: number;
  penetration: number;  // extra targets pierced
  moveMult: number;
  adsZoom: number;      // FOV divisor while aiming
  adsTime: number;      // seconds to aim in
  /** Explosive projectile / rounds */
  splashRadius?: number;
  splashDamage?: number;
  projectile?: 'grenade' | 'arc';
  /** Signal Disruptor chain length */
  chain?: number;
}

export interface WeaponDef {
  id: string;
  name: string;
  upgradedName: string;
  cls: WeaponClass;
  reloadStyle: ReloadStyle;
  /** Wall-buy price (0 = not on walls). Ammo refill price is ammoCost. */
  cost: number;
  ammoCost: number;
  /** Relative chance from the Supply Crate (0 = never). */
  boxWeight: number;
  scope?: boolean;
  base: WeaponStats;
  upgraded: Partial<WeaponStats>;
  /** Short description for How-to-play / crate display */
  blurb: string;
}

const W = (d: WeaponDef) => d;

export const WEAPONS: Record<string, WeaponDef> = {
  warden: W({
    id: 'warden', name: 'M1 "Warden" Pistol', upgradedName: "Warden's Verdict", cls: 'pistol', reloadStyle: 'mag',
    cost: 0, ammoCost: 250, boxWeight: 0, blurb: 'Reliable sidearm.',
    base: { damage: 45, headMult: 2.5, rpm: 420, auto: false, mag: 8, reserve: 80, reloadTac: 1.3, reloadEmpty: 1.7,
      pellets: 1, spreadHip: 1.6, spreadAds: 0.25, recoilUp: 1.1, recoilSide: 0.5, kick: 0.45,
      falloffStart: 12, falloffEnd: 30, minDamageMult: 0.6, penetration: 0, moveMult: 1.05, adsZoom: 1.2, adsTime: 0.14 },
    upgraded: { damage: 140, mag: 12, reserve: 168, splashRadius: 1.6, splashDamage: 220, recoilUp: 1.4 },
  }),
  hollowpoint: W({
    id: 'hollowpoint', name: 'Hollowpoint .45', upgradedName: 'Hollowpoint: Judgement', cls: 'revolver', reloadStyle: 'cylinder',
    cost: 1000, ammoCost: 500, boxWeight: 6, blurb: 'Heavy revolver. Punches through.',
    base: { damage: 140, headMult: 3, rpm: 160, auto: false, mag: 6, reserve: 54, reloadTac: 2.4, reloadEmpty: 2.4,
      pellets: 1, spreadHip: 2.2, spreadAds: 0.2, recoilUp: 4.2, recoilSide: 1.2, kick: 1,
      falloffStart: 15, falloffEnd: 35, minDamageMult: 0.6, penetration: 1, moveMult: 1, adsZoom: 1.25, adsTime: 0.18 },
    upgraded: { damage: 340, reserve: 96, penetration: 3 },
  }),
  chatterbox: W({
    id: 'chatterbox', name: 'Chatterbox SMG', upgradedName: 'Chatterbox: Overdrive', cls: 'smg', reloadStyle: 'mag',
    cost: 1200, ammoCost: 600, boxWeight: 8, blurb: 'Fast-firing bullet hose.',
    base: { damage: 42, headMult: 2, rpm: 820, auto: true, mag: 32, reserve: 192, reloadTac: 1.8, reloadEmpty: 2.3,
      pellets: 1, spreadHip: 2.8, spreadAds: 0.9, recoilUp: 0.55, recoilSide: 0.45, kick: 0.35,
      falloffStart: 8, falloffEnd: 22, minDamageMult: 0.5, penetration: 0, moveMult: 1.05, adsZoom: 1.15, adsTime: 0.13 },
    upgraded: { damage: 95, mag: 50, reserve: 350 },
  }),
  typewriter: W({
    id: 'typewriter', name: 'Halcyon Typewriter', upgradedName: 'Typewriter: Final Draft', cls: 'smg', reloadStyle: 'drum',
    cost: 1500, ammoCost: 750, boxWeight: 7, blurb: 'Drum-fed. Writes a long letter.',
    base: { damage: 58, headMult: 2, rpm: 700, auto: true, mag: 50, reserve: 250, reloadTac: 2.6, reloadEmpty: 3.1,
      pellets: 1, spreadHip: 3.0, spreadAds: 1.0, recoilUp: 0.75, recoilSide: 0.6, kick: 0.45,
      falloffStart: 9, falloffEnd: 24, minDamageMult: 0.5, penetration: 0, moveMult: 0.97, adsZoom: 1.15, adsTime: 0.17 },
    upgraded: { damage: 120, mag: 100, reserve: 500 },
  }),
  fieldmarshal: W({
    id: 'fieldmarshal', name: 'Field Marshal', upgradedName: 'Field Marshal: Supreme Command', cls: 'rifle', reloadStyle: 'clip',
    cost: 1200, ammoCost: 600, boxWeight: 5, blurb: 'Semi-auto rifle. Eight-round clip, satisfying ping.',
    base: { damage: 135, headMult: 3, rpm: 320, auto: false, mag: 8, reserve: 128, reloadTac: 2.0, reloadEmpty: 1.8,
      pellets: 1, spreadHip: 2.4, spreadAds: 0.1, recoilUp: 2.4, recoilSide: 0.7, kick: 0.7,
      falloffStart: 30, falloffEnd: 60, minDamageMult: 0.8, penetration: 2, moveMult: 0.97, adsZoom: 1.35, adsTime: 0.2 },
    upgraded: { damage: 320, mag: 12, reserve: 192, penetration: 4 },
  }),
  ironside: W({
    id: 'ironside', name: 'Ironside', upgradedName: 'Ironside: Bulwark', cls: 'ar', reloadStyle: 'mag',
    cost: 0, ammoCost: 0, boxWeight: 6, blurb: 'Heavy automatic rifle. Hits like a truck.',
    base: { damage: 115, headMult: 2.5, rpm: 450, auto: true, mag: 20, reserve: 180, reloadTac: 2.3, reloadEmpty: 2.8,
      pellets: 1, spreadHip: 3.0, spreadAds: 0.4, recoilUp: 1.5, recoilSide: 0.8, kick: 0.7,
      falloffStart: 25, falloffEnd: 55, minDamageMult: 0.75, penetration: 2, moveMult: 0.92, adsZoom: 1.3, adsTime: 0.24 },
    upgraded: { damage: 240, mag: 40, reserve: 360, penetration: 3 },
  }),
  vanguard: W({
    id: 'vanguard', name: 'Vanguard', upgradedName: 'Vanguard: Spearhead', cls: 'ar', reloadStyle: 'mag',
    cost: 0, ammoCost: 0, boxWeight: 8, blurb: 'Balanced assault rifle.',
    base: { damage: 82, headMult: 2.5, rpm: 600, auto: true, mag: 30, reserve: 240, reloadTac: 2.0, reloadEmpty: 2.5,
      pellets: 1, spreadHip: 2.6, spreadAds: 0.45, recoilUp: 0.9, recoilSide: 0.55, kick: 0.5,
      falloffStart: 20, falloffEnd: 45, minDamageMult: 0.7, penetration: 1, moveMult: 0.97, adsZoom: 1.3, adsTime: 0.2 },
    upgraded: { damage: 180, mag: 45, reserve: 360, penetration: 2 },
  }),
  trench: W({
    id: 'trench', name: 'Trench Sweeper', upgradedName: 'Trench Sweeper: Scorched Earth', cls: 'shotgun', reloadStyle: 'pump',
    cost: 1500, ammoCost: 750, boxWeight: 6, blurb: 'Pump shotgun. Clears a doorway.',
    base: { damage: 42, headMult: 1.5, rpm: 72, auto: false, mag: 6, reserve: 54, reloadTac: 0.48, reloadEmpty: 0.48,
      perShellReload: true, pellets: 8, spreadHip: 5.5, spreadAds: 4.0, recoilUp: 5, recoilSide: 1.5, kick: 1,
      falloffStart: 5, falloffEnd: 14, minDamageMult: 0.25, penetration: 1, moveMult: 0.97, adsZoom: 1.1, adsTime: 0.2 },
    upgraded: { damage: 95, pellets: 10, mag: 8, reserve: 80, splashRadius: 1.2, splashDamage: 120 },
  }),
  coachgun: W({
    id: 'coachgun', name: 'Coachgun', upgradedName: 'Coachgun: Widowmaker', cls: 'shotgun', reloadStyle: 'break',
    cost: 0, ammoCost: 0, boxWeight: 6, blurb: 'Two barrels. No arguments.',
    base: { damage: 62, headMult: 1.5, rpm: 360, auto: false, mag: 2, reserve: 60, reloadTac: 1.9, reloadEmpty: 2.1,
      pellets: 10, spreadHip: 6, spreadAds: 4.5, recoilUp: 6.5, recoilSide: 2, kick: 1,
      falloffStart: 5, falloffEnd: 13, minDamageMult: 0.25, penetration: 1, moveMult: 1, adsZoom: 1.1, adsTime: 0.18 },
    upgraded: { damage: 140, pellets: 12, reserve: 120, penetration: 2 },
  }),
  gravedigger: W({
    id: 'gravedigger', name: 'Gravedigger LMG', upgradedName: 'Gravedigger: Mass Grave', cls: 'lmg', reloadStyle: 'belt',
    cost: 0, ammoCost: 0, boxWeight: 5, blurb: 'Belt-fed. Dig a lot of graves.',
    base: { damage: 100, headMult: 2, rpm: 680, auto: true, mag: 100, reserve: 400, reloadTac: 4.4, reloadEmpty: 5.0,
      pellets: 1, spreadHip: 3.6, spreadAds: 0.8, recoilUp: 0.9, recoilSide: 0.8, kick: 0.6,
      falloffStart: 25, falloffEnd: 50, minDamageMult: 0.7, penetration: 2, moveMult: 0.85, adsZoom: 1.25, adsTime: 0.32 },
    upgraded: { damage: 210, mag: 150, reserve: 750, penetration: 3 },
  }),
  longshot: W({
    id: 'longshot', name: 'Longshot Bolt Rifle', upgradedName: 'Longshot: Last Word', cls: 'sniper', reloadStyle: 'bolt',
    cost: 2000, ammoCost: 1000, boxWeight: 4, scope: true, blurb: 'Scoped bolt action. Lines them up.',
    base: { damage: 600, headMult: 4, rpm: 52, auto: false, mag: 5, reserve: 40, reloadTac: 2.8, reloadEmpty: 3.2,
      pellets: 1, spreadHip: 6, spreadAds: 0, recoilUp: 6, recoilSide: 1, kick: 1,
      falloffStart: 80, falloffEnd: 120, minDamageMult: 1, penetration: 5, moveMult: 0.92, adsZoom: 3.2, adsTime: 0.3 },
    upgraded: { damage: 1800, mag: 8, reserve: 80, penetration: 10, splashRadius: 1.5, splashDamage: 600 },
  }),
  marksman: W({
    id: 'marksman', name: 'Marksman Carbine', upgradedName: 'Marksman: Deadeye', cls: 'dmr', reloadStyle: 'mag',
    cost: 0, ammoCost: 0, boxWeight: 6, blurb: 'Semi-auto carbine with a fast trigger.',
    base: { damage: 150, headMult: 3, rpm: 330, auto: false, mag: 15, reserve: 150, reloadTac: 1.9, reloadEmpty: 2.3,
      pellets: 1, spreadHip: 2.2, spreadAds: 0.1, recoilUp: 1.9, recoilSide: 0.6, kick: 0.6,
      falloffStart: 30, falloffEnd: 60, minDamageMult: 0.8, penetration: 2, moveMult: 0.98, adsZoom: 1.6, adsTime: 0.22 },
    upgraded: { damage: 340, mag: 20, reserve: 240, penetration: 3 },
  }),
  thumper: W({
    id: 'thumper', name: 'Thumper Launcher', upgradedName: 'Thumper: Doomsday', cls: 'launcher', reloadStyle: 'break',
    cost: 0, ammoCost: 0, boxWeight: 4, blurb: 'Lobbed grenades. Mind your own feet.',
    base: { damage: 0, headMult: 1, rpm: 80, auto: false, mag: 1, reserve: 20, reloadTac: 2.1, reloadEmpty: 2.1,
      pellets: 1, spreadHip: 0.8, spreadAds: 0.3, recoilUp: 4, recoilSide: 1, kick: 0.9,
      falloffStart: 100, falloffEnd: 100, minDamageMult: 1, penetration: 0, moveMult: 0.95, adsZoom: 1.15, adsTime: 0.2,
      projectile: 'grenade', splashRadius: 4.5, splashDamage: 700 },
    upgraded: { mag: 3, reserve: 45, splashDamage: 1600, splashRadius: 5.5 },
  }),
  disruptor: W({
    id: 'disruptor', name: 'Signal Disruptor', upgradedName: 'Signal Disruptor: Total Blackout', cls: 'wonder', reloadStyle: 'mag',
    cost: 0, ammoCost: 0, boxWeight: 0, blurb: 'Overloads Tether chips. Arcs between targets.',
    base: { damage: 4000, headMult: 1, rpm: 95, auto: false, mag: 4, reserve: 24, reloadTac: 2.8, reloadEmpty: 3.2,
      pellets: 1, spreadHip: 0.5, spreadAds: 0.2, recoilUp: 3.5, recoilSide: 0.6, kick: 0.9,
      falloffStart: 100, falloffEnd: 100, minDamageMult: 1, penetration: 0, moveMult: 1, adsZoom: 1.2, adsTime: 0.2,
      projectile: 'arc', chain: 6 },
    upgraded: { damage: 9000, mag: 8, reserve: 48, chain: 10 },
  }),
};

/** Supply Crate chance for the wonder weapon (separate from weights). */
export const WONDER_CHANCE = 0.04;
export const WEAPON_LIST = Object.values(WEAPONS);

export function statsFor(def: WeaponDef, upgraded: boolean): WeaponStats {
  return upgraded ? { ...def.base, ...def.upgraded } : def.base;
}
