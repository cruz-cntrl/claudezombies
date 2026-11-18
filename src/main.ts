import '@fontsource/black-ops-one/400.css';
import '@fontsource/special-elite/400.css';
import './ui/styles.css';
import * as THREE from 'three';
import { Renderer } from './render/renderer';
import { Loop } from './core/loop';
import { save, persist } from './core/save';
import { Input, KeyboardMouse } from './input/input';
import { TouchControls } from './input/touchControls';
import { computeLayout } from './ui/layout';
import { Game } from './game';
import { World } from './world/mapBuilder';
import { AutoQuality, QUALITY_ORDER } from './render/quality';
import { setTextureSize } from './render/proceduralTextures';
import { MAPS } from './world/maps';
import { DIFFICULTY, type DifficultyId } from './config/difficulty';
import { h } from './core/dom';

export const params = new URLSearchParams(location.search);
export const DEBUG = params.get('debug') === '1';

type State = 'loading' | 'title' | 'menu' | 'playing' | 'paused' | 'gameover';

// ---------------------------------------------------------------- gesture blocking
function blockGestures() {
  const stop = (e: Event) => e.preventDefault();
  document.addEventListener('gesturestart', stop, { passive: false } as AddEventListenerOptions);
  document.addEventListener('gesturechange', stop, { passive: false } as AddEventListenerOptions);
  document.addEventListener('gestureend', stop, { passive: false } as AddEventListenerOptions);
  document.addEventListener('dblclick', stop, { passive: false });
  document.addEventListener('contextmenu', stop);
  document.addEventListener('selectstart', stop);
  document.addEventListener('touchmove', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest && t.closest('.scroll')) return;
    if ((e as TouchEvent).touches.length > 1 || !t.closest?.('input')) e.preventDefault();
  }, { passive: false });
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    if (now - lastTouch < 300 && !(e.target as HTMLElement).closest?.('input,.scroll')) e.preventDefault();
    lastTouch = now;
  }, { passive: false });
}

export class App {
  state: State = 'loading';
  readonly r: Renderer;
  readonly input = new Input();
  readonly touch: TouchControls;
  readonly kbm: KeyboardMouse;
  readonly loop: Loop;
  game: Game | null = null;
  /** World shown behind the title / menu (flythrough) */
  backdrop: World | null = null;
  backdropMap = '';
  time = 0;
  screens = document.getElementById('screens')!;
  autoQ: AutoQuality;
  fpsEl: HTMLElement | null = null;
  mapId = 'ravenmoor';
  difficulty: DifficultyId = 'normal';

  constructor() {
    const canvas = document.getElementById('game') as HTMLCanvasElement;
    const q = (params.get('quality') as any) || save.settings.quality;
    setTextureSize(q === 'low' ? 256 : 512);
    this.r = new Renderer(canvas, q);
    this.r.renderer.info.autoReset = false;
    this.touch = new TouchControls(this.input);
    this.touch.applySettings();
    this.kbm = new KeyboardMouse(this.input, canvas, () => this.state === 'playing');
    this.kbm.onPauseRequest = () => this.pause();
    this.loop = new Loop((dt) => this.update(dt), (a, fdt) => this.render(a, fdt));
    this.autoQ = new AutoQuality(() => this.dropQuality());
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => { computeLayout(); this.r.resize(); }, 250));
    window.addEventListener('resize', () => {
      computeLayout();
      if (window.innerHeight > window.innerWidth && this.state === 'playing') this.pause();
    });
    if (DEBUG || save.settings.showFps) {
      this.fpsEl = h('div', { class: 'hud-fps' });
      this.fpsEl.style.left = 'calc(var(--sal) + 70px)';
      this.fpsEl.style.top = 'calc(var(--sat) + 8px)';
      this.fpsEl.style.zIndex = '60';
      document.getElementById('app')!.appendChild(this.fpsEl);
    }
  }

  async boot() {
    this.showLoading('Preparing');
    this.loop.start();
    const mapParam = params.get('map');
    const first = mapParam && MAPS[mapParam] ? mapParam : 'ravenmoor';
    await this.loadBackdrop(first);
    if (params.get('autostart') === '1') {
      await this.startGame(first, (params.get('difficulty') as DifficultyId) || 'normal');
      return;
    }
    this.showTitle();
  }

  // ------------------------------------------------------------ loading
  private loadingEls: { fill: HTMLElement; label: HTMLElement } | null = null;
  showLoading(label: string) {
    const fill = h('div', { class: 'loader-fill' });
    const lab = h('div', { class: 'loader-label' }, label);
    const scr = h('div', { class: 'screen solid', style: 'align-items:center;justify-content:center;text-align:center' },
      h('div', { class: 'title-logo' }, 'TETHERED'),
      h('div', { class: 'title-sub' }, 'RAVENMOOR · 1944'),
      h('div', { class: 'loader-bar' }, fill),
      lab,
    );
    this.setScreen(scr);
    this.loadingEls = { fill, label: lab };
  }
  progress(f: number, label: string) {
    if (!this.loadingEls) return;
    this.loadingEls.fill.style.width = Math.round(f * 100) + '%';
    this.loadingEls.label.textContent = label.toUpperCase();
  }

  async loadBackdrop(id: string) {
    if (this.backdropMap === id && this.backdrop) return;
    this.disposeBackdrop();
    this.backdrop = await Game.load(this.r, MAPS[id], (f, l) => this.progress(f, l));
    this.backdropMap = id;
  }

  disposeBackdrop() {
    if (!this.backdrop) return;
    this.r.scene.remove(this.backdrop.group);
    this.backdrop.dispose();
    this.backdrop = null;
    this.backdropMap = '';
  }

  setScreen(el: HTMLElement | null) {
    this.screens.innerHTML = '';
    if (el) this.screens.appendChild(el);
  }

  // ------------------------------------------------------------ title / menu
  showTitle() {
    this.state = 'title';
    this.touch.setVisible(false);
    const logo = h('div', { class: 'title-logo' }, 'TETHERED', h('span', { class: 'glitch' }, 'TETHERED'));
    const scr = h('div', { class: 'screen', style: 'align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at center, rgba(0,0,0,0.1), rgba(0,0,0,0.75))' },
      logo,
      h('div', { class: 'title-sub' }, 'PROJECT TETHER · 1944'),
      h('div', { style: 'height:8vh' }),
      h('div', { class: 'tap-start' }, 'TAP TO START'),
    );
    scr.addEventListener('pointerup', () => this.showMenu(), { once: true });
    this.setScreen(scr);
  }

  showMenu() {
    this.state = 'menu';
    const scr = h('div', { class: 'screen dim', style: 'justify-content:center' },
      h('div', { class: 'h1' }, 'TETHERED'),
      h('div', { class: 'menu-col', style: 'width:min(320px,40vw)' },
        h('button', { class: 'btn primary', onclick: () => this.startGame(this.mapId, this.difficulty) }, 'Deploy'),
      ),
    );
    this.setScreen(scr);
  }

  // ------------------------------------------------------------ session
  async startGame(mapId: string, diff: DifficultyId) {
    this.mapId = mapId;
    this.difficulty = diff;
    this.showLoading('Deploying');
    if (this.backdropMap !== mapId) await this.loadBackdrop(mapId);
    const world = this.backdrop!;
    this.backdrop = null;
    this.backdropMap = '';
    this.game?.dispose();
    this.game = new Game(this.r, world, this.input, DIFFICULTY[diff]);
    this.setScreen(null);
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.touch.setVisible(true);
    computeLayout();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.kbm.exitLock();
    const scr = h('div', { class: 'screen dim', style: 'justify-content:center' },
      h('div', { class: 'h1' }, 'PAUSED'),
      h('div', { class: 'menu-col', style: 'width:min(320px,40vw)' },
        h('button', { class: 'btn primary', onclick: () => this.resume() }, 'Resume'),
        h('button', { class: 'btn', onclick: () => this.quitToMenu() }, 'Quit to Menu'),
      ),
    );
    this.setScreen(scr);
  }

  resume() {
    if (this.state !== 'paused') return;
    if (window.innerHeight > window.innerWidth) return;
    this.setScreen(null);
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.touch.setVisible(true);
  }

  async quitToMenu() {
    this.game?.dispose();
    this.game = null;
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.showLoading('Returning');
    await this.loadBackdrop(this.mapId);
    this.showMenu();
  }

  dropQuality() {
    const idx = QUALITY_ORDER.indexOf(this.r.quality);
    if (idx <= 0) return;
    const q = QUALITY_ORDER[idx - 1];
    this.r.setQuality(q);
    save.settings.quality = q;
    persist();
    if (this.game) this.game.world.setupLightPool(this.r.scene, this.r.preset.practicalLights);
  }

  // ------------------------------------------------------------ loop
  update(dt: number) {
    if (this.input.consume('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (this.state === 'playing' && this.game) this.game.update(dt);
  }

  private flyT = 0;
  render(alpha: number, frameDt: number) {
    this.time += frameDt;
    this.r.renderer.info.reset();
    if (this.game && (this.state === 'playing' || this.state === 'paused' || this.state === 'gameover')) {
      this.game.render(this.state === 'playing' ? alpha : 1, this.state === 'playing' ? frameDt : 0);
    } else if (this.backdrop) {
      this.flythrough(frameDt);
    }
    this.r.render(this.time);
    this.autoQ.update(this.loop.fps, frameDt, this.state === 'playing');
    if (this.fpsEl) {
      const inf = this.r.renderer.info;
      this.fpsEl.textContent = `${this.loop.fps.toFixed(0)} fps  ${inf.render.calls} dc  ${(inf.render.triangles / 1000).toFixed(0)}k tri  ${this.r.quality}`;
    }
  }

  /** Slow camera drift through the backdrop map behind the title / menus. */
  private flythrough(dt: number) {
    const w = this.backdrop!;
    this.flyT += dt * 0.05;
    const g = w.grid;
    const cam = this.r.camera;
    const sx = g.start.i + 0.5, sz = g.start.j + 0.5;
    const t = this.flyT;
    cam.position.set(sx + Math.sin(t) * 2.2, 1.7 + Math.sin(t * 0.7) * 0.15, sz + Math.cos(t * 0.8) * 2.2);
    cam.rotation.order = 'YXZ';
    cam.rotation.set(-0.05 + Math.sin(t * 0.5) * 0.05, t * 0.9, 0);
    w.update(dt, this.time, cam.position, true);
  }
}

// ---------------------------------------------------------------- boot
blockGestures();
if (DEBUG) document.body.classList.add('debug');
if (params.get('safe') === '1') document.documentElement.classList.add('sim-safe');
computeLayout();
const app = new App();
(window as any).app = app;
app.boot().catch((e) => {
  console.error(e);
  document.getElementById('screens')!.innerHTML = `<div class="screen solid" style="align-items:center;justify-content:center"><div class="h2">Failed to start</div><div class="txt">${String(e)}</div></div>`;
});
void THREE;
