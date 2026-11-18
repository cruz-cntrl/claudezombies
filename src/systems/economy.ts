import { ECONOMY } from '../config/economy';
import { bus } from '../core/events';
import type { Game } from '../game';

/** Points: earning (with Double Points), spending, popups. */
export class Economy {
  points = ECONOMY.startPoints;
  repairThisRound = 0;
  constructor(private g: Game) {}

  add(n: number, reason = '', crit = false) {
    if (this.g.powerups.active('double')) n *= 2;
    this.points += n;
    this.g.player.stats.pointsEarned += n;
    bus.emit('pointsChanged', { points: this.points, delta: n, reason });
    bus.emit('pointsPopup', { delta: n, crit });
  }

  can(n: number) { return this.points >= n; }

  spend(n: number): boolean {
    if (this.points < n) return false;
    this.points -= n;
    bus.emit('pointsChanged', { points: this.points, delta: -n });
    bus.emit('pointsPopup', { delta: -n });
    return true;
  }
}
