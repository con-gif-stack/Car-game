import { describe, expect, it } from 'vitest';
import { formatDistance, formatPrecise } from '../src/core/format';
import { computeIdleRates, computeOfflineEarnings } from '../src/core/idle';
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

  it('more power means more speed and more money', () => {
    const weak = computeIdleRates({ ...emptyStats(), power: 50 });
    const strong = computeIdleRates({ ...emptyStats(), power: 150 });
    expect(strong.speedKmh).toBeGreaterThan(weak.speedKmh);
    expect(strong.moneyPerSecond).toBeGreaterThan(weak.moneyPerSecond);
  });
});

describe('computeOfflineEarnings', () => {
  it('earns the idle rate for the time away', () => {
    const rates = starterRates();
    const earned = computeOfflineEarnings(rates, 3600);
    expect(earned.seconds).toBe(3600);
    expect(earned.money).toBeCloseTo(rates.moneyPerSecond * 3600 * ECONOMY.offline.efficiency);
    expect(earned.distanceKm).toBeCloseTo(rates.kmPerSecond * 3600 * ECONOMY.offline.efficiency);
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
