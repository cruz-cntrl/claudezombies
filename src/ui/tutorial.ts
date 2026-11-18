import { h } from '../core/dom';
import { save, persist } from '../core/save';
import { bus } from '../core/events';
import type { Game } from '../game';

interface Step { touch: string; keys: string; done: (g: Game, t: number) => boolean }

/**
 * First-play tutorial: one short, skippable hint at a time, advanced by doing the thing.
 * Never blocks input.
 */
export class Tutorial {
  private el: HTMLElement;
  private idx = 0;
  private t = 0;
  private start = { x: 0, z: 0, yaw: 0 };
  private flags = { shot: false, reload: false, buy: false, repair: false };
  private unsub: (() => void)[] = [];
  active = true;

  private steps: Step[] = [
    { touch: '<b>Move:</b> drag on the left side of the screen. Push to the edge to sprint.', keys: '<b>Move:</b> WASD, Shift to sprint.',
      done: (g) => Math.hypot(g.player.pos.x - this.start.x, g.player.pos.z - this.start.z) > 2.5 },
    { touch: '<b>Look:</b> swipe on the right side of the screen.', keys: '<b>Look:</b> click to lock the mouse, then move it.',
      done: (g) => Math.abs(g.player.yaw - this.start.yaw) > 0.9 },
    { touch: '<b>Fire:</b> hold the red FIRE button. Aim for the glowing chip on their skulls.', keys: '<b>Fire:</b> left mouse button. Aim for the glowing chips.',
      done: () => this.flags.shot },
    { touch: '<b>Reload:</b> tap RELOAD.', keys: '<b>Reload:</b> press R.',
      done: () => this.flags.reload },
    { touch: 'Walk up to a <b>chalk outline</b> on a wall and <b>hold</b> the prompt to buy that gun.', keys: 'Walk up to a <b>chalk outline</b> and <b>hold E</b> to buy that gun.',
      done: (_g, t) => this.flags.buy || t > 22 },
    { touch: 'They tear boards off the windows. <b>Hold</b> the prompt at a window to rebuild (+10 each).', keys: 'They tear boards off the windows. <b>Hold E</b> at a window to rebuild (+10 each).',
      done: (_g, t) => this.flags.repair || t > 22 },
    { touch: 'Spend points on <b>doors and debris</b> to open new areas — and new windows.', keys: 'Spend points on <b>doors and debris</b> to open new areas — and new windows.',
      done: (_g, t) => t > 7 },
    { touch: 'Find the <b>power switch</b> to wake the perk machines and the Rewirer. The <b>Supply Crate</b> gives a random gun.', keys: 'Find the <b>power switch</b> to wake the perk machines and the Rewirer. The <b>Supply Crate</b> gives a random gun.',
      done: (_g, t) => t > 8 },
  ];

  constructor(private g: Game) {
    this.el = h('div', { class: 'tut' });
    document.getElementById('app')!.appendChild(this.el);
    this.start = { x: g.player.pos.x, z: g.player.pos.z, yaw: g.player.yaw };
    this.unsub.push(
      bus.on('ammoChanged', () => {
        const w = g.weapons.current;
        if (!w) return;
        if (g.weapons.state === 'reload') this.flags.reload = true;
        if (w.mag < w.stats.mag) this.flags.shot = true;
      }),
      bus.on('pointsChanged', (e) => {
        if (e.delta <= -500) this.flags.buy = true;
        if (e.reason === 'repair') this.flags.repair = true;
      }),
      bus.on('weaponChanged', () => { if (g.weapons.slots.length > 1) this.flags.buy = true; }),
    );
    this.render();
  }

  private render() {
    const s = this.steps[this.idx];
    if (!s) { this.finish(); return; }
    this.el.innerHTML = (this.g.input.usingTouch || matchMedia('(pointer: coarse)').matches ? s.touch : s.keys) +
      ` <span class="skip">Skip tutorial</span> <span class="txt" style="font-size:11px;opacity:.6">${this.idx + 1}/${this.steps.length}</span>`;
    this.el.querySelector('.skip')!.addEventListener('click', () => this.finish());
  }

  update(dt: number) {
    if (!this.active) return;
    this.t += dt;
    const s = this.steps[this.idx];
    if (!s) return;
    if (s.done(this.g, this.t)) {
      this.idx++;
      this.t = 0;
      this.render();
    }
  }

  setVisible(on: boolean) { this.el.style.display = on && this.active ? 'block' : 'none'; }

  finish() {
    if (!this.active) return;
    this.active = false;
    save.settings.tutorialDone = true;
    persist();
    this.el.remove();
    for (const u of this.unsub) u();
  }

  dispose() { this.el.remove(); for (const u of this.unsub) u(); }
}
