import { ECONOMY, type StatScaling } from '../data/economy';
import type { StatBlock } from './vehicle';

/** What the car earns per second while idle-driving. */
export interface IdleRates {
  speedKmh: number;
  kmPerSecond: number;
  moneyPerSecond: number;
  materialsPerSecond: number;
  rareMaterialsPerSecond: number;
}

export interface OfflineEarnings {
  /** Seconds that counted toward earnings (time away, capped). */
  seconds: number;
  distanceKm: number;
  money: number;
  materials: number;
  rareMaterials: number;
  /** True if the player was away longer than the cap. */
  capped: boolean;
}

function statFactor(stats: StatBlock, scaling: StatScaling): number {
  return Math.max(0, stats[scaling.stat]) / scaling.reference;
}

/** Rare materials per hour from the idle trickle at a Salvage Magnet level. */
export function rareTricklePerHour(level: number): number {
  const { basePerHour, perLevelPerHour, maxLevel } = ECONOMY.rareTrickle;
  const clamped = Math.min(maxLevel, Math.max(0, Math.floor(level)));
  return basePerHour + perLevelPerHour * clamped;
}

export function computeIdleRates(stats: StatBlock, rareTrickleLevel = 0): IdleRates {
  const d = ECONOMY.idleDriving;
  const speedKmh = Math.max(0, d.baseSpeedKmh + stats.power * d.speedKmhPerPower);
  const kmPerSecond = speedKmh / 3600;
  return {
    speedKmh,
    kmPerSecond,
    moneyPerSecond: kmPerSecond * d.moneyPerKm * statFactor(stats, d.moneyScaling),
    materialsPerSecond: kmPerSecond * d.materialsPerKm * statFactor(stats, d.materialsScaling),
    rareMaterialsPerSecond: rareTricklePerHour(rareTrickleLevel) / 3600,
  };
}

/** Earnings for time spent away, limited by the offline cap. */
export function computeOfflineEarnings(rates: IdleRates, awaySeconds: number): OfflineEarnings {
  const { capHours, efficiency } = ECONOMY.offline;
  const capSeconds = capHours * 3600;
  const away = Number.isFinite(awaySeconds) ? Math.max(0, awaySeconds) : 0;
  const seconds = Math.min(away, capSeconds);
  const earn = (perSecond: number) => perSecond * seconds * efficiency;
  return {
    seconds,
    distanceKm: earn(rates.kmPerSecond),
    money: earn(rates.moneyPerSecond),
    materials: earn(rates.materialsPerSecond),
    rareMaterials: earn(rates.rareMaterialsPerSecond),
    capped: away > capSeconds,
  };
}
