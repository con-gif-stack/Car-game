import { describe, expect, it } from 'vitest';
import { formatDistance, formatPrecise } from '../src/core/format';
import { computeIdleRates, computeOfflineEarnings, progressFactor, salvageMagnetMultiplier } from '../src/core/idle';
import { carProgress, computeCarStats, createStarterGarage, emptyStats, getActiveCar } from '../src/core/vehicle';
import { ECONOMY } from '../src/data/economy';
import { MATERIALS, RARITIES } from '../src/data/materials';

const starterRates = () => computeIdleRates(computeCarStats(getActiveCar(createStarterGarage())));
const base = { ...emptyStats(), power: 58, efficiency: 20, grip: 16 };

describe('computeIdleRates', () => {
  it('the starter car earns about 1 money per second', () => {
    const rates = starterRates();
    expect(rates.speedKmh).toBeCloseTo(20 + 58 * 0.35);
    expect(rates.moneyPerSecond).toBeGreaterThan(0.9);
    expect(rates.moneyPerSecond).toBeLessThan(1.1);
  });

  it('the starter car finds common materials every few minutes, uncommon ones a few times an hour', () => {
    const perHour = (id: keyof ReturnType<typeof starterRates>['materialsPerSecond']) =>
      starterRates().materialsPerSecond[id] * 3600;
    expect(perHour('scrapMetal')).toBeGreaterThan(10);
    expect(perHour('rubber')).toBeGreaterThan(5);
    expect(perHour('copperWire')).toBeGreaterThan(1);
    expect(perHour('aluminum')).toBeGreaterThan(1);
    expect(perHour('copperWire')).toBeLessThan(perHour('scrapMetal'));
  });

  it('Rare and above only trickle in while idle (runs are their main source)', () => {
    for (const material of MATERIALS) {
      if (RARITIES[material.rarity].rank < RARITIES.rare.rank) continue;
      expect(material.idle.kind, material.id).toBe('trickle');
      // Under one an hour even with a maxed Salvage Magnet at high progress.
      const perHour = computeIdleRates(base, ECONOMY.salvageMagnet.maxLevel, 4).materialsPerSecond[material.id] * 3600;
      expect(perHour, material.id).toBeLessThan(2);
    }
  });

  it('Ceramic does not drop while idle until progress 3', () => {
    expect(computeIdleRates(base, 0, 2).materialsPerSecond.ceramic).toBe(0);
    expect(computeIdleRates(base, 0, 3).materialsPerSecond.ceramic).toBeGreaterThan(0);
  });

  it('every material drops more as the car progresses', () => {
    const early = computeIdleRates(base, 0, 3);
    const late = computeIdleRates(base, 0, 4);
    for (const material of MATERIALS) {
      expect(late.materialsPerSecond[material.id], material.id).toBeGreaterThan(early.materialsPerSecond[material.id]);
    }
    expect(progressFactor({ kind: 'trickle', perHour: 1, unlockProgress: 1, growthPerProgress: 1 }, 0.5)).toBe(0);
  });

  it('more power means more speed, money and materials', () => {
    const weak = computeIdleRates({ ...base, power: 50 });
    const strong = computeIdleRates({ ...base, power: 150 });
    expect(strong.speedKmh).toBeGreaterThan(weak.speedKmh);
    expect(strong.moneyPerSecond).toBeGreaterThan(weak.moneyPerSecond);
    expect(strong.materialsPerSecond.scrapMetal).toBeGreaterThan(weak.materialsPerSecond.scrapMetal);
  });

  it('fuel efficiency scales money and grip scales distance-based materials', () => {
    const normal = computeIdleRates(base);
    const efficient = computeIdleRates({ ...base, efficiency: 40 });
    const grippy = computeIdleRates({ ...base, grip: 32 });
    expect(efficient.moneyPerSecond).toBeCloseTo(normal.moneyPerSecond * 2);
    expect(efficient.materialsPerSecond.scrapMetal).toBeCloseTo(normal.materialsPerSecond.scrapMetal);
    expect(grippy.materialsPerSecond.scrapMetal).toBeCloseTo(normal.materialsPerSecond.scrapMetal * 2);
    expect(grippy.materialsPerSecond.titanium).toBeCloseTo(normal.materialsPerSecond.titanium);
  });

  it('the Salvage Magnet boosts the rare trickle, up to its max level', () => {
    const magnetised = computeIdleRates(base, 2);
    expect(magnetised.materialsPerSecond.titanium).toBeCloseTo(starterRates().materialsPerSecond.titanium * salvageMagnetMultiplier(2));
    expect(magnetised.materialsPerSecond.scrapMetal).toBeCloseTo(computeIdleRates(base).materialsPerSecond.scrapMetal);
    expect(salvageMagnetMultiplier(999)).toBe(salvageMagnetMultiplier(ECONOMY.salvageMagnet.maxLevel));
  });

  it('a new car has progress 0', () => {
    expect(carProgress(getActiveCar(createStarterGarage()))).toBe(0);
  });
});

describe('computeOfflineEarnings', () => {
  it('earns the idle rate for the time away, for money and every material', () => {
    const rates = starterRates();
    const earned = computeOfflineEarnings(rates, 3600);
    const share = 3600 * ECONOMY.offline.efficiency;
    expect(earned.seconds).toBe(3600);
    expect(earned.money).toBeCloseTo(rates.moneyPerSecond * share);
    expect(earned.distanceKm).toBeCloseTo(rates.kmPerSecond * share);
    for (const material of MATERIALS) {
      expect(earned.materials[material.id]).toBeCloseTo(rates.materialsPerSecond[material.id] * share);
    }
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
    expect(computeOfflineEarnings(starterRates(), Number.NaN).materials.scrapMetal).toBe(0);
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
