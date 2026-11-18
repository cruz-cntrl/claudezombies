import { Input } from './input';
import { layout, inReserved, onLayout } from '../ui/layout';
import { save } from '../core/save';
import { h } from '../core/dom';

const ICONS: Record<string, string> = {
  fire: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="7"/><path d="M12 2v5M12 17v5M2 12h5M17 12h5"/></svg>',
  aim: '<svg viewBox="0 0 24 24"><circle cx="12" cy="12" r="8"/><circle cx="12" cy="12" r="2.5"/></svg>',
  reload: '<svg viewBox="0 0 24 24"><path d="M20 12a8 8 0 1 1-2.3-5.6"/><path d="M20 4v5h-5"/></svg>',
  swap: '<svg viewBox="0 0 24 24"><path d="M4 8h14l-3-3M20 16H6l3 3"/></svg>',
  melee: '<svg viewBox="0 0 24 24"><path d="M5 19l9-9M14 10l5-6 1 1-6 5M7 15l2 2M4 20l2-2"/></svg>',
  grenade: '<svg viewBox="0 0 24 24"><ellipse cx="12" cy="14" rx="6" ry="7"/><path d="M10 7V4h4v3M14 5l4-2"/></svg>',
  pause: '<svg viewBox="0 0 24 24"><path d="M8 5v14M16 5v14"/></svg>',
};

type Role = { kind: 'joy' | 'look' | 'btn' | 'pad'; act?: string; el?: HTMLElement; lx: number; ly: number; lt: number; ox?: number; oy?: number; t0?: number; travel?: number };

/** Upper part of the movement side (fraction of screen height) that acts as the invisible look / ADS pad. */
const PAD_SPLIT = 0.46;

/**
 * Twin-stick touch controls: floating joystick (left), swipe-look (right), button arc above
 * and left of the reserved Netlify zone. Multi-touch via pointer ids.
 */
export class TouchControls {
  readonly root: HTMLElement;
  private buttons: Record<string, HTMLElement> = {};
  private joyBase: HTMLElement;
  private joyKnob: HTMLElement;
  private joyHint: HTMLElement;
  readonly interactEl: HTMLElement;
  private interactRing: SVGCircleElement;
  private interactText: HTMLElement;
  private interactIco: HTMLElement;
  private roles = new Map<number, Role>();
  onPause: (() => void) | null = null;

  constructor(private input: Input) {
    this.root = document.getElementById('controls')!;
    for (const act of ['fire', 'aim', 'reload', 'swap', 'melee', 'grenade', 'pause']) {
      const sec = act === 'melee' || act === 'reload' || act === 'swap' || act === 'aim' || act === 'grenade' ? ' sec' : '';
      const el = h('div', { class: `ctl-btn ${act}${sec}`, 'data-act': act, html: ICONS[act] });
      if (act !== 'fire' && act !== 'pause') el.appendChild(h('span', { class: 'lbl' }, act.toUpperCase()));
      this.buttons[act] = el;
      this.root.appendChild(el);
    }
    this.joyHint = h('div', { class: 'joy-hint' });
    this.joyBase = h('div', { class: 'joy-base' });
    this.joyKnob = h('div', { class: 'joy-knob' });
    this.joyBase.appendChild(this.joyKnob);
    this.root.append(this.joyHint, this.joyBase);
    this.interactRing = document.createElementNS('http://www.w3.org/2000/svg', 'circle');
    this.interactText = h('div', { class: 'itxt' });
    this.interactIco = h('div', { class: 'ico' }, 'E');
    const ring = h('div', { class: 'iring', html: '<svg viewBox="0 0 52 52"><circle class="bg" cx="26" cy="26" r="22" fill="none" stroke-width="4"/></svg>' });
    const svg = ring.querySelector('svg')!;
    Object.entries({ class: 'fg', cx: '26', cy: '26', r: '22', fill: 'none', 'stroke-width': '4', 'stroke-dasharray': '138.2', 'stroke-dashoffset': '138.2' })
      .forEach(([k, v]) => this.interactRing.setAttribute(k, v));
    svg.appendChild(this.interactRing);
    ring.appendChild(this.interactIco);
    this.interactEl = h('div', { class: 'interact', 'data-act': 'interact' }, this.interactText, ring);
    document.getElementById('hud')!.parentElement!.appendChild(this.interactEl);
    this.interactEl.style.zIndex = '25';

    const opts = { passive: false } as AddEventListenerOptions;
    const app = document.getElementById('app')!;
    app.addEventListener('pointerdown', (e) => this.down(e), opts);
    app.addEventListener('pointermove', (e) => this.move(e), opts);
    app.addEventListener('pointerup', (e) => this.up(e), opts);
    app.addEventListener('pointercancel', (e) => this.up(e), opts);
    onLayout(() => this.layout());
  }

  setVisible(on: boolean) {
    this.root.classList.toggle('on', on);
    if (!on) { this.releaseAll(); this.setInteract(null); }
  }

  get visible() { return this.root.classList.contains('on'); }

  applySettings() {
    const s = save.settings;
    document.documentElement.style.setProperty('--bs', String(s.buttonSize === 'S' ? 0.85 : s.buttonSize === 'L' ? 1.18 : 1));
    document.documentElement.style.setProperty('--btn-op', String(s.buttonOpacity));
    this.layout();
  }

  /** Position every control relative to safe areas + reserved zone. */
  layout() {
    const L = layout, bs = save.settings.buttonSize === 'S' ? 0.85 : save.settings.buttonSize === 'L' ? 1.18 : 1;
    const left = save.settings.leftHanded;
    const r = L.reserved;
    const fireR = 46 * bs;
    const R = 118 * bs;
    let cx: number, cy: number;
    if (!left) {
      cx = L.W - L.sar - 20 - fireR;
      cy = r.y - 12 - fireR;
    } else {
      cx = L.sal + 20 + fireR;
      cy = L.H - L.sab - 16 - fireR;
    }
    const dir = left ? -1 : 1;
    const at = (deg: number, rad = R) => {
      const a = (deg * Math.PI) / 180;
      return [cx + Math.cos(a) * rad * dir, cy - Math.sin(a) * rad] as const;
    };
    const pos: Record<string, readonly [number, number]> = {
      fire: [cx, cy],
      aim: at(180),
      melee: at(145),
      reload: at(110),
      swap: at(75),
      grenade: [cx - dir * (R + 74 * bs), cy + 14 * bs],
      pause: [L.sal + 12 + 23 * bs, L.sat + 12 + 23 * bs],
    };
    // keep the swap button on-screen at small heights
    for (const k in pos) {
      const el = this.buttons[k];
      let [x, y] = pos[k];
      y = Math.max(L.sat + 40 * bs, y);
      el.style.left = x + 'px';
      el.style.top = y + 'px';
    }
    this.fireCenter = { x: cx, y: cy };
    // joystick hint sits in the lower corner of the movement side
    const hx = left ? L.W * 0.78 : L.sal + 110;
    const hy = left ? Math.min(L.H - L.sab - 90, r.y - 70) : L.H - L.sab - 90;
    this.joyHint.style.left = hx + 'px';
    this.joyHint.style.top = hy + 'px';
    // interact prompt
    if (!left) {
      this.interactEl.style.left = Math.min(L.W * 0.7, cx - R - 40) + 'px';
      this.interactEl.style.transform = 'translate(-100%, -50%)';
    } else {
      this.interactEl.style.left = Math.max(L.W * 0.3, cx + R + 40) + 'px';
      this.interactEl.style.transform = 'translate(0, -50%)';
    }
    // above the button arc and clear of the crosshair: free centre-right space
    this.interactEl.style.top = Math.max(L.sat + 64, Math.min(L.H * 0.3, cy - R * 0.94 - 6)) + 'px';
  }
  fireCenter = { x: 0, y: 0 };

  /** Show / hide the contextual interact prompt. progress 0..1 fills the hold ring. */
  setInteract(p: { text: string; sub?: string; cant?: boolean; progress: number; icon?: string } | null) {
    if (!p) { this.interactEl.classList.remove('on'); return; }
    this.interactEl.classList.add('on');
    this.interactEl.classList.toggle('cant', !!p.cant);
    const html = p.sub ? `${p.text}<small>${p.sub}</small>` : p.text;
    if (this.interactText.innerHTML !== html) this.interactText.innerHTML = html;
    this.interactRing.setAttribute('stroke-dashoffset', String(138.2 * (1 - p.progress)));
    const ico = p.icon ?? (this.input.usingTouch ? '✋' : 'E');
    if (this.interactIco.textContent !== ico) this.interactIco.textContent = ico;
  }

  setAimActive(on: boolean) { this.buttons.aim.classList.toggle('active', on); }

  private isMoveSide(x: number) {
    return save.settings.leftHanded ? x > layout.W * 0.55 : x < layout.W * 0.45;
  }

  private down(e: PointerEvent) {
    if (e.pointerType === 'mouse') return;
    if (!this.visible) return;
    if (inReserved(e.clientX, e.clientY)) return; // reserved Netlify zone: no handlers
    const target = e.target as HTMLElement;
    if (target.closest('.screen') || target.closest('.tut')) return;
    e.preventDefault();
    this.input.usingTouch = true;
    const btn = target.closest('[data-act]') as HTMLElement | null;
    const role: Role = { kind: 'look', lx: e.clientX, ly: e.clientY, lt: e.timeStamp };
    if (btn) {
      const act = btn.dataset.act!;
      role.kind = 'btn'; role.act = act; role.el = btn;
      btn.classList.add('pressed');
      this.buttonDown(act);
    } else if (this.isMoveSide(e.clientX) && save.settings.leftLookPad && e.clientY < layout.H * PAD_SPLIT) {
      // invisible look pad above the stick: drag to turn, quick tap to toggle aim-down-sights
      role.kind = 'pad'; role.t0 = e.timeStamp; role.travel = 0;
    } else if (this.isMoveSide(e.clientX)) {
      role.kind = 'joy';
      let ox = Math.max(layout.sal + 66, Math.min(layout.W - layout.sar - 66, e.clientX));
      let oy = Math.max(layout.sat + 66, Math.min(layout.H - layout.sab - 66, e.clientY));
      // never let the floating stick sit over the reserved zone
      if (inReserved(ox + 65, oy + 65)) oy = layout.reserved.y - 70;
      role.ox = ox; role.oy = oy;
      this.joyBase.style.left = ox + 'px';
      this.joyBase.style.top = oy + 'px';
      this.joyBase.style.display = 'block';
      this.joyHint.style.display = 'none';
      this.updateJoy(role, e.clientX, e.clientY);
    }
    this.roles.set(e.pointerId, role);
  }

  private move(e: PointerEvent) {
    const role = this.roles.get(e.pointerId);
    if (!role) return;
    e.preventDefault();
    const dx = e.clientX - role.lx, dy = e.clientY - role.ly;
    const dt = Math.max(1, e.timeStamp - role.lt);
    role.lx = e.clientX; role.ly = e.clientY; role.lt = e.timeStamp;
    if (role.kind === 'joy') this.updateJoy(role, e.clientX, e.clientY);
    else if (role.kind === 'look' || role.kind === 'pad' || (role.kind === 'btn' && role.act === 'fire')) {
      if (role.kind === 'pad') role.travel = (role.travel ?? 0) + Math.hypot(dx, dy);
      const speed = Math.hypot(dx, dy) / dt; // px/ms
      const accel = 1 + 0.7 * Math.max(0, Math.min(1, (speed - 0.3) / 2.2));
      this.input.addLook(dx * accel, dy * accel, 0.0048);
    }
  }

  private up(e: PointerEvent) {
    const role = this.roles.get(e.pointerId);
    if (!role) return;
    this.roles.delete(e.pointerId);
    if (role.kind === 'joy') {
      this.input.moveX = 0; this.input.moveY = 0; this.input.sprint = false;
      this.joyBase.style.display = 'none';
      this.joyHint.style.display = 'block';
    } else if (role.kind === 'btn' && role.act) {
      role.el?.classList.remove('pressed');
      this.buttonUp(role.act);
    } else if (role.kind === 'pad' && (role.travel ?? 0) < 14 && e.timeStamp - (role.t0 ?? 0) < 280) {
      this.input.aimPad = !this.input.aimPad;
    }
  }

  private updateJoy(role: Role, x: number, y: number) {
    const R = 60;
    let dx = x - role.ox!, dy = y - role.oy!;
    const d = Math.hypot(dx, dy);
    const m = Math.min(1, d / R);
    if (d > R) { dx = (dx / d) * R; dy = (dy / d) * R; }
    this.joyKnob.style.transform = `translate(${dx}px, ${dy}px)`;
    const dead = 0.12;
    const mag = m < dead ? 0 : (m - dead) / (1 - dead);
    const nx = d > 0 ? dx / Math.min(d, R) : 0, ny = d > 0 ? dy / Math.min(d, R) : 0;
    this.input.moveX = nx * mag;
    this.input.moveY = -ny * mag;
    this.input.sprint = m > 0.9 && -ny > 0.5;
    this.joyBase.classList.toggle('sprint', this.input.sprint);
  }

  private buttonDown(act: string) {
    const i = this.input;
    switch (act) {
      case 'fire': i.fire = true; break;
      case 'aim': i.aimHeld = true; i.aimToggled = !i.aimToggled; break;
      case 'reload': i.press('reload'); break;
      case 'swap': i.press('swap'); break;
      case 'melee': i.press('melee'); break;
      case 'grenade': i.grenadeHeld = true; break;
      case 'interact': i.interactHeld = true; i.press('interactPress'); break;
      case 'pause': i.press('pause'); break;
    }
  }

  private buttonUp(act: string) {
    const i = this.input;
    switch (act) {
      case 'fire': i.fire = false; break;
      case 'aim': i.aimHeld = false; break;
      case 'grenade': i.grenadeHeld = false; i.press('grenadeRelease'); break;
      case 'interact': i.interactHeld = false; break;
    }
  }

  releaseAll() {
    for (const [, r] of this.roles) r.el?.classList.remove('pressed');
    this.roles.clear();
    this.input.reset();
    this.joyBase.style.display = 'none';
    this.joyHint.style.display = 'block';
  }
}
