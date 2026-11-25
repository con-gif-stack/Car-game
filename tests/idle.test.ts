import { describe, expect, it } from 'vitest';
import { formatDistance, formatPrecise } from '../src/core/format';
import { combineRates, computeOfflineEarnings, progressFactor, salvageMagnetMultiplier, trickleRates } from '../src/core/idle';
import { ECONOMY } from '../src/data/economy';
import { emptyMaterials, MATERIALS, RARITIES } from '../src/data/materials';

const rates = (moneyPerSecond: number, scrapPerSecond: number) => {
  const materialsPerSecond = emptyMaterials();
  materialsPerSecond.scrapMetal = scrapPerSecond;
  return { moneyPerSecond, materialsPerSecond };
};

describe('rare-material trickle', () => {
  it('only Rare and above trickle in; Common and Uncommon come from the farm', () => {
    for (const material of MATERIALS) {
      const rare = RARITIES[material.rarity].rank >= RARITIES.rare.rank;
      expect(material.trickle !== null, material.id).toBe(rare);
    }
  });

  it('is very small: under one an hour even with a maxed magnet at high progress', () => {
    const perSecond = trickleRates(ECONOMY.salvageMagnet.maxLevel, 4);
    for (const material of MATERIALS) expect(perSecond[material.id] * 3600, material.id).toBeLessThan(2);
  });

  it('grows with progress and the Salvage Magnet; Ceramic starts at progress 3', () => {
    expect(trickleRates(0, 4).titanium).toBeGreaterThan(trickleRates(0, 0).titanium);
    expect(trickleRates(2, 0).titanium).toBeCloseTo(trickleRates(0, 0).titanium * salvageMagnetMultiplier(2));
    expect(trickleRates(0, 2).ceramic).toBe(0);
    expect(trickleRates(0, 3).ceramic).toBeGreaterThan(0);
    expect(salvageMagnetMultiplier(999)).toBe(salvageMagnetMultiplier(ECONOMY.salvageMagnet.maxLevel));
    expect(progressFactor({ perHour: 1, unlockProgress: 1, growthPerProgress: 1 }, 0.5)).toBe(0);
  });
});

describe('computeOfflineEarnings', () => {
  it('earns the rates for the time away', () => {
    const earned = computeOfflineEarnings(rates(2, 0.5), 3600);
    const share = 3600 * ECONOMY.offline.efficiency;
    expect(earned.seconds).toBe(3600);
    expect(earned.money).toBeCloseTo(2 * share);
    expect(earned.materials.scrapMetal).toBeCloseTo(0.5 * share);
    expect(earned.capped).toBe(false);
  });

  it('stops at the offline cap', () => {
    const cap = ECONOMY.offline.capHours * 3600;
    const earned = computeOfflineEarnings(rates(1, 1), cap * 3);
    expect(earned.seconds).toBe(cap);
    expect(earned.capped).toBe(true);
  });

  it('earns nothing for negative or invalid time', () => {
    expect(computeOfflineEarnings(rates(1, 1), -100).money).toBe(0);
    expect(computeOfflineEarnings(rates(1, 1), Number.NaN).materials.scrapMetal).toBe(0);
  });

  it('combines rates', () => {
    const total = combineRates(rates(1, 2), rates(3, 4));
    expect(total.moneyPerSecond).toBe(4);
    expect(total.materialsPerSecond.scrapMetal).toBe(6);
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
