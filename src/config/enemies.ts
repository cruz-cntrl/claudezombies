/** Enemy archetypes. HP is a multiplier on the round's base health. Speeds in m/s. */
export type SpeedTier = 'walker' | 'runner' | 'sprinter';

export const ZOMBIE = {
  radius: 0.34,
  height: 1.75,
  speeds: { walker: 1.15, runner: 3.0, sprinter: 4.6 } as Record<SpeedTier, number>,
  attackRange: 1.15,
  attackWindup: 0.55,
  attackCooldown: 1.1,
  attackDamage: 50,
  boardTearTime: 1.1,
  climbTime: 1.2,
  stuckRespawnSeconds: 8,
  chipCritMult: 2.5,
  staggerThreshold: 0.33, // fraction of max HP in one hit
  separation: 0.75,
};

export const HOUND = {
  hpMult: 0.35,
  speed: 6.2,
  damage: 30,
  radius: 0.3,
  attackRange: 1.1,
  attackWindup: 0.3,
  attackCooldown: 0.8,
};

export const BRUTE = {
  hpMult: 9,
  cageHpMult: 1.6, // multiplier on round base health
  minCageHp: 1500,
  speed: 1.9,
  enragedSpeed: 3.0,
  slamDamage: 90,
  slamRadius: 3.2,
  slamWindup: 1.0,
  radius: 0.6,
  scale: 1.55,
};

export const BOSS = {
  warden: { hp: 60000, hpPerRound: 2500, chargeSpeed: 9, walkSpeed: 2.2, meleeDamage: 80, screechJam: 4 },
  mother: { hp: 80000, hpPerRound: 3000, pylonHp: 6000, pulseDamage: 60, coreDamageMult: 1 },
};

export const POWERUPS = {
  maxPerRound: 4,
  baseDropChance: 0.028,
  lifetime: 25,
  blinkFrom: 18,
  duration: 30,
};
