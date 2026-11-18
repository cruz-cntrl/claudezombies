/**
 * Screen layout service. Reads safe-area insets (via a probe element using the same CSS
 * variables the stylesheet uses) and the reserved Netlify zone, so every HUD/control element
 * is positioned relative to them. Re-computed on resize/orientation change.
 */
export interface Rect { x: number; y: number; w: number; h: number }

export const layout = {
  W: 0, H: 0,
  sat: 0, sar: 0, sab: 0, sal: 0,
  reserved: { x: 0, y: 0, w: 0, h: 0 } as Rect,
  listeners: [] as (() => void)[],
};

let probe: HTMLDivElement | null = null;

export function computeLayout() {
  if (!probe) {
    probe = document.createElement('div');
    probe.style.cssText = 'position:fixed;left:0;top:0;width:0;height:0;visibility:hidden;pointer-events:none;' +
      'padding-top:var(--sat);padding-right:var(--sar);padding-bottom:var(--sab);padding-left:var(--sal);' +
      'margin-left:var(--reserved-w);margin-top:var(--reserved-h);';
    document.getElementById('app')!.appendChild(probe);
  }
  const cs = getComputedStyle(probe);
  layout.W = window.innerWidth;
  layout.H = window.innerHeight;
  layout.sat = parseFloat(cs.paddingTop) || 0;
  layout.sar = parseFloat(cs.paddingRight) || 0;
  layout.sab = parseFloat(cs.paddingBottom) || 0;
  layout.sal = parseFloat(cs.paddingLeft) || 0;
  const rw = (parseFloat(cs.marginLeft) || 150) + layout.sar;
  const rh = (parseFloat(cs.marginTop) || 70) + layout.sab;
  layout.reserved = { x: layout.W - rw, y: layout.H - rh, w: rw, h: rh };
  for (const l of layout.listeners) l();
}

export function inReserved(x: number, y: number, pad = 0): boolean {
  const r = layout.reserved;
  return x >= r.x - pad && y >= r.y - pad;
}

/** True if a rect overlaps the reserved zone (used by the layout self-check in debug mode). */
export function overlapsReserved(r: DOMRect): boolean {
  const z = layout.reserved;
  return r.right > z.x && r.bottom > z.y && r.width > 0 && r.height > 0;
}

export function onLayout(fn: () => void) { layout.listeners.push(fn); }
