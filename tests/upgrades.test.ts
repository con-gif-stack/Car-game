import { describe, expect, it } from 'vitest';
import { parseSave } from '../src/core/save';
import { emptyResources, SAVE_VERSION, type Resources } from '../src/core/state';
import {
  buyLevelUp,
  buyNextTier,
  canAfford,
  costMaterials,
  levelUpCost,
  nextTierPart,
  salvageMagnetCost,
  spend,
  tierCost,
} from '../src/core/upgrades';
import { createStarterGarage, getActiveCar, getPart } from '../src/core/vehicle';
import { ECONOMY, PART_LEVELS, PART_RECIPES, SLOT_COST_MULTIPLIERS, TIER_MONEY_COSTS } from '../src/data/economy';
import { MATERIAL_IDS, MATERIALS_BY_ID, RARITIES } from '../src/data/materials';
import { SLOTS, TIER_ORDER } from '../src/data/vehicles';

const rich = (): Resources => {
  const r = emptyResources();
  r.money = 1e12;
  for (const id of MATERIAL_IDS) r.materials[id] = 1e12;
  return r;
};

describe('recipes', () => {
  it('every slot has a recipe for every buyable tier, using only known materials', () => {
    for (const slot of SLOTS) {
      for (const tier of TIER_ORDER.slice(1) as (keyof (typeof PART_RECIPES)['engine'])[]) {
        const recipe = PART_RECIPES[slot.id][tier];
        expect(Object.keys(recipe).length, `${slot.id} ${tier}`).toBeGreaterThan(0);
        for (const [id, amount] of Object.entries(recipe)) {
          expect(MATERIALS_BY_ID[id as keyof typeof MATERIALS_BY_ID], id).toBeDefined();
          expect(amount).toBeGreaterThan(0);
        }
      }
    }
  });

  it('Used parts need only Common and Uncommon materials; Race parts all need Rare or better', () => {
    const highestRank = (recipe: object) =>
      Math.max(...Object.keys(recipe).map((id) => RARITIES[MATERIALS_BY_ID[id as keyof typeof MATERIALS_BY_ID].rarity].rank));
    for (const slot of SLOTS) {
      expect(highestRank(PART_RECIPES[slot.id].used), slot.id).toBeLessThanOrEqual(RARITIES.uncommon.rank);
      expect(highestRank(PART_RECIPES[slot.id].race), slot.id).toBeGreaterThanOrEqual(RARITIES.rare.rank);
    }
  });

  it('some Street parts already need a little Rare material', () => {
    const needsRare = SLOTS.filter((slot) =>
      Object.keys(PART_RECIPES[slot.id].street).some(
        (id) => RARITIES[MATERIALS_BY_ID[id as keyof typeof MATERIALS_BY_ID].rarity].rank >= RARITIES.rare.rank,
      ),
    );
    expect(needsRare.length).toBeGreaterThan(0);
  });
});

describe('costs', () => {
  it('tier cost = slot-scaled money + the recipe', () => {
    const part = getPart('engine-used');
    expect(part && tierCost(part)).toEqual({
      money: Math.round(TIER_MONEY_COSTS.used * SLOT_COST_MULTIPLIERS.engine),
      materials: PART_RECIPES.engine.used,
    });
  });

  it('level costs rise each level, cost only money, and stop at max level', () => {
    const part = getPart('engine-worn');
    if (!part) throw new Error('missing part');
    const costs = [1, 2, 3, 4].map((level) => levelUpCost(part, level));
    for (let i = 1; i < costs.length; i++) expect(costs[i]?.money ?? 0).toBeGreaterThan(costs[i - 1]?.money ?? 0);
    expect(costs[0]?.materials).toBeUndefined();
    expect(levelUpCost(part, PART_LEVELS.maxLevel)).toBeNull();
  });

  it('Salvage Magnet costs rise and stop at max level', () => {
    expect((salvageMagnetCost(1)?.money ?? 0) > (salvageMagnetCost(0)?.money ?? 0)).toBe(true);
    expect(salvageMagnetCost(0)?.materials?.scrapMetal).toBeGreaterThan(0);
    expect(salvageMagnetCost(ECONOMY.salvageMagnet.maxLevel)).toBeNull();
  });

  it('costMaterials lists only the materials needed, in display order', () => {
    expect(costMaterials({ materials: { titanium: 2, scrapMetal: 5, rubber: 0 } })).toEqual([
      ['scrapMetal', 5],
      ['titanium', 2],
    ]);
  });
});

describe('spending', () => {
  it('canAfford checks money and every material, and spend takes all or nothing', () => {
    const wallet = emptyResources();
    wallet.money = 100;
    wallet.materials.scrapMetal = 5;
    expect(canAfford(wallet, { money: 100, materials: { scrapMetal: 5 } })).toBe(true);
    expect(canAfford(wallet, { money: 100, materials: { titanium: 1 } })).toBe(false);
    expect(spend(wallet, { money: 50, materials: { scrapMetal: 1, titanium: 1 } })).toBe(false);
    expect(wallet.money).toBe(100);
    expect(wallet.materials.scrapMetal).toBe(5);
    expect(spend(wallet, { money: 40, materials: { scrapMetal: 5 } })).toBe(true);
    expect(wallet.money).toBe(60);
    expect(wallet.materials.scrapMetal).toBe(0);
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
    const wallet = emptyResources();
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

describe('save migrations', () => {
  const v1 = {
    version: 1,
    createdAt: 0,
    lastSavedAt: 0,
    resources: { money: 5, materials: 40, rareMaterials: 3 },
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

  it('v1 → current: old part ids become tiered parts at level 1', () => {
    const state = parseSave(JSON.stringify(v1), 0);
    const car = state && getActiveCar(state.garage);
    expect(state?.version).toBe(SAVE_VERSION);
    expect(car?.parts.engine).toEqual({ partId: 'engine-worn', level: 1 });
    expect(car?.parts.tires).toEqual({ partId: 'tires-worn', level: 1 });
    expect(car?.parts.turbo).toBeNull();
    expect(state?.workshop.salvageMagnetLevel).toBe(0);
  });

  it('v2 → v3: generic materials become Scrap Metal and rare materials become Titanium', () => {
    const v2 = {
      ...v1,
      version: 2,
      garage: { cars: [{ id: 'car-1', modelId: 'rustbucket', parts: {} }], activeCarId: 'car-1' },
      pendingOffline: { money: 9, materials: 7, rareMaterials: 0.5, distanceKm: 2, seconds: 100, capped: false },
      workshop: { salvageMagnetLevel: 2 },
    };
    const state = parseSave(JSON.stringify(v2), 0);
    expect(state?.resources.money).toBe(5);
    expect(state?.resources.materials.scrapMetal).toBe(40);
    expect(state?.resources.materials.titanium).toBe(3);
    expect(state?.resources.materials.rubber).toBe(0);
    expect(state?.pendingOffline.materials.scrapMetal).toBe(7);
    expect(state?.pendingOffline.materials.titanium).toBe(0.5);
    expect(state?.pendingOffline.money).toBe(9);
    expect(state?.workshop.salvageMagnetLevel).toBe(2);
  });
});
