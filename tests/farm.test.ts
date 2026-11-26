import { describe, expect, it } from 'vitest';
import {
  createFarmState,
  DEPOSITS,
  FarmSim,
  farmRates,
  haulValue,
  regrowDeposits,
  repairFarm,
  scavenge,
} from '../src/core/farm';
import { GameModel } from '../src/core/GameModel';
import { checkMilestones } from '../src/core/milestones';
import { MemoryStorage, parseSave, SaveManager } from '../src/core/save';
import { createNewState, emptyResources, SAVE_VERSION } from '../src/core/state';
import { buyDrone, buyDroneModel, droneBuildCost, droneModelCost } from '../src/core/upgrades';
import { DRONE_MODELS, DRONES, GARAGE_POSITION, MAP_HEIGHT, MAP_WIDTH } from '../src/data/farm';
import { MATERIAL_IDS } from '../src/data/materials';

const T0 = 1_700_000_000_000;

describe('farm data', () => {
  it('deposits sit on the map, away from the garage', () => {
    for (const d of DEPOSITS) {
      expect(d.x).toBeGreaterThan(0);
      expect(d.x).toBeLessThan(MAP_WIDTH);
      expect(d.y).toBeGreaterThan(0);
      expect(d.y).toBeLessThan(MAP_HEIGHT);
      expect(Math.hypot(d.x - GARAGE_POSITION.x, d.y - GARAGE_POSITION.y)).toBeGreaterThan(15);
    }
  });

  it('each drone model beats the last in every way', () => {
    for (let i = 1; i < DRONE_MODELS.length; i++) {
      const prev = DRONE_MODELS[i - 1];
      const next = DRONE_MODELS[i];
      expect(next?.speed).toBeGreaterThan(prev?.speed ?? 0);
      expect(next?.capacity).toBeGreaterThan(prev?.capacity ?? 0);
      expect(next?.mineRate).toBeGreaterThan(prev?.mineRate ?? 0);
    }
  });
});

describe('scavenging by hand', () => {
  it('takes one unit per tap, pays its scrap value, and counts the tap', () => {
    const farm = createFarmState();
    const heap = DEPOSITS[0];
    if (!heap) throw new Error('no deposits');
    const haul = scavenge(farm, heap.id);
    expect(haul?.materials[heap.material]).toBe(1);
    expect(haul?.money).toBe(haulValue({ [heap.material]: 1 }));
    expect(farm.deposits[heap.id]).toBe(heap.max - 1);
    expect(farm.scavenged).toBe(1);
  });

  it('gives nothing from a bare deposit until it regrows', () => {
    const farm = createFarmState();
    const heap = DEPOSITS[0];
    if (!heap) throw new Error('no deposits');
    farm.deposits[heap.id] = 0;
    expect(scavenge(farm, heap.id)).toBeNull();
    regrowDeposits(farm, 60);
    expect(scavenge(farm, heap.id)).not.toBeNull();
    regrowDeposits(farm, 1e6);
    expect(farm.deposits[heap.id]).toBe(heap.max);
  });

  it('20 taps unlock drones and the first drone', () => {
    const state = createNewState(T0);
    state.farm.scavenged = 20;
    expect(checkMilestones(state).map((m) => m.id)).toContain('first-drone');
    expect(state.unlockedFeatures).toContain('drones');
    expect(state.farm.droneCount).toBe(1);
  });
});

describe('drones', () => {
  it('fly out, mine, return and unload', () => {
    const farm = createFarmState();
    farm.droneCount = 1;
    const sim = new FarmSim(1);
    let units = 0;
    let money = 0;
    const phases = new Set<string>();
    for (let i = 0; i < 600; i++) {
      const haul = sim.step(farm, 0.1);
      units += MATERIAL_IDS.reduce((sum, id) => sum + haul.materials[id], 0);
      money += haul.money;
      phases.add(sim.drones[0]?.phase ?? '');
    }
    expect(phases).toEqual(new Set(['waiting', 'outbound', 'mining', 'returning', 'unloading']));
    expect(units).toBeGreaterThan(0);
    expect(money).toBeGreaterThan(0);
  });

  it('live hauling roughly matches the average rate used while away', () => {
    for (const model of [0, 2]) {
      const farm = createFarmState();
      farm.droneCount = 3;
      farm.droneModel = model;
      const sim = new FarmSim(3);
      const seconds = 3600;
      let units = 0;
      for (let t = 0; t < seconds; t += 0.1) {
        const haul = sim.step(farm, 0.1);
        units += MATERIAL_IDS.reduce((sum, id) => sum + haul.materials[id], 0);
      }
      const rates = farmRates({ ...createFarmState(), droneCount: 3, droneModel: model });
      const expected = MATERIAL_IDS.reduce((sum, id) => sum + rates.materials[id], 0) * seconds;
      expect(units / expected, `model ${model}`).toBeGreaterThan(0.75);
      expect(units / expected, `model ${model}`).toBeLessThan(1.25);
    }
  });

  it('more drones and better models haul more; no drones, no haul', () => {
    const rate = (count: number, model: number) =>
      farmRates({ ...createFarmState(), droneCount: count, droneModel: model }).money;
    expect(rate(0, 0)).toBe(0);
    expect(rate(2, 0)).toBeGreaterThan(rate(1, 0));
    expect(rate(1, 1)).toBeGreaterThan(rate(1, 0));
    expect(rate(5, 3)).toBeGreaterThan(rate(5, 2));
  });

  it('drone building and model upgrades cost more each time and stop at the limits', () => {
    expect(droneBuildCost(2)?.money ?? 0).toBeGreaterThan(droneBuildCost(1)?.money ?? 0);
    expect(droneBuildCost(DRONES.maxCount)).toBeNull();
    expect(droneModelCost(DRONE_MODELS.length - 1)).toBeNull();

    const farm = createFarmState();
    const wallet = emptyResources();
    wallet.money = 1e12;
    for (const id of MATERIAL_IDS) wallet.materials[id] = 1e9;
    expect(buyDrone(farm, wallet)).toBe(false); // the first drone comes from the milestone
    farm.droneCount = 1;
    while (buyDrone(farm, wallet));
    expect(farm.droneCount).toBe(DRONES.maxCount);
    while (buyDroneModel(farm, wallet));
    expect(farm.droneModel).toBe(DRONE_MODELS.length - 1);
  });
});

describe('farm in the game model', () => {
  function setup(drones = 0) {
    let now = T0;
    const saves = new SaveManager(new MemoryStorage(), () => now);
    const state = createNewState(T0);
    state.farm.droneCount = drones;
    const model = new GameModel(state, saves, () => now);
    return { model, saves, advance: (ms: number) => (now += ms) };
  }

  it('scavenging adds materials and money, and the 20th tap announces the first drone', () => {
    const { model } = setup();
    const announced: string[] = [];
    model.events.on('milestoneReached', (m) => announced.push(m.id));
    const heap = DEPOSITS[0];
    if (!heap) throw new Error('no deposits');
    for (let i = 0; i < 20; i++) model.scavenge(heap.id);
    expect(model.state.resources.materials[heap.material]).toBe(20);
    expect(model.state.resources.money).toBeGreaterThan(0);
    expect(announced).toEqual(['first-drone']);
    expect(model.state.farm.droneCount).toBe(1);
  });

  it('drones earn while the game runs, and announce each haul', () => {
    const { model } = setup(2);
    let hauls = 0;
    model.events.on('hauled', () => hauls++);
    for (let i = 0; i < 60 * 60; i++) model.update(1 / 60);
    expect(hauls).toBeGreaterThan(0);
    expect(model.state.resources.money).toBeGreaterThan(0);
  });

  it('time away earns the drones’ average rate', () => {
    const { model, advance } = setup(2);
    model.pause();
    advance(3_600_000);
    model.resume();
    const expected = model.incomeRates().moneyPerSecond * 3600;
    expect(model.state.pendingOffline.money).toBeCloseTo(expected);
  });

  it('without drones, time away earns only the rare trickle', () => {
    const { model, advance } = setup(0);
    model.pause();
    advance(3_600_000);
    model.resume();
    expect(model.state.pendingOffline.money).toBe(0);
    expect(model.state.pendingOffline.materials.scrapMetal).toBe(0);
    expect(model.state.pendingOffline.materials.titanium).toBeGreaterThan(0);
  });
});

describe('save migration v4 → v5', () => {
  it('adds a fresh farm, and repairs bad farm values', () => {
    const v4 = { ...createNewState(T0), version: 4 } as Record<string, unknown>;
    delete v4.farm;
    const state = parseSave(JSON.stringify(v4), T0);
    expect(state?.version).toBe(SAVE_VERSION);
    expect(state?.farm.droneCount).toBe(0);
    expect(state?.farm.deposits[DEPOSITS[0]?.id ?? '']).toBe(DEPOSITS[0]?.max);

    const broken = repairFarm({ deposits: { 'heap-1': -5 }, droneCount: 99, droneModel: -1, scavenged: 3.7, branches: { speed: 0, cargo: 0, drills: 0, range: 0 } } as never);
    expect(broken.deposits['heap-1']).toBe(0);
    expect(broken.droneCount).toBe(DRONES.maxCount);
    expect(broken.droneModel).toBe(0);
    expect(broken.scavenged).toBe(3);
  });
});
