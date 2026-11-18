/** "Halcyon Tonics" — perk machines. Effects are applied in systems/perks.ts. */
export type PerkId = 'ironhide' | 'quickhands' | 'secondwind' | 'fleetfoot' | 'rapidfire' | 'packmule';

export interface PerkDef {
  id: PerkId;
  name: string;
  cost: number;
  desc: string;
  /** Machine / icon color */
  color: number;
  /** Short glyph used in the HUD icon */
  glyph: string;
  /** For Second Wind: how many times it can be bought */
  maxBuys?: number;
}

export const PERKS: Record<PerkId, PerkDef> = {
  ironhide:   { id: 'ironhide',   name: 'Ironhide',    cost: 2500, color: 0xc4302b, glyph: 'shield', desc: '250 max health.' },
  quickhands: { id: 'quickhands', name: 'Quickhands',  cost: 3000, color: 0x3fae5a, glyph: 'hand',   desc: '50% faster reloads.' },
  secondwind: { id: 'secondwind', name: 'Second Wind', cost: 1500, color: 0x4aa3d8, glyph: 'lung',   desc: '+1 self-revive (up to 3 purchases).', maxBuys: 3 },
  fleetfoot:  { id: 'fleetfoot',  name: 'Fleetfoot',   cost: 2000, color: 0xe0b23a, glyph: 'boot',   desc: 'Faster, longer sprint. Faster aiming.' },
  rapidfire:  { id: 'rapidfire',  name: 'Rapidfire',   cost: 2000, color: 0xd9692a, glyph: 'bolt',   desc: '+33% fire rate.' },
  packmule:   { id: 'packmule',   name: 'Packmule',    cost: 4000, color: 0x7d5bbf, glyph: 'crate',  desc: 'Carry a third weapon.' },
};

export const MAX_PERKS = 4;
export const PERK_TUNING = {
  ironhideHp: 250,
  quickhandsReloadMult: 0.5,
  fleetfootSprintMult: 1.15,
  fleetfootSprintDurationMult: 2,
  fleetfootAdsMult: 0.6,
  rapidfireMult: 1.33,
};
