/**
 * ZOMBIE LOOKS — who each Tethered used to be. Each outfit sets clothing colours, which
 * accessories may appear (with probabilities) and how common it is on each map.
 * Accessories are separate instanced meshes, so they only cost GPU time when worn.
 */
export type Accessory = 'helmet' | 'coat' | 'cap' | 'apron' | 'bandage' | 'straps';

export interface Outfit {
  id: string;
  cloth: number[];     // torso / gown / tunic
  trousers: number[];
  /** accessory → [chance, colour choices] */
  acc: Partial<Record<Accessory, [number, number[]]>>;
  /** torso width range (thin .. heavy) */
  bulk: [number, number];
  bareLegs?: boolean;
  weight: Record<string, number>; // per map id
}

export const OUTFITS: Outfit[] = [
  {
    id: 'patient', cloth: [0x9a9c90, 0xa8a498, 0x8a9286, 0xb0ac9c], trousers: [0x9a9c90], bareLegs: true,
    acc: { bandage: [0.4, [0xc8c0a8, 0xa89880]] }, bulk: [0.86, 1.0],
    weight: { grounds: 3, ravenmoor: 5, station: 1, test: 3 },
  },
  {
    id: 'soldier', cloth: [0x4c5038, 0x5a5e44, 0x3e4436], trousers: [0x4a4a3a, 0x3a3a2e],
    acc: { helmet: [0.7, [0x3e4430, 0x4a4e38]], straps: [0.9, [0x3a3020, 0x5a4a30]], bandage: [0.15, [0xb8a890]] }, bulk: [0.95, 1.12],
    weight: { grounds: 4, ravenmoor: 3, station: 3, test: 2 },
  },
  {
    id: 'doctor', cloth: [0xb0aea4, 0xa8a69a], trousers: [0x2e2e2a, 0x3a3a34],
    acc: { coat: [1, [0xb8b6aa, 0xa4a296]], apron: [0.35, [0x6a2018, 0x5a3a2a]] }, bulk: [0.92, 1.1],
    weight: { grounds: 1, ravenmoor: 2, station: 1, test: 1 },
  },
  {
    id: 'nurse', cloth: [0x7a8a96, 0x8a96a0], trousers: [0x7a8a96],
    acc: { coat: [1, [0x7a8a96, 0x6a7a86]], cap: [0.8, [0xd0ccc0]], apron: [0.3, [0xc0bcb0]] }, bulk: [0.84, 0.98], bareLegs: true,
    weight: { grounds: 1.5, ravenmoor: 2, station: 0.5, test: 1 },
  },
  {
    id: 'worker', cloth: [0x2e3a4a, 0x3a4450, 0x4a4a40], trousers: [0x2e3a4a, 0x2a3240],
    acc: { cap: [0.55, [0x2a2a28, 0x3a3020]], apron: [0.35, [0x4a3420, 0x3a2a1a]] }, bulk: [0.98, 1.18],
    weight: { grounds: 3, ravenmoor: 0.5, station: 4, test: 1 },
  },
  {
    id: 'officer', cloth: [0x22221e, 0x2a2a26], trousers: [0x1e1e1a],
    acc: { coat: [1, [0x1e1e1a, 0x26261e]], cap: [0.75, [0x1a1a16]], straps: [0.5, [0x3a2a1a]] }, bulk: [0.95, 1.08],
    weight: { grounds: 1, ravenmoor: 0.4, station: 1.5, test: 0.5 },
  },
];

export function pickOutfit(mapId: string, r = Math.random()): Outfit {
  let total = 0;
  for (const o of OUTFITS) total += o.weight[mapId] ?? 1;
  let x = r * total;
  for (const o of OUTFITS) { x -= o.weight[mapId] ?? 1; if (x <= 0) return o; }
  return OUTFITS[0];
}
