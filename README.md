# TETHERED

A 3D round-based wave-survival horror shooter for **iPhone Safari in landscape** (and desktop browsers),
built with **Vite + TypeScript + three.js**. 1944: Project TETHER put neural-control chips into soldiers; the
signal broke. Shoot the glowing chip.

Everything — geometry, textures, animation, sound effects and music — is **generated in code at load time**.
There are no downloaded art or audio files.

## Run locally

```bash
npm install
npm run dev        # dev server (also on your LAN: open the printed Network URL on your phone)
npm run build      # type-check + production build into dist/
npm run preview    # serve dist/ on http://localhost:4173
```

Useful URL flags: `?debug=1` (FPS/draw-call readout, outlines the reserved Netlify zone in red),
`?safe=1` (simulate iPhone 16 landscape safe-area insets), `?autostart=1&map=grounds&difficulty=hardened`
(skip menus), `?quality=low|medium|high`, `?screen=menu`, `?tutorial=1`, `?cutscenes=1` (story scenes are off in autostart test mode unless set).

Tests and checks (need `npx playwright install webkit` once, and `npm run preview` running):

```bash
npm run test:shots         # WebKit 852×393 @3x screenshots → shots/, console errors, reserved-zone overlap check
npm run test:gameplay      # doors / power / perks / crate / Rewirer / power-ups / hounds / Brutes smoke test
npm run test:easter-eggs   # both main quests + bosses + rewards
npm run test:robustness    # WebGL context loss, backgrounding, portrait rotation, input spam, retry leak check
npm run test:bot           # faster-than-real-time bot plays from the start room; reports round reached, accuracy, stuck zombies
npm run check:audio        # renders every sound and reports spectrum, loudness and "phone speaker" loudness
npm run check:cpu          # JS cost per frame at round 30 with a full horde
npm run check:viewmodels   # every gun at hip / ADS / mid-reload → shots/vm_*.png
node scripts/adscheck.mjs   # hip vs aimed view of each gun with the ADS reticle → shots/ads_*.png
node scripts/mapviews.mjs grounds   # tour of the Grounds (incl. aerial) with draw calls / triangles per view
node scripts/eegrounds.mjs  # Grounds easter egg end to end (flare → bells → vigil → Lights Out)
node scripts/cutscenecheck.mjs grounds   # frames from the Grounds prologue + establishing shot
node scripts/taptest.mjs    # real touch taps through title → menu → map select (ghost-click regression)
```

Note: `?autostart=1` without `map=` still starts Ravenmoor Asylum (the existing tests are written for it); the
normal menu starts on the Grounds.

## Deploy to Netlify

1. Push this repository to GitHub.
2. In Netlify: **Add new site → Import from Git**, pick the repo. `netlify.toml` already sets
   `npm run build` and publishes `dist/` (Node 22), with long cache headers on hashed assets and
   `no-cache` on `index.html`. No manual steps.
3. On iPhone, "Add to Home Screen" launches it full-screen (web-app manifest included).

The bottom-right **150×70 px** (+ safe-area insets) is reserved for the Netlify badge: nothing interactive or
important is ever placed there (CSS variables `--reserved-w` / `--reserved-h` in `src/ui/styles.css`).

## Tuning the balance

All numbers live in `src/config/` — no logic changes needed:

| File | What you tune |
|---|---|
| `weapons.ts` | Per weapon: damage, head multiplier, RPM, mag/reserve, reload times, spread (hip/ADS), recoil, falloff, penetration, move speed, ADS zoom, wall-buy price, ammo price, crate weight, and the `upgraded` overrides from the Rewirer. `WONDER_CHANCE` = Signal Disruptor crate odds. |
| `rounds.ts` | Zombie count / health formulas, spawn delay, speed mix by round, hound-round cadence, Brute start round, max alive. |
| `difficulty.ts` | Easy / Normal / Hardened multipliers (HP, speed, count, damage to player, drop rate, self-revives). |
| `economy.ts` | Points per hit / kill / headshot / chip kill / melee kill / board, crate & Rewirer cost, rewired-ammo cost, ammo-drop chance and tin sizes, hold-to-buy time. |
| `lighting.ts` | Global brightness: exposure, baked-light strength, ambient fill, player lamp, light-probe strength. |
| `perks.ts` | Halcyon Tonic prices, colours, effects (`PERK_TUNING`), max perks. |
| `enemies.ts` | Zombie speeds, attack range/wind-up/damage, chip crit multiplier, hound & Brute stats, boss HP, power-up drop chance & timers. |
| `lore.ts` | Lore note text, radio frequencies. |
| `story.ts` | Cutscene text: map prologues, the line each room speaks when unlocked, boss reveal lines. |
| `../entities/outfits.ts` | Zombie looks: outfits, accessory chances and colours, body builds, how common each is per map. |

Map layouts are authored in `src/world/maps/*.ts` with a small `LayoutBuilder` (rooms, doors, windows and named
markers for wall-buys, perks, crates, the Rewirer, power, easter-egg anchors).

The Grounds (`maps/grounds.ts`) adds a few knobs at the top of the file: `KS` (layout stretch — raise it for a
bigger estate), the `terrain()` function (hill heights), `skyLight` / `fogDensity` (how bright the dusk is),
`unlock` on `maps/ravenmoor.ts` (which round on the Grounds opens the Asylum), and `ADS_SCALE` / `ADS_DIST` in
`weapons/viewmodel.ts` (how small the gun gets when aiming).

## Code map

```
src/main.ts          app state machine (loading → title → menu → playing / paused / game over)
src/game.ts          one play session: wires every system together
src/core/            fixed 60 Hz loop, event bus, pools, persistence, math
src/config/          all tuning data (see above)
src/input/           touch twin-stick + swipe look, keyboard/mouse, aim assist
src/render/          renderer + post (bloom, grain, CA, desat, static), quality tiers, procedural textures,
                     geometry kit, baked vertex lighting + light probes, FX (particles, decals, casings, arcs)
src/world/           ASCII grid maps, map builder, flow field, barriers, interactables, props, sky
src/entities/        player, instanced zombie/hound/Brute rigs + AI, bosses (The Warden, The Mother Transmitter)
src/weapons/         14 procedural gun models, viewmodel animation, weapon system
src/systems/         combat/damage, rounds/spawner, economy, power-ups, map objects (doors, perks, crate,
                     Rewirer, wall-buys), easter eggs, ambient FX
src/audio/           Web Audio engine (HRTF, occlusion, reverb, voice stealing), offline synthesis of every SFX,
                     generated music (menu, adaptive score, stingers, easter-egg songs)
src/ui/              HUD, menus, tutorial, layout (safe areas + reserved zone), styles
```

See `GAME_DESIGN.md` for the condensed design and `DECISIONS.md` for judgement calls.
