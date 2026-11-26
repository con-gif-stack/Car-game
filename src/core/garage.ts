import type { Cost } from '../data/economy';
import { DRONES } from '../data/farm';
import {
  DRONE_BAYS,
  FUEL_DEPOT_LEVELS,
  GARAGE_UPGRADES_BY_ID,
  REFINERY,
  WAREHOUSE,
  type GarageUpgradeId,
  type RefineryRecipe,
} from '../data/garage';
import { emptyMaterials, MATERIAL_IDS, MATERIALS_BY_ID, type MaterialId } from '../data/materials';
import type { FuelLimits } from './run';
import type { MaterialStock, Resources, WorkshopState } from './state';

/*
 * Garage upgrades: Drone Bays (more drones), the Warehouse (storage limits for Common and
 * Uncommon materials), the Fuel Depot (more and faster fuel tanks) and the Refinery (turns
 * common materials into better ones over time). Pure functions on plain state.
 */

/** Current level of a garage upgrade. */
export function garageLevel(workshop: WorkshopState, id: GarageUpgradeId): number {
  const def = GARAGE_UPGRADES_BY_ID[id];
  return Math.min(def.maxLevel, Math.max(0, Math.floor(workshop[id] ?? 0)));
}

/** Most drones the garage can run. */
export function maxDrones(workshop: WorkshopState): number {
  return DRONES.maxCount + DRONE_BAYS.dronesPerLevel * garageLevel(workshop, 'droneBays');
}

/** Storage limit for a material at a Warehouse level; Infinity for Rare and better. */
export function capacityAt(level: number, id: MaterialId): number {
  const rarity = MATERIALS_BY_ID[id].rarity;
  const base = rarity === 'common' ? WAREHOUSE.baseCapacity.common : rarity === 'uncommon' ? WAREHOUSE.baseCapacity.uncommon : Infinity;
  return base * WAREHOUSE.growthPerLevel ** level;
}

/** Storage limit for a material; Infinity for Rare and better. */
export function storageCap(workshop: WorkshopState, id: MaterialId): number {
  return capacityAt(garageLevel(workshop, 'warehouse'), id);
}

/** Room left for a material (0 when full, or when holding more than the limit already). */
export function storageRoom(resources: Resources, workshop: WorkshopState, id: MaterialId, alsoPending = 0): number {
  return Math.max(0, storageCap(workshop, id) - resources.materials[id] - alsoPending);
}

/** True when a material's storage is full (drones stop mining it). */
export function isFull(resources: Resources, workshop: WorkshopState, id: MaterialId): boolean {
  return storageRoom(resources, workshop, id) < 0.01;
}

/** Fits amounts into the room left in storage (amounts already pending count as stored). */
export function fitToStorage(
  materials: Partial<Record<MaterialId, number>>,
  resources: Resources,
  workshop: WorkshopState,
  pending?: MaterialStock,
): MaterialStock {
  const fitted = emptyMaterials();
  for (const id of MATERIAL_IDS) {
    const amount = materials[id] ?? 0;
    fitted[id] = amount > 0 ? Math.min(amount, storageRoom(resources, workshop, id, pending?.[id] ?? 0)) : amount;
  }
  return fitted;
}

/** Adds materials, up to the storage limits. Returns the amounts actually stored. */
export function storeMaterials(resources: Resources, workshop: WorkshopState, materials: Partial<Record<MaterialId, number>>): MaterialStock {
  const stored = fitToStorage(materials, resources, workshop);
  for (const id of MATERIAL_IDS) resources.materials[id] += stored[id];
  return stored;
}

/** Fuel tanks stored and time per refill, from the Fuel Depot. */
export function fuelLimits(workshop: WorkshopState): FuelLimits {
  const level = FUEL_DEPOT_LEVELS[garageLevel(workshop, 'fuelDepot')] ?? FUEL_DEPOT_LEVELS[0];
  return { maxTanks: level?.maxTanks ?? 3, refillMs: (level?.refillMinutes ?? 40) * 60_000 };
}

/** Price of the next level of a garage upgrade, or null when it's maxed. */
export function garageUpgradeCost(workshop: WorkshopState, id: GarageUpgradeId): Cost | null {
  const def = GARAGE_UPGRADES_BY_ID[id];
  const level = garageLevel(workshop, id);
  if (level >= def.maxLevel) return null;
  const n = level + 1;
  const curve = (c: { base: number; growth: number }) => Math.round(c.base * c.growth ** (n - 1));
  const materials: Partial<Record<MaterialId, number>> = {};
  for (const [mid, c] of Object.entries(def.cost.materials)) if (c) materials[mid as MaterialId] = curve(c);
  return { money: curve(def.cost.money), materials };
}

/** Recipes the refinery can run at a level. */
export function refineryRecipes(level: number): RefineryRecipe[] {
  return REFINERY.recipes.filter((r) => r.level <= level);
}

export function refineryRecipe(id: string): RefineryRecipe | undefined {
  return REFINERY.recipes.find((r) => r.id === id);
}

/** Seconds per batch of a recipe at a Refinery level. */
export function batchSeconds(recipe: RefineryRecipe, level: number): number {
  return recipe.seconds / (1 + REFINERY.speedPerLevel * Math.max(0, level - 1));
}

export type RefineryStatus = 'off' | 'running' | 'noInputs' | 'storageFull';

export interface RefineryResult {
  batches: number;
  consumed: MaterialStock;
  produced: MaterialStock;
  status: RefineryStatus;
}

/**
 * Runs the refinery for `seconds`: consumes inputs and stores outputs, a batch at a time,
 * stopping when inputs run out or the outputs' storage is full. Progress towards a partly done
 * batch carries over between calls.
 */
export function stepRefinery(resources: Resources, workshop: WorkshopState, seconds: number): RefineryResult {
  const consumed = emptyMaterials();
  const produced = emptyMaterials();
  const level = garageLevel(workshop, 'refinery');
  const recipe = refineryRecipe(workshop.refineryRecipe);
  if (!recipe || level < recipe.level || !(seconds > 0)) {
    return { batches: 0, consumed, produced, status: recipe && level >= recipe.level ? 'running' : 'off' };
  }

  const total = workshop.refineryProgress + seconds / batchSeconds(recipe, level);
  const wanted = Math.floor(total);
  let possible = wanted;
  let status: RefineryStatus = 'running';
  for (const [id, amount] of Object.entries(recipe.inputs) as [MaterialId, number][]) {
    const byInput = Math.floor(resources.materials[id] / amount);
    if (byInput < possible) {
      possible = byInput;
      status = 'noInputs';
    }
  }
  for (const [id, amount] of Object.entries(recipe.outputs) as [MaterialId, number][]) {
    const byRoom = Math.floor(storageRoom(resources, workshop, id) / amount);
    if (byRoom < possible) {
      possible = byRoom;
      status = 'storageFull';
    }
  }
  const batches = Math.max(0, possible);
  for (const [id, amount] of Object.entries(recipe.inputs) as [MaterialId, number][]) {
    consumed[id] = amount * batches;
    resources.materials[id] -= consumed[id];
  }
  for (const [id, amount] of Object.entries(recipe.outputs) as [MaterialId, number][]) {
    produced[id] = amount * batches;
    resources.materials[id] += produced[id];
  }
  // A blocked refinery waits with its next batch ready; otherwise keep the partial progress.
  workshop.refineryProgress = batches < wanted ? Math.min(0.999, total - batches) : total - wanted;
  return { batches, consumed, produced, status };
}

/** What the refinery is doing right now, without running it. */
export function refineryStatus(resources: Resources, workshop: WorkshopState): RefineryStatus {
  const level = garageLevel(workshop, 'refinery');
  const recipe = refineryRecipe(workshop.refineryRecipe);
  if (!recipe || level < recipe.level) return 'off';
  for (const [id, amount] of Object.entries(recipe.inputs) as [MaterialId, number][]) {
    if (resources.materials[id] < amount) return 'noInputs';
  }
  for (const [id, amount] of Object.entries(recipe.outputs) as [MaterialId, number][]) {
    if (storageRoom(resources, workshop, id) < amount) return 'storageFull';
  }
  return 'running';
}
