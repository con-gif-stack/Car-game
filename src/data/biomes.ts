import type { MaterialAmounts } from './economy';

/*
 * The drive road: one endless road through biomes, in order. Every run starts at the first
 * biome. Numbers are placeholders, tuned with `npm run simulate`.
 */

export type BiomeId = 'junkyard' | 'rustHighway' | 'industrial' | 'desert' | 'beyond';

/** Silhouette drawn in the middle distance of the scenery. */
export type SceneryFeature = 'junk' | 'pines' | 'factories' | 'mesas' | 'spires';

export interface BiomePalette {
  /** Sky bands, top to horizon. */
  sky: readonly number[];
  cloudLight: number;
  cloud: number;
  cloudShadow: number;
  ridge: number;
  ridgeShadow: number;
  mountain: number;
  mountainShadow: number;
  peak: number;
  peakShadow: number;
  featureLight: number;
  feature: number;
  featureDark: number;
}

export interface BiomeDef {
  id: BiomeId;
  name: string;
  description: string;
  /** Where the biome starts and ends on the road (km). The last one never ends. */
  startKm: number;
  endKm: number;
  /** Grip + Handling (averaged) the road needs for full speed. */
  gripDemand: number;
  /** Fuel used per second of driving, relative to the Junkyard. */
  fuelDrain: number;
  /** Damage to the car per km. */
  roughness: number;
  /** Money paid per km driven here on a run. */
  moneyPerKm: number;
  /** Materials found per km driven here, on average. */
  findsPerKm: MaterialAmounts;
  palette: BiomePalette;
  feature: SceneryFeature;
}

export const BIOMES: readonly BiomeDef[] = [
  {
    id: 'junkyard',
    name: 'Junkyard Wastes',
    description: 'Where every run begins: rusted wrecks, scrap heaps and potholes.',
    startKm: 0,
    endKm: 2,
    gripDemand: 14,
    fuelDrain: 1,
    roughness: 3,
    moneyPerKm: 40,
    findsPerKm: { scrapMetal: 3, rubber: 2, copperWire: 0.3, titanium: 0.02 },
    palette: {
      sky: [0x2a2340, 0x3a2b4a, 0x55354f, 0x7a4552, 0x9e5a4f, 0xbf7550, 0xd99459, 0xe8b070, 0xf0c88a],
      cloudLight: 0xf0b58a,
      cloud: 0xc98a6a,
      cloudShadow: 0x8f5a52,
      ridge: 0x6e4a4f,
      ridgeShadow: 0x5d3e45,
      mountain: 0x4a3540,
      mountainShadow: 0x3b2a35,
      peak: 0x8a6a5e,
      peakShadow: 0x6e5450,
      featureLight: 0x6a5048,
      feature: 0x4a3a38,
      featureDark: 0x33282a,
    },
    feature: 'junk',
  },
  {
    id: 'rustHighway',
    name: 'Rust Highway',
    description: 'An old highway through the pines at sunset. Smoother, and faster.',
    startKm: 2,
    endKm: 6,
    gripDemand: 20,
    fuelDrain: 1.1,
    roughness: 2,
    moneyPerKm: 80,
    findsPerKm: { scrapMetal: 3, rubber: 3, aluminum: 0.4, copperWire: 0.4, titanium: 0.05 },
    palette: {
      sky: [0x2b4486, 0x38579d, 0x4a6db5, 0x6689c8, 0x8fa2d4, 0xbea1cd, 0xe49fbb, 0xf3b2a9, 0xf7caa6],
      cloudLight: 0xffd9e3,
      cloud: 0xf2a3bc,
      cloudShadow: 0xc97fa7,
      ridge: 0x8792cc,
      ridgeShadow: 0x7480c0,
      mountain: 0x5767a9,
      mountainShadow: 0x445494,
      peak: 0xf3eff9,
      peakShadow: 0xc4c5ea,
      featureLight: 0x2e4277,
      feature: 0x1f2d5b,
      featureDark: 0x162147,
    },
    feature: 'pines',
  },
  {
    id: 'industrial',
    name: 'Industrial Zone',
    description: 'Smog, smokestacks and oily roads that need real grip.',
    startKm: 6,
    endKm: 15,
    gripDemand: 45,
    fuelDrain: 1.4,
    roughness: 6,
    moneyPerKm: 200,
    findsPerKm: { scrapMetal: 4, aluminum: 1, copperWire: 1, titanium: 0.15, carbonFiber: 0.06 },
    palette: {
      sky: [0x2c2f38, 0x3a3d45, 0x4b4d52, 0x5e5e5c, 0x777163, 0x8f8467, 0xa8976b, 0xbca878, 0xc9b78a],
      cloudLight: 0xb0a78f,
      cloud: 0x8a8475,
      cloudShadow: 0x66645c,
      ridge: 0x57585e,
      ridgeShadow: 0x4a4b51,
      mountain: 0x3e4047,
      mountainShadow: 0x33353b,
      peak: 0x6a6a68,
      peakShadow: 0x56575a,
      featureLight: 0x4b4f5a,
      feature: 0x30333c,
      featureDark: 0x22242b,
    },
    feature: 'factories',
  },
  {
    id: 'desert',
    name: 'Desert Canyons',
    description: 'Endless sand and red rock. Hot, rough and thirsty.',
    startKm: 15,
    endKm: 35,
    gripDemand: 90,
    fuelDrain: 1.8,
    roughness: 10,
    moneyPerKm: 500,
    findsPerKm: { aluminum: 2, titanium: 0.3, carbonFiber: 0.2, ceramic: 0.15 },
    palette: {
      sky: [0x3f6fb0, 0x4f83c2, 0x6797d0, 0x86acd9, 0xa8c0dc, 0xd4c9b8, 0xeac9a0, 0xf2d6a8, 0xf7e2b8],
      cloudLight: 0xffffff,
      cloud: 0xf0e6da,
      cloudShadow: 0xd2c1b2,
      ridge: 0xd9a06e,
      ridgeShadow: 0xc58c5e,
      mountain: 0xb5653f,
      mountainShadow: 0x964f33,
      peak: 0xd98a58,
      peakShadow: 0xb87048,
      featureLight: 0xc46e42,
      feature: 0xa0522f,
      featureDark: 0x7a3c24,
    },
    feature: 'mesas',
  },
  {
    id: 'beyond',
    name: 'The Unknown',
    description: 'Nobody who came out here talks about it. More to discover soon.',
    startKm: 35,
    endKm: Infinity,
    gripDemand: 150,
    fuelDrain: 2.5,
    roughness: 20,
    moneyPerKm: 1200,
    findsPerKm: { titanium: 0.5, carbonFiber: 0.4, ceramic: 0.4 },
    palette: {
      sky: [0x0d0b1f, 0x16122e, 0x221a40, 0x2f2252, 0x402b63, 0x553572, 0x6c3f7d, 0x854a85, 0x9c578b],
      cloudLight: 0x8e6bb0,
      cloud: 0x664a8c,
      cloudShadow: 0x47336a,
      ridge: 0x3a2a5a,
      ridgeShadow: 0x30224c,
      mountain: 0x251a40,
      mountainShadow: 0x1c1433,
      peak: 0x7f5fd0,
      peakShadow: 0x5f45a8,
      featureLight: 0x5a3f92,
      feature: 0x3a2a66,
      featureDark: 0x261a47,
    },
    feature: 'spires',
  },
];

export const BIOMES_BY_ID: Readonly<Record<BiomeId, BiomeDef>> = Object.fromEntries(
  BIOMES.map((b) => [b.id, b]),
) as Record<BiomeId, BiomeDef>;

export const BIOME_IDS: readonly BiomeId[] = BIOMES.map((b) => b.id);

/** The biome at a distance along the road. */
export function biomeAt(distanceKm: number): BiomeDef {
  for (let i = BIOMES.length - 1; i >= 0; i--) {
    const biome = BIOMES[i] as BiomeDef;
    if (distanceKm >= biome.startKm) return biome;
  }
  return BIOMES[0] as BiomeDef;
}
