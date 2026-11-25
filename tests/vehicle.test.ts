import { describe, expect, it } from 'vitest';
import { parseSave } from '../src/core/save';
import { createNewState } from '../src/core/state';
import {
  computeCarStats,
  createStarterGarage,
  getActiveCar,
  getInstalledPart,
  levelMultiplier,
  repairGarage,
} from '../src/core/vehicle';
import { PART_LEVELS } from '../src/data/economy';
import {
  CAR_MODELS,
  PARTS,
  QUALITIES,
  SLOTS,
  STARTER_MODEL_ID,
  STATS,
  TIER_ORDER,
  TIER_STAT_MULTIPLIERS,
} from '../src/data/vehicles';

describe('vehicle data', () => {
  it('starter parts exist and fit the slot they are in', () => {
    for (const model of Object.values(CAR_MODELS)) {
      for (const slot of SLOTS) {
        const partId = model.starterParts[slot.id];
        if (partId === null) continue;
        expect(PARTS[partId], partId).toBeDefined();
        expect(PARTS[partId]?.slot).toBe(slot.id);
      }
    }
  });

  it('only uses known stats', () => {
    const statIds = new Set(STATS.map((s) => s.id));
    for (const part of Object.values(PARTS)) {
      for (const key of Object.keys(part.stats)) expect(statIds.has(key as never), `${part.id}.${key}`).toBe(true);
    }
  });

  it('every slot has a part at every tier above Worn', () => {
    for (const slot of SLOTS) {
      for (const quality of TIER_ORDER.slice(1)) expect(PARTS[`${slot.id}-${quality}`], `${slot.id}-${quality}`).toBeDefined();
    }
  });

  it('a new tier always beats the previous tier at max level', () => {
    const maxed = levelMultiplier(PART_LEVELS.maxLevel);
    for (let i = 1; i < TIER_ORDER.length; i++) {
      const prev = TIER_ORDER[i - 1] as keyof typeof TIER_STAT_MULTIPLIERS;
      const next = TIER_ORDER[i] as keyof typeof TIER_STAT_MULTIPLIERS;
      expect(TIER_STAT_MULTIPLIERS[next]).toBeGreaterThan(TIER_STAT_MULTIPLIERS[prev] * maxed);
      expect(QUALITIES[next].rank).toBe(i);
    }
  });
});

describe('computeCarStats', () => {
  it('adds base stats and every installed part', () => {
    const car = getActiveCar(createStarterGarage());
    const stats = computeCarStats(car);
    // Rustbucket: engine 52 + transmission 3 + exhaust 3.
    expect(stats.power).toBe(58);
    expect(stats.durability).toBe(10 + 4 + 3 + 4);
  });

  it('part levels add a share of the part stats', () => {
    const car = getActiveCar(createStarterGarage());
    const before = computeCarStats(car).power;
    (car.parts.engine as { level: number }).level = 3;
    expect(computeCarStats(car).power).toBeCloseTo(before + 52 * PART_LEVELS.bonusPerLevel * 2);
  });

  it('a removed part no longer counts', () => {
    const car = getActiveCar(createStarterGarage());
    const before = computeCarStats(car).power;
    car.parts.engine = null;
    expect(computeCarStats(car).power).toBe(before - 52);
  });

  it('starter car stats stay well below the bar maximums (it is meant to be rusty)', () => {
    const stats = computeCarStats(getActiveCar(createStarterGarage()));
    for (const stat of STATS) expect(stats[stat.id] / stat.displayMax).toBeLessThan(0.5);
  });
});

describe('repairGarage', () => {
  it('gives a new garage with the starter car when nothing usable is saved', () => {
    for (const raw of [undefined, null, {}, { cars: [] }, { cars: [{ id: 'x', modelId: 'no-such-car' }] }]) {
      const garage = repairGarage(raw);
      expect(garage.cars).toHaveLength(1);
      expect(garage.cars[0]?.modelId).toBe(STARTER_MODEL_ID);
    }
  });

  it('replaces unknown or wrong-slot parts with the stock part, keeps empty slots, and clamps levels', () => {
    const garage = repairGarage({
      cars: [
        {
          id: 'car-1',
          modelId: STARTER_MODEL_ID,
          parts: {
            engine: { partId: 'no-such-part', level: 1 },
            tires: { partId: 'engine-used', level: 1 },
            turbo: null,
            brakes: { partId: 'brakes-street', level: 99 },
            exhaust: 'not-an-object',
          },
        },
      ],
      activeCarId: 'car-1',
    });
    const car = getActiveCar(garage);
    expect(car.parts.engine).toEqual({ partId: 'engine-worn', level: 1 });
    expect(car.parts.tires).toEqual({ partId: 'tires-worn', level: 1 });
    expect(car.parts.turbo).toBeNull();
    expect(car.parts.brakes).toEqual({ partId: 'brakes-street', level: PART_LEVELS.maxLevel });
    expect(car.parts.exhaust).toEqual({ partId: 'exhaust-worn', level: 1 });
    expect(getInstalledPart(car, 'fuelSystem')?.id).toBe('fuelSystem-worn');
  });

  it('fixes an active car id that does not exist, and drops duplicate cars', () => {
    const car = { id: 'a', modelId: STARTER_MODEL_ID, parts: {} };
    const garage = repairGarage({ cars: [car, car], activeCarId: 'missing' });
    expect(garage.cars).toHaveLength(1);
    expect(garage.activeCarId).toBe('a');
  });

  it('a save from before the garage existed loads with the starter car', () => {
    const old = createNewState(0) as unknown as Record<string, unknown>;
    delete old.garage;
    const state = parseSave(JSON.stringify(old), 0);
    expect(state && getActiveCar(state.garage).modelId).toBe(STARTER_MODEL_ID);
  });
});
