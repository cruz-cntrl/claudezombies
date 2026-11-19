import type { PerkId } from '../config/perks';

/** Surface styles map to procedural texture sets in render/proceduralTextures.ts */
export type Surface =
  | 'tile' | 'tileWall' | 'concrete' | 'stone' | 'wood' | 'metal' | 'grate' | 'dirt' | 'grass'
  | 'plaster' | 'wallpaper' | 'brick' | 'riveted' | 'ceilingTile' | 'water';

export type PropTheme =
  | 'reception' | 'ward' | 'theater' | 'boiler' | 'courtyard' | 'library'
  | 'dock' | 'assembly' | 'generator' | 'control' | 'roof' | 'corridor' | 'test'
  | 'drive' | 'garden' | 'graveyard' | 'field' | 'yard' | 'chapel';

export type ReverbType = 'hall' | 'room' | 'metal' | 'outdoor';

export interface ZoneDef {
  letter: string;
  name: string;
  floor: Surface;
  wall: Surface;
  /** Lower wall band (wainscot) surface */
  wainscot?: Surface;
  ceiling: Surface | null; // null = open sky
  height: number;
  lightColor: number;
  lightIntensity: number;
  /** Ambient (bounce) color baked into vertices */
  ambient: number;
  reverb: ReverbType;
  theme: PropTheme;
  /** Spacing between auto-placed ceiling lights (cells) */
  lightSpacing?: number;
  water?: boolean;
  rain?: boolean;
  steam?: boolean;
  /** Floor y offset — purely visual (e.g. flooded basement water plane). */
  waterLevel?: number;
}

export interface DoorDef {
  id: string;       // digit character used in the layout
  cost: number;
  kind: 'door' | 'debris' | 'secret';
  label: string;
}

export interface MapDef {
  id: string;
  name: string;
  subtitle: string;
  desc: string;
  layout: string[];
  zones: ZoneDef[];
  doors: DoorDef[];
  /** Row-major assignment of marker cells. */
  markers: {
    p: PerkId[];        // perk machines
    b: string[];        // wall-buys (weapon ids)
    e: string[];        // easter egg / special anchors
  };
  /** Explicit marker ids keyed "x,y" (from LayoutBuilder); preferred over the ordered lists. */
  markerIds?: Record<string, string>;
  fogColor: number;
  fogDensity: number;
  outsideSurface: Surface;
  exterior: Surface;
  perimeter: Surface;
  outsideAmbient: number;
  doorStyle: 'gate' | 'shutter';
  /** Map-specific extra geometry / setpieces, run during build. */
  decorate?: (ctx: import('./mapBuilder').BuildContext) => void;
  sky: 'night' | 'storm' | 'dusk';
  /**
   * Outdoor maps: raw ground height (metres) at a cell-corner position. The builder flattens it
   * around machines, windows, doors and solid set-pieces, then warps all static geometry onto it.
   */
  terrain?: (x: number, z: number) => number;
  /** Open-air map settings: estate-wall height, fence-gate height, no perimeter cliff walls. */
  outdoor?: { wallHeight: number; gateTop: number };
  /** A landmark the opening cutscene frames (e.g. the Grounds' signal-tower beacon) */
  landmark?: { x: number; y: number; z: number };
  /** Best round needed on another map before this one unlocks */
  unlock?: { map: string; round: number };
  /** Sky light baked into every surface: hemisphere fill from above + a low directional glow. */
  skyLight?: { top: number; bottom: number; glow: number; glowDir: [number, number, number] };
  chipColor: number;
  /** Music easter-egg track key */
  songId: string;
  /** Extra flavour props: list of [anchor id, kind] handled by the map module */
}

/** Layout legend
 *  ' ' void (nothing)            '#' wall              ',' outside ground (zombies only)
 *  'A'..'Z' floor of zone letter 'w' boarded window    '1'..'9' door/debris id
 *  '*' player start              'v' spawn vent         'x' solid prop slot (theme prop)
 *  'p' perk machine              'b' wall-buy (chalk on adjacent wall)
 *  'c' supply crate spot          'r' Rewirer           's' power switch
 *  'e' easter-egg anchor          'l' extra light        'o' low cover prop (blocks movement, not bullets)
 *  'q' solid named set-piece (built by the map's decorate hook / easter-egg system)
 *  '%' solid, not drawn (the map's decorate hook builds it: buildings, wrecks, tombs)
 *  'f' fence / hedge line: blocks movement, not bullets or sight (drawn by decorate)
 */
export const LEGEND_INFO = true;
