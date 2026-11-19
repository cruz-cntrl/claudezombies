/**
 * Climbable structures (Grounds watchtower). A ladder joins the ground to a raised platform.
 * The player attaches by walking into the ladder. The Tethered can't climb: they crowd round the foot.
 */
export interface Ladder {
  /** foot of the ladder: the ground-side standing spot (world x/z) */
  bx: number; bz: number;
  /** unit direction from the foot toward the tower (the way you face while climbing) */
  nx: number; nz: number;
  /** platform height above the ground */
  top: number;
  /** step-off point on the platform */
  tx: number; tz: number;
  /** platform floor rectangle (world), inside the railing */
  rect: { x0: number; z0: number; x1: number; z1: number };
  /** reserved for a climbing enemy (none climb at the moment) */
  occupant: object | null;
}

export function inRect(l: Ladder, x: number, z: number, pad = 0) {
  return x >= l.rect.x0 - pad && x <= l.rect.x1 + pad && z >= l.rect.z0 - pad && z <= l.rect.z1 + pad;
}

export function clampToRect(l: Ladder, p: { x: number; z: number }, r: number) {
  p.x = Math.max(l.rect.x0 + r, Math.min(l.rect.x1 - r, p.x));
  p.z = Math.max(l.rect.z0 + r, Math.min(l.rect.z1 - r, p.z));
}
