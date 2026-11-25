import { describe, expect, it } from 'vitest';
import { parseSave } from '../src/core/save';
import type { Resources } from '../src/core/state';
import {
  buyLevelUp,
  buyNextTier,
  canAfford,
  levelUpCost,
  nextTierPart,
  rareTrickleUpgradeCost,
  spend,
  tierCost,
} from '../src/core/upgrades';
import { createStarterGarage, getActiveCar, getPart } from '../src/core/vehicle';
import { ECONOMY, PART_LEVELS, SLOT_COST_MULTIPLIERS, TIER_COSTS } from '../src/data/economy';

const rich = (): Resources => ({ money: 1e12, materials: 1e12, rareMaterials: 1e12 });
const broke = (): Resources => ({ money: 0, materials: 0, rareMaterials: 0 });

describe('costs', () => {
  it('tier costs scale by slot', () => {
    const part = getPart('engine-used');
    expect(part && tierCost(part)).toEqual({
      money: Math.round((TIER_COSTS.used.money ?? 0) * SLOT_COST_MULTIPLIERS.engine),
      materials: Math.round((TIER_COSTS.used.materials ?? 0) * SLOT_COST_MULTIPLIERS.engine),
    });
  });

  it('Street tier and above need rare materials', () => {
    for (const id of ['tires-street', 'engine-sport', 'turbo-race']) {
      const part = getPart(id);
      expect(part && (tierCost(part).rareMaterials ?? 0)).toBeGreaterThan(0);
    }
  });

  it('level costs rise each level and stop at max level', () => {
    const part = getPart('engine-worn');
    if (!part) throw new Error('missing part');
    const costs = [1, 2, 3, 4].map((level) => levelUpCost(part, level)?.money ?? 0);
    for (let i = 1; i < costs.length; i++) expect(costs[i]).toBeGreaterThan(costs[i - 1] ?? 0);
    expect(levelUpCost(part, PART_LEVELS.maxLevel)).toBeNull();
  });

  it('Salvage Magnet costs rise and stop at max level', () => {
    expect((rareTrickleUpgradeCost(1)?.money ?? 0) > (rareTrickleUpgradeCost(0)?.money ?? 0)).toBe(true);
    expect(rareTrickleUpgradeCost(ECONOMY.rareTrickle.maxLevel)).toBeNull();
  });
});

describe('spending', () => {
  it('canAfford checks every resource, and spend takes all or nothing', () => {
    const wallet: Resources = { money: 100, materials: 5, rareMaterials: 0 };
    expect(canAfford(wallet, { money: 100, materials: 5 })).toBe(true);
    expect(canAfford(wallet, { money: 100, rareMaterials: 1 })).toBe(false);
    expect(spend(wallet, { money: 50, rareMaterials: 1 })).toBe(false);
    expect(wallet).toEqual({ money: 100, materials: 5, rareMaterials: 0 });
    expect(spend(wallet, { money: 40, materials: 5 })).toBe(true);
    expect(wallet).toEqual({ money: 60, materials: 0, rareMaterials: 0 });
  });
});

describe('buying', () => {
  it('buys tiers in order, each installed at level 1, until the top tier', () => {
    const car = getActiveCar(createStarterGarage());
    const wallet = rich();
    const bought: string[] = [];
    while (nextTierPart(car, 'engine')) {
      expect(buyNextTier(car, 'engine', wallet)).toBe(true);
      bought.push(car.parts.engine?.partId ?? '');
      expect(car.parts.engine?.level).toBe(1);
    }
    expect(bought).toEqual(['engine-used', 'engine-street', 'engine-sport', 'engine-race']);
    expect(buyNextTier(car, 'engine', wallet)).toBe(false);
  });

  it('an empty turbo slot starts at the Used tier', () => {
    const car = getActiveCar(createStarterGarage());
    expect(nextTierPart(car, 'turbo')?.id).toBe('turbo-used');
  });

  it('refuses purchases the player cannot afford, changing nothing', () => {
    const car = getActiveCar(createStarterGarage());
    const wallet = broke();
    expect(buyNextTier(car, 'engine', wallet)).toBe(false);
    expect(buyLevelUp(car, 'engine', wallet)).toBe(false);
    expect(car.parts.engine).toEqual({ partId: 'engine-worn', level: 1 });
  });

  it('levels a part up to the max level and no further', () => {
    const car = getActiveCar(createStarterGarage());
    const wallet = rich();
    while (buyLevelUp(car, 'tires', wallet));
    expect(car.parts.tires?.level).toBe(PART_LEVELS.maxLevel);
    expect(buyLevelUp(car, 'turbo', wallet)).toBe(false); // empty slot
  });
});

describe('save migration v1 → v2', () => {
  it('converts old part ids to tiered parts at level 1', () => {
    const v1 = {
      version: 1,
      createdAt: 0,
      lastSavedAt: 0,
      resources: { money: 5, materials: 0, rareMaterials: 0 },
      garage: {
        cars: [
          {
            id: 'car-1',
            modelId: 'rustbucket',
            parts: {
              engine: 'worn-engine',
              transmission: 'worn-transmission',
              tires: 'bald-tires',
              suspension: 'saggy-suspension',
              brakes: 'squeaky-brakes',
              exhaust: 'rusted-exhaust',
              turbo: null,
              fuelSystem: 'leaky-fuel-pump',
            },
          },
        ],
        activeCarId: 'car-1',
      },
      stats: { playTimeSeconds: 10, distanceKm: 1, sessions: 2 },
    };
    const state = parseSave(JSON.stringify(v1), 0);
    const car = state && getActiveCar(state.garage);
    expect(state?.version).toBe(2);
    expect(state?.resources.money).toBe(5);
    expect(car?.parts.engine).toEqual({ partId: 'engine-worn', level: 1 });
    expect(car?.parts.tires).toEqual({ partId: 'tires-worn', level: 1 });
    expect(car?.parts.fuelSystem).toEqual({ partId: 'fuelSystem-worn', level: 1 });
    expect(car?.parts.turbo).toBeNull();
    expect(state?.workshop.salvageMagnetLevel).toBe(0);
  });
});
