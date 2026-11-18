/**
 * Tiny typed event bus. Gameplay systems emit, HUD / audio / stats listen.
 * Keeps systems decoupled: the weapon system doesn't know the HUD exists.
 */
export interface GameEvents {
  pointsChanged: { points: number; delta: number; reason?: string };
  pointsPopup: { delta: number; crit?: boolean };
  roundStart: { round: number; special: 'none' | 'hounds' };
  roundEnd: { round: number };
  zombieKilled: { kind: string; headshot: boolean; chip: boolean; melee: boolean; x: number; z: number; explosive?: boolean };
  zombieHit: { chip: boolean; headshot: boolean; damage: number; x: number; y: number; z: number };
  playerDamaged: { amount: number; fromX: number; fromZ: number };
  playerDowned: { selfRevive: boolean };
  playerRevived: Record<string, never>;
  gameOver: Record<string, never>;
  weaponChanged: Record<string, never>;
  ammoChanged: Record<string, never>;
  perksChanged: Record<string, never>;
  powerupStart: { id: string; duration: number };
  powerupGrab: { id: string };
  doorOpened: { id: string };
  powerOn: Record<string, never>;
  message: { text: string; sub?: string; duration?: number; color?: string };
  bossStart: { name: string };
  bossHealth: { frac: number; phase: number };
  bossEnd: { name: string };
  noteFound: { id: string };
  eeProgress: { text: string };
  hudJam: { seconds: number };
  shake: { amount: number };
  pickup: { text: string; size: string };
}

type Handler<T> = (payload: T) => void;

export class EventBus {
  private map = new Map<keyof GameEvents, Set<Handler<any>>>();

  on<K extends keyof GameEvents>(type: K, fn: Handler<GameEvents[K]>): () => void {
    let set = this.map.get(type);
    if (!set) { set = new Set(); this.map.set(type, set); }
    set.add(fn);
    return () => set!.delete(fn);
  }

  emit<K extends keyof GameEvents>(type: K, payload: GameEvents[K]): void {
    const set = this.map.get(type);
    if (!set) return;
    for (const fn of set) fn(payload);
  }

  clear(): void { this.map.clear(); }
}

/** Global bus. Reset between runs by the game (listeners re-register). */
export const bus = new EventBus();
