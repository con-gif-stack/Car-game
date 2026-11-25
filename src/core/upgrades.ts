import {
  ECONOMY,
  LEVEL_COSTS,
  PART_LEVELS,
  SLOT_COST_MULTIPLIERS,
  TIER_COSTS,
  type Cost,
  type CostCurve,
} from '../data/economy';
import { partId, QUALITIES, TIER_ORDER } from '../data/vehicles';
import type { Resources } from './state';
import { getPart, type CarState, type PartDef, type SlotId } from './vehicle';

/*
 * Upgrade rules: what can be bought next and what it costs. Pure functions on plain state,
 * shared by the game and the balance simulator.
 */

const RESOURCE_KEYS = ['money', 'materials', 'rareMaterials'] as const;

function curve(c: CostCurve, level: number): number {
  return Math.round(c.base * c.growth ** (level - 1));
}

function scaleCost(cost: Cost, multiplier: number): Cost {
  const result: Cost = {};
  for (const key of RESOURCE_KEYS) {
    const value = cost[key];
    if (value) result[key] = Math.round(value * multiplier);
  }
  return result;
}

export function canAfford(resources: Resources, cost: Cost): boolean {
  return RESOURCE_KEYS.every((key) => resources[key] >= (cost[key] ?? 0));
}

/** Takes the cost from resources. Returns false (and changes nothing) if it can't be afforded. */
export function spend(resources: Resources, cost: Cost): boolean {
  if (!canAfford(resources, cost)) return false;
  for (const key of RESOURCE_KEYS) resources[key] -= cost[key] ?? 0;
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
  return scaleCost(TIER_COSTS[part.quality], SLOT_COST_MULTIPLIERS[part.slot]);
}

/** Price of levelling the installed part from `level` to `level + 1`, or null at max level. */
export function levelUpCost(part: PartDef, level: number): Cost | null {
  if (level >= PART_LEVELS.maxLevel) return null;
  return { money: Math.round(curve(LEVEL_COSTS[part.quality], level) * SLOT_COST_MULTIPLIERS[part.slot]) };
}

/** Price of raising the Salvage Magnet from `level` to `level + 1`, or null at max level. */
export function rareTrickleUpgradeCost(level: number): Cost | null {
  const t = ECONOMY.rareTrickle;
  if (level >= t.maxLevel) return null;
  return { money: curve(t.cost.money, level + 1), materials: curve(t.cost.materials, level + 1) };
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
