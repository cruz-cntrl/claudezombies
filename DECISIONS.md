# Decisions log

Choices made where the brief was ambiguous, with the reasoning.

1. **Grid-based world (1 m cells, ASCII layouts).** Collision, bullet ray casts (2D DDA + height checks), AI flow
   fields, zone membership and lighting occlusion all come from one grid. It is fast on mobile, trivially
   data-driven and makes maps easy to author. All floors are at y = 0; "basement" and "roof" areas are
   expressed through art (water plane, open sky, lower lighting) rather than real vertical levels.
2. **Baked vertex lighting, injected as indirect irradiance.** Static geometry carries a `bake` vertex attribute
   (lights with grid occlusion + AO). It is added as irradiance in the standard material so dynamic point lights
   (muzzle flash, practical flicker pool, player lamp, chip lights) still add at full strength. Dynamic objects
   sample a per-cell probe grid. No shadow maps (the brief allows "at most one").
3. **Fixed point-light count per quality tier** (Low 1 / Medium 2 / High 4 practical lights, plus muzzle flash,
   player lamp and chip lights). Changing light counts recompiles shaders, so the pool is reassigned by proximity
   instead.
4. **Doors** are portcullis-style iron gates (Ravenmoor) or riveted shutters (Station) that lift into the lintel;
   debris sinks into the floor with dust. One mesh group per door keeps draw calls bounded.
5. **Safe-area testing:** Playwright cannot emulate `env(safe-area-inset-*)`, so `?safe=1` simulates iPhone 16
   landscape insets (59/59/21 px) for screenshot checks.
6. **Fonts:** Black Ops One (stencil, OFL) and Special Elite (typewriter, Apache 2.0) via `@fontsource`, bundled.
7. **Fullscreen on iPhone:** Safari does not allow the Fullscreen API for non-video elements. The page ships a
   web-app manifest + `apple-mobile-web-app-capable` so "Add to Home Screen" launches chrome-less; in-browser it
   adapts to whatever height Safari gives.
8. **Render interpolation** applies to the camera only; zombies render at their latest 60 Hz state (the device
   display is 60 Hz).
9. **Zombies are instanced articulated rigs.** One `InstancedMesh` per body part (14 parts) shared by all
   creatures; active creatures are packed into the first slots every frame so inactive slots cost nothing.
   24 zombies ≈ 15 draw calls. Brute cages are packed separately so only Brutes pay for that geometry.
10. **Semi-auto weapons repeat while FIRE is held on touch** (at ~70 % of their max rate). Tapping fastest is still
    best, but holding is usable on a phone. Mouse users must click per shot.
11. **Perks are lost when you go down** (the genre's classic rule); a Packmule third weapon is dropped on revive.
    Second Wind adds one self-revive per purchase (max 3).
12. **The Rewirer keeps your weapon for 12 s after it finishes.** If you don't take it back, it's gone.
13. **Power-ups have no announcer voice** (speech can't be synthesized convincingly without samples); each has a
    distinct radio-broadcast chord stinger plus a large on-screen title.
14. **Hound rounds spawn hounds with a lightning strike inside unlocked areas** (6–16 m from the player) rather than
    through windows; chips and fog shift to red for the round and for boss fights.
15. **Bosses pause the round spawner** while alive and spawn their own runner minions; normal rounds resume after.
16. **Easter-egg randomisation:** the Ravenmoor radio frequency and the Station keypad digits are randomised per
    run and shown on in-run notes, so the quests can't be skipped from memory. Lore-note collection persists.
17. **Hidden room reward (Ravenmoor):** the Director's stash gives +1500 points and a Resupply. **Radio gag
    (Station):** a broken radio laughs at you for a small one-off tip.
18. **Boss rewards:** every Halcyon Tonic is granted free (the 4-perk cap is ignored) and your current weapon is
    rewired for free. Halcyon Station also plays a "Signal Cut" ending card; rounds continue endlessly after.
19. **Station roof** is a walled rooftop compound (parapets are full-height walls) — the grid world has one floor
    level, so a low parapet would expose ground-level geometry outside.
20. **Music rendering budget:** essential SFX (~35 sounds) render during the loading screen; everything else,
    including music loops and the ~2-minute easter-egg songs, renders in the background after first playable.
21. **Low quality** disables the post-processing composer entirely (vignette and damage edges are CSS overlays on
    every tier, so they keep working).
22. **Menus reserve the bottom strip** of the screen (reserved-zone height) on every screen, so no menu button,
    slider or scrollable row can ever sit in the Netlify zone.
23. **Audio is mixed for phone speakers, verified by measurement.** iPhone speakers barely reproduce < ~300 Hz.
    `npm run check:audio` showed the first-pass gunshots had 95–99 % of their energy below 200 Hz. Guns and impacts
    now carry a strong 300 Hz–2.5 kHz "bark", the sub thump is passed through soft clipping so its harmonics are
    audible, and touch devices get a subtle psychoacoustic bass path on the master bus. Headphones still get the sub.
24. **Automatic reload on an empty magazine** (found by the bot playtest: it is easy to be left with an empty gun
    on a touchscreen). Manual reload still works at any time.
25. **Going down while drinking a tonic loses that tonic** (and the points), as the genre traditionally does.
26. **Queued zombies re-route.** If a window is occupied, waiting zombies move to another free unlocked window after
    a few seconds instead of standing in line until the stuck-timer teleports them.
27. **Shader warm-up at session start** compiles every material (muzzle flash, decals, particles, upgraded camo) so
    the first shot doesn't hitch (measured 84 ms → 2 ms).
28. **Viewmodel image-based lighting.** The first-person scene has a small generated room environment (intensity
    driven by the local light probe) so steel reads as steel instead of black; world materials keep low metalness
    because the world is lit only by baked light.
29. **Bot balance baseline:** a scripted player that never leaves the start room and only buys the two local
    wall guns reaches round 5–7 on Normal depending on aim skill (dying mostly to running out of ammo). This matches
    the genre's "camping is a trap" expectations, so the round formulas from the brief were kept unchanged.
30. **Brighter baseline.** Global lighting moved into `config/lighting.ts` (exposure 1.45, baked light ×2.9,
    ambient ×1.6 plus a small lift, a stronger player lamp). The game stays moody but every area is readable.
31. **Zombie looks** come from six outfits (patient, soldier, doctor, nurse, worker, officer) with accessories
    (helmet, coat/dress, cap, apron, bandage, webbing) and thin-to-heavy builds, weighted per map. Accessories are
    packed instanced meshes, so they only cost draw time when someone is wearing them.
32. **Hit reactions** use per-part springs driven by the bullet's direction in the zombie's own frame. Fatal head
    shots snap the head back (and knock off hats), leg kills buckle the knee and pitch forward, arm kills spin the
    body, explosions can take an arm (within the brief's "limbs/chip popping off" limit).
33. **Ammo tins:** ~9 % of kills (× difficulty drop rate) drop a small / medium / large tin refilling 12 / 25 / 50 %
    of every carried weapon's max reserve; Brutes always drop a large one. Tins are skipped (left on the floor) when
    every gun is full.
34. **Cheaper upgrades:** the Rewirer costs 3000 (was 5000) and wall ammo for a rewired gun costs 1500 (was 2500).
35. **Left look pad.** The upper ~46 % of the movement side is an invisible second look pad: drag to turn the
    camera (so the other thumb can stay on FIRE), quick tap (< 280 ms, < 14 px) to toggle aim-down-sights. The
    movement stick still starts anywhere below it. Mirrored for left-handed play; can be switched off in Settings.
36. **Cutscenes freeze the world.** While a scene plays the simulation doesn't advance (no spawns, attacks or round
    timer), the player is invulnerable, and they get 1.5 s of grace afterwards. Every scene is skippable (button,
    Space/Enter) and the whole system can be turned off in Settings → Story.
37. **Scene set:** a prologue the first time you play each map (replayable via Settings → "Show prologues again"),
    a short sweep of the starting room every game that lands in the player's eyes, a fly-in the first time a door /
    debris / the secret bookshelf opens into a new room, and a reveal for each boss. Story text lives in
    `config/story.ts` and echoes the lore notes.
38. **The chip is a one-shot kill.** Any hit on the chip of a regular Tethered or hound kills it instantly at any
    round (bigger hit sphere: 0.11 m radius). Brutes (cage first) and bosses still take ×2.5 critical damage only.
    Both are switches in `config/enemies.ts` (`chipOneShot`, `chipHitRadius`).
39. **Aimed reticle.** Bullets always leave along the exact screen centre, so ADS shows a red dot there (plus a faint
    ring sized to the gun's aimed spread, e.g. shotguns). The gun shrinks to ~55 % and sits further out when aimed,
    with its sight line placed exactly on the dot; the viewmodel no longer magnifies with ADS zoom, and camera shake
    is mostly suppressed while aiming so the dot stays on the bullet path.
40. **Menu taps.** iOS was delivering a tap's synthetic `click` to whatever button of the *next* screen appeared
    under the finger (title → Settings instead of the main menu), and dropping taps when the finger wobbled.
    `ui/tap.ts` runs menu buttons on pointerup (12 px slop) and swallows any click from a touch that started on a
    screen that has since been replaced. Starting / quitting a game ignores repeat taps while it loads.
41. **Ravenmoor Grounds** is the first map. It is ~2× the playable area of both indoor maps combined ×2 (layout is
    authored at 1× and stretched by `KS = 1.42`; set-pieces keep their size). Open-air zones are separated by
    railings, hedges and dry-stone walls (`'f'` cells: block movement, not bullets or sight) with gates; the Tethered
    climb through barricaded gaps in the estate wall and out of open graves.
42. **Terrain without rewriting the engine.** The grid stays 2D. A height field (`world/terrain.ts`) is flattened
    around machines, windows, doors and set-pieces, all static geometry is warped onto it once at build time, and
    everything dynamic adds `groundY(x, z)` (camera, zombies, decals, casings, pickups, grenades, ground hits,
    cutscene cameras). Hills are kept gentle (±2 m) so aiming and hit boxes behave exactly like flat ground.
43. **Dusk lighting** is a baked sky term (cool hemisphere fill + warm afterglow from the west) instead of
    moonlight probes, with a dusk sky shader, mauve fog and an unfogged ridge silhouette. The beacon and the flare are
    unfogged HDR sprites so they read from anywhere.
44. **Big-map performance.** Heavy merged layers are split into 48 m chunks (sharing one vertex buffer) so the
    camera culls what is behind it; outdoor floors use one quad per cell. Typical frame: 70–200 draw calls,
    150–310 k triangles on the Grounds.
45. **Unlocks.** Ravenmoor Asylum unlocks the moment round 5 starts on the Grounds (any difficulty). Players who
    already have an Asylum score keep it unlocked. Halcyon Signal Station stays open as before.
46. **Jump, vault, climb.** JUMP (touch button / Space) hops ~0.7 m. Next to low cover (sandbags, gravestones,
    benches, plane wings) the same button vaults you over, but only into the same area, so paid gates can't be
    skipped. Fences, hedges and walls are never vaultable. Ladders attach when you walk into them; "forward" moves
    the way you face (toward the ladder = up, facing away or looking down = down), JUMP lets go.
47. **The lookout tower** (Front Drive) is a 5 m platform with a roofed hut and a searchlight. While you're up there
    the horde paths to the ladder and climbs one at a time; hounds and Brutes can't climb and circle below. It's a
    strong spot, not a safe one.
48. **Hounds hunt as a pack** instead of sprinting straight in: they run in a little slower than your sprint, circle
    you at ~5.5 m, and at most two charge at once (with a snarl as the tell). After a bite they peel away. Damage
    20 (was 30), wind-up 0.45 s, cooldown 1.4 s, fewer per round with a cap on how many are loose at once. A player
    who doesn't fight back now lasts ~7–8 s against a pack (was ~2 s).
49. **Smarter Tethered.** They spread round you in an arc instead of filing in a line, clamber over low cover
    (slowly, with a hop) instead of jamming behind it, and on open maps some claw up out of the ground behind or
    beside you so a big map never leaves you waiting.
50. **Collisions match the props.** Trees, statues, signposts and rocks collide (and stop bullets) as their trunk or
    base, not a whole 1 m block; lamp posts, note stands and bell posts are now solid. Grounds decor is placed last
    with a spacing check so branches, lamps and headstones never clip into walls, fences, machines or each other.
51. **No arms on the viewmodel.** The guns, knife, grenade and tonic float on their own (`SHOW_ARMS` in
    `weapons/viewmodel.ts`). Aiming always cancels sprinting, and the run pose blends out as you aim, so the two
    poses can no longer stack.
52. **Flare pistol clarity.** Picking it up spells out the remaining steps; the easter-egg line on the HUD tracks
    them (bells n/3 → power → "fire from the red marker"); a red light pillar marks the firing spot once you're ready,
    with a large, quick prompt there.
53. **Auto-fire while aiming (touch).** Aimed in (ADS ≥ 75 %) with the red dot on a Tethered or boss, every gun
    fires on its own — semi-autos at their normal held-trigger cadence, launchers only when the target is more than
    7 m away. Off in Settings → "Auto-fire while aiming at a target". Keyboard/mouse players are unaffected.
54. **Faster aiming.** Default aim sensitivity 1.25 (was 0.7) and zoom only halves its slowdown; existing saves are
    raised to the new default once (save `settingsVersion` 2). Look and aim speed sliders are on the pause screen.
55. **One story.** All notes, prologues, room lines, boss lines and easter-egg text were rewritten around one arc:
    the chips set brain activity by frequency → their echoes formed a hivemind in the signal (the Chorus) →
    Director Hale is trying to master it (beacon → Warden → Mother Transmitter). See GAME_DESIGN.md → Story.
56. **Station unlock.** Halcyon Signal Station opens at round 5 in the Asylum (existing Station players keep it).
