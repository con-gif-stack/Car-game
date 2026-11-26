import { describe, expect, it } from 'vitest';
import { branchMaxLevel, createFarmState, DEPOSITS, droneStats, FarmSim, farmRates, inReach, scavenge } from '../src/core/farm';
import {
  capacityAt,
  fuelLimits,
  garageUpgradeCost,
  isFull,
  maxDrones,
  refineryStatus,
  stepRefinery,
  storageCap,
  storeMaterials,
} from '../src/core/garage';
import { GameModel } from '../src/core/GameModel';
import { MemoryStorage, parseSave, SaveManager } from '../src/core/save';
import { createNewState, createWorkshopState, emptyResources, SAVE_VERSION } from '../src/core/state';
import { buyDroneBranch, buyGarageUpgrade, droneBranchCost } from '../src/core/upgrades';
import { DRONE_BRANCHES, DRONE_MODELS, DRONES } from '../src/data/farm';
import { DRONE_BAYS, FUEL_DEPOT_LEVELS, GARAGE_UPGRADES, REFINERY, WAREHOUSE } from '../src/data/garage';

const T0 = 1_700_000_000_000;

/** Plenty of everything (for buying upgrades in tests). */
function rich() {
  const resources = emptyResources();
  resources.money = 1e12;
  for (const id of Object.keys(resources.materials) as (keyof typeof resources.materials)[]) resources.materials[id] = 1e9;
  return resources;
}

describe('storage (Warehouse)', () => {
  it('limits Common and Uncommon materials; Rare and better are never limited', () => {
    const workshop = createWorkshopState();
    expect(storageCap(workshop, 'scrapMetal')).toBe(WAREHOUSE.baseCapacity.common);
    expect(storageCap(workshop, 'aluminum')).toBe(WAREHOUSE.baseCapacity.uncommon);
    expect(storageCap(workshop, 'titanium')).toBe(Infinity);
    workshop.warehouse = 2;
    expect(storageCap(workshop, 'rubber')).toBeCloseTo(WAREHOUSE.baseCapacity.common * WAREHOUSE.growthPerLevel ** 2);
  });

  it('stores up to the limit and reports what fitted', () => {
    const workshop = createWorkshopState();
    const resources = emptyResources();
    resources.materials.scrapMetal = WAREHOUSE.baseCapacity.common - 10;
    const stored = storeMaterials(resources, workshop, { scrapMetal: 50, titanium: 5 });
    expect(stored.scrapMetal).toBe(10);
    expect(stored.titanium).toBe(5);
    expect(isFull(resources, workshop, 'scrapMetal')).toBe(true);
    expect(isFull(resources, workshop, 'titanium')).toBe(false);
  });

  it('keeps materials already held above the limit (only new ones stop)', () => {
    const workshop = createWorkshopState();
    const resources = emptyResources();
    resources.materials.rubber = 1e6;
    expect(storeMaterials(resources, workshop, { rubber: 5 }).rubber).toBe(0);
    expect(resources.materials.rubber).toBe(1e6);
  });

  it('every level can be paid for with what the previous level can store', () => {
    const workshop = createWorkshopState();
    const def = GARAGE_UPGRADES.find((u) => u.id === 'warehouse')!;
    for (let level = 0; level < def.maxLevel; level++) {
      workshop.warehouse = level;
      const cost = garageUpgradeCost(workshop, 'warehouse')!;
      for (const [id, amount] of Object.entries(cost.materials ?? {})) {
        expect(amount, `level ${level + 1} ${id}`).toBeLessThanOrEqual(capacityAt(level, id as 'scrapMetal'));
      }
    }
  });
});

describe('drones and full storage', () => {
  it('drones leave full materials alone', () => {
    const farm = createFarmState();
    farm.droneCount = 3;
    const scrapFull = (id: string) => id === 'scrapMetal';
    expect(farmRates(farm).materials.scrapMetal).toBeGreaterThan(0);
    const rates = farmRates(farm, scrapFull);
    expect(rates.materials.scrapMetal).toBe(0);
    expect(rates.materials.rubber).toBeGreaterThan(0);

    const sim = new FarmSim(3);
    let scrap = 0;
    for (let i = 0; i < 6000; i++) scrap += sim.step(farm, 0.1, scrapFull).materials.scrapMetal;
    expect(scrap).toBe(0);
  });

  it('when everything is full the drones wait and earn nothing', () => {
    const farm = createFarmState();
    farm.droneCount = 3;
    expect(farmRates(farm, () => true).money).toBe(0);
  });

  it('the game stops hauls at the limit and pays no scrap money for them', () => {
    const state = createNewState(T0);
    state.farm.droneCount = 5;
    for (const id of ['scrapMetal', 'rubber'] as const) state.resources.materials[id] = WAREHOUSE.baseCapacity.common;
    for (const id of ['copperWire', 'aluminum'] as const) state.resources.materials[id] = WAREHOUSE.baseCapacity.uncommon;
    const model = new GameModel(state, new SaveManager(new MemoryStorage(), () => T0), () => T0);
    for (let i = 0; i < 60 * 120; i++) model.update(1 / 60);
    expect(state.resources.money).toBe(0);
    expect(state.resources.materials.scrapMetal).toBe(WAREHOUSE.baseCapacity.common);
    expect(model.scavenge('heap-1')).toBeNull();
  });

  it('time away fills storage only up to the limit', () => {
    const state = createNewState(T0);
    state.farm.droneCount = 5;
    state.resources.materials.scrapMetal = WAREHOUSE.baseCapacity.common - 100;
    const model = new GameModel(state, new SaveManager(new MemoryStorage(), () => T0), () => T0, 8 * 3600);
    expect(state.pendingOffline.materials.scrapMetal).toBeCloseTo(100);
    model.collectOffline();
    expect(state.resources.materials.scrapMetal).toBeCloseTo(WAREHOUSE.baseCapacity.common);
  });
});

describe('Drone Bays and Fuel Depot', () => {
  it('Drone Bays raise the drone limit', () => {
    const workshop = createWorkshopState();
    expect(maxDrones(workshop)).toBe(DRONES.maxCount);
    workshop.droneBays = 3;
    expect(maxDrones(workshop)).toBe(DRONES.maxCount + 3 * DRONE_BAYS.dronesPerLevel);
  });

  it('the Fuel Depot stores more tanks and refills faster, and the game uses it', () => {
    const workshop = createWorkshopState();
    const top = FUEL_DEPOT_LEVELS.length - 1;
    expect(fuelLimits(workshop).maxTanks).toBe(FUEL_DEPOT_LEVELS[0]!.maxTanks);
    workshop.fuelDepot = top;
    expect(fuelLimits(workshop).maxTanks).toBe(FUEL_DEPOT_LEVELS[top]!.maxTanks);
    expect(fuelLimits(workshop).refillMs).toBe(FUEL_DEPOT_LEVELS[top]!.refillMinutes * 60_000);

    let now = T0;
    const state = createNewState(T0);
    state.workshop.fuelDepot = top;
    const model = new GameModel(state, new SaveManager(new MemoryStorage(), () => now), () => now);
    expect(model.fuel().maxTanks).toBe(FUEL_DEPOT_LEVELS[top]!.maxTanks);
    // The bigger depot fills its extra tanks over time.
    now += FUEL_DEPOT_LEVELS[top]!.refillMinutes * 60_000 * 10;
    expect(model.fuel().tanks).toBe(FUEL_DEPOT_LEVELS[top]!.maxTanks);
  });

  it('garage upgrades cost more each level and stop at their maximum', () => {
    const resources = rich();
    for (const def of GARAGE_UPGRADES) {
      const workshop = createWorkshopState();
      let previous = 0;
      for (let level = 0; level < def.maxLevel; level++) {
        const money = garageUpgradeCost(workshop, def.id)!.money ?? 0;
        expect(money).toBeGreaterThan(previous);
        previous = money;
        expect(buyGarageUpgrade(workshop, def.id, resources)).toBe(true);
      }
      expect(garageUpgradeCost(workshop, def.id)).toBeNull();
      expect(buyGarageUpgrade(workshop, def.id, resources)).toBe(false);
    }
  });
});

describe('Refinery', () => {
  const setup = (recipe: string, level = 1) => {
    const workshop = createWorkshopState();
    workshop.refinery = level;
    workshop.refineryRecipe = recipe;
    return { workshop, resources: emptyResources() };
  };
  const smelt = REFINERY.recipes.find((r) => r.id === 'aluminum')!;

  it('turns inputs into outputs a batch at a time, carrying partial progress', () => {
    const { workshop, resources } = setup('aluminum');
    resources.materials.scrapMetal = 1000;
    const result = stepRefinery(resources, workshop, smelt.seconds * 2.5);
    expect(result.batches).toBe(2);
    expect(resources.materials.scrapMetal).toBe(1000 - 2 * smelt.inputs.scrapMetal!);
    expect(resources.materials.aluminum).toBe(2 * smelt.outputs.aluminum!);
    expect(workshop.refineryProgress).toBeCloseTo(0.5);
    expect(stepRefinery(resources, workshop, smelt.seconds * 0.5).batches).toBe(1);
  });

  it('higher levels work faster', () => {
    const { workshop, resources } = setup('aluminum', 3);
    resources.materials.scrapMetal = 1e6;
    expect(stepRefinery(resources, workshop, smelt.seconds).batches).toBe(1 + 2 * REFINERY.speedPerLevel);
  });

  it('stops when inputs run out, or when there is no room for the output', () => {
    const { workshop, resources } = setup('aluminum');
    resources.materials.scrapMetal = smelt.inputs.scrapMetal! * 3;
    const result = stepRefinery(resources, workshop, smelt.seconds * 10);
    expect(result.batches).toBe(3);
    expect(result.status).toBe('noInputs');
    expect(refineryStatus(resources, workshop)).toBe('noInputs');

    resources.materials.scrapMetal = 1e6;
    resources.materials.aluminum = WAREHOUSE.baseCapacity.uncommon;
    expect(stepRefinery(resources, workshop, smelt.seconds * 10).status).toBe('storageFull');
    expect(resources.materials.aluminum).toBe(WAREHOUSE.baseCapacity.uncommon);
  });

  it("does nothing until it's built and a recipe it knows is chosen", () => {
    const { workshop, resources } = setup('titanium', 1);
    resources.materials.scrapMetal = 1e6;
    resources.materials.aluminum = 800;
    expect(stepRefinery(resources, workshop, 1e6).batches).toBe(0);
    expect(refineryStatus(resources, workshop)).toBe('off');
  });

  it('runs while the player is away, and its output waits in the summary', () => {
    const state = createNewState(T0);
    state.workshop.refinery = 1;
    state.workshop.refineryRecipe = 'aluminum';
    state.resources.materials.scrapMetal = 600;
    const model = new GameModel(state, new SaveManager(new MemoryStorage(), () => T0), () => T0, 3600);
    expect(state.resources.materials.scrapMetal).toBe(0);
    expect(state.pendingOffline.materials.aluminum).toBe(10 * smelt.outputs.aluminum!);
    model.collectOffline();
    expect(state.resources.materials.aluminum).toBe(10 * smelt.outputs.aluminum!);
  });

  it('the game only accepts recipes the refinery has unlocked', () => {
    const state = createNewState(T0);
    const model = new GameModel(state, new SaveManager(new MemoryStorage(), () => T0), () => T0);
    expect(model.setRefineryRecipe('aluminum')).toBe(false);
    state.workshop.refinery = 1;
    expect(model.setRefineryRecipe('aluminum')).toBe(true);
    expect(model.setRefineryRecipe('titanium')).toBe(false);
    expect(model.setRefineryRecipe('')).toBe(true);
  });
});

describe('drone upgrade tree', () => {
  it('branch levels boost the drones', () => {
    const farm = createFarmState();
    const base = droneStats(farm);
    farm.branches.speed = 2;
    farm.branches.cargo = 3;
    farm.branches.drills = 4;
    const better = droneStats(farm);
    expect(better.speed).toBeGreaterThan(base.speed);
    expect(better.capacity).toBeGreaterThan(base.capacity);
    expect(better.mineRate).toBeGreaterThan(base.mineRate);
    expect(better.heapYield).toBeGreaterThan(base.heapYield);
  });

  it('each drone model opens more levels on every branch', () => {
    const farm = createFarmState();
    farm.droneCount = 1;
    const resources = rich();
    for (const branch of DRONE_BRANCHES) {
      const cap = branchMaxLevel(farm, branch.id);
      for (let i = 0; i < cap; i++) expect(buyDroneBranch(farm, branch.id, resources)).toBe(true);
      expect(droneBranchCost(farm, branch.id)).toBeNull();
      expect(buyDroneBranch(farm, branch.id, resources)).toBe(false);
    }
    farm.droneModel = 1;
    for (const branch of DRONE_BRANCHES) expect(branchMaxLevel(farm, branch.id)).toBeGreaterThan(farm.branches[branch.id]);
    farm.droneModel = DRONE_MODELS.length - 1;
    expect(branchMaxLevel(farm, 'range')).toBe(3);
  });

  it('far piles need Range: drones and hands only reach them once upgraded', () => {
    const farm = createFarmState();
    farm.droneCount = 2;
    const far = DEPOSITS.find((d) => d.range === 1)!;
    expect(inReach(farm, far)).toBe(false);
    expect(scavenge(farm, far.id)).toBeNull();
    const before = farmRates(farm).materials[far.material];
    farm.branches.range = 1;
    expect(inReach(farm, far)).toBe(true);
    expect(scavenge(farm, far.id)).not.toBeNull();
    expect(farmRates(farm).materials[far.material]).toBeGreaterThan(before);
  });
});

describe('save format v6', () => {
  it('loads a v5 save with the new upgrades at level 0 and keeps materials above the new limits', () => {
    const v5 = {
      version: 5,
      createdAt: T0,
      lastSavedAt: T0,
      resources: { money: 10, materials: { scrapMetal: 2_000_000 } },
      workshop: { salvageMagnetLevel: 3 },
      farm: { deposits: {}, droneCount: 5, droneModel: 1, scavenged: 40 },
    };
    const state = parseSave(JSON.stringify(v5), T0)!;
    expect(state.version).toBe(SAVE_VERSION);
    expect(state.workshop).toEqual({ ...createWorkshopState(), salvageMagnetLevel: 3 });
    expect(state.farm.branches).toEqual({ speed: 0, cargo: 0, drills: 0, range: 0 });
    expect(state.farm.droneCount).toBe(5);
    expect(state.resources.materials.scrapMetal).toBe(2_000_000);
  });

  it('repairs branch levels beyond what the drone model allows, and drones beyond the bays', () => {
    const state = createNewState(T0);
    state.farm.branches.speed = 99;
    state.farm.droneCount = 99;
    const loaded = parseSave(JSON.stringify(state), T0)!;
    expect(loaded.farm.branches.speed).toBe(branchMaxLevel(loaded.farm, 'speed'));
    expect(loaded.farm.droneCount).toBe(DRONES.maxCount);
  });
});
