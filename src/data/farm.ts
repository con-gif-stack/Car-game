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
}

/** The Junkyard farm (the first biome). More farms arrive with Step 8. */
export const JUNKYARD_DEPOSITS: readonly DepositDef[] = [
  { id: 'heap-1', kind: 'scrapHeap', material: 'scrapMetal', x: 22, y: 24, max: 60, regenPerMinute: 12, weight: 3 },
  { id: 'heap-2', kind: 'scrapHeap', material: 'scrapMetal', x: 74, y: 16, max: 60, regenPerMinute: 12, weight: 3 },
  { id: 'heap-3', kind: 'scrapHeap', material: 'scrapMetal', x: 60, y: 46, max: 60, regenPerMinute: 12, weight: 3 },
  { id: 'tires-1', kind: 'tireStack', material: 'rubber', x: 38, y: 50, max: 40, regenPerMinute: 8, weight: 2 },
  { id: 'tires-2', kind: 'tireStack', material: 'rubber', x: 85, y: 38, max: 40, regenPerMinute: 8, weight: 2 },
  { id: 'wire-1', kind: 'wireTangle', material: 'copperWire', x: 14, y: 52, max: 20, regenPerMinute: 3, weight: 0.8 },
  { id: 'engines-1', kind: 'engineBlocks', material: 'aluminum', x: 46, y: 12, max: 20, regenPerMinute: 2.5, weight: 0.6 },
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
  /** Most drones the garage can run (more with garage upgrades in Step 7). */
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

/** Money each unit hauled is worth (scrap value), on top of the material itself. */
export const HAUL_VALUE: Partial<Record<MaterialId, number>> = {
  scrapMetal: 6,
  rubber: 5,
  copperWire: 15,
  aluminum: 18,
};
