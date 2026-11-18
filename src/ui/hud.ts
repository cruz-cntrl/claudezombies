import { h } from '../core/dom';
import { bus } from '../core/events';
import { layout, onLayout } from './layout';
import { save } from '../core/save';
import { PERKS, type PerkId } from '../config/perks';
import { POWERUP_INFO, type PowerupId } from '../systems/powerups';
import type { Game } from '../game';

export const PERK_ICONS: Record<string, string> = {
  shield: '<path d="M12 3l7 3v6c0 4-3 7-7 9-4-2-7-5-7-9V6z"/>',
  hand: '<path d="M8 12V6a1.5 1.5 0 013 0v5M11 11V4.5a1.5 1.5 0 013 0V11M14 11V6a1.5 1.5 0 013 0v7c0 4-2.5 7-6 7s-5-2-6-5l-1.5-3a1.5 1.5 0 012.5-1.5L8 13"/>',
  lung: '<path d="M12 4v8M12 12c-1 0-2 1-3 1M12 12c1 0 2 1 3 1M9 7C6 8 4 13 5 18c1 2 4 1 5-1V9M15 7c3 1 5 6 4 11-1 2-4 1-5-1V9"/>',
  boot: '<path d="M8 3h5v9l6 3c1 .5 1 3 0 4H5v-3l3-1z"/><path d="M4 21h16"/>',
  bolt: '<path d="M13 2L5 14h6l-1 8 8-12h-6z"/>',
  crate: '<path d="M3 8l9-4 9 4v9l-9 4-9-4z"/><path d="M3 8l9 4 9-4M12 12v9"/>',
};
const PU_ICONS: Record<PowerupId, string> = {
  resupply: '<rect x="4" y="8" width="16" height="11"/><path d="M4 12h16M8 8V5h8v3"/>',
  overload: '<path d="M13 2L6 13h5l-2 9 8-12h-5z"/>',
  double: '<text x="12" y="17" text-anchor="middle" font-size="12" fill="currentColor" stroke="none" font-family="Black Ops One">x2</text>',
  killsignal: '<path d="M12 21V10M8 21l4-11 4 11M8 7a5 5 0 018 0M5 4a9 9 0 0114 0"/>',
  fortify: '<path d="M4 8l16-2M4 13l16-2M4 18l16-2"/>',
};

/** The in-game HUD. Every element is placed relative to safe areas and the reserved zone. */
export class Hud {
  readonly root = document.getElementById('hud')!;
  private points = h('div', { class: 'hud-points' });
  private pointsVal = h('span', null, '500');
  private ammo = h('div', { class: 'hud-ammo' });
  private mag = h('span', { class: 'mag' }, '8');
  private res = h('span', { class: 'res' }, ' / 80');
  private wname = h('div', { class: 'wname' }, '');
  private nades = h('div', { class: 'nades' }, '');
  private roundBox = h('div', { class: 'hud-round' });
  private roundCanvas = document.createElement('canvas');
  private perks = h('div', { class: 'hud-perks' });
  private pus = h('div', { class: 'hud-powerups' });
  private cross = h('div', { class: 'crosshair' });
  private ct = h('i', { class: 't' }); private cb = h('i', { class: 'b' }); private cl = h('i', { class: 'l' }); private cr = h('i', { class: 'r' });
  private hit = h('div', { class: 'hitmarker' });
  private warn = h('div', { class: 'hud-warn' }, '');
  private msg = h('div', { class: 'hud-msg' });
  private boss = h('div', { class: 'hud-boss' });
  private bossFill = h('div', { class: 'fill' });
  private bossName = h('div', { class: 'bn' });
  private revive = h('div', { class: 'hud-revive' });
  private ee = h('div', { class: 'hud-ee' });
  private scope = h('div', { style: 'position:absolute;inset:0;display:none;background:radial-gradient(circle at center, transparent 0, transparent 32vh, rgba(0,0,0,0.97) 33vh);' });
  private staticEl = document.createElement('canvas');
  private dmgEdge = document.getElementById('damage-edge')!;
  private hitDirs = document.getElementById('hit-dirs')!;
  private msgT = 0;
  private hitT = 0;
  private dmgFlash = 0;
  private shownRound = -1;
  private roundAnim = 0;
  private unsub: (() => void)[] = [];
  private lastPerks = '';
  private lastPus = '';
  private staticT = 0;
  private lowHpT = 0;

  constructor(private g: Game) {
    const r = this.root;
    r.innerHTML = '';
    this.points.append(this.pointsVal);
    this.ammo.append(this.wname, h('div', null, this.mag, this.res), this.nades);
    this.roundBox.append(this.roundCanvas);
    this.cross.append(this.ct, this.cb, this.cl, this.cr, h('i', { class: 'dot' }));
    this.boss.append(this.bossName, h('div', { class: 'bar' }, this.bossFill));
    this.scope.innerHTML = '<div style="position:absolute;left:50%;top:50%;width:66vh;height:1px;margin-left:-33vh;background:rgba(0,0,0,0.85)"></div><div style="position:absolute;left:50%;top:50%;height:66vh;width:1px;margin-top:-33vh;background:rgba(0,0,0,0.85)"></div>';
    this.staticEl.className = 'static-overlay';
    this.staticEl.width = 160; this.staticEl.height = 90;
    this.staticEl.style.width = '100%'; this.staticEl.style.height = '100%';
    r.append(this.scope, this.staticEl, this.points, this.ammo, this.roundBox, this.perks, this.pus, this.cross, this.hit, this.warn, this.msg, this.boss, this.revive, this.ee);
    this.msg.style.opacity = '0';
    this.layout();
    onLayout(() => this.layout());
    this.unsub.push(
      bus.on('pointsPopup', (e) => this.popup(e.delta, !!e.crit)),
      bus.on('zombieHit', (e) => this.hitmark(e.chip ? 'crit' : '')),
      bus.on('zombieKilled', (e) => this.hitmark(e.chip ? 'crit kill' : 'kill')),
      bus.on('playerDamaged', (e) => this.damaged(e.fromX, e.fromZ)),
      bus.on('message', (e) => this.message(e.text, e.sub, e.duration ?? 2.5, e.color)),
      bus.on('bossStart', (e) => { this.boss.classList.add('on'); this.bossName.textContent = e.name.toUpperCase(); }),
      bus.on('bossHealth', (e) => { this.bossFill.style.width = Math.max(0, e.frac * 100) + '%'; }),
      bus.on('bossEnd', () => this.boss.classList.remove('on')),
      bus.on('eeProgress', (e) => { this.ee.textContent = e.text; }),
      bus.on('hudJam', (e) => { this.staticT = Math.max(this.staticT, e.seconds); }),
      bus.on('pickup', (e) => {
        const el = h('div', { class: 'ammo-pop ' + e.size }, e.text);
        this.ammo.appendChild(el);
        setTimeout(() => el.remove(), 1200);
      }),
    );
  }

  dispose() { for (const u of this.unsub) u(); this.root.innerHTML = ''; }

  setVisible(on: boolean) { this.root.classList.toggle('on', on); }

  layout() {
    const L = layout, left = save.settings.leftHanded;
    const r = L.reserved;
    const bs = save.settings.buttonSize === 'S' ? 0.85 : save.settings.buttonSize === 'L' ? 1.18 : 1;
    // points: top-right below safe area
    this.points.style.right = L.sar + 16 + 'px';
    this.points.style.top = L.sat + 4 + 'px';
    // ammo: right side, above the fire-button cluster (or left cluster when left-handed)
    const fireCy = left ? L.H - L.sab - 16 - 46 * bs : r.y - 12 - 46 * bs;
    const clusterTop = Math.max(L.sat + 40 * bs, fireCy - 118 * bs * Math.sin((75 * Math.PI) / 180)) - 29 * bs;
    if (!left) {
      this.ammo.style.right = L.sar + 18 + 'px'; this.ammo.style.left = '';
      this.ammo.style.textAlign = 'right';
    } else {
      this.ammo.style.left = L.sal + 18 + 'px'; this.ammo.style.right = '';
      this.ammo.style.textAlign = 'left';
    }
    this.ammo.style.top = '';
    this.ammo.style.bottom = Math.max(L.H - clusterTop + 6, 0) + 'px';
    // round counter: bottom-left (top-left beside pause when left-handed)
    const rw = 150, rh = 64;
    this.roundCanvas.width = rw * 2; this.roundCanvas.height = rh * 2;
    this.roundCanvas.style.width = rw + 'px'; this.roundCanvas.style.height = rh + 'px';
    if (!left) {
      this.roundBox.style.left = L.sal + 14 + 'px';
      this.roundBox.style.bottom = L.sab + 10 + 'px';
      this.roundBox.style.top = '';
      this.perks.style.left = L.sal + 16 + 'px';
      this.perks.style.bottom = L.sab + 10 + rh + 8 + 'px';
      this.perks.style.top = '';
    } else {
      this.roundBox.style.left = L.sal + 70 + 'px';
      this.roundBox.style.top = L.sat + 8 + 'px';
      this.roundBox.style.bottom = '';
      this.perks.style.left = L.sal + 72 + 'px';
      this.perks.style.top = L.sat + 8 + rh + 6 + 'px';
      this.perks.style.bottom = '';
    }
    this.pus.style.top = L.sat + 8 + 'px';
    this.msg.style.top = L.H * 0.2 + 'px';
    this.boss.style.top = L.sat + 52 + 'px';
    this.ee.style.left = L.sal + 70 + 'px';
    this.ee.style.top = left ? L.sat + 120 + 'px' : L.sat + 14 + 'px';
    this.shownRound = -1;
  }

  private popup(delta: number, crit: boolean) {
    if (this.points.childElementCount > 7) this.points.children[1]?.remove();
    const el = h('div', { class: 'pop' + (crit ? ' crit' : '') + (delta < 0 ? ' neg' : '') }, (delta > 0 ? '+' : '') + delta);
    el.style.top = 2 + Math.random() * 6 + 'px';
    this.points.appendChild(el);
    setTimeout(() => el.remove(), 900);
  }

  private hitmark(cls: string) {
    this.hit.className = 'hitmarker ' + cls;
    this.hit.style.opacity = '1';
    this.hitT = cls.includes('kill') ? 0.3 : 0.15;
  }

  private damaged(fx: number, fz: number) {
    this.dmgFlash = 1;
    const p = this.g.player;
    const ang = Math.atan2(fx - p.pos.x, fz - p.pos.z);
    // screen angle relative to facing (yaw 0 faces -z)
    const rel = -(ang - (p.yaw + Math.PI));
    const el = h('div', { class: 'hit-dir' });
    el.style.transform = `rotate(${rel}rad)`;
    el.style.transition = 'opacity 1.2s';
    this.hitDirs.appendChild(el);
    requestAnimationFrame(() => (el.style.opacity = '0'));
    setTimeout(() => el.remove(), 1300);
  }

  message(text: string, sub?: string, dur = 2.5, color?: string) {
    this.msg.innerHTML = '';
    this.msg.append(text);
    if (sub) this.msg.append(h('small', null, sub));
    this.msg.style.color = color ?? '';
    this.msg.style.opacity = '1';
    this.msgT = dur;
  }

  update(dt: number) {
    const g = this.g;
    const p = g.player;
    const ws = g.weapons;
    // points
    const pts = String(g.economy.points);
    if (this.pointsVal.textContent !== pts) this.pointsVal.textContent = pts;
    // ammo
    const w = ws.current;
    if (w) {
      const m = String(w.mag), rs = ' / ' + w.reserve;
      if (this.mag.textContent !== m) this.mag.textContent = m;
      if (this.res.textContent !== rs) this.res.textContent = rs;
      this.mag.classList.toggle('low', ws.lowAmmo);
      if (this.wname.textContent !== w.name) { this.wname.textContent = w.name; this.wname.classList.toggle('up', w.upgraded); }
      const nd = '◆'.repeat(ws.grenades) + '◇'.repeat(Math.max(0, ws.maxGrenades - ws.grenades));
      if (this.nades.textContent !== nd) this.nades.textContent = nd;
    }
    // round counter
    if (g.rounds.round !== this.shownRound) {
      if (this.shownRound >= 0 && g.rounds.round > this.shownRound) this.roundAnim = 1.6;
      this.shownRound = g.rounds.round;
      this.drawRound(this.shownRound, 0);
    }
    if (this.roundAnim > 0) {
      this.roundAnim -= dt;
      this.drawRound(this.shownRound, Math.max(0, this.roundAnim));
    }
    // perks
    const pk = [...p.perks].join(',');
    if (pk !== this.lastPerks) {
      this.lastPerks = pk;
      this.perks.innerHTML = '';
      for (const id of p.perks) {
        const d = PERKS[id as PerkId];
        const col = '#' + d.color.toString(16).padStart(6, '0');
        this.perks.appendChild(h('div', { class: 'perk-ico', style: `background:${col}`, html: `<svg viewBox="0 0 24 24">${PERK_ICONS[d.glyph]}</svg>` }));
      }
    }
    // power-ups
    const list = g.powerups.list;
    const key = list.map(([id, t]) => id + Math.ceil(t)).join(',');
    if (key !== this.lastPus) {
      this.lastPus = key;
      this.pus.innerHTML = '';
      for (const [id, t] of list) {
        const info = POWERUP_INFO[id];
        const col = '#' + info.color.toString(16).padStart(6, '0');
        const blink = t < 5 && Math.floor(t * 4) % 2 === 0 ? 'opacity:0.4' : '';
        this.pus.appendChild(h('div', { class: 'pu', style: blink },
          h('div', { class: 'pi', style: `border-color:${col};color:${col}`, html: `<svg viewBox="0 0 24 24" style="stroke:${col}">${PU_ICONS[id]}</svg>` }),
          String(Math.ceil(t))));
      }
    }
    // crosshair
    const scope = ws.vm.scopeActive;
    this.scope.style.display = scope ? 'block' : 'none';
    const showCross = ws.ads < 0.5 && !p.sprinting && ws.state !== 'swap' && !scope;
    this.cross.style.opacity = showCross ? '1' : '0';
    if (showCross) {
      const fov = (g.r.camera.fov * Math.PI) / 180;
      const px = Math.tan((ws.spread * Math.PI) / 180) / Math.tan(fov / 2) * (layout.H / 2);
      const gap = Math.max(4, Math.min(80, px));
      this.ct.style.top = -gap - 9 + 'px'; this.cb.style.top = gap + 'px';
      this.cl.style.left = -gap - 9 + 'px'; this.cr.style.left = gap + 'px';
    }
    this.hitT -= dt;
    if (this.hitT <= 0) this.hit.style.opacity = '0';
    // warnings
    let warn = '';
    if (w && !p.downed) {
      if (w.mag === 0 && w.reserve === 0) warn = 'NO AMMO';
      else if (ws.state === 'reload') warn = '';
      else if (w.mag === 0) warn = 'RELOAD';
      else if (ws.lowAmmo && w.stats.mag > 2) warn = 'LOW AMMO';
    }
    if (this.warn.textContent !== warn) this.warn.textContent = warn;
    this.warn.style.top = '40%';
    // message fade
    if (this.msgT > 0) { this.msgT -= dt; if (this.msgT <= 0) this.msg.style.opacity = '0'; }
    // damage edge
    const hpFrac = p.hp / p.maxHp;
    this.dmgFlash = Math.max(0, this.dmgFlash - dt * 1.5);
    const edge = Math.max(this.dmgFlash * 0.9, hpFrac < 0.6 ? (0.6 - hpFrac) * 1.4 : 0, p.downed ? 0.9 : 0);
    this.dmgEdge.style.opacity = String(Math.min(1, edge));
    // downed
    if (p.downed) {
      const txt = `DOWNED — REVIVING ${Math.ceil(p.downTimer)}`;
      if (this.revive.textContent !== txt) this.revive.textContent = txt;
      this.revive.style.display = 'block';
    } else this.revive.style.display = 'none';
    // HUD jam (static)
    if (this.staticT > 0) {
      this.staticT -= dt;
      this.staticEl.style.opacity = String(Math.min(0.55, this.staticT));
      const ctx = this.staticEl.getContext('2d')!;
      const img = ctx.createImageData(160, 90);
      for (let i = 0; i < img.data.length; i += 4) { const v = Math.random() * 255; img.data[i] = v * 0.8; img.data[i + 1] = v; img.data[i + 2] = v; img.data[i + 3] = 255; }
      ctx.putImageData(img, 0, 0);
      this.root.style.filter = Math.random() < 0.3 ? 'blur(1px)' : '';
    } else { this.staticEl.style.opacity = '0'; this.root.style.filter = ''; }
    this.lowHpT += dt;
  }

  /** Chalk tally marks for rounds 1–5, blood-red painted numerals after. */
  private drawRound(n: number, anim: number) {
    const c = this.roundCanvas, g = c.getContext('2d')!;
    const W = c.width, H = c.height;
    g.clearRect(0, 0, W, H);
    if (n <= 0) return;
    const flash = anim > 0 ? Math.abs(Math.sin(anim * 9)) * Math.min(1, anim) : 0;
    let seed = n * 977;
    const rnd = () => { seed = (seed * 16807) % 2147483647; return (seed % 1000) / 1000; };
    if (n <= 5) {
      const chalk = (x1: number, y1: number, x2: number, y2: number) => {
        for (let k = 0; k < 4; k++) {
          g.strokeStyle = `rgba(${200 + flash * 55},${200 - flash * 160},${190 - flash * 160},${0.35 + rnd() * 0.3})`;
          g.lineWidth = 6 + rnd() * 5;
          g.lineCap = 'round';
          g.beginPath();
          g.moveTo(x1 + (rnd() - 0.5) * 5, y1 + (rnd() - 0.5) * 5);
          g.lineTo(x2 + (rnd() - 0.5) * 5, y2 + (rnd() - 0.5) * 5);
          g.stroke();
        }
      };
      for (let i = 0; i < Math.min(4, n); i++) chalk(26 + i * 34, 18, 22 + i * 34 + rnd() * 10, H - 14);
      if (n === 5) chalk(6, H - 30, 150, 26);
    } else {
      g.font = `${H * 0.92}px "Black Ops One", Impact, sans-serif`;
      g.textBaseline = 'alphabetic';
      const txt = String(n);
      g.fillStyle = flash > 0.3 ? '#f4e8d0' : '#a3170f';
      g.shadowColor = 'rgba(0,0,0,0.9)'; g.shadowBlur = 8; g.shadowOffsetX = 3; g.shadowOffsetY = 3;
      g.fillText(txt, 8, H * 0.86);
      g.shadowBlur = 0; g.shadowOffsetX = 0; g.shadowOffsetY = 0;
      // drips
      const w = g.measureText(txt).width;
      g.fillStyle = '#7a0d08';
      for (let i = 0; i < 4; i++) {
        const x = 14 + rnd() * (w - 20), len = 8 + rnd() * 18 + (anim > 0 ? (1.6 - anim) * 18 : 18);
        g.fillRect(x, H * 0.7, 4, len);
        g.beginPath(); g.arc(x + 2, H * 0.7 + len, 3.5, 0, 6.3); g.fill();
      }
    }
  }
}
