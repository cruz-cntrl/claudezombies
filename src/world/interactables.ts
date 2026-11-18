import type { Input } from '../input/input';
import type { Player } from '../entities/player';

export interface Prompt { text: string; sub?: string; cant?: boolean; icon?: string }

export interface Interactable {
  x: number; z: number;
  r: number;
  /** Returns the prompt, or null if not currently usable / visible */
  label: () => Prompt | null;
  /** hold duration in seconds (0 = tap) */
  hold: number;
  /** keep firing while held (board repair) */
  repeat?: boolean;
  /** can it be used right now? (affordable etc.) */
  can: () => boolean;
  use: () => void;
  onDenied?: () => void;
  priority?: number;
}

/**
 * Contextual interaction: picks the nearest usable interactable in front of the player,
 * shows its prompt, and runs hold-to-confirm (purchases need a 0.35 s hold).
 */
export class Interactables {
  readonly list: Interactable[] = [];
  current: Interactable | null = null;
  progress = 0;
  private wasHeld = false;
  private deniedCooldown = 0;

  add(i: Interactable) { this.list.push(i); return i; }
  remove(i: Interactable) { const k = this.list.indexOf(i); if (k >= 0) this.list.splice(k, 1); }

  update(dt: number, player: Player, input: Input): { prompt: Prompt | null; progress: number } {
    this.deniedCooldown -= dt;
    let best: Interactable | null = null, bestScore = 1e9;
    const fx = -Math.sin(player.yaw), fz = -Math.cos(player.yaw);
    for (const it of this.list) {
      const dx = it.x - player.pos.x, dz = it.z - player.pos.z;
      const d = Math.hypot(dx, dz);
      if (d > it.r) continue;
      const facing = d < 0.6 ? 1 : (dx * fx + dz * fz) / d;
      if (facing < -0.2) continue;
      const score = d - facing * 0.8 - (it.priority ?? 0);
      if (score < bestScore && it.label()) { best = it; bestScore = score; }
    }
    if (best !== this.current) { this.current = best; this.progress = 0; }
    if (!best) { this.wasHeld = input.interactHeld; input.consume('interactPress'); return { prompt: null, progress: 0 }; }
    const prompt = best.label();
    const held = input.interactHeld || input.consume('interactPress');
    if (held && !player.downed) {
      if (best.can()) {
        this.progress += best.hold > 0 ? dt / best.hold : 1;
        if (this.progress >= 1) {
          best.use();
          this.progress = 0;
          if (!best.repeat) { input.interactHeld = false; }
        }
      } else if (!this.wasHeld && this.deniedCooldown <= 0) {
        best.onDenied?.();
        this.deniedCooldown = 0.6;
      }
    } else this.progress = Math.max(0, this.progress - dt * 4);
    this.wasHeld = held;
    return { prompt, progress: Math.min(1, this.progress) };
  }

  clear() { this.list.length = 0; this.current = null; }
}
