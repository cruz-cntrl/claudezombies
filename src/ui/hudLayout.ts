import { save, persist } from '../core/save';
import { layout } from './layout';

/**
 * Player-arranged HUD / touch-control positions. Each moved element stores its centre as a
 * fraction of the screen, so a layout survives rotation and different phones. Positions are
 * always clamped inside the safe area and kept out of the reserved Netlify corner.
 */
export type HudItemKind = 'btn' | 'box';

export function getOverride(id: string): [number, number] | null {
  const v = save.settings.hudLayout?.[id];
  return v && v.length === 2 && isFinite(v[0]) && isFinite(v[1]) ? v : null;
}

export function setOverride(id: string, fx: number, fy: number) {
  save.settings.hudLayout = { ...(save.settings.hudLayout ?? {}), [id]: [fx, fy] };
}

export function clearOverrides() { save.settings.hudLayout = {}; persist(); }

/** Clamp a centre (px) for an element of size w×h: inside safe areas, out of the reserved zone. */
export function clampCentre(cx: number, cy: number, w: number, h: number): [number, number] {
  const L = layout;
  const x0 = L.sal + w / 2 + 2, x1 = L.W - L.sar - w / 2 - 2;
  const y0 = L.sat + h / 2 + 2, y1 = L.H - L.sab - h / 2 - 2;
  cx = Math.max(x0, Math.min(x1, cx));
  cy = Math.max(y0, Math.min(y1, cy));
  const r = L.reserved;
  if (cx + w / 2 > r.x - 4 && cy + h / 2 > r.y - 4) {
    // overlapping the reserved corner: nudge out along the shorter way
    const up = cy + h / 2 - (r.y - 4), left = cx + w / 2 - (r.x - 4);
    if (up <= left) cy -= up; else cx -= left;
  }
  return [cx, cy];
}

/**
 * Apply a stored position to an element (if any). Buttons are centred by CSS transform; boxes are
 * anchored to the nearer screen side so text that grows (weapon names, points) grows inward.
 * Returns true if an override was applied.
 */
export function applyOverride(el: HTMLElement, id: string, kind: HudItemKind): boolean {
  const o = getOverride(id);
  if (!o) return false;
  const L = layout;
  const w = el.offsetWidth || 60, h = el.offsetHeight || 40;
  // buttons carry a label underneath: keep that clear of the reserved corner too
  const [cx, cy] = kind === 'btn' ? clampCentre(o[0] * L.W, o[1] * L.H + 9, w, h + 18).map((v, i) => (i ? v - 9 : v)) as [number, number] : clampCentre(o[0] * L.W, o[1] * L.H, w, h);
  if (kind === 'btn') {
    el.style.left = cx + 'px';
    el.style.top = cy + 'px';
    return true;
  }
  el.style.transform = 'none';
  el.style.bottom = '';
  el.style.top = cy - h / 2 + 'px';
  if (cx > L.W / 2) { el.style.left = ''; el.style.right = L.W - (cx + w / 2) + 'px'; }
  else { el.style.right = ''; el.style.left = cx - w / 2 + 'px'; }
  return true;
}
