import type { Game } from '../game';
import { save } from '../core/save';
import { wrapAngle } from '../core/math';

/**
 * Touch aim assist: slows look speed while the crosshair is over a target, and gently
 * pulls toward the nearest target when aiming down sights. Only active for touch input.
 */
export class AimAssist {
  private prevAds = 0;
  constructor(private g: Game) {}

  update(dt: number) {
    const g = this.g, input = g.input, p = g.player, s = save.settings;
    input.slowdown = 1;
    if (!s.aimAssist || !input.usingTouch || p.downed) { this.prevAds = g.weapons.ads; return; }
    const k = s.aimAssistStrength;
    const camX = p.pos.x, camY = p.eye, camZ = p.pos.z;
    const yaw = p.yaw, pitch = p.pitch;
    let best: { dy: number; dp: number; ang: number } | null = null;
    for (const z of g.zombies.all()) {
      if (!z.alive) continue;
      // aim point: chest for runners, head when close-ish
      const tx = (z.neck.x + z.pelvis.x) / 2, ty = (z.neck.y + z.pelvis.y) / 2 + 0.1, tz = (z.neck.z + z.pelvis.z) / 2;
      const dx = tx - camX, dy = ty - camY, dz = tz - camZ;
      const dist = Math.hypot(dx, dz);
      if (dist > 30 || dist < 0.5) continue;
      const tYaw = Math.atan2(-dx, -dz);
      const tPitch = Math.atan2(dy, dist);
      const dYaw = wrapAngle(tYaw - yaw), dPitch = tPitch - pitch;
      const ang = Math.hypot(dYaw, dPitch);
      const window = Math.atan2(0.6, dist) + 0.03; // bigger window up close
      if (ang > window * 2.2) continue;
      if (!g.world.grid.los(camX, camZ, z.x, z.z)) continue;
      if (!best || ang < best.ang) best = { dy: dYaw, dp: dPitch, ang };
    }
    if (!best) { this.prevAds = g.weapons.ads; return; }
    input.slowdown = 1 - 0.5 * k;
    const ads = g.weapons.ads;
    // snap-on when entering ADS
    if (this.prevAds < 0.5 && ads >= 0.5 && best.ang < 0.16) {
      p.yaw += best.dy * 0.55 * k;
      p.pitch += best.dp * 0.55 * k;
    } else if (ads > 0.5) {
      // gentle continuous magnetism
      const pull = Math.min(1, dt * 4 * k);
      p.yaw += best.dy * pull * 0.35;
      p.pitch += best.dp * pull * 0.35;
    }
    this.prevAds = ads;
  }
}
