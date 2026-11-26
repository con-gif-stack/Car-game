import type { Cost, CostCurve } from './economy';
import type { MaterialId } from './materials';

/*
 * The farm: a top-down biome map with deposits to scavenge by hand and drones that haul
 * from them back to the garage. Numbers are placeholders, tuned with `npm run simulate`.
 *
 * Map positions are in metres. The map is MAP_WIDTH wide; y grows downwards, and the garage
 * sits near the bottom. Taller screens show extra ground above.
 */

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 90;

export type DepositKind = 'scrapHeap' | 'tireStack' | 'wireTangle' | 'engineBlocks';

export interface DepositDef {
  id: string;
  kind: DepositKind;
  material: MaterialId;
  x: number;
  y: number;
  /** Most units the deposit holds. */
  max: number;
  /** Units it regrows per minute. */
  regenPerMinute: number;
  /** How often drones pick it, relative to other deposits. */
  weight: number;
  /** Drone Range level needed to reach it (0 = always in reach). Far deposits are richer. */
  range: number;
}

/** The Junkyard farm (the first biome). More farms arrive with Step 8. */
export const JUNKYARD_DEPOSITS: readonly DepositDef[] = [
  { id: 'heap-1', kind: 'scrapHeap', material: 'scrapMetal', x: 22, y: 24, max: 60, regenPerMinute: 12, weight: 3, range: 0 },
  { id: 'heap-2', kind: 'scrapHeap', material: 'scrapMetal', x: 74, y: 16, max: 60, regenPerMinute: 12, weight: 3, range: 0 },
  { id: 'heap-3', kind: 'scrapHeap', material: 'scrapMetal', x: 60, y: 46, max: 60, regenPerMinute: 12, weight: 3, range: 0 },
  { id: 'tires-1', kind: 'tireStack', material: 'rubber', x: 38, y: 50, max: 40, regenPerMinute: 8, weight: 2, range: 0 },
  { id: 'tires-2', kind: 'tireStack', material: 'rubber', x: 85, y: 38, max: 40, regenPerMinute: 8, weight: 2, range: 0 },
  { id: 'wire-1', kind: 'wireTangle', material: 'copperWire', x: 14, y: 52, max: 20, regenPerMinute: 3, weight: 0.8, range: 0 },
  { id: 'engines-1', kind: 'engineBlocks', material: 'aluminum', x: 46, y: 12, max: 20, regenPerMinute: 2.5, weight: 0.6, range: 0 },
  // Out at the edges of the yard: drones need Range upgrades to reach these.
  { id: 'wire-far-1', kind: 'wireTangle', material: 'copperWire', x: 6, y: 34, max: 50, regenPerMinute: 8, weight: 1.2, range: 1 },
  { id: 'heap-far-1', kind: 'scrapHeap', material: 'scrapMetal', x: 60, y: 4, max: 120, regenPerMinute: 24, weight: 2, range: 1 },
  { id: 'engines-far-1', kind: 'engineBlocks', material: 'aluminum', x: 24, y: 4, max: 60, regenPerMinute: 8, weight: 1.2, range: 2 },
  { id: 'tires-far-1', kind: 'tireStack', material: 'rubber', x: 95, y: 28, max: 100, regenPerMinute: 20, weight: 1.5, range: 2 },
  { id: 'engines-far-2', kind: 'engineBlocks', material: 'aluminum', x: 82, y: 5, max: 140, regenPerMinute: 18, weight: 1.6, range: 3 },
  { id: 'wire-far-2', kind: 'wireTangle', material: 'copperWire', x: 5, y: 14, max: 120, regenPerMinute: 18, weight: 1.6, range: 3 },
];

/** Where drones take off from and unload. */
export const GARAGE_POSITION = { x: 50, y: 78 };

/** Scavenging by hand: what one tap gives. */
export const SCAVENGE = {
  /** Units of the deposit's material per tap. */
  unitsPerTap: 1,
};

export interface DroneModel {
  name: string;
  description: string;
  /** Flying speed (m/s). */
  speed: number;
  /** Units carried per trip. */
  capacity: number;
  /** Units mined per second while hovering over a deposit. */
  mineRate: number;
  /** Better drones dig deeper: deposits regrow this many times faster. */
  heapYield: number;
  /** Price to upgrade every drone to this model (the first model is free). */
  cost: Cost;
}

/** Drone models, in upgrade order. Each looks different (see src/art/droneArt.ts). */
export const DRONE_MODELS: readonly DroneModel[] = [
  {
    name: 'Scrap Drone',
    description: 'Bolted together from junk. Wobbly, slow, but it works.',
    speed: 4,
    capacity: 3,
    mineRate: 0.5,
    heapYield: 1,
    cost: {},
  },
  {
    name: 'Patched Drone',
    description: 'New rotors and a proper frame. Faster, and carries more.',
    speed: 6,
    capacity: 6,
    mineRate: 1,
    heapYield: 3,
    cost: { money: 4_000, materials: { scrapMetal: 300, copperWire: 60, aluminum: 40 } },
  },
  {
    name: 'Sleek Drone',
    description: 'A light shell and quiet motors. A serious hauler.',
    speed: 9,
    capacity: 10,
    mineRate: 2,
    heapYield: 5,
    cost: { money: 120_000, materials: { aluminum: 1_500, copperWire: 1_200, titanium: 25 } },
  },
  {
    name: 'Hover Drone',
    description: 'No rotors at all: it rides on a humming field. The future, early.',
    speed: 14,
    capacity: 24,
    mineRate: 5,
    heapYield: 15,
    cost: { money: 2_500_000, materials: { aluminum: 12_000, titanium: 220, carbonFiber: 140, ceramic: 40 } },
  },
];

export const DRONES = {
  /** Most drones the garage can run before any Drone Bay upgrades (see src/data/garage.ts). */
  maxCount: 5,
  /** Seconds a drone spends unloading at the garage. */
  unloadSeconds: 1,
  /** Price of building drone number N (N ≥ 2; the first comes from a milestone). */
  buildCost: {
    money: { base: 800, growth: 4 } as CostCurve,
    scrapMetal: { base: 120, growth: 3 } as CostCurve,
    copperWire: { base: 20, growth: 3 } as CostCurve,
  },
};

export type DroneBranchId = 'speed' | 'cargo' | 'drills' | 'range';

/**
 * A branch of the drone upgrade tree: levels bought with money and materials. Each drone
 * model opens `levelsPerModel` more levels on every branch, so the models are the trunk.
 */
export interface DroneBranch {
  id: DroneBranchId;
  name: string;
  description: string;
  levelsPerModel: number;
  /** Bonus per level, as a share of the model's base value (e.g. 0.12 = +12%). Unused by Range. */
  bonusPerLevel: number;
  /** Price of level N, as curves (money and each material); or a fixed list per level. */
  cost: { money: CostCurve; materials: Partial<Record<MaterialId, CostCurve>> } | readonly Cost[];
}

export const DRONE_BRANCHES: readonly DroneBranch[] = [
  {
    id: 'speed',
    name: 'Rotors',
    description: 'Bigger rotors and better motors: drones fly faster.',
    levelsPerModel: 4,
    bonusPerLevel: 0.08,
    cost: {
      money: { base: 300, growth: 1.5 },
      materials: { scrapMetal: { base: 60, growth: 1.42 }, copperWire: { base: 8, growth: 1.45 } },
    },
  },
  {
    id: 'cargo',
    name: 'Cargo Pods',
    description: 'Roomier pods and stronger straps: each trip carries more.',
    levelsPerModel: 4,
    bonusPerLevel: 0.1,
    cost: {
      money: { base: 350, growth: 1.5 },
      materials: { scrapMetal: { base: 70, growth: 1.42 }, rubber: { base: 30, growth: 1.42 } },
    },
  },
  {
    id: 'drills',
    name: 'Drills',
    description: 'Sharper drills and claws: drones mine faster and dig deeper, so piles regrow faster.',
    levelsPerModel: 4,
    bonusPerLevel: 0.1,
    cost: {
      money: { base: 400, growth: 1.5 },
      materials: { scrapMetal: { base: 80, growth: 1.42 }, aluminum: { base: 6, growth: 1.45 } },
    },
  },
  {
    id: 'range',
    name: 'Range',
    description: 'Bigger batteries: drones reach richer piles at the edges of the yard.',
    levelsPerModel: 1,
    bonusPerLevel: 0,
    cost: [
      { money: 3_000, materials: { scrapMetal: 400, copperWire: 80 } },
      { money: 40_000, materials: { aluminum: 600, copperWire: 400 } },
      { money: 400_000, materials: { aluminum: 3_000, titanium: 40 } },
    ],
  },
];

export const DRONE_BRANCHES_BY_ID = Object.fromEntries(DRONE_BRANCHES.map((b) => [b.id, b])) as Record<
  DroneBranchId,
  DroneBranch
>;

/** Money each unit hauled is worth (scrap value), on top of the material itself. */
export const HAUL_VALUE: Partial<Record<MaterialId, number>> = {
  scrapMetal: 6,
  rubber: 5,
  copperWire: 15,
  aluminum: 18,
};
