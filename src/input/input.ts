import { save } from '../core/save';

export type Action = 'reload' | 'swap' | 'melee' | 'pause' | 'interactPress' | 'grenadeRelease' | 'aimToggle';

/**
 * Unified input state consumed by the simulation. Touch and keyboard/mouse both write here.
 * Look deltas are in radians (already sensitivity-scaled), accumulated until consumed.
 */
export class Input {
  moveX = 0;      // -1..1 strafe
  moveY = 0;      // -1..1 forward
  sprint = false;
  lookDX = 0;
  lookDY = 0;
  fire = false;
  aimHeld = false;
  aimToggled = false;
  /** ADS toggled by tapping the left look pad (works in both hold and toggle modes) */
  aimPad = false;
  interactHeld = false;
  grenadeHeld = false;
  enabled = false;
  usingTouch = false;
  /** Set by gameplay each frame: >1 while ADS so look sensitivity can scale with zoom. */
  zoom = 1;
  /** Set by aim assist: multiplier (<1) applied to look speed while over a target */
  slowdown = 1;
  private pressed = new Set<Action>();

  press(a: Action) { if (this.enabled || a === 'pause') this.pressed.add(a); }
  consume(a: Action): boolean {
    if (this.pressed.has(a)) { this.pressed.delete(a); return true; }
    return false;
  }

  get aiming(): boolean {
    return (save.settings.adsMode === 'toggle' ? this.aimToggled : this.aimHeld) || this.aimPad;
  }

  /** Add a look delta in pixels (touch) or mouse counts. */
  addLook(dxPx: number, dyPx: number, base: number) {
    if (!this.enabled) return;
    const s = save.settings;
    let k = base * s.lookSens * this.slowdown;
    if (this.aiming) k *= s.adsSens / Math.max(1, this.zoom * 0.85);
    this.lookDX += dxPx * k;
    this.lookDY += dyPx * k * (s.invertY ? -1 : 1);
  }

  consumeLook(): [number, number] {
    const r: [number, number] = [this.lookDX, this.lookDY];
    this.lookDX = 0; this.lookDY = 0;
    return r;
  }

  reset() {
    this.moveX = this.moveY = 0;
    this.sprint = false;
    this.fire = false;
    this.aimHeld = false;
    this.aimToggled = false;
    this.aimPad = false;
    this.interactHeld = false;
    this.grenadeHeld = false;
    this.lookDX = this.lookDY = 0;
    this.pressed.clear();
  }
}

/** Desktop fallback: WASD, mouse look with pointer lock, LMB fire, RMB aim, etc. */
export class KeyboardMouse {
  private keys = new Set<string>();
  locked = false;
  onPauseRequest: (() => void) | null = null;

  constructor(private input: Input, private canvas: HTMLCanvasElement, private isPlaying: () => boolean) {
    window.addEventListener('keydown', (e) => this.key(e, true));
    window.addEventListener('keyup', (e) => this.key(e, false));
    window.addEventListener('blur', () => { this.keys.clear(); this.updateMove(); this.input.fire = false; });
    canvas.addEventListener('mousedown', (e) => {
      if (!this.isPlaying()) return;
      this.input.usingTouch = false;
      if (!this.locked) { this.requestLock(); return; }
      if (e.button === 0) this.input.fire = true;
      if (e.button === 2) { this.input.aimHeld = true; this.input.aimToggled = !this.input.aimToggled; }
    });
    window.addEventListener('mouseup', (e) => {
      if (e.button === 0) this.input.fire = false;
      if (e.button === 2) this.input.aimHeld = false;
    });
    canvas.addEventListener('contextmenu', (e) => e.preventDefault());
    window.addEventListener('mousemove', (e) => {
      if (!this.locked) return;
      this.input.addLook(e.movementX, e.movementY, 0.0022);
    });
    window.addEventListener('wheel', () => { if (this.locked) this.input.press('swap'); }, { passive: true });
    document.addEventListener('pointerlockchange', () => {
      const was = this.locked;
      this.locked = document.pointerLockElement === this.canvas;
      if (was && !this.locked && this.isPlaying()) this.onPauseRequest?.();
    });
  }

  requestLock() {
    try {
      const p = this.canvas.requestPointerLock() as unknown as Promise<void> | undefined;
      if (p && typeof p.catch === 'function') p.catch(() => {});
    } catch { /* not supported */ }
  }
  exitLock() { if (document.pointerLockElement) document.exitPointerLock(); }

  private key(e: KeyboardEvent, down: boolean) {
    const k = e.code;
    if (k === 'Escape' && down) { this.input.press('pause'); return; }
    if (!this.isPlaying()) return;
    if (down && this.keys.has(k)) return; // auto-repeat
    if (down) this.keys.add(k); else this.keys.delete(k);
    this.input.usingTouch = false;
    switch (k) {
      case 'KeyR': if (down) this.input.press('reload'); break;
      case 'KeyQ': if (down) this.input.press('swap'); break;
      case 'Digit1': case 'Digit2': case 'Digit3': if (down) this.input.press('swap'); break;
      case 'KeyF': case 'KeyV': if (down) this.input.press('melee'); break;
      case 'KeyG': this.input.grenadeHeld = down; if (!down) this.input.press('grenadeRelease'); break;
      case 'KeyE': this.input.interactHeld = down; if (down) this.input.press('interactPress'); break;
      case 'Space': if (down) this.input.press('interactPress'); this.input.interactHeld = down; break;
    }
    this.updateMove();
    if (['Space', 'ArrowUp', 'ArrowDown', 'ArrowLeft', 'ArrowRight'].includes(k)) e.preventDefault();
  }

  private updateMove() {
    const has = (c: string) => this.keys.has(c);
    if (this.input.usingTouch) return;
    this.input.moveY = (has('KeyW') || has('ArrowUp') ? 1 : 0) - (has('KeyS') || has('ArrowDown') ? 1 : 0);
    this.input.moveX = (has('KeyD') || has('ArrowRight') ? 1 : 0) - (has('KeyA') || has('ArrowLeft') ? 1 : 0);
    this.input.sprint = has('ShiftLeft') || has('ShiftRight');
  }
}
