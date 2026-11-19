/**
 * Reliable menu taps on iOS Safari.
 *
 * Two problems this solves:
 *  1. Ghost clicks — a screen that changes on pointerup (e.g. the title's "tap to start", or a
 *     game-over screen appearing under a held finger) receives the browser's synthetic `click`
 *     for that same touch, which then activates whatever button of the NEW screen sits under
 *     the finger. Every touch remembers which screen it started on; a click from a touch that
 *     started on an older screen is swallowed.
 *  2. Dropped taps — iOS cancels `click` when the finger wobbles a few pixels or a second tap
 *     follows quickly. Menu controls fire on pointerup instead (12 px of slop), and the native
 *     click that follows is suppressed so nothing runs twice.
 */
let epoch = 0;
let downEpoch = -1;
let downTime = 0;
let downX = 0, downY = 0, downEl: Element | null = null, downTouch = false;
let suppressUntil = 0;
let allowSynthetic = false;

const ACTIONABLE = 'button, .card, .tog, .seg button, [data-tap]';

/** Call whenever the visible screen is replaced. */
export function bumpScreenEpoch() { epoch++; }

export function installTapGuard() {
  const opts = { capture: true, passive: true } as AddEventListenerOptions;
  document.addEventListener('pointerdown', (e) => {
    downEpoch = epoch;
    downTime = performance.now();
    downX = e.clientX; downY = e.clientY;
    downTouch = e.pointerType !== 'mouse';
    const t = e.target as Element | null;
    downEl = t?.closest?.(ACTIONABLE) ?? null;
    if (downEl && (downEl.closest('input') || !downEl.closest('#screens, .cs-root'))) downEl = null;
  }, opts);

  document.addEventListener('pointerup', (e) => {
    if (!downTouch || !downEl) return;
    const el = downEl;
    downEl = null;
    if (downEpoch !== epoch || !el.isConnected) return;
    if (Math.hypot(e.clientX - downX, e.clientY - downY) > 12) return;
    const t = e.target as Element | null;
    const upEl = t?.closest?.(ACTIONABLE) ?? document.elementFromPoint(e.clientX, e.clientY)?.closest(ACTIONABLE);
    if (upEl !== el) return;
    if ((el as HTMLButtonElement).disabled) return;
    suppressUntil = performance.now() + 700;
    allowSynthetic = true;
    try { (el as HTMLElement).click(); } finally { allowSynthetic = false; }
  }, opts);

  document.addEventListener('click', (e) => {
    if (allowSynthetic) return;
    const stale = downEpoch !== epoch && performance.now() - downTime < 1500;
    if (stale || performance.now() < suppressUntil) {
      // the tap already ran on pointerup, or it began on a screen that is gone
      if (stale) downEpoch = epoch; // only the first click of a stale touch is swallowed
      e.stopImmediatePropagation();
      e.preventDefault();
    }
  }, { capture: true });
}
