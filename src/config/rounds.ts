/** Round scaling formulas. All tunable. */
import { clamp } from '../core/math';

export const ROUNDS = {
  maxAlive: 24,
  maxPerRound: 120,
  breakSeconds: 10,
  firstRoundBreak: 4,
  /** Hound rounds occur every 5..7 rounds (first between 5 and 7). */
  houndEveryMin: 5,
  houndEveryMax: 7,
  /** Brutes from this round, ~1 per 2 rounds. */
  bruteFromRound: 12,
  bruteChancePerRound: 0.5,
};

export function zombieCount(round: number): number {
  if (round <= 1) return 6;
  return Math.min(ROUNDS.maxPerRound, Math.round(6 + round * 2.2));
}

export function houndCount(round: number): number {
  return Math.min(24, 6 + Math.floor(round * 0.8));
}

export function zombieHealth(round: number): number {
  if (round <= 9) return 150 + (round - 1) * 100;
  return 950 * Math.pow(1.1, round - 9);
}

export function spawnDelay(round: number): number {
  return Math.max(0.3, 2.0 * Math.pow(0.93, round - 1));
}

/** Returns probabilities [walker, runner, sprinter] for a round. */
export function speedMix(round: number): [number, number, number] {
  const sprint = clamp((round - 9) / 6, 0, 1) * 0.85; // ramps 10..15
  const runRaw = round < 4 ? 0 : clamp((round - 3) / 7, 0, 1) * 0.8; // majority by 10
  const run = Math.min(runRaw, 1 - sprint);
  const walk = Math.max(0, 1 - run - sprint);
  return [walk, run, sprint];
}
