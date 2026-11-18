/** Points economy. */
export const ECONOMY = {
  startPoints: 500,
  hit: 10,
  kill: 60,
  headshotKill: 100,
  chipKill: 130,
  meleeKill: 130,
  boardRepair: 10,
  boardRepairCapPerRound: 500,
  crateCost: 950,
  rewirerCost: 3000,
  /** Wall ammo for an already-rewired weapon */
  upgradedAmmoCost: 1500,
  killSignalBonus: 400,
  fortifyBonus: 200,
  houndKill: 50,
  bruteKill: 600,
  bruteCageBreak: 200,
  /** Purchase hold duration (s) */
  holdBuy: 0.35,
  /** Board repair hold per board (s) */
  repairTime: 0.55,
  /** Ammo drops from kills (scaled by the difficulty's drop rate) */
  ammoDropChance: 0.09,
  ammoDropLifetime: 20,
  maxAmmoDrops: 6,
  /** frac = share of each weapon's max reserve refilled */
  ammoDropTiers: [
    { id: 'small', frac: 0.12, weight: 6, scale: 0.8 },
    { id: 'medium', frac: 0.25, weight: 3, scale: 1.0 },
    { id: 'large', frac: 0.5, weight: 1, scale: 1.25 },
  ],
};
