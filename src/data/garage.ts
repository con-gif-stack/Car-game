import { FUEL_TANKS, type CostCurve } from './economy';
import type { MaterialId } from './materials';

/*
 * Garage upgrades, bought in the Garage tab's Workshop: Drone Bays, the Warehouse, the Fuel
 * Depot and the Refinery (the Salvage Magnet lives there too; see economy.ts).
 * Numbers are placeholders, tuned with `npm run simulate`.
 */

export type GarageUpgradeId = 'droneBays' | 'warehouse' | 'fuelDepot' | 'refinery';

export interface GarageUpgradeDef {
  id: GarageUpgradeId;
  name: string;
  description: string;
  maxLevel: number;
  /** Price of level N (N ≥ 1): money and materials, each on a curve. */
  cost: { money: CostCurve; materials: Partial<Record<MaterialId, CostCurve>> };
}

export const GARAGE_UPGRADES: readonly GarageUpgradeDef[] = [
  {
    id: 'droneBays',
    name: 'Drone Bays',
    description: 'More charging bays: the garage can run more drones.',
    maxLevel: 5,
    cost: {
      money: { base: 60_000, growth: 3.5 },
      materials: { scrapMetal: { base: 4_000, growth: 2 }, aluminum: { base: 400, growth: 2.2 }, titanium: { base: 10, growth: 2 } },
    },
  },
  {
    id: 'warehouse',
    name: 'Warehouse',
    description: 'More shelves and racks: store more Common and Uncommon materials.',
    maxLevel: 10,
    // Mostly paid in the materials it stores, so it soaks up surplus rather than money.
    cost: {
      money: { base: 1_000, growth: 1.9 },
      materials: { scrapMetal: { base: 600, growth: 2.15 }, rubber: { base: 300, growth: 2.15 }, aluminum: { base: 40, growth: 2.1 } },
    },
  },
  {
    id: 'fuelDepot',
    name: 'Fuel Depot',
    description: 'Bigger tanks and a faster pump: store more fuel for drive runs, and refill sooner.',
    maxLevel: 5,
    cost: {
      money: { base: 25_000, growth: 3.4 },
      materials: { scrapMetal: { base: 800, growth: 2.2 }, rubber: { base: 400, growth: 2.2 }, copperWire: { base: 80, growth: 2.3 } },
    },
  },
  {
    id: 'refinery',
    name: 'Refinery',
    description: 'Turns piles of common scrap into better materials, slowly, even while you are away.',
    maxLevel: 5,
    cost: {
      money: { base: 5_000, growth: 3.2 },
      materials: { scrapMetal: { base: 1_000, growth: 2.1 }, copperWire: { base: 100, growth: 2.2 }, aluminum: { base: 40, growth: 2.4 } },
    },
  },
];

export const GARAGE_UPGRADES_BY_ID = Object.fromEntries(GARAGE_UPGRADES.map((u) => [u.id, u])) as Record<
  GarageUpgradeId,
  GarageUpgradeDef
>;

/** Each Drone Bays level adds this many drones to the garage's limit. */
export const DRONE_BAYS = { dronesPerLevel: 2 };

/**
 * Storage for Common and Uncommon materials (Rare and better are never limited, so a good run
 * is never wasted). Full materials aren't mined: drones work other piles, or wait.
 */
export const WAREHOUSE = {
  /** Capacity at Warehouse level 0, by rarity. */
  baseCapacity: { common: 2_500, uncommon: 800 },
  /** Each level multiplies capacity by this. */
  growthPerLevel: 2.2,
};

/** Fuel tanks stored and minutes per refill, by Fuel Depot level (index 0 = not upgraded). */
export const FUEL_DEPOT_LEVELS: readonly { maxTanks: number; refillMinutes: number }[] = [
  { maxTanks: FUEL_TANKS.max, refillMinutes: FUEL_TANKS.refillMinutes },
  { maxTanks: 4, refillMinutes: 40 },
  { maxTanks: 4, refillMinutes: 38 },
  { maxTanks: 5, refillMinutes: 38 },
  { maxTanks: 5, refillMinutes: 36 },
  { maxTanks: 6, refillMinutes: 34 },
];

export interface RefineryRecipe {
  id: string;
  name: string;
  description: string;
  /** Refinery level that unlocks it. */
  level: number;
  inputs: Partial<Record<MaterialId, number>>;
  outputs: Partial<Record<MaterialId, number>>;
  /** Seconds per batch at Refinery level 1. */
  seconds: number;
}

export const REFINERY = {
  /** Each level above 1 makes batches this much faster (share of the level-1 speed). */
  speedPerLevel: 0.5,
  recipes: [
    {
      id: 'copper',
      name: 'Wire Stripping',
      description: 'Pull old wiring out of scrap and burn off the insulation.',
      level: 1,
      inputs: { scrapMetal: 40, rubber: 10 },
      outputs: { copperWire: 3 },
      seconds: 60,
    },
    {
      id: 'aluminum',
      name: 'Smelting',
      description: 'Melt down cast engine parts into clean aluminium.',
      level: 1,
      inputs: { scrapMetal: 60 },
      outputs: { aluminum: 2 },
      seconds: 60,
    },
    {
      id: 'titanium',
      name: 'Alloy Sorting',
      description: 'Sift tons of scrap for the odd titanium part. Slow, but it adds up.',
      level: 4,
      inputs: { scrapMetal: 1_200, aluminum: 150 },
      outputs: { titanium: 1 },
      seconds: 8_000,
    },
    {
      id: 'carbon',
      name: 'Carbon Baking',
      description: 'Bake old tyres down to carbon and weave it into fibre.',
      level: 5,
      inputs: { rubber: 1_500, copperWire: 120 },
      outputs: { carbonFiber: 1 },
      seconds: 18_000,
    },
  ] as readonly RefineryRecipe[],
};
