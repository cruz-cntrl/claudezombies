/** Difficulty multipliers (selected per run; high scores are tracked separately). */
export type DifficultyId = 'easy' | 'normal' | 'hardened';
export interface DifficultyDef {
  id: DifficultyId; name: string; desc: string;
  zombieHp: number; zombieSpeed: number; count: number; damageToPlayer: number; dropRate: number; selfRevives: number;
}
export const DIFFICULTY: Record<DifficultyId, DifficultyDef> = {
  easy:     { id: 'easy',     name: 'Easy',     desc: 'Weaker, slower Tethered. Three self-revives.', zombieHp: 0.75, zombieSpeed: 0.9, count: 0.8, damageToPlayer: 0.6, dropRate: 1.3, selfRevives: 3 },
  normal:   { id: 'normal',   name: 'Normal',   desc: 'The intended experience. Two self-revives.',   zombieHp: 1.0,  zombieSpeed: 1.0, count: 1.0, damageToPlayer: 1.0, dropRate: 1.0, selfRevives: 2 },
  hardened: { id: 'hardened', name: 'Hardened', desc: 'Tougher, faster, meaner. One self-revive.',   zombieHp: 1.35, zombieSpeed: 1.1, count: 1.2, damageToPlayer: 1.4, dropRate: 0.8, selfRevives: 1 },
};
