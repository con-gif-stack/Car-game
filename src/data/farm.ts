import type { BiomeId } from './biomes';
import type { Cost, CostCurve } from './economy';
import type { MaterialId } from './materials';

/*
 * The farms: top-down biome maps with deposits to scavenge by hand and drones that haul
 * from them back to the garage. The Junkyard is the first; reaching a biome on a run unlocks
 * its farm. Numbers are placeholders, tuned with `npm run simulate`.
 *
 * Map positions are in metres. The map is MAP_WIDTH wide; y grows downwards, and the garage
 * sits near the bottom. Taller screens show extra ground above.
 */

export const MAP_WIDTH = 100;
export const MAP_HEIGHT = 90;

export type DepositKind =
  | 'scrapHeap'
  | 'tireStack'
  | 'wireTangle'
  | 'engineBlocks'
  | 'carWreck'
  | 'raceWreck'
  | 'pipeStack'
  | 'cableDrum'
  | 'machinery'
  | 'planeWreck'
  | 'insulators';

/** A farm, one per biome that has one (the endless last biome has none yet). */
export type FarmId = 'junkyard' | 'rustHighway' | 'industrial' | 'desert';

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
  /**
   * Rare deposits (a farm's Rare or Epic material) regrow at their own slow pace: better drones
   * can't dig them deeper. Only the farm's local upgrade speeds them up.
   */
  rare?: boolean;
}

/** The Junkyard farm (the first biome). */
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

/** Colours of a farm's ground (see src/art/farmArt.ts). */
export interface GroundPalette {
  light: number;
  base: number;
  dark: number;
  gravel: number;
  oil: number;
  track: number;
}

/** A farm's own upgrade: it makes every pile on that farm regrow faster, rare ones included. */
export interface LocalUpgradeDef {
  name: string;
  description: string;
  maxLevel: number;
  /** Share of normal regrowth added per level (0.4 = +40%). */
  regrowBonusPerLevel: number;
  cost: { money: CostCurve; materials: Partial<Record<MaterialId, CostCurve>> };
}

export interface FarmDef {
  id: FarmId;
  /** The biome whose arrival on a run unlocks this farm. */
  biome: BiomeId;
  name: string;
  description: string;
  deposits: readonly DepositDef[];
  ground: GroundPalette;
  /** Decorative wrecks (map metres). */
  wrecks: readonly { x: number; y: number }[];
  local: LocalUpgradeDef | null;
}

const d = (
  id: string,
  kind: DepositKind,
  material: MaterialId,
  x: number,
  y: number,
  max: number,
  regenPerMinute: number,
  weight: number,
  range = 0,
  rare = false,
): DepositDef => ({ id, kind, material, x, y, max, regenPerMinute, weight, range, ...(rare ? { rare } : {}) });

export const FARMS: readonly FarmDef[] = [
  {
    id: 'junkyard',
    biome: 'junkyard',
    name: 'Junkyard Wastes',
    description: 'Where it all began: scrap heaps, tyre stacks and the odd engine block.',
    deposits: JUNKYARD_DEPOSITS,
    ground: { light: 0x7d6953, base: 0x725e4b, dark: 0x665443, gravel: 0x9c8870, oil: 0x2e2826, track: 0x5a493b },
    wrecks: [
      { x: 8, y: 6 },
      { x: 92, y: 58 },
      { x: 28, y: 72 },
      { x: 74, y: 70 },
      { x: 94, y: 4 },
      { x: 6, y: 82 },
    ],
    local: null,
  },
  {
    id: 'rustHighway',
    biome: 'rustHighway',
    name: 'Rust Highway',
    description: 'An abandoned truck stop. Rich in tyres and aluminium, and the odd crashed race car.',
    deposits: [
      d('hw-tires-1', 'tireStack', 'rubber', 20, 30, 80, 16, 3),
      d('hw-tires-2', 'tireStack', 'rubber', 78, 22, 80, 16, 3),
      d('hw-tires-3', 'tireStack', 'rubber', 64, 50, 60, 12, 2),
      d('hw-wreck-1', 'carWreck', 'aluminum', 34, 14, 40, 6, 1.5),
      d('hw-wreck-2', 'carWreck', 'aluminum', 86, 44, 40, 6, 1.5),
      d('hw-heap-1', 'scrapHeap', 'scrapMetal', 12, 52, 60, 12, 2),
      d('hw-wire-1', 'wireTangle', 'copperWire', 46, 36, 30, 5, 1),
      d('hw-racer-1', 'raceWreck', 'carbonFiber', 56, 8, 6, 0.004, 0.5, 0, true),
      d('hw-wreck-far-1', 'carWreck', 'aluminum', 6, 8, 100, 15, 1.6, 1),
      d('hw-tires-far-1', 'tireStack', 'rubber', 95, 8, 150, 28, 1.6, 2),
      d('hw-racer-far-1', 'raceWreck', 'carbonFiber', 5, 38, 10, 0.006, 0.6, 3, true),
    ],
    ground: { light: 0x575a63, base: 0x4c4f58, dark: 0x41444c, gravel: 0x6b6e77, oil: 0x26272c, track: 0x383a41 },
    wrecks: [
      { x: 90, y: 64 },
      { x: 24, y: 70 },
      { x: 70, y: 74 },
      { x: 40, y: 2 },
    ],
    local: {
      name: 'Tow Truck',
      description: 'Drags in fresh wrecks off the highway: every pile here regrows faster.',
      maxLevel: 3,
      regrowBonusPerLevel: 0.4,
      cost: {
        money: { base: 20_000, growth: 4 },
        materials: { rubber: { base: 2_000, growth: 2.5 }, aluminum: { base: 300, growth: 2.5 } },
      },
    },
  },
  {
    id: 'industrial',
    biome: 'industrial',
    name: 'Industrial Zone',
    description: 'A closed-down factory yard: pipes, cable drums and old machines with titanium inside.',
    deposits: [
      d('ind-pipes-1', 'pipeStack', 'scrapMetal', 22, 22, 120, 24, 3),
      d('ind-pipes-2', 'pipeStack', 'scrapMetal', 70, 30, 120, 24, 3),
      d('ind-cable-1', 'cableDrum', 'copperWire', 40, 48, 50, 8, 2),
      d('ind-cable-2', 'cableDrum', 'copperWire', 86, 52, 50, 8, 2),
      d('ind-engines-1', 'engineBlocks', 'aluminum', 56, 14, 40, 6, 1.5),
      d('ind-wire-1', 'wireTangle', 'copperWire', 12, 48, 30, 5, 1),
      d('ind-machine-1', 'machinery', 'titanium', 32, 6, 6, 0.004, 0.5, 0, true),
      d('ind-pipes-far-1', 'pipeStack', 'scrapMetal', 92, 10, 200, 40, 1.6, 1),
      d('ind-cable-far-1', 'cableDrum', 'copperWire', 6, 26, 120, 18, 1.6, 2),
      d('ind-machine-far-1', 'machinery', 'titanium', 64, 5, 10, 0.006, 0.6, 3, true),
    ],
    ground: { light: 0x7a7974, base: 0x6b6a66, dark: 0x5c5b58, gravel: 0x8a8984, oil: 0x2a2a2c, track: 0x4e4d4a },
    wrecks: [
      { x: 8, y: 72 },
      { x: 92, y: 74 },
      { x: 30, y: 66 },
    ],
    local: {
      name: 'Gantry Crane',
      description: 'Lifts the heavy machinery out of the halls: every pile here regrows faster.',
      maxLevel: 3,
      regrowBonusPerLevel: 0.4,
      cost: {
        money: { base: 60_000, growth: 4 },
        materials: { scrapMetal: { base: 6_000, growth: 2.5 }, copperWire: { base: 800, growth: 2.5 } },
      },
    },
  },
  {
    id: 'desert',
    biome: 'desert',
    name: 'Desert Canyons',
    description: 'An aircraft boneyard in the sand, with old power lines and their ceramic insulators.',
    deposits: [
      d('des-plane-1', 'planeWreck', 'aluminum', 24, 26, 80, 12, 2.5),
      d('des-plane-2', 'planeWreck', 'aluminum', 72, 20, 80, 12, 2.5),
      d('des-tires-1', 'tireStack', 'rubber', 46, 46, 60, 10, 2),
      d('des-heap-1', 'scrapHeap', 'scrapMetal', 84, 48, 60, 12, 2),
      d('des-wire-1', 'wireTangle', 'copperWire', 14, 50, 30, 5, 1),
      d('des-insulators-1', 'insulators', 'ceramic', 50, 8, 6, 0.003, 0.5, 0, true),
      d('des-plane-far-1', 'planeWreck', 'aluminum', 6, 8, 160, 24, 1.6, 1),
      d('des-wire-far-1', 'wireTangle', 'copperWire', 95, 30, 80, 12, 1.6, 2),
      d('des-insulators-far-1', 'insulators', 'ceramic', 90, 4, 10, 0.005, 0.6, 3, true),
    ],
    ground: { light: 0xd8b67e, base: 0xc9a46c, dark: 0xb8935e, gravel: 0xe2c48e, oil: 0x9a7448, track: 0xa8834f },
    wrecks: [
      { x: 30, y: 70 },
      { x: 76, y: 72 },
    ],
    local: {
      name: 'Sand Sifter',
      description: 'Sifts the dunes for buried wreckage: every pile here regrows faster.',
      maxLevel: 3,
      regrowBonusPerLevel: 0.4,
      cost: {
        money: { base: 200_000, growth: 4 },
        materials: { aluminum: { base: 3_000, growth: 2.5 }, rubber: { base: 3_000, growth: 2.5 } },
      },
    },
  },
];

export const FARMS_BY_ID = Object.fromEntries(FARMS.map((f) => [f.id, f])) as Record<FarmId, FarmDef>;
export const FARM_IDS: readonly FarmId[] = FARMS.map((f) => f.id);
