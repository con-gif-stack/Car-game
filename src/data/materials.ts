/*
 * Materials and rarities. Early materials are realistic things car parts are made of; later
 * biomes will add sci-fi and fantasy ones (see the design doc's Decisions Log).
 * Numbers are placeholders, tuned with `npm run simulate`.
 */

export type RarityId = 'common' | 'uncommon' | 'rare' | 'epic' | 'legendary';

export interface RarityDef {
  id: RarityId;
  label: string;
  color: number;
  rank: number;
}

export const RARITIES: Record<RarityId, RarityDef> = {
  common: { id: 'common', label: 'Common', color: 0xc9ccd6, rank: 0 },
  uncommon: { id: 'uncommon', label: 'Uncommon', color: 0x5ccf6a, rank: 1 },
  rare: { id: 'rare', label: 'Rare', color: 0x3fa9f5, rank: 2 },
  epic: { id: 'epic', label: 'Epic', color: 0xb36bff, rank: 3 },
  legendary: { id: 'legendary', label: 'Legendary', color: 0xffb02e, rank: 4 },
};

export type MaterialId =
  | 'scrapMetal'
  | 'rubber'
  | 'copperWire'
  | 'aluminum'
  | 'titanium'
  | 'carbonFiber'
  | 'ceramic';

/** Shape used for the material's pixel icon. */
export type MaterialIcon = 'scrap' | 'ring' | 'coil' | 'ingot' | 'plate' | 'weave' | 'disc';

/**
 * A small idle trickle (Rare and above): `perHour`, boosted by the Salvage Magnet. These come
 * mainly from drive runs. Drops start at `unlockProgress` and grow by `growthPerProgress` for
 * each progress level beyond it, so rarer materials become more common as the game goes on.
 * Common and Uncommon materials come from the farm (deposits and drones) and run finds instead.
 */
export interface TrickleSource {
  perHour: number;
  unlockProgress: number;
  growthPerProgress: number;
}

export interface MaterialDef {
  id: MaterialId;
  name: string;
  rarity: RarityId;
  description: string;
  icon: MaterialIcon;
  /** Idle trickle, for Rare and above; null for materials farmed from deposits. */
  trickle: TrickleSource | null;
}

/** All materials, in display order (commonest first). */
export const MATERIALS: readonly MaterialDef[] = [
  {
    id: 'scrapMetal',
    name: 'Scrap Metal',
    rarity: 'common',
    description: 'Steel offcuts and bent brackets. The backbone of every build.',
    icon: 'scrap',
    trickle: null,
  },
  {
    id: 'rubber',
    name: 'Rubber',
    rarity: 'common',
    description: 'Old tyres and hoses, ready to be reworked.',
    icon: 'ring',
    trickle: null,
  },
  {
    id: 'copperWire',
    name: 'Copper Wire',
    rarity: 'uncommon',
    description: 'Stripped from dead wiring looms. Engines and pumps need it.',
    icon: 'coil',
    trickle: null,
  },
  {
    id: 'aluminum',
    name: 'Aluminum',
    rarity: 'uncommon',
    description: 'Light and strong. Cast into engine blocks and housings.',
    icon: 'ingot',
    trickle: null,
  },
  {
    id: 'titanium',
    name: 'Titanium',
    rarity: 'rare',
    description: 'Heat-proof and tough. Turbos, springs and exhausts love it.',
    icon: 'plate',
    trickle: { perHour: 0.06, unlockProgress: 0, growthPerProgress: 0.8 },
  },
  {
    id: 'carbonFiber',
    name: 'Carbon Fiber',
    rarity: 'rare',
    description: 'Woven strength at almost no weight.',
    icon: 'weave',
    trickle: { perHour: 0.04, unlockProgress: 0, growthPerProgress: 0.8 },
  },
  {
    id: 'ceramic',
    name: 'Ceramic Composite',
    rarity: 'epic',
    description: 'Shrugs off temperatures that melt steel. For race brakes and turbos.',
    icon: 'disc',
    trickle: { perHour: 0.03, unlockProgress: 3, growthPerProgress: 1 },
  },
];

export const MATERIAL_IDS: readonly MaterialId[] = MATERIALS.map((m) => m.id);

export const MATERIALS_BY_ID: Readonly<Record<MaterialId, MaterialDef>> = Object.fromEntries(
  MATERIALS.map((m) => [m.id, m]),
) as Record<MaterialId, MaterialDef>;

/** A zero amount of every material. */
export function emptyMaterials(): Record<MaterialId, number> {
  return Object.fromEntries(MATERIAL_IDS.map((id) => [id, 0])) as Record<MaterialId, number>;
}
