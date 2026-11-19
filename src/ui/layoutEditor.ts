import { h } from '../core/dom';
import { persist, save } from '../core/save';
import { audio } from '../audio/audioEngine';
import { layout } from './layout';
import { clampCentre, clearOverrides, setOverride, type HudItemKind } from './hudLayout';
import type { App } from '../main';

/**
 * Pause → "Customize layout": every touch button and HUD piece gets a dashed handle you can
 * drag anywhere. Positions save as you go; Reset restores the default layout. The reserved
 * Netlify corner and the safe areas are off limits (pieces slide out of them).
 */
export class LayoutEditor {
  private root: HTMLElement;
  private handles: { id: string; el: HTMLElement; kind: HudItemKind; handle: HTMLElement }[] = [];
  private raf = 0;

  constructor(private app: App, private onClose: () => void) {
    const g = app.game!;
    this.root = h('div', { class: 'layout-editor' });
    const bar = h('div', { class: 'le-bar' },
      h('div', { class: 'le-title' }, 'DRAG ANYTHING TO MOVE IT'),
      h('button', { class: 'btn small', onclick: () => this.reset() }, 'Reset'),
      h('button', { class: 'btn small primary', onclick: () => this.close() }, 'Done'));
    this.root.appendChild(bar);
    document.getElementById('app')!.appendChild(this.root);
    // show everything that can be moved
    app.touch.setVisible(true);
    g.hud.setVisible(true);
    app.touch.setInteract({ text: 'Buy / use prompt', sub: 'appears here', progress: 0.35 });
    const items: [string, HTMLElement, string, HudItemKind][] = [
      ...app.touch.movable().map(([id, el, label]) => [id, el, label, id.startsWith('btn:') ? 'btn' : 'box'] as [string, HTMLElement, string, HudItemKind]),
      ...g.hud.movable().map(([id, el, label]) => [id, el, label, 'box'] as [string, HTMLElement, string, HudItemKind]),
    ];
    for (const [id, el, label, kind] of items) {
      const handle = h('div', { class: 'le-handle' }, h('span', null, label));
      this.root.appendChild(handle);
      this.handles.push({ id, el, kind, handle });
      this.bindDrag(id, el, kind, handle);
    }
    const loop = () => { this.syncHandles(); this.raf = requestAnimationFrame(loop); };
    loop();
  }

  private bindDrag(id: string, el: HTMLElement, kind: HudItemKind, handle: HTMLElement) {
    let start: { px: number; py: number; cx: number; cy: number } | null = null;
    handle.addEventListener('pointerdown', (e) => {
      e.preventDefault(); e.stopPropagation();
      handle.setPointerCapture(e.pointerId);
      const r = el.getBoundingClientRect();
      start = { px: e.clientX, py: e.clientY, cx: r.left + r.width / 2, cy: r.top + r.height / 2 };
      handle.classList.add('drag');
    });
    handle.addEventListener('pointermove', (e) => {
      if (!start) return;
      e.preventDefault();
      const r = el.getBoundingClientRect();
      const bh = kind === 'btn' ? 18 : 0;
      const [cx, cy0] = clampCentre(start.cx + e.clientX - start.px, start.cy + e.clientY - start.py + bh / 2, r.width || 60, (r.height || 40) + bh);
      const cy = cy0 - bh / 2;
      setOverride(id, cx / layout.W, cy / layout.H);
      this.relayout();
    });
    const end = () => { if (start) { start = null; handle.classList.remove('drag'); persist(); audio.play('ui_click', { bus: 'ui', vol: 0.4 }); } };
    handle.addEventListener('pointerup', end);
    handle.addEventListener('pointercancel', end);
  }

  private relayout() {
    this.app.touch.layout();
    this.app.game?.hud.layout();
  }

  private syncHandles() {
    for (const it of this.handles) {
      const r = it.el.getBoundingClientRect();
      const w = Math.max(44, r.width + 8), hh = Math.max(36, r.height + 8);
      const s = it.handle.style;
      s.left = r.left + r.width / 2 - w / 2 + 'px';
      s.top = r.top + r.height / 2 - hh / 2 + 'px';
      s.width = w + 'px';
      s.height = hh + 'px';
      s.borderRadius = it.kind === 'btn' ? '50%' : '6px';
    }
  }

  private reset() {
    clearOverrides();
    this.relayout();
    audio.play('ui_back', { bus: 'ui', vol: 0.6 });
  }

  close() {
    cancelAnimationFrame(this.raf);
    this.root.remove();
    this.app.touch.setInteract(null);
    this.app.touch.setVisible(false);
    persist();
    void save;
    this.onClose();
  }
}
