import { h } from '../core/dom';
import { save, persist, defaultSettings, type Settings, type Quality } from '../core/save';
import { MAPS } from '../world/maps';
import { DIFFICULTY, type DifficultyId } from '../config/difficulty';
import { LORE } from '../config/lore';
import { PERKS } from '../config/perks';
import { ECONOMY } from '../config/economy';
import { audio } from '../audio/audioEngine';
import type { App } from '../main';

/** Chalk-on-slate floor plan of a map, drawn from its grid layout. */
function mapPreview(id: string): HTMLCanvasElement {
  const m = MAPS[id];
  const rows = m.layout, H = rows.length, W = Math.max(...rows.map((r) => r.length));
  const c = document.createElement('canvas');
  const S = 6;
  c.width = W * S; c.height = H * S;
  const g = c.getContext('2d')!;
  const letters = m.zones.map((z) => z.letter);
  const zc = ['#3a4a44', '#4a3a30', '#2e3a4a', '#4a4630', '#3a2e3e', '#2e4a3a'];
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    const ch = rows[y][x] ?? ' ';
    const zi = letters.indexOf(ch);
    let col = '';
    if (ch === '#') col = '#d8d0bc';
    else if (ch === 'w') col = '#c0392b';
    else if (ch >= '1' && ch <= '9') col = '#d8a940';
    else if (ch === ',') col = '#141412';
    else if (zi >= 0 || 'xopcrsbelvq*'.includes(ch)) col = zi >= 0 ? zc[zi % zc.length] : '#5a5448';
    if (!col) continue;
    g.fillStyle = col;
    g.fillRect(x * S, y * S, S, S);
  }
  c.style.cssText = 'width:100%;height:auto;max-height:46%;object-fit:contain;opacity:.85;margin-bottom:6px;image-rendering:pixelated';
  return c;
}

const click = () => audio.play('ui_click', { bus: 'ui', vol: 0.7 });
const back = () => audio.play('ui_back', { bus: 'ui', vol: 0.7 });

function btn(label: string, onclick: () => void, cls = 'btn') {
  return h('button', { class: cls, onclick: () => { click(); onclick(); } }, label);
}

/** Menu screens. All screens are plain DOM inside #screens. */
export class Menus {
  constructor(private app: App) {}

  // ------------------------------------------------------------------ title
  title(): HTMLElement {
    const logo = h('div', { class: 'title-logo' }, 'TETHERED', h('span', { class: 'glitch' }, 'TETHERED'));
    const scr = h('div', { class: 'screen', style: 'align-items:center;justify-content:center;text-align:center;background:radial-gradient(ellipse at center, rgba(0,0,0,0.05), rgba(0,0,0,0.78))' },
      logo,
      h('div', { class: 'title-sub' }, 'PROJECT TETHER · 1944'),
      h('div', { style: 'height:9vh' }),
      h('div', { class: 'tap-start' }, 'TAP TO START'),
      h('div', { class: 'txt', style: 'position:absolute;bottom:calc(var(--sab) + 12px);left:calc(var(--sal) + 16px);font-size:11px;opacity:0.6' }, 'Best with sound on · landscape'),
    );
    const glitch = () => {
      if (!logo.isConnected) return;
      logo.classList.add('glitching');
      setTimeout(() => logo.classList.remove('glitching'), 90 + Math.random() * 120);
      setTimeout(glitch, 600 + Math.random() * 2200);
    };
    setTimeout(glitch, 800);
    return scr;
  }

  // ------------------------------------------------------------------ main
  main(): HTMLElement {
    const a = this.app;
    return h('div', { class: 'screen', style: 'justify-content:center;background:linear-gradient(90deg, rgba(5,4,3,0.92) 0%, rgba(5,4,3,0.7) 45%, rgba(5,4,3,0.1) 100%)' },
      h('div', { class: 'title-logo', style: 'font-size:clamp(34px,10vh,60px);margin-bottom:2vh' }, 'TETHERED'),
      h('div', { class: 'menu-col', style: 'width:min(300px,38vw)' },
        btn('Play', () => a.setScreen(this.mapSelect()), 'btn primary'),
        btn('Settings', () => a.setScreen(this.settings(() => a.setScreen(this.main())))),
        btn('Lore Notes', () => a.setScreen(this.lore(() => a.setScreen(this.main())))),
        btn('How to Play', () => a.setScreen(this.howTo(() => a.setScreen(this.main())))),
        btn('Credits', () => a.setScreen(this.credits())),
      ),
    );
  }

  private header(title: string, onBack: () => void) {
    return h('div', { style: 'display:flex;align-items:center;gap:14px;margin-bottom:8px' },
      h('button', { class: 'btn small', onclick: () => { back(); onBack(); } }, '‹ Back'),
      h('div', { class: 'h1', style: 'margin:0' }, title),
    );
  }

  mapSelect(): HTMLElement {
    const a = this.app;
    const grid = h('div', { style: 'display:flex;gap:12px;flex:1;min-height:0' });
    for (const id of ['ravenmoor', 'station']) {
      const m = MAPS[id];
      if (!m) continue;
      const scores = (['easy', 'normal', 'hardened'] as DifficultyId[]).map((d) => {
        const s = save.scores[`${id}:${d}`];
        return `${DIFFICULTY[d].name}: ${s ? 'R' + s.round : '—'}`;
      }).join('   ');
      const card = h('div', { class: 'card', style: 'flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-height:0;overflow:hidden;background:' + (id === 'ravenmoor' ? 'linear-gradient(160deg,#1c2622,#0c0d0b)' : 'linear-gradient(160deg,#2a2214,#0b0c12)') },
        mapPreview(id),
        h('div', { class: 'ct' }, m.name.toUpperCase()),
        h('div', { class: 'cs' }, m.subtitle),
        h('div', { class: 'cs', style: 'margin-top:6px;font-size:11px' }, m.desc),
        h('div', { class: 'cb' }, 'BEST — ' + scores),
      );
      card.addEventListener('click', () => { click(); a.mapId = id; a.setScreen(this.difficulty()); });
      grid.appendChild(card);
    }
    return h('div', { class: 'screen dim' }, this.header('Choose a Map', () => a.setScreen(this.main())), grid);
  }

  difficulty(): HTMLElement {
    const a = this.app;
    let sel: DifficultyId = a.difficulty;
    const cards = h('div', { style: 'display:flex;gap:10px' });
    const draw = () => {
      cards.innerHTML = '';
      for (const d of Object.values(DIFFICULTY)) {
        const s = save.scores[`${a.mapId}:${d.id}`];
        const c = h('div', { class: 'card' + (d.id === sel ? ' sel' : ''), style: 'flex:1' },
          h('div', { class: 'ct' }, d.name.toUpperCase()),
          h('div', { class: 'cs' }, d.desc),
          h('div', { class: 'cb' }, s ? `Best: round ${s.round} · ${s.kills} kills` : 'No record yet'));
        c.addEventListener('click', () => { click(); sel = d.id; draw(); });
        cards.appendChild(c);
      }
    };
    draw();
    return h('div', { class: 'screen dim' },
      this.header(MAPS[a.mapId].name, () => a.setScreen(this.mapSelect())),
      h('div', { class: 'h2' }, 'Difficulty'),
      cards,
      h('div', { style: 'flex:1' }),
      h('div', { style: 'display:flex;justify-content:flex-start' },
        btn('Deploy', () => { a.difficulty = sel; a.startGame(a.mapId, sel); }, 'btn primary')),
    );
  }

  // ------------------------------------------------------------------ settings
  settings(onBack: () => void): HTMLElement {
    const s = save.settings;
    const a = this.app;
    const changed = () => { persist(); a.applySettings(); };
    const slider = (label: string, key: keyof Settings, min: number, max: number, step: number) => {
      const val = h('span', { class: 'txt', style: 'width:38px;text-align:right' }, String((s[key] as number).toFixed(2)));
      const inp = h('input', { type: 'range', min, max, step, value: String(s[key]) }) as HTMLInputElement;
      inp.addEventListener('input', () => { (s as any)[key] = parseFloat(inp.value); val.textContent = (s[key] as number).toFixed(2); changed(); });
      return h('div', { class: 'row' }, h('label', null, label), h('div', { style: 'display:flex;align-items:center;gap:8px;width:55%' }, inp, val));
    };
    const toggle = (label: string, key: keyof Settings) => {
      const t = h('div', { class: 'tog' + (s[key] ? ' on' : '') });
      t.addEventListener('click', () => { (s as any)[key] = !s[key]; t.classList.toggle('on', !!s[key]); click(); changed(); });
      return h('div', { class: 'row' }, h('label', null, label), t);
    };
    const seg = <T extends string>(label: string, key: keyof Settings, opts: [T, string][]) => {
      const wrap = h('div', { class: 'seg' });
      const draw = () => {
        wrap.innerHTML = '';
        for (const [v, l] of opts) {
          const b = h('button', { class: s[key] === v ? 'on' : '' }, l);
          b.addEventListener('click', () => { (s as any)[key] = v; click(); draw(); changed(); });
          wrap.appendChild(b);
        }
      };
      draw();
      return h('div', { class: 'row' }, h('label', null, label), wrap);
    };
    const list = h('div', { class: 'scroll panel', style: 'flex:1;min-height:0' },
      h('div', { class: 'h2' }, 'Controls'),
      slider('Look sensitivity', 'lookSens', 0.2, 3, 0.05),
      slider('Aim (ADS) sensitivity', 'adsSens', 0.2, 2, 0.05),
      toggle('Invert look Y', 'invertY'),
      toggle('Aim assist', 'aimAssist'),
      slider('Aim assist strength', 'aimAssistStrength', 0, 1, 0.05),
      seg('Aim button', 'adsMode', [['hold', 'Hold'], ['toggle', 'Toggle']]),
      seg('Button size', 'buttonSize', [['S', 'S'], ['M', 'M'], ['L', 'L']]),
      slider('Button opacity', 'buttonOpacity', 0.2, 1, 0.05),
      toggle('Left-handed layout', 'leftHanded'),
      toggle('Look pad above the move stick', 'leftLookPad'),
      h('div', { class: 'h2', style: 'margin-top:12px' }, 'Story'),
      toggle('Story cutscenes', 'cutscenes'),
      h('div', { class: 'row' }, h('label', null, 'Prologues'), btn('Show prologues again', () => { save.seen = save.seen.filter((x) => !x.startsWith('prologue:')); persist(); }, 'btn small')),
      h('div', { class: 'h2', style: 'margin-top:12px' }, 'Graphics'),
      seg<Quality>('Quality', 'quality', [['low', 'Low'], ['medium', 'Medium'], ['high', 'High']]),
      toggle('Show FPS', 'showFps'),
      h('div', { class: 'h2', style: 'margin-top:12px' }, 'Audio'),
      slider('Master volume', 'master', 0, 1, 0.05),
      slider('Music volume', 'music', 0, 1, 0.05),
      slider('Effects volume', 'sfx', 0, 1, 0.05),
      slider('Voices volume', 'voice', 0, 1, 0.05),
      h('div', { class: 'h2', style: 'margin-top:12px' }, 'Other'),
      h('div', { class: 'row' }, h('label', null, 'Tutorial'), btn('Replay tutorial', () => { s.tutorialDone = false; changed(); }, 'btn small')),
      h('div', { class: 'row' }, h('label', null, 'Defaults'), btn('Reset settings', () => {
        Object.assign(s, { ...defaultSettings, tutorialDone: s.tutorialDone });
        changed();
        this.app.setScreen(this.settings(onBack));
      }, 'btn small')),
    );
    return h('div', { class: 'screen dim' }, this.header('Settings', onBack), list);
  }

  // ------------------------------------------------------------------ how to play
  howTo(onBack: () => void): HTMLElement {
    const perkLines = Object.values(PERKS).map((p) => `<b style="color:#${p.color.toString(16).padStart(6, '0')}">${p.name}</b> (${p.cost}) — ${p.desc}`).join('<br>');
    const body = h('div', { class: 'scroll panel txt', style: 'flex:1;min-height:0', html: `
      <div class="h2">Controls</div>
      <b>Touch:</b> drag the left side to move (push to the edge to sprint), swipe the right side to look. FIRE (drag from it to keep aiming), AIM, RELOAD, SWAP, MELEE, GRENADE (hold to cook, release to throw). Purchases need a short hold on the prompt.<br>
      <b>Look pad:</b> the invisible upper half of the movement side is a second look pad — drag it to aim with your other thumb while you hold FIRE, and tap it to aim down sights.<br>
      <b>Keyboard + mouse:</b> WASD move, Shift sprint, mouse look (click to lock), LMB fire, RMB aim, R reload, E interact (hold), Q swap, F melee, G grenade, Esc pause.
      <div class="h2" style="margin-top:10px">Surviving</div>
      Every Tethered has a glowing chip in its skull. <b>Shoot the chip</b> for a critical hit — it shorts the Tether out and pays more.<br>
      The dead come through boarded windows: hold the prompt at a window to rebuild boards (+10 each).<br>
      Spend points on chalk wall-buys, doors and debris. Find the <b>power switch</b> to wake the perk machines and the Rewirer.<br>
      The <b>Supply Crate</b> (950) gives a random weapon — until it gets bored and moves.<br>
      <b>The Rewirer</b> (${ECONOMY.rewirerCost}) overcharges your weapon. Kills sometimes drop <b>ammo tins</b> — small, medium or large — that top up every gun you carry. Every few rounds, the static storm brings chipped hounds. From round 12, Brutes wear cages over their chips: shoot the cage off first.
      <div class="h2" style="margin-top:10px">Halcyon Tonics (max 4)</div>${perkLines}
      <div class="h2" style="margin-top:10px">Power-ups</div>
      Resupply (max ammo), Overload (one-hit kills), Double Points, Kill Signal (kills every Tethered), Fortify (rebuilds every barrier).
      <div class="h2" style="margin-top:10px">Secrets</div>
      Both maps hide a radio-driven main quest, a boss, a hidden song and lore notes. Listen to the static.` });
    return h('div', { class: 'screen dim' }, this.header('How to Play', onBack), body,
      h('div', { style: 'margin-top:8px' }, btn('Replay tutorial next game', () => { save.settings.tutorialDone = false; persist(); }, 'btn small')));
  }

  // ------------------------------------------------------------------ lore
  lore(onBack: () => void): HTMLElement {
    const list = h('div', { class: 'scroll', style: 'flex:1;min-height:0;display:grid;grid-template-columns:1fr 1fr;gap:8px;align-content:start' });
    const found = new Set(save.notes);
    for (const n of LORE) {
      const has = found.has(n.id);
      const c = h('div', { class: 'card', style: has ? '' : 'opacity:0.45' },
        h('div', { class: 'ct', style: 'font-size:14px' }, has ? n.title : '— missing —'),
        h('div', { class: 'cs' }, n.map === 'ravenmoor' ? 'Ravenmoor Asylum' : 'Halcyon Signal Station'));
      if (has) c.addEventListener('click', () => { click(); this.app.setScreen(this.noteView(n.id, () => this.app.setScreen(this.lore(onBack)), null)); });
      list.appendChild(c);
    }
    return h('div', { class: 'screen dim' }, this.header(`Lore Notes  ${found.size}/${LORE.length}`, onBack), list);
  }

  noteView(id: string, onClose: () => void, digit: string | null): HTMLElement {
    const n = LORE.find((x) => x.id === id)!;
    const body = n.body.replace('{D}', digit ?? '—');
    const paper = h('div', { class: 'note-paper scroll' },
      n.stamp ? h('div', { class: 'stamp' }, n.stamp) : null,
      h('h3', null, n.title),
      h('div', { style: 'white-space:pre-wrap' }, body));
    const scr = h('div', { class: 'screen dim', style: 'align-items:center;justify-content:center' }, paper,
      h('div', { class: 'txt', style: 'margin-top:8px' }, 'Tap anywhere to close'));
    scr.addEventListener('click', () => { back(); onClose(); });
    return scr;
  }

  credits(): HTMLElement {
    return h('div', { class: 'screen dim' }, this.header('Credits', () => this.app.setScreen(this.main())),
      h('div', { class: 'panel txt scroll', style: 'flex:1;min-height:0', html: `
        <div class="h2">TETHERED</div>
        An original wave-survival horror shooter. Every model, texture, animation, sound effect and piece of music is generated in code at load time — there are no downloaded art or audio files.<br><br>
        <b>Engine:</b> three.js · Vite · TypeScript<br>
        <b>Fonts:</b> Black Ops One (SIL OFL) · Special Elite (Apache 2.0), bundled via Fontsource<br>
        <b>Audio:</b> Web Audio API, rendered offline — layered synthesis, formant voices, convolution reverb<br><br>
        All names, places and organisations — the Halcyon Signal Corps, Project TETHER, Ravenmoor — are fictional. Any resemblance to real signal corps is purely coincidental.<br><br>
        <i>Peace Through Signal.</i>` }));
  }

  // ------------------------------------------------------------------ pause
  pause(): HTMLElement {
    const a = this.app;
    const g = a.game;
    const info = g ? `${MAPS[a.mapId].name} · Round ${g.rounds.round} · ${DIFFICULTY[a.difficulty].name}` : '';
    return h('div', { class: 'screen dim', style: 'justify-content:center' },
      h('div', { class: 'h1' }, 'PAUSED'),
      h('div', { class: 'txt', style: 'margin-bottom:10px' }, info),
      h('div', { class: 'menu-col', style: 'width:min(300px,38vw)' },
        btn('Resume', () => a.resume(), 'btn primary'),
        btn('Settings', () => a.setScreen(this.settings(() => a.setScreen(this.pause())))),
        btn('How to Play', () => a.setScreen(this.howTo(() => a.setScreen(this.pause())))),
        btn('Quit to Menu', () => a.setScreen(this.confirmQuit())),
      ),
    );
  }

  confirmQuit(): HTMLElement {
    const a = this.app;
    return h('div', { class: 'screen dim', style: 'justify-content:center;align-items:center;text-align:center' },
      h('div', { class: 'h1' }, 'ABANDON THE RUN?'),
      h('div', { class: 'txt', style: 'margin-bottom:12px' }, 'Your progress this game will be lost (your best round is still saved).'),
      h('div', { style: 'display:flex;gap:10px' },
        btn('Keep fighting', () => a.setScreen(this.pause()), 'btn primary'),
        btn('Quit', () => a.quitToMenu())),
    );
  }
}
