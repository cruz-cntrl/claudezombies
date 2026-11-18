# TETHERED — condensed design spec

**Pitch:** 1944. Project TETHER (Halcyon Signal Corps) implanted neural-control chips. The broadcast
corrupted; every subject became a *Tethered* — puppeted bodies with a glowing chip jutting from the skull.
Round-based wave survival, first person, iPhone 16 Safari landscape, Netlify-hosted. All art/audio procedural.

## Pillars
- **Shoot the chip.** Chip hitbox = critical: ×2.5 on top of headshot, sparks, electrical pop, bonus points.
- Dark-industrial horror, stylized dark blood, dark humour in details (Halcyon propaganda, notes).
- Plays great on a phone: twin-stick + swipe aim, aim assist, ≥64 px targets, nothing in the reserved zone.

## Hard rules
- Reserved zone: bottom-right 150×70 CSS px + right/bottom safe insets. No UI or touch handlers there.
  CSS vars `--reserved-w/--reserved-h`; `?debug=1` outlines it; `scripts/shots.mjs` checks overlaps.
- 60 fps target, ≤150 draw calls, ≤400k tris, ≤24 zombies alive, pools everywhere, no per-frame allocs.
- Audio pre-rendered with OfflineAudioContext, no 8-bit timbres, layered/filtered, HRTF 3D.

## Systems (see config/ for numbers)
- Economy: +10 hit, +60 kill, +100 head kill, +130 chip/melee kill, +10/board (cap 500/round). Start 500.
- Rounds: count 6 → 6+r·2.2 (cap 120), HP 150 +100/round to r9 then ×1.1. Runners from r4 (majority r10),
  sprinters by r15. Spawn delay shrinks (min 0.3 s). 10 s breaks. Hound rounds every 5–7. Brutes from r12.
- Difficulty Easy/Normal/Hardened multipliers (config/difficulty.ts), separate high scores.
- Player 100 HP (zombie hit 50), regen after 4 s, downed → self-revive (6 s) or game over.
- Barriers: windows with 6 boards; zombies tear boards then climb. Rebuild by holding interact.
- Doors/debris cost points, unlock zones (and their spawners). Power switch enables perks + Rewirer.
- 14 weapons (config/weapons.ts), 2 slots (3 with Packmule). Wall-buys (chalk), Supply Crate 950,
  6 Halcyon Tonics perks (max 4), Rewirer upgrade 5000, 5 power-ups (≤4/round).
- Enemies: Tethered walker/runner/sprinter, Hounds (special round), Brute (cage over chip), 2 bosses.

## Maps
1. **Ravenmoor Asylum** — reception → ward → operating theater → flooded boiler room (power) → courtyard.
   EE "Dead Air": 3 radio valves → console → dial frequency from ward note → boss **The Warden**.
2. **Halcyon Signal Station** — loading dock → assembly line → generator hall (power) → control room → transmitter roof.
   EE "Cut the Signal": 3 relay pylons (defend 30 s) → keypad code from lore notes → boss **The Mother Transmitter**.
Side EEs: music track (3 items), 5 lore notes each, secret room / radio teddy gag.

## Architecture
- `core/` loop (fixed 60 Hz), events bus, pools, save. `config/` all tuning data.
- `world/` ASCII grid maps (1 m cells) → Grid (collision, DDA raycasts) → FlowField (Dijkstra) → mapBuilder
  (merged geometry per material, procedural textures, vertex-baked lighting + probe grid).
- `render/` renderer + composer (bloom, grain/CA/desat/static), quality tiers + auto-drop.
- `entities/` player, instanced zombie rigs (one InstancedMesh per body part → few draw calls).
- `weapons/`, `systems/`, `audio/`, `ui/` as described in the build prompt.
