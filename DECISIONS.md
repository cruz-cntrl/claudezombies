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
