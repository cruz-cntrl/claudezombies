import { h } from '../core/dom';
import { save, persist, defaultSettings, isUnlocked, type Settings, type Quality } from '../core/save';
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
    else if (ch === '%') col = '#b8ad96';
    else if (ch === 'f') col = '#7a7262';
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
    const bg: Record<string, string> = {
      grounds: 'linear-gradient(160deg,#3a2a3a,#141220 60%,#0b0b10)',
      ravenmoor: 'linear-gradient(160deg,#1c2622,#0c0d0b)',
      station: 'linear-gradient(160deg,#2a2214,#0b0c12)',
    };
    for (const id of ['grounds', 'ravenmoor', 'station']) {
      const m = MAPS[id];
      if (!m) continue;
      const open = isUnlocked(m);
      const scores = (['easy', 'normal', 'hardened'] as DifficultyId[]).map((d) => {
        const s = save.scores[`${id}:${d}`];
        return `${DIFFICULTY[d].name[0]}: ${s ? 'R' + s.round : '—'}`;
      }).join('  ');
      const lockNote = !open && m.unlock ? `LOCKED — reach round ${m.unlock.round} on ${MAPS[m.unlock.map]?.name ?? m.unlock.map}` : '';
      const card = h('div', { class: 'card' + (open ? '' : ' locked'), style: 'flex:1;display:flex;flex-direction:column;justify-content:flex-end;min-height:0;overflow:hidden;background:' + bg[id] },
        mapPreview(id),
        h('div', { class: 'ct' }, m.name.toUpperCase()),
        h('div', { class: 'cs' }, m.subtitle),
        open ? h('div', { class: 'cs', style: 'margin-top:4px;font-size:11px' }, m.desc) : h('div', { class: 'lock-note' }, '🔒 ' + lockNote),
        h('div', { class: 'cb' }, 'BEST — ' + scores),
      );
      card.addEventListener('click', () => {
        if (!open) { audio.play('ui_denied', { bus: 'ui', vol: 0.7 }); card.classList.remove('shake'); void card.offsetWidth; card.classList.add('shake'); return; }
        click(); a.mapId = id; a.setScreen(this.difficulty());
      });
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
      toggle('Auto-fire while aiming at a target', 'autoFireAds'),
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
      <b>Jump / vault / climb:</b> tap JUMP to hop. Next to low cover (sandbags, gravestones, a wing) it vaults you over. Walk into a ladder to climb it — push forward to go up, back to come down, JUMP to let go. The Tethered can climb ladders too, one at a time; hounds and Brutes can’t.<br>
      <b>Keyboard + mouse:</b> WASD move, Shift sprint, Space jump / vault, mouse look (click to lock), LMB fire, RMB aim, R reload, E interact (hold), Q swap, F melee, G grenade, Esc pause.
      <div class="h2" style="margin-top:10px">Surviving</div>
      Every Tethered has a glowing chip in its skull. <b>Shoot the chip</b> and it shorts out — <b>one hit kills</b> any Tethered or hound, and pays more. Brutes cage theirs, and bosses only take heavy damage there.<br>
      The dead come through boarded windows: hold the prompt at a window to rebuild boards (+10 each).<br>
      Spend points on chalk wall-buys, doors and debris. Find the <b>power switch</b> to wake the perk machines and the Rewirer.<br>
      The <b>Supply Crate</b> (950) gives a random weapon — until it gets bored and moves.<br>
      <b>The Rewirer</b> (${ECONOMY.rewirerCost}) overcharges your weapon. Kills sometimes drop <b>ammo tins</b> — small, medium or large — that top up every gun you carry. Every few rounds, the static storm brings chipped hounds. From round 12, Brutes wear cages over their chips: shoot the cage off first.
      <div class="h2" style="margin-top:10px">Halcyon Tonics (max 4)</div>${perkLines}
      <div class="h2" style="margin-top:10px">Power-ups</div>
      Resupply (max ammo), Overload (one-hit kills), Double Points, Kill Signal (kills every Tethered), Fortify (rebuilds every barrier).
      <div class="h2" style="margin-top:10px">Secrets</div>
      Every map hides a main quest, a hidden song and lore notes. Listen to the static — and to the bells on the Grounds.
      <div class="h2" style="margin-top:10px">Maps</div>
      Start on <b>Ravenmoor Grounds</b>. Reach <b>round 5</b> there and the <b>Asylum</b> opens; reach <b>round 5</b> in the Asylum and <b>Halcyon Signal Station</b> opens.<br>
      <b>Aiming:</b> while aimed in, the gun fires by itself whenever the red dot is on a Tethered (switch off in Settings). Aim speed has its own slider in the pause menu.` });
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
        h('div', { class: 'cs' }, MAPS[n.map]?.name ?? n.map));
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
    const gate = Object.values(MAPS).find((m) => m.unlock?.map === a.mapId && !isUnlocked(m));
    const goal = gate && gate.unlock ? `Goal: reach round ${gate.unlock.round} to open ${gate.name}` : '';
    const big = g && g.world.def.outdoor;
    return h('div', { class: 'screen dim', style: 'justify-content:center' },
      h('div', { style: 'display:flex;gap:18px;align-items:center;min-height:0;flex:1' },
        h('div', { style: 'display:flex;flex-direction:column;justify-content:center' },
          h('div', { class: 'h1' }, 'PAUSED'),
          h('div', { class: 'txt', style: 'margin-bottom:4px' }, info),
          goal ? h('div', { class: 'txt', style: 'margin-bottom:10px;color:var(--gold)' }, goal) : h('div', { style: 'height:6px' }),
          h('div', { class: 'menu-col', style: 'width:min(280px,34vw)' },
            this.quickSlider('Look speed', 'lookSens', 0.2, 3),
            this.quickSlider('Aim speed (while aiming)', 'adsSens', 0.2, 3),
            btn('Resume', () => a.resume(), 'btn primary'),
            btn('Settings', () => a.setScreen(this.settings(() => a.setScreen(this.pause())))),
            btn('How to Play', () => a.setScreen(this.howTo(() => a.setScreen(this.pause())))),
            btn('Quit to Menu', () => a.setScreen(this.confirmQuit())),
          )),
        big && g ? this.liveMap(g) : null,
      ),
    );
  }

  /** Compact sensitivity slider for the pause screen (same setting as in Settings). */
  private quickSlider(label: string, key: 'lookSens' | 'adsSens', min: number, max: number): HTMLElement {
    const s = save.settings;
    const val = h('span', { style: 'width:34px;text-align:right;font-size:12px' }, s[key].toFixed(2));
    const inp = h('input', { type: 'range', min, max, step: 0.05, value: String(s[key]), style: 'flex:1;accent-color:var(--blood);height:26px;touch-action:none' }) as HTMLInputElement;
    inp.addEventListener('input', () => { s[key] = parseFloat(inp.value); val.textContent = s[key].toFixed(2); persist(); this.app.applySettings(); });
    return h('div', { class: 'txt', style: 'display:flex;flex-direction:column;gap:0;margin-bottom:2px' },
      h('div', { style: 'font-size:12px;opacity:.85' }, label),
      h('div', { style: 'display:flex;align-items:center;gap:6px' }, inp, val));
  }

  /** Pause-screen map of an open map: unlocked areas, machines, and where you are. */
  private liveMap(g: NonNullable<App['game']>): HTMLElement {
    const w = g.world, grid = w.grid, def = w.def;
    const S = 3;
    const c = document.createElement('canvas');
    c.width = grid.w * S; c.height = grid.h * S;
    const x = c.getContext('2d')!;
    const zc = ['#5a7a5e', '#6a6a8a', '#5e6e7a', '#7a6a4e', '#6e5a4a', '#5a6e6e'];
    for (let j = 0; j < grid.h; j++) for (let i = 0; i < grid.w; i++) {
      const k = grid.kindAt(i, j), zi = grid.zoneAt(i, j);
      let col = '';
      if (grid.hidden[j * grid.w + i]) col = '#c8bca0';
      else if (k === 2) col = '#3a362e';
      else if (k === 4) col = '#c0392b';
      else if (k === 5) col = w.doors.get(String.fromCharCode(grid.doorId[j * grid.w + i]))?.open ? '' : '#d8a940';
      else if (grid.fence[j * grid.w + i]) col = '#2a2824';
      else if (zi >= 0 && k !== 3) col = w.zoneActive[zi] ? zc[zi % zc.length] : '#1e1e1c';
      if (!col) { if (zi >= 0) col = w.zoneActive[zi] ? zc[zi % zc.length] : '#1e1e1c'; else continue; }
      x.fillStyle = col; x.fillRect(i * S, j * S, S, S);
    }
    // labels for unlocked areas
    x.font = `bold ${S * 3.2}px sans-serif`; x.textAlign = 'center'; x.fillStyle = 'rgba(255,255,255,0.85)';
    def.zones.forEach((zd, zi) => {
      if (!w.zoneActive[zi]) return;
      let sx = 0, sz = 0, n = 0;
      for (let j = 0; j < grid.h; j += 2) for (let i = 0; i < grid.w; i += 2) if (grid.zoneAt(i, j) === zi && grid.kindAt(i, j) === 1) { sx += i; sz += j; n++; }
      if (n) x.fillText(zd.name.toUpperCase(), (sx / n) * S, (sz / n) * S);
    });
    const dot = (i: number, j: number, col: string, r: number) => { x.fillStyle = col; x.beginPath(); x.arc(i * S, j * S, r, 0, 7); x.fill(); };
    for (const m of grid.markers) {
      if (m.zone >= 0 && !w.zoneActive[m.zone]) continue;
      if (m.ch === 'p') dot(m.i + 0.5, m.j + 0.5, '#4ff0e8', S * 1.4);
      else if (m.ch === 's') dot(m.i + 0.5, m.j + 0.5, '#ffd040', S * 1.6);
      else if (m.ch === 'r') dot(m.i + 0.5, m.j + 0.5, '#c070ff', S * 1.6);
      else if (m.ch === 'b') dot(m.i + 0.5, m.j + 0.5, '#e9e1cc', S * 1.1);
    }
    // you
    const p = g.player;
    x.save();
    x.translate(p.pos.x * S, p.pos.z * S);
    x.rotate(-p.yaw);
    x.fillStyle = '#ff3b2a'; x.strokeStyle = '#000'; x.lineWidth = 2;
    x.beginPath(); x.moveTo(0, -S * 4); x.lineTo(S * 2.6, S * 2.6); x.lineTo(-S * 2.6, S * 2.6); x.closePath(); x.stroke(); x.fill();
    x.restore();
    c.style.cssText = 'height:min(78vh,330px);width:auto;max-width:52vw;border:2px solid rgba(233,225,204,0.25);image-rendering:pixelated;background:#0c0b0a';
    const legend = h('div', { class: 'txt', style: 'font-size:11px;opacity:.85;margin-top:4px;text-align:center', html:
      '<span style="color:#ff3b2a">▲</span> you &nbsp; <span style="color:#4ff0e8">●</span> tonic &nbsp; <span style="color:#ffd040">●</span> power &nbsp; <span style="color:#c070ff">●</span> Rewirer &nbsp; <span style="color:#e9e1cc">●</span> wall gun' });
    return h('div', { style: 'display:flex;flex-direction:column;align-items:center;min-height:0' }, c, legend);
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
