/** Global lighting knobs (tune brightness without touching map data). */
export const LIGHTING = {
  /** Tone-mapping exposure */
  exposure: 1.45,
  /** Multiplier on baked (static) light: lamps + bounce */
  bakeScale: 2.9,
  /** Extra ambient fill added everywhere (linear RGB), keeps dark corners readable */
  ambientLift: 0.035,
  /** Multiplier on every zone's ambient colour */
  ambientScale: 1.6,
  /** Dynamic point light that follows the player */
  playerLamp: { intensity: 0.9, distance: 9 },
  /** Multiplier on light-probe values used for zombies / viewmodel */
  probeScale: 1.25,
};
