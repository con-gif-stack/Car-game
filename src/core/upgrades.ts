import {
  ECONOMY,
  LEVEL_COSTS,
  PART_LEVELS,
  PART_RECIPES,
  SLOT_COST_MULTIPLIERS,
  TIER_MONEY_COSTS,
  type Cost,
  type CostCurve,
  type MaterialAmounts,
} from '../data/economy';
import { MATERIAL_IDS } from '../data/materials';
import { DRONE_BRANCHES_BY_ID, DRONE_MODELS, DRONES, type DroneBranchId } from '../data/farm';
import type { GarageUpgradeId } from '../data/garage';
import { partId, QUALITIES, TIER_ORDER } from '../data/vehicles';
import { branchLevel, branchMaxLevel, type FarmState } from './farm';
import { garageUpgradeCost } from './garage';
import type { Resources, WorkshopState } from './state';
import { getPart, type CarState, type PartDef, type SlotId } from './vehicle';

/*
 * Upgrade rules: what can be bought next and what it costs. Pure functions on plain state,
 * shared by the game and the balance simulator.
 */

function curve(c: CostCurve, level: number): number {
  return Math.round(c.base * c.growth ** (level - 1));
}

/** Materials in a cost, as [id, amount] pairs with amount > 0, in display order. */
export function costMaterials(cost: Cost): [keyof MaterialAmounts, number][] {
  return MATERIAL_IDS.filter((id) => (cost.materials?.[id] ?? 0) > 0).map((id) => [id, cost.materials?.[id] ?? 0]);
}

export function canAfford(resources: Resources, cost: Cost): boolean {
  if (resources.money < (cost.money ?? 0)) return false;
  return costMaterials(cost).every(([id, amount]) => resources.materials[id] >= amount);
}

/** Takes the cost from resources. Returns false (and changes nothing) if it can't be afforded. */
export function spend(resources: Resources, cost: Cost): boolean {
  if (!canAfford(resources, cost)) return false;
  resources.money -= cost.money ?? 0;
  for (const [id, amount] of costMaterials(cost)) resources.materials[id] -= amount;
  return true;
}

/** The next-tier part for a slot, or null if the slot is already at the top tier. */
export function nextTierPart(car: CarState, slot: SlotId): PartDef | null {
  const current = getPart(car.parts[slot]?.partId);
  const startRank = current ? QUALITIES[current.quality].rank + 1 : 0;
  for (let rank = startRank; rank < TIER_ORDER.length; rank++) {
    const quality = TIER_ORDER[rank];
    const part = quality ? getPart(partId(slot, quality)) : null;
    if (part) return part;
  }
  return null;
}

/** Price of buying a part outright (replacing whatever is installed). */
export function tierCost(part: PartDef): Cost {
  if (part.quality === 'worn') return {};
  return {
    money: Math.round(TIER_MONEY_COSTS[part.quality] * SLOT_COST_MULTIPLIERS[part.slot]),
    materials: { ...PART_RECIPES[part.slot][part.quality] },
  };
}

/** Price of levelling the installed part from `level` to `level + 1`, or null at max level. */
export function levelUpCost(part: PartDef, level: number): Cost | null {
  if (level >= PART_LEVELS.maxLevel) return null;
  return { money: Math.round(curve(LEVEL_COSTS[part.quality], level) * SLOT_COST_MULTIPLIERS[part.slot]) };
}

/** Price of raising the Salvage Magnet from `level` to `level + 1`, or null at max level. */
export function salvageMagnetCost(level: number): Cost | null {
  const m = ECONOMY.salvageMagnet;
  if (level >= m.maxLevel) return null;
  return {
    money: curve(m.cost.money, level + 1),
    materials: {
      scrapMetal: curve(m.cost.scrapMetal, level + 1),
      copperWire: curve(m.cost.copperWire, level + 1),
    },
  };
}

/** Buys and installs the next tier for a slot, at level 1. Returns false if not possible. */
export function buyNextTier(car: CarState, slot: SlotId, resources: Resources): boolean {
  const part = nextTierPart(car, slot);
  if (!part || !spend(resources, tierCost(part))) return false;
  car.parts[slot] = { partId: part.id, level: 1 };
  return true;
}

/** Levels up the part in a slot. Returns false if empty, maxed or unaffordable. */
export function buyLevelUp(car: CarState, slot: SlotId, resources: Resources): boolean {
  const installed = car.parts[slot];
  const part = getPart(installed?.partId);
  if (!installed || !part) return false;
  const cost = levelUpCost(part, installed.level);
  if (!cost || !spend(resources, cost)) return false;
  installed.level += 1;
  return true;
}

/** Price of building one more drone, given how many the farm already has; null at the limit. */
export function droneBuildCost(currentCount: number, maxCount: number = DRONES.maxCount): Cost | null {
  if (currentCount >= maxCount) return null;
  // The first drone comes from a milestone; prices start with the second.
  const n = Math.max(1, currentCount);
  const c = DRONES.buildCost;
  return {
    money: curve(c.money, n),
    materials: { scrapMetal: curve(c.scrapMetal, n), copperWire: curve(c.copperWire, n) },
  };
}

/** Price of upgrading every drone to the next model, or null at the best model. */
export function droneModelCost(currentModel: number): Cost | null {
  const next = DRONE_MODELS[currentModel + 1];
  return next ? next.cost : null;
}

/** Builds one more drone. Returns false if at the limit or unaffordable. */
export function buyDrone(farm: FarmState, resources: Resources, maxCount: number = DRONES.maxCount): boolean {
  const cost = droneBuildCost(farm.droneCount, maxCount);
  if (!cost || farm.droneCount < 1 || !spend(resources, cost)) return false;
  farm.droneCount += 1;
  return true;
}

/** Upgrades the drones to the next model. Returns false if at the best model or unaffordable. */
export function buyDroneModel(farm: FarmState, resources: Resources): boolean {
  const cost = droneModelCost(farm.droneModel);
  if (!cost || farm.droneCount < 1 || !spend(resources, cost)) return false;
  farm.droneModel += 1;
  return true;
}

/** Price of the next level of a drone-tree branch, or null if the current model can't go higher. */
export function droneBranchCost(farm: FarmState, id: DroneBranchId): Cost | null {
  const level = branchLevel(farm, id);
  if (level >= branchMaxLevel(farm, id)) return null;
  return branchLevelCost(id, level + 1);
}

/** Price of a branch level (ignoring whether the current model allows it). */
export function branchLevelCost(id: DroneBranchId, level: number): Cost | null {
  const branch = DRONE_BRANCHES_BY_ID[id];
  if (Array.isArray(branch.cost)) return (branch.cost as readonly Cost[])[level - 1] ?? null;
  const c = branch.cost as Exclude<typeof branch.cost, readonly Cost[]>;
  const materials: MaterialAmounts = {};
  for (const [mid, m] of Object.entries(c.materials)) if (m) materials[mid as keyof MaterialAmounts] = curve(m, level);
  return { money: curve(c.money, level), materials };
}

/** Buys the next level of a drone-tree branch. Returns false if not possible. */
export function buyDroneBranch(farm: FarmState, id: DroneBranchId, resources: Resources): boolean {
  const cost = droneBranchCost(farm, id);
  if (!cost || farm.droneCount < 1 || !spend(resources, cost)) return false;
  farm.branches[id] = branchLevel(farm, id) + 1;
  return true;
}

/** Buys the next level of a garage upgrade. Returns false if maxed or unaffordable. */
export function buyGarageUpgrade(workshop: WorkshopState, id: GarageUpgradeId, resources: Resources): boolean {
  const cost = garageUpgradeCost(workshop, id);
  if (!cost || !spend(resources, cost)) return false;
  workshop[id] += 1;
  return true;
}
