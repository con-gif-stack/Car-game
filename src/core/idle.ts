import { ECONOMY, type StatScaling } from '../data/economy';
import { emptyMaterials, MATERIALS, type IdleSource } from '../data/materials';
import type { MaterialStock } from './state';
import type { StatBlock } from './vehicle';

/** What the car earns per second while idle-driving. */
export interface IdleRates {
  speedKmh: number;
  kmPerSecond: number;
  moneyPerSecond: number;
  materialsPerSecond: MaterialStock;
}

export interface OfflineEarnings {
  /** Seconds that counted toward earnings (time away, capped). */
  seconds: number;
  distanceKm: number;
  money: number;
  materials: MaterialStock;
  /** True if the player was away longer than the cap. */
  capped: boolean;
}

function statFactor(stats: StatBlock, scaling: StatScaling): number {
  return Math.max(0, stats[scaling.stat]) / scaling.reference;
}

/** How much a material's idle drop is multiplied at a progress level (0 before it unlocks). */
export function progressFactor(source: IdleSource, progress: number): number {
  if (progress < source.unlockProgress) return 0;
  return 1 + source.growthPerProgress * (progress - source.unlockProgress);
}

/** Multiplier on the Rare-and-above trickle from the Salvage Magnet. */
export function salvageMagnetMultiplier(level: number): number {
  const { bonusPerLevel, maxLevel } = ECONOMY.salvageMagnet;
  return 1 + bonusPerLevel * Math.min(maxLevel, Math.max(0, Math.floor(level)));
}

/**
 * Idle earnings per second.
 * @param progress car progress (see carProgress); rarer materials drop more as it rises.
 */
export function computeIdleRates(stats: StatBlock, salvageMagnetLevel = 0, progress = 0): IdleRates {
  const d = ECONOMY.idleDriving;
  const speedKmh = Math.max(0, d.baseSpeedKmh + stats.power * d.speedKmhPerPower);
  const kmPerSecond = speedKmh / 3600;
  const grip = statFactor(stats, d.materialsScaling);
  const magnet = salvageMagnetMultiplier(salvageMagnetLevel);

  const materialsPerSecond = emptyMaterials();
  for (const material of MATERIALS) {
    const source = material.idle;
    const growth = progressFactor(source, progress);
    materialsPerSecond[material.id] =
      source.kind === 'distance'
        ? kmPerSecond * source.perKm * grip * growth
        : (source.perHour / 3600) * magnet * growth;
  }

  return {
    speedKmh,
    kmPerSecond,
    moneyPerSecond: kmPerSecond * d.moneyPerKm * statFactor(stats, d.moneyScaling),
    materialsPerSecond,
  };
}

/** Earnings for time spent away, limited by the offline cap. */
export function computeOfflineEarnings(rates: IdleRates, awaySeconds: number): OfflineEarnings {
  const { capHours, efficiency } = ECONOMY.offline;
  const capSeconds = capHours * 3600;
  const away = Number.isFinite(awaySeconds) ? Math.max(0, awaySeconds) : 0;
  const seconds = Math.min(away, capSeconds);
  const earn = (perSecond: number) => perSecond * seconds * efficiency;
  const materials = emptyMaterials();
  for (const material of MATERIALS) materials[material.id] = earn(rates.materialsPerSecond[material.id]);
  return {
    seconds,
    distanceKm: earn(rates.kmPerSecond),
    money: earn(rates.moneyPerSecond),
    materials,
    capped: away > capSeconds,
  };
}
