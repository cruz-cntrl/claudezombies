import '@fontsource/black-ops-one/400.css';
import '@fontsource/special-elite/400.css';
import './ui/styles.css';
import { Renderer } from './render/renderer';
import { Loop } from './core/loop';
import { save, persist, recordScore, addNote } from './core/save';
import { Input, KeyboardMouse } from './input/input';
import { TouchControls } from './input/touchControls';
import { computeLayout } from './ui/layout';
import { Game } from './game';
import type { World } from './world/mapBuilder';
import { AutoQuality, QUALITY_ORDER } from './render/quality';
import { setTextureSize } from './render/proceduralTextures';
import { MAPS } from './world/maps';
import { DIFFICULTY, type DifficultyId } from './config/difficulty';
import { h } from './core/dom';
import { audio } from './audio/audioEngine';
import { registerSounds, ESSENTIAL } from './audio/catalog';
import { Menus } from './ui/menus';
import { Tutorial } from './ui/tutorial';
import { Music } from './audio/music/score';

registerSounds();

export const params = new URLSearchParams(location.search);
export const DEBUG = params.get('debug') === '1';

type State = 'loading' | 'title' | 'menu' | 'playing' | 'paused' | 'gameover';

// ---------------------------------------------------------------- gesture blocking
function blockGestures() {
  const stop = (e: Event) => e.preventDefault();
  const opts = { passive: false } as AddEventListenerOptions;
  document.addEventListener('gesturestart', stop, opts);
  document.addEventListener('gesturechange', stop, opts);
  document.addEventListener('gestureend', stop, opts);
  document.addEventListener('dblclick', stop, opts);
  document.addEventListener('contextmenu', stop);
  document.addEventListener('selectstart', stop);
  document.addEventListener('touchmove', (e) => {
    const t = e.target as HTMLElement;
    if (t.closest?.('.scroll') && (e as TouchEvent).touches.length === 1) return;
    if (t.closest?.('input[type=range]')) return;
    e.preventDefault();
  }, opts);
  let lastTouch = 0;
  document.addEventListener('touchend', (e) => {
    const now = Date.now();
    const t = e.target as HTMLElement;
    if (now - lastTouch < 300 && !t.closest?.('.screen,.tut,input')) e.preventDefault();
    lastTouch = now;
  }, opts);
}

export class App {
  state: State = 'loading';
  readonly r: Renderer;
  readonly input = new Input();
  readonly touch: TouchControls;
  readonly kbm: KeyboardMouse;
  readonly loop: Loop;
  readonly menus: Menus;
  readonly music = new Music();
  game: Game | null = null;
  tutorial: Tutorial | null = null;
  /** World shown behind the title / menu (flythrough) */
  backdrop: World | null = null;
  backdropMap = '';
  time = 0;
  screens = document.getElementById('screens')!;
  autoQ: AutoQuality;
  fpsEl: HTMLElement;
  mapId = 'ravenmoor';
  difficulty: DifficultyId = 'normal';
  private flyT = 0;

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
    this.menus = new Menus(this);
    this.r.onContextRestored = () => {
      // GPU resources are re-uploaded by three.js on restore; rebuild the composer + light pools
      if (this.game) this.game.world.setupLightPool(this.r.scene, this.r.preset.practicalLights);
    };
    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.state === 'playing') this.pause();
    });
    window.addEventListener('orientationchange', () => setTimeout(() => { computeLayout(); this.r.resize(); }, 250));
    window.addEventListener('resize', () => {
      computeLayout();
      if (window.innerHeight > window.innerWidth && this.state === 'playing') this.pause();
    });
    this.fpsEl = h('div', { class: 'hud-fps' });
    this.fpsEl.style.left = 'calc(var(--sal) + 70px)';
    this.fpsEl.style.top = 'calc(var(--sat) + 8px)';
    this.fpsEl.style.zIndex = '60';
    document.getElementById('app')!.appendChild(this.fpsEl);
    this.applySettings();
  }

  async boot() {
    this.showLoading('Preparing');
    this.loop.start();
    const mapParam = params.get('map');
    const first = mapParam && MAPS[mapParam] ? mapParam : 'ravenmoor';
    this.mapId = first;
    let audioF = 0, mapF = 0, mapL = 'Preparing';
    const report = () => this.progress(mapF * 0.75 + audioF * 0.25, audioF < 1 && mapF >= 1 ? 'Recording sounds' : mapL);
    await Promise.all([
      this.loadBackdrop(first, (f, l) => { mapF = f; mapL = l; report(); }),
      audio.preload(ESSENTIAL, (f) => { audioF = f; report(); }),
    ]);
    if (params.get('autostart') === '1') {
      save.settings.tutorialDone = params.get('tutorial') !== '1';
      await this.startGame(first, (params.get('difficulty') as DifficultyId) || 'normal');
      return;
    }
    if (params.get('screen') === 'menu') { this.showMenu(); return; }
    this.showTitle();
  }

  // ------------------------------------------------------------ loading
  private loadingEls: { fill: HTMLElement; label: HTMLElement } | null = null;
  showLoading(label: string) {
    const fill = h('div', { class: 'loader-fill' });
    const lab = h('div', { class: 'loader-label' }, label);
    const m = MAPS[this.mapId];
    const scr = h('div', { class: 'screen solid', style: 'align-items:center;justify-content:center;text-align:center' },
      h('div', { class: 'title-logo' }, 'TETHERED'),
      h('div', { class: 'title-sub' }, (m ? m.name : 'Ravenmoor').toUpperCase() + ' · 1944'),
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

  async loadBackdrop(id: string, onP?: (f: number, l: string) => void) {
    if (this.backdropMap === id && this.backdrop) return;
    this.disposeBackdrop();
    this.backdrop = await Game.load(this.r, MAPS[id], onP ?? ((f, l) => this.progress(f, l)));
    this.backdropMap = id;
  }

  disposeBackdrop() {
    if (!this.backdrop) return;
    this.r.scene.remove(this.backdrop.group);
    this.backdrop.setupLightPool(this.r.scene, 0);
    this.backdrop.dispose();
    this.backdrop = null;
    this.backdropMap = '';
  }

  setScreen(el: HTMLElement | null) {
    this.screens.innerHTML = '';
    this.loadingEls = null;
    if (el) this.screens.appendChild(el);
  }

  // ------------------------------------------------------------ title / menu
  showTitle() {
    this.state = 'title';
    this.touch.setVisible(false);
    const scr = this.menus.title();
    // iOS only unlocks Web Audio inside certain gestures: try every one of them
    for (const ev of ['touchend', 'click']) scr.addEventListener(ev, () => audio.unlock(), { once: true });
    scr.addEventListener('pointerup', () => {
      audio.unlock();
      audio.play('ui_click', { bus: 'ui' });
      this.music.playMenu();
      audio.background();
      this.showMenu();
    }, { once: true });
    this.setScreen(scr);
  }

  showMenu() {
    this.state = 'menu';
    this.touch.setVisible(false);
    this.setScreen(this.menus.main());
  }

  applySettings() {
    const s = save.settings;
    this.touch.applySettings();
    audio.applyVolumes();
    this.fpsEl.style.display = DEBUG || s.showFps ? 'block' : 'none';
    if (s.quality !== this.r.quality && !params.get('quality')) {
      this.r.setQuality(s.quality);
      const w = this.game?.world ?? this.backdrop;
      w?.setupLightPool(this.r.scene, this.r.preset.practicalLights);
      if (this.game) {
        this.game.zombies.setupChipLights(this.r.scene, this.r.preset.chipLights);
        this.game.fx.particleScale = this.r.preset.particles;
      }
    }
    computeLayout();
    this.game?.hud.layout();
  }

  // ------------------------------------------------------------ session
  async startGame(mapId: string, diff: DifficultyId) {
    this.mapId = mapId;
    this.difficulty = diff;
    this.showLoading('Deploying');
    this.music.stop(1.5);
    if (this.backdropMap !== mapId) await this.loadBackdrop(mapId);
    const world = this.backdrop!;
    this.backdrop = null;
    this.backdropMap = '';
    this.tutorial?.dispose();
    this.tutorial = null;
    if (this.game) { this.game.dispose(); this.game = null; }
    audio.stopAll();
    this.game = new Game(this.r, world, this.input, DIFFICULTY[diff], this.touch);
    this.game.onGameOver = () => this.showGameOver();
    this.game.onReadNote = (id, digit) => this.readNote(id, digit);
    this.game.onModal = (el) => this.showModal(el);
    audio.unlock();
    audio.background();
    this.music.startGame(this.game);
    this.setScreen(null);
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.touch.setVisible(true);
    if (!save.settings.tutorialDone) this.tutorial = new Tutorial(this.game);
    computeLayout();
    this.game.hud.layout();
  }

  pause() {
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.tutorial?.setVisible(false);
    this.kbm.exitLock();
    audio.duck(1);
    this.setScreen(this.menus.pause());
  }

  resume() {
    if (this.state !== 'paused') return;
    if (window.innerHeight > window.innerWidth) return;
    this.setScreen(null);
    this.state = 'playing';
    this.input.reset();
    this.input.enabled = true;
    this.touch.setVisible(true);
    this.tutorial?.setVisible(true);
    audio.duck(0);
  }

  /** Lore note overlay — pauses the game while open. */
  readNote(id: string, digit: string | null) {
    if (this.state !== 'playing') return;
    if (addNote(id)) audio.play('ui_noteFound', { bus: 'ui' });
    this.state = 'paused';
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.kbm.exitLock();
    this.setScreen(this.menus.noteView(id, () => { this.state = 'paused'; this.resume(); }, digit));
  }

  /** Generic in-game modal (radio dial, keypad). Pauses until closed. */
  showModal(el: HTMLElement | null) {
    if (!el) { if (this.state === 'paused') this.resume(); return; }
    if (this.state !== 'playing') return;
    this.state = 'paused';
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.kbm.exitLock();
    this.setScreen(el);
  }

  showGameOver() {
    const g = this.game;
    if (!g) return;
    this.state = 'gameover';
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.tutorial?.setVisible(false);
    g.hud.setVisible(false);
    this.kbm.exitLock();
    this.music.gameOver();
    const st = g.player.stats;
    const round = g.rounds.round;
    const best = recordScore(this.mapId, this.difficulty, round, st.kills);
    const fmt = (t: number) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
    const scr = h('div', { class: 'screen dim', style: 'align-items:center;justify-content:center;text-align:center' },
      h('div', { class: 'gameover-title' }, `YOU SURVIVED ${round} ROUND${round === 1 ? '' : 'S'}`),
      best ? h('div', { class: 'newbest' }, 'NEW BEST') : null,
      h('div', { class: 'panel stats', style: 'margin:10px 0;min-width:300px' },
        h('span', null, 'Kills'), h('span', null, String(st.kills)),
        h('span', null, 'Headshots'), h('span', null, String(st.headshots)),
        h('span', null, 'Chip kills'), h('span', null, String(st.chipKills)),
        h('span', null, 'Points earned'), h('span', null, String(st.pointsEarned)),
        h('span', null, 'Doors opened'), h('span', null, String(st.doorsOpened)),
        h('span', null, 'Time'), h('span', null, fmt(st.time)),
        h('span', null, 'Easter egg'), h('span', null, g.eeSummary()),
      ),
      h('div', { style: 'display:flex;gap:10px' },
        h('button', { class: 'btn primary', onclick: () => { audio.play('ui_click', { bus: 'ui' }); this.startGame(this.mapId, this.difficulty); } }, 'Retry'),
        h('button', { class: 'btn', onclick: () => { audio.play('ui_click', { bus: 'ui' }); this.quitToMenu(); } }, 'Menu'),
      ),
    );
    this.setScreen(scr);
  }

  async quitToMenu() {
    this.tutorial?.dispose();
    this.tutorial = null;
    if (this.game) { this.game.dispose(); this.game = null; }
    audio.stopAll();
    this.input.enabled = false;
    this.touch.setVisible(false);
    this.showLoading('Returning');
    await this.loadBackdrop(this.mapId);
    this.music.playMenu();
    this.showMenu();
  }

  dropQuality() {
    const idx = QUALITY_ORDER.indexOf(this.r.quality);
    if (idx <= 0) return;
    const q = QUALITY_ORDER[idx - 1];
    this.r.setQuality(q);
    save.settings.quality = q;
    persist();
    if (this.game) {
      this.game.world.setupLightPool(this.r.scene, this.r.preset.practicalLights);
      this.game.zombies.setupChipLights(this.r.scene, this.r.preset.chipLights);
      this.game.fx.particleScale = this.r.preset.particles;
    }
  }

  // ------------------------------------------------------------ loop
  update(dt: number) {
    if (this.input.consume('pause')) {
      if (this.state === 'playing') this.pause();
      else if (this.state === 'paused') this.resume();
    }
    if (this.state === 'playing' && this.game) {
      this.game.update(dt);
      this.tutorial?.update(dt);
    }
    this.music.update(dt, this.state === 'playing' ? this.game : null);
  }

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
    if (this.fpsEl.style.display !== 'none') {
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
    cam.fov = this.r.baseFov;
    cam.updateProjectionMatrix();
    w.update(dt, this.time, cam.position, true);
    audio.update(dt, cam.position, -Math.sin(cam.rotation.y), -Math.cos(cam.rotation.y));
  }
}

// ---------------------------------------------------------------- boot
blockGestures();
if (DEBUG) document.body.classList.add('debug');
if (params.get('safe') === '1') document.documentElement.classList.add('sim-safe');
computeLayout();
const app = new App();
(window as any).app = app;
if (DEBUG) (window as any).save = save;
app.boot().catch((e) => {
  console.error(e);
  document.getElementById('screens')!.innerHTML = `<div class="screen solid" style="align-items:center;justify-content:center"><div class="h2">Failed to start</div><div class="txt">${String(e)}</div></div>`;
});
