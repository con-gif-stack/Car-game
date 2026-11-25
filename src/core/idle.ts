import { ECONOMY } from '../data/economy';
import { emptyMaterials, MATERIAL_IDS, MATERIALS, type TrickleSource } from '../data/materials';
import type { MaterialStock } from './state';

/*
 * Idle income: what keeps arriving while the game runs or is away. Since the core loop
 * revision, that is the farm's drone hauls (src/core/farm.ts) plus a small trickle of Rare
 * and Epic materials (the Salvage Magnet).
 */

/** Income per second. */
export interface IncomeRates {
  moneyPerSecond: number;
  materialsPerSecond: MaterialStock;
}

export interface OfflineEarnings {
  /** Seconds that counted toward earnings (time away, capped). */
  seconds: number;
  money: number;
  materials: MaterialStock;
  /** True if the player was away longer than the cap. */
  capped: boolean;
}

/** How much a trickle is multiplied at a progress level (0 before it unlocks). */
export function progressFactor(source: TrickleSource, progress: number): number {
  if (progress < source.unlockProgress) return 0;
  return 1 + source.growthPerProgress * (progress - source.unlockProgress);
}

/** Multiplier on the Rare-and-above trickle from the Salvage Magnet. */
export function salvageMagnetMultiplier(level: number): number {
  const { bonusPerLevel, maxLevel } = ECONOMY.salvageMagnet;
  return 1 + bonusPerLevel * Math.min(maxLevel, Math.max(0, Math.floor(level)));
}

/**
 * The idle trickle of Rare-and-above materials, per second.
 * @param progress car progress (see carProgress); the trickle grows as it rises.
 */
export function trickleRates(salvageMagnetLevel: number, progress: number): MaterialStock {
  const rates = emptyMaterials();
  const magnet = salvageMagnetMultiplier(salvageMagnetLevel);
  for (const material of MATERIALS) {
    if (!material.trickle) continue;
    rates[material.id] = (material.trickle.perHour / 3600) * magnet * progressFactor(material.trickle, progress);
  }
  return rates;
}

/** Adds two sets of rates together. */
export function combineRates(a: IncomeRates, b: IncomeRates): IncomeRates {
  const materialsPerSecond = emptyMaterials();
  for (const id of MATERIAL_IDS) materialsPerSecond[id] = a.materialsPerSecond[id] + b.materialsPerSecond[id];
  return { moneyPerSecond: a.moneyPerSecond + b.moneyPerSecond, materialsPerSecond };
}

/** Earnings for time spent away, limited by the offline cap. */
export function computeOfflineEarnings(rates: IncomeRates, awaySeconds: number): OfflineEarnings {
  const { capHours, efficiency } = ECONOMY.offline;
  const capSeconds = capHours * 3600;
  const away = Number.isFinite(awaySeconds) ? Math.max(0, awaySeconds) : 0;
  const seconds = Math.min(away, capSeconds);
  const earn = (perSecond: number) => perSecond * seconds * efficiency;
  const materials = emptyMaterials();
  for (const id of MATERIAL_IDS) materials[id] = earn(rates.materialsPerSecond[id]);
  return { seconds, money: earn(rates.moneyPerSecond), materials, capped: away > capSeconds };
}
