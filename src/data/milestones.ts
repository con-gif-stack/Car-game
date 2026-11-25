import type { QualityId } from '../core/vehicle';
import type { BiomeId } from './biomes';
import type { MaterialAmounts } from './economy';

/*
 * Milestones: pivotal moments, announced to the player. Mostly reaching a new biome on a run,
 * or a major unlock. Each is granted once.
 */

export type MilestoneCondition =
  | { kind: 'distance'; km: number }
  | { kind: 'runs'; count: number }
  | { kind: 'allPartsTier'; tier: QualityId };

export interface MilestoneReward {
  /** A biome that becomes available to farm (from Step 8). */
  unlockBiome?: BiomeId;
  /** A feature that switches on, e.g. 'drones' (Step 6). */
  unlockFeature?: string;
  money?: number;
  materials?: MaterialAmounts;
}

export interface MilestoneDef {
  id: string;
  title: string;
  description: string;
  condition: MilestoneCondition;
  reward: MilestoneReward;
}

/** In the order the player will usually reach them. */
export const MILESTONES: readonly MilestoneDef[] = [
  {
    id: 'first-run',
    title: 'Hitting the Road',
    description: 'Finish your first drive run.',
    condition: { kind: 'runs', count: 1 },
    reward: { money: 100 },
  },
  {
    id: 'parts-used',
    title: 'Roadworthy',
    description: 'Fit Used or better parts in every slot.',
    condition: { kind: 'allPartsTier', tier: 'used' },
    reward: { money: 1_000, materials: { scrapMetal: 50 } },
  },
  {
    id: 'reach-rust-highway',
    title: 'Out of the Junkyard',
    description: 'Drive 2 km and reach the Rust Highway.',
    condition: { kind: 'distance', km: 2 },
    reward: { unlockBiome: 'rustHighway', money: 500 },
  },
  {
    id: 'parts-street',
    title: 'Street Machine',
    description: 'Fit Street or better parts in every slot.',
    condition: { kind: 'allPartsTier', tier: 'street' },
    reward: { money: 15_000, materials: { titanium: 3 } },
  },
  {
    id: 'reach-industrial',
    title: 'Smoke on the Horizon',
    description: 'Drive 6 km and reach the Industrial Zone.',
    condition: { kind: 'distance', km: 6 },
    reward: { unlockBiome: 'industrial', money: 5_000 },
  },
  {
    id: 'parts-sport',
    title: 'Sports Car',
    description: 'Fit Sport or better parts in every slot.',
    condition: { kind: 'allPartsTier', tier: 'sport' },
    reward: { money: 150_000, materials: { carbonFiber: 5 } },
  },
  {
    id: 'reach-desert',
    title: 'Sand in the Gears',
    description: 'Drive 15 km and reach the Desert Canyons.',
    condition: { kind: 'distance', km: 15 },
    reward: { unlockBiome: 'desert', money: 50_000 },
  },
  {
    id: 'parts-race',
    title: 'Race Ready',
    description: 'Fit Race parts in every slot.',
    condition: { kind: 'allPartsTier', tier: 'race' },
    reward: { money: 2_000_000, materials: { ceramic: 10 } },
  },
  {
    id: 'reach-beyond',
    title: 'Into the Unknown',
    description: 'Drive 35 km, past the edge of the map.',
    condition: { kind: 'distance', km: 35 },
    reward: { money: 500_000 },
  },
];

export const MILESTONES_BY_ID: Readonly<Record<string, MilestoneDef>> = Object.fromEntries(
  MILESTONES.map((m) => [m.id, m]),
);
