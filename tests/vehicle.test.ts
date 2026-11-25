import { describe, expect, it } from 'vitest';
import { computeCarStats, createStarterGarage, getActiveCar, repairGarage } from '../src/core/vehicle';
import { CAR_MODELS, PARTS, SLOTS, STARTER_MODEL_ID, STATS } from '../src/data/vehicles';
import { parseSave } from '../src/core/save';
import { createNewState } from '../src/core/state';

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
});

describe('computeCarStats', () => {
  it('adds base stats and every installed part', () => {
    const car = getActiveCar(createStarterGarage());
    const stats = computeCarStats(car);
    // Rustbucket: engine 52 + transmission 3 + exhaust 3.
    expect(stats.power).toBe(58);
    expect(stats.durability).toBe(10 + 4 + 3 + 4);
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

  it('replaces unknown or wrong-slot parts with the stock part, and keeps empty slots', () => {
    const garage = repairGarage({
      cars: [
        {
          id: 'car-1',
          modelId: STARTER_MODEL_ID,
          parts: { engine: 'no-such-part', tires: 'worn-engine', turbo: null, brakes: 'squeaky-brakes' },
        },
      ],
      activeCarId: 'car-1',
    });
    const car = getActiveCar(garage);
    expect(car.parts.engine).toBe('worn-engine');
    expect(car.parts.tires).toBe('bald-tires');
    expect(car.parts.turbo).toBeNull();
    expect(car.parts.brakes).toBe('squeaky-brakes');
    expect(car.parts.fuelSystem).toBe('leaky-fuel-pump');
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
