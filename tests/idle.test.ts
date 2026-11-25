import { describe, expect, it } from 'vitest';
import { formatDistance, formatPrecise } from '../src/core/format';
import { computeIdleRates, computeOfflineEarnings, rareTricklePerHour } from '../src/core/idle';
import { computeCarStats, createStarterGarage, emptyStats, getActiveCar } from '../src/core/vehicle';
import { ECONOMY } from '../src/data/economy';

const starterRates = () => computeIdleRates(computeCarStats(getActiveCar(createStarterGarage())));

describe('computeIdleRates', () => {
  it('the starter car earns about 1 money per second', () => {
    const rates = starterRates();
    expect(rates.speedKmh).toBeCloseTo(20 + 58 * 0.35);
    expect(rates.moneyPerSecond).toBeGreaterThan(0.9);
    expect(rates.moneyPerSecond).toBeLessThan(1.1);
  });

  it('more power means more speed, money and materials', () => {
    const base = { ...emptyStats(), efficiency: 20, grip: 16 };
    const weak = computeIdleRates({ ...base, power: 50 });
    const strong = computeIdleRates({ ...base, power: 150 });
    expect(strong.speedKmh).toBeGreaterThan(weak.speedKmh);
    expect(strong.moneyPerSecond).toBeGreaterThan(weak.moneyPerSecond);
    expect(strong.materialsPerSecond).toBeGreaterThan(weak.materialsPerSecond);
  });

  it('fuel efficiency scales money and grip scales materials', () => {
    const base = { ...emptyStats(), power: 58, efficiency: 20, grip: 16 };
    const normal = computeIdleRates(base);
    const efficient = computeIdleRates({ ...base, efficiency: 40 });
    const grippy = computeIdleRates({ ...base, grip: 32 });
    expect(efficient.moneyPerSecond).toBeCloseTo(normal.moneyPerSecond * 2);
    expect(efficient.materialsPerSecond).toBeCloseTo(normal.materialsPerSecond);
    expect(grippy.materialsPerSecond).toBeCloseTo(normal.materialsPerSecond * 2);
  });

  it('the starter car salvages about 20 materials an hour', () => {
    const perHour = starterRates().materialsPerSecond * 3600;
    expect(perHour).toBeGreaterThan(18);
    expect(perHour).toBeLessThan(22);
  });

  it('rare materials only trickle in, faster with each Salvage Magnet level, up to its max', () => {
    expect(rareTricklePerHour(0)).toBe(ECONOMY.rareTrickle.basePerHour);
    expect(rareTricklePerHour(2)).toBeGreaterThan(rareTricklePerHour(1));
    expect(rareTricklePerHour(999)).toBe(rareTricklePerHour(ECONOMY.rareTrickle.maxLevel));
    // "Very small": under one rare material an hour even at max level.
    expect(rareTricklePerHour(ECONOMY.rareTrickle.maxLevel)).toBeLessThan(1);
  });
});

describe('computeOfflineEarnings', () => {
  it('earns the idle rate for the time away', () => {
    const rates = starterRates();
    const earned = computeOfflineEarnings(rates, 3600);
    expect(earned.seconds).toBe(3600);
    expect(earned.money).toBeCloseTo(rates.moneyPerSecond * 3600 * ECONOMY.offline.efficiency);
    expect(earned.distanceKm).toBeCloseTo(rates.kmPerSecond * 3600 * ECONOMY.offline.efficiency);
    expect(earned.materials).toBeCloseTo(rates.materialsPerSecond * 3600 * ECONOMY.offline.efficiency);
    expect(earned.rareMaterials).toBeCloseTo(rates.rareMaterialsPerSecond * 3600 * ECONOMY.offline.efficiency);
    expect(earned.capped).toBe(false);
  });

  it('stops at the offline cap', () => {
    const cap = ECONOMY.offline.capHours * 3600;
    const earned = computeOfflineEarnings(starterRates(), cap * 3);
    expect(earned.seconds).toBe(cap);
    expect(earned.capped).toBe(true);
  });

  it('earns nothing for negative or invalid time', () => {
    expect(computeOfflineEarnings(starterRates(), -100).money).toBe(0);
    expect(computeOfflineEarnings(starterRates(), Number.NaN).money).toBe(0);
  });
});

describe('formatPrecise and formatDistance', () => {
  it('keeps decimals for small values', () => {
    expect(formatPrecise(1.079)).toBe('1.07');
    expect(formatPrecise(12.56)).toBe('12.5');
    expect(formatPrecise(345.9)).toBe('345');
    expect(formatPrecise(1234)).toBe('1.23K');
    expect(formatDistance(0.4)).toBe('0.40 km');
  });
});
