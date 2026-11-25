import { describe, expect, it } from 'vitest';
import { GameModel } from '../src/core/GameModel';
import { checkMilestones, milestoneProgress, nextDistanceMilestone } from '../src/core/milestones';
import {
  createRun,
  msUntilNextTank,
  payoutBetween,
  refillFuel,
  runRewards,
  simulateRun,
  stepRun,
  useTank,
  type FuelState,
} from '../src/core/run';
import { MemoryStorage, parseSave, SaveManager } from '../src/core/save';
import { createNewState, emptyResources } from '../src/core/state';
import { buyLevelUp, buyNextTier } from '../src/core/upgrades';
import { computeCarStats, createCar, type StatBlock } from '../src/core/vehicle';
import { biomeAt, BIOMES } from '../src/data/biomes';
import { FUEL_TANKS } from '../src/data/economy';
import { MATERIAL_IDS } from '../src/data/materials';
import { MILESTONES } from '../src/data/milestones';
import { SLOTS } from '../src/data/vehicles';

const T0 = 1_700_000_000_000;
const MIN = 60_000;

function carStatsAtTier(tiers: number, maxLevels = false): StatBlock {
  const car = createCar('c', 'rustbucket');
  const wallet = emptyResources();
  wallet.money = 1e15;
  for (const id of MATERIAL_IDS) wallet.materials[id] = 1e12;
  for (let i = 0; i < tiers; i++) for (const slot of SLOTS) buyNextTier(car, slot.id, wallet);
  if (maxLevels) for (const slot of SLOTS) while (buyLevelUp(car, slot.id, wallet));
  return computeCarStats(car);
}

describe('biome road', () => {
  it('biomes follow on from each other with no gaps, and the last never ends', () => {
    expect(BIOMES[0]?.startKm).toBe(0);
    for (let i = 1; i < BIOMES.length; i++) expect(BIOMES[i]?.startKm).toBe(BIOMES[i - 1]?.endKm);
    expect(BIOMES[BIOMES.length - 1]?.endKm).toBe(Infinity);
    expect(biomeAt(0).id).toBe('junkyard');
    expect(biomeAt(2).id).toBe('rustHighway');
    expect(biomeAt(1e6).id).toBe('beyond');
  });

  it('later biomes are harder and pay more', () => {
    for (let i = 1; i < BIOMES.length; i++) {
      const prev = BIOMES[i - 1];
      const next = BIOMES[i];
      expect(next?.gripDemand).toBeGreaterThan(prev?.gripDemand ?? 0);
      expect(next?.fuelDrain).toBeGreaterThan(prev?.fuelDrain ?? 0);
      expect(next?.moneyPerKm).toBeGreaterThan(prev?.moneyPerKm ?? 0);
    }
  });
});

describe('drive runs', () => {
  it('the starter car barely makes it a mile or two, in about a minute', () => {
    const run = simulateRun(carStatsAtTier(0), 1);
    expect(run.distanceKm).toBeGreaterThan(0.8);
    expect(run.distanceKm).toBeLessThan(2);
    expect(run.elapsedSeconds).toBeGreaterThan(45);
    expect(run.elapsedSeconds).toBeLessThan(100);
  });

  it('better cars go further, and a Race car crosses the Junkyard in a few seconds', () => {
    const distances = [0, 1, 2, 3, 4].map((tier) => simulateRun(carStatsAtTier(tier), 1).distanceKm);
    for (let i = 1; i < distances.length; i++) expect(distances[i]).toBeGreaterThan(distances[i - 1] ?? 0);
    const race = createRun(carStatsAtTier(4, true), 1);
    while (race.distanceKm < 2 && !race.finished) stepRun(race, 0.1);
    expect(race.elapsedSeconds).toBeLessThan(5);
  });

  it('runs stay roughly one to two minutes long at every tier', () => {
    for (let tier = 0; tier <= 4; tier++) {
      const run = simulateRun(carStatsAtTier(tier, true), 1);
      expect(run.elapsedSeconds, `tier ${tier}`).toBeLessThan(150);
    }
  });

  it('ends when fuel or health runs out', () => {
    const fuelRun = simulateRun(carStatsAtTier(0), 1);
    expect(fuelRun.endReason).toBe('fuel');
    expect(fuelRun.fuel).toBeCloseTo(0);
    const fragile = { ...carStatsAtTier(4, true), durability: 1 };
    const broken = simulateRun(fragile, 1);
    expect(broken.endReason).toBe('breakdown');
    expect(broken.health).toBeCloseTo(0);
  });

  it('is deterministic for a seed, in any step size', () => {
    const stats = carStatsAtTier(2);
    const a = simulateRun(stats, 42);
    const b = createRun(stats, 42);
    while (!b.finished) stepRun(b, 1 / 60);
    expect(b.distanceKm).toBeCloseTo(a.distanceKm, 6);
    expect(b.finds.scrapMetal).toBeCloseTo(a.finds.scrapMetal, 6);
  });

  it('finds materials from the biomes it drives through', () => {
    const run = simulateRun(carStatsAtTier(3), 1);
    expect(run.finds.scrapMetal).toBeGreaterThan(0);
    expect(run.finds.titanium).toBeGreaterThan(0);
  });

  it('pays per km by biome, with a bonus for new ground', () => {
    expect(payoutBetween(0, 2)).toBeCloseTo(2 * (BIOMES[0]?.moneyPerKm ?? 0));
    expect(payoutBetween(1, 3)).toBeCloseTo((BIOMES[0]?.moneyPerKm ?? 0) + (BIOMES[1]?.moneyPerKm ?? 0));
    const run = simulateRun(carStatsAtTier(1), 1);
    const first = runRewards(run, 0);
    expect(first.newBest).toBe(true);
    expect(first.bonusMoney).toBeCloseTo(first.money);
    const repeat = runRewards(run, run.distanceKm + 1);
    expect(repeat.newBest).toBe(false);
    expect(repeat.bonusMoney).toBe(0);
  });
});

describe('fuel tanks', () => {
  const full = (): FuelState => ({ tanks: FUEL_TANKS.max, lastRefillAt: T0 });

  it('using a full tank starts the refill timer', () => {
    const fuel = full();
    expect(useTank(fuel, T0)).toBe(true);
    expect(fuel.tanks).toBe(FUEL_TANKS.max - 1);
    expect(msUntilNextTank(fuel, T0)).toBe(FUEL_TANKS.refillMinutes * MIN);
  });

  it('refills one tank per interval, up to the max', () => {
    const fuel: FuelState = { tanks: 0, lastRefillAt: T0 };
    refillFuel(fuel, T0 + FUEL_TANKS.refillMinutes * MIN * 1.5);
    expect(fuel.tanks).toBe(1);
    expect(msUntilNextTank(fuel, T0 + FUEL_TANKS.refillMinutes * MIN * 1.5)).toBe(FUEL_TANKS.refillMinutes * MIN * 0.5);
    refillFuel(fuel, T0 + FUEL_TANKS.refillMinutes * MIN * 100);
    expect(fuel.tanks).toBe(FUEL_TANKS.max);
  });

  it('refuses a run with no fuel, and a clock moved backwards grants nothing', () => {
    const fuel: FuelState = { tanks: 0, lastRefillAt: T0 };
    expect(useTank(fuel, T0 + MIN)).toBe(false);
    refillFuel(fuel, T0 - 1000 * MIN);
    expect(fuel.tanks).toBe(0);
  });
});

describe('milestones', () => {
  it('are granted once each, apply rewards and unlock biomes', () => {
    const state = createNewState(T0);
    state.run.runsCompleted = 1;
    state.run.bestDistanceKm = 6.5;
    const granted = checkMilestones(state).map((m) => m.id);
    expect(granted).toEqual(['first-run', 'reach-rust-highway', 'reach-industrial']);
    expect(state.unlockedBiomes).toEqual(['junkyard', 'rustHighway', 'industrial']);
    expect(state.resources.money).toBe(100 + 500 + 5_000);
    expect(checkMilestones(state)).toEqual([]);
  });

  it('track progress toward the next one', () => {
    const state = createNewState(T0);
    state.run.bestDistanceKm = 1.2;
    const next = nextDistanceMilestone(state);
    expect(next?.id).toBe('reach-rust-highway');
    expect(next && milestoneProgress(state, next.condition)).toEqual({ current: 1.2, target: 2 });
  });

  it('every biome after the first has a milestone that unlocks it', () => {
    for (const biome of BIOMES.slice(1, -1)) {
      expect(MILESTONES.some((m) => m.reward.unlockBiome === biome.id), biome.id).toBe(true);
    }
  });
});

describe('runs in the game model', () => {
  function setup() {
    let now = T0;
    const saves = new SaveManager(new MemoryStorage(), () => now);
    const model = new GameModel(createNewState(T0), saves, () => now);
    return { model, saves, advance: (ms: number) => (now += ms) };
  }

  it('a run uses a tank, pays out, records the best, and announces milestones', () => {
    const { model, saves } = setup();
    const announced: string[] = [];
    model.events.on('milestoneReached', (m) => announced.push(m.id));
    const run = model.startRun();
    expect(run).not.toBeNull();
    expect(model.fuel().tanks).toBe(FUEL_TANKS.max - 1);
    if (!run) return;
    while (!run.finished) stepRun(run, 1);
    const summary = model.finishRun(run);
    expect(summary.newBest).toBe(true);
    expect(model.state.run.bestDistanceKm).toBeCloseTo(run.distanceKm);
    expect(model.state.resources.money).toBeGreaterThan(summary.money);
    expect(announced).toContain('first-run');
    expect(saves.load().state.run.runsCompleted).toBe(1);
  });

  it('refuses runs when the tanks are empty, until they refill', () => {
    const { model, advance } = setup();
    for (let i = 0; i < FUEL_TANKS.max; i++) expect(model.startRun()).not.toBeNull();
    expect(model.startRun()).toBeNull();
    advance(FUEL_TANKS.refillMinutes * MIN);
    expect(model.startRun()).not.toBeNull();
  });

  it('buying parts can reach part milestones', () => {
    const { model } = setup();
    const announced: string[] = [];
    model.events.on('milestoneReached', (m) => announced.push(m.id));
    model.state.resources.money = 1e9;
    for (const id of MATERIAL_IDS) model.state.resources.materials[id] = 1e6;
    for (const slot of SLOTS) model.buyNextTier(slot.id);
    expect(announced).toEqual(['parts-used']);
  });
});

describe('save migration v3 → v4', () => {
  it('adds run records, milestones and biomes with defaults, and drops unknown ids', () => {
    const v3 = { ...createNewState(T0), version: 3 } as Record<string, unknown>;
    delete v3.run;
    delete v3.unlockedBiomes;
    v3.milestones = ['first-run', 'not-a-milestone', 'first-run'];
    const state = parseSave(JSON.stringify(v3), T0);
    expect(state?.version).toBe(4);
    expect(state?.run.fuel.tanks).toBe(FUEL_TANKS.max);
    expect(state?.run.bestDistanceKm).toBe(0);
    expect(state?.unlockedBiomes).toEqual(['junkyard']);
    expect(state?.milestones).toEqual(['first-run']);
  });
});
