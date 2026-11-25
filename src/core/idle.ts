import { ECONOMY } from '../data/economy';
import type { StatBlock } from './vehicle';

/** What the car earns per second while idle-driving. */
export interface IdleRates {
  speedKmh: number;
  kmPerSecond: number;
  moneyPerSecond: number;
}

export interface OfflineEarnings {
  /** Seconds that counted toward earnings (time away, capped). */
  seconds: number;
  distanceKm: number;
  money: number;
  /** True if the player was away longer than the cap. */
  capped: boolean;
}

export function computeIdleRates(stats: StatBlock): IdleRates {
  const { baseSpeedKmh, speedKmhPerPower, moneyPerKm } = ECONOMY.idleDriving;
  const speedKmh = Math.max(0, baseSpeedKmh + stats.power * speedKmhPerPower);
  const kmPerSecond = speedKmh / 3600;
  return { speedKmh, kmPerSecond, moneyPerSecond: kmPerSecond * moneyPerKm };
}

/** Earnings for time spent away, limited by the offline cap. */
export function computeOfflineEarnings(rates: IdleRates, awaySeconds: number): OfflineEarnings {
  const { capHours, efficiency } = ECONOMY.offline;
  const capSeconds = capHours * 3600;
  const away = Number.isFinite(awaySeconds) ? Math.max(0, awaySeconds) : 0;
  const seconds = Math.min(away, capSeconds);
  return {
    seconds,
    distanceKm: rates.kmPerSecond * seconds * efficiency,
    money: rates.moneyPerSecond * seconds * efficiency,
    capped: away > capSeconds,
  };
}
