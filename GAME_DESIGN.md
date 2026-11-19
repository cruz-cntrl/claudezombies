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
  6 Halcyon Tonics perks (max 4), Rewirer upgrade 3000 (rewired ammo 1500), 5 power-ups (≤4/round), ammo tins from ~9% of kills (small/medium/large = 12/25/50% of max reserve).
- Zombie looks: outfits (patient, soldier, doctor, nurse, worker, officer) with accessories and body builds, weighted per map (entities/outfits.ts).
- Hit reactions: per-part springs; fatal head shots snap the head back, leg kills buckle forward, arm kills spin, explosions can take an arm.
- Enemies: Tethered walker/runner/sprinter, Hounds (special round), Brute (cage over chip), 2 bosses.

## Story (one arc across the three maps)
- **The chips.** Project TETHER puts a copper chip against the skull. The chip listens to the Halcyon carrier and
  sets the brain to the band it hears: 5.40 settle, 7.15 obey, 9.85 fury, 11.20 wake. Operators "tune" soldiers.
- **The Chorus.** Every chip also sends its wearer's brain rhythm back down the carrier. Forty minds echoing into each
  other became one mind living in the signal — a hivemind the staff call the Chorus. On 3 March 1944 at 03:14 it
  retuned the Mother Transmitter to its own note; every Tethered now hums it and moves for it.
- **Director Edmund Hale** (Ravenmoor) believes the Chorus is the army the Corps wanted — it only lacks a will, and
  the loudest mind on the band steers it. He took seven chips and built the blue beacon on the clock tower to carry
  his voice into the Chorus. He is the villain of all three maps.
- **Grounds — "Lights Out":** ring the coffin bells (the Chorus turns to the tower), then blind Hale's beacon with
  the pilot's flare: for a moment nobody is steering and every Tethered on the estate drops.
- **Asylum — "Dead Air":** tune Hale's own band on the theater radio; he answers in person as **The Warden**.
- **Station — "Signal Cut":** Hale's voice survived his body and rode the signal home. Wired into the **Mother
  Transmitter**, he is fighting the Chorus for control. Cutting the signal silences them both.
- Unlocks: Grounds round 5 → Asylum; Asylum round 5 → Station.

## Maps
0. **Ravenmoor Grounds** (start here; dusk, open air, gentle hills) — front drive (start) → groundskeeper's yard
   (power) / chapel → graveyard, courtyard → crash field with the downed courier plane (walk-in hull). The sealed
   asylum and its signal tower (blue beacon) stand in the middle. Reaching **round 5** here unlocks the Asylum.
   EE "Lights Out": flare pistol from the cockpit → ring 3 coffin bells (each wakes the graves) → power on → fire
   the flare at the tower → hold the ground under it for 45 s → the beacon dies and every Tethered drops.
   A lookout tower in the Front Drive can be climbed by ladder (the Tethered follow one at a time).
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
