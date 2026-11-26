import { seededRandom } from './random';
import { biomeAt, BIOMES, type BiomeDef } from '../data/biomes';
import { FUEL_TANKS, RUN_TUNING } from '../data/economy';
import { emptyMaterials, MATERIAL_IDS } from '../data/materials';
import type { MaterialStock } from './state';
import type { StatBlock } from './vehicle';

/*
 * Drive runs: the car drives itself along the biome road until its fuel or health runs out.
 * Pure and deterministic (for a given seed), so the game, the tests and the balance simulator
 * all get the same results.
 */

export type RunEndReason = 'fuel' | 'breakdown';

/** What a car brings to a run, worked out from its stats. */
export interface RunCar {
  topSpeedKmh: number;
  /** Average of Grip and Handling. */
  traction: number;
  /** Seconds of driving on a full tank (at fuel drain 1). */
  tankSeconds: number;
  maxHealth: number;
}

export interface RunState {
  car: RunCar;
  distanceKm: number;
  elapsedSeconds: number;
  /** Fuel left, in seconds of driving at drain 1. */
  fuel: number;
  health: number;
  speedKmh: number;
  biome: BiomeDef;
  /** Materials picked up so far. */
  finds: MaterialStock;
  /** Per-material luck for this run (multiplies the biome's find rates). */
  luck: MaterialStock;
  finished: boolean;
  endReason: RunEndReason | null;
}

export interface RunRewards {
  /** Money for the distance driven. */
  money: number;
  /** Extra money for ground beyond the previous best. */
  bonusMoney: number;
  finds: MaterialStock;
  newBest: boolean;
}

/** Longest a run can last, as a safety stop (seconds). */
const MAX_RUN_SECONDS = 900;

export function runCarFromStats(stats: StatBlock): RunCar {
  const t = RUN_TUNING;
  return {
    topSpeedKmh: t.baseSpeedKmh * (Math.max(1, stats.power) / 58) ** t.speedPowerExponent,
    traction: (stats.grip + stats.handling) / 2,
    tankSeconds: t.baseTankSeconds * (Math.max(1, stats.efficiency) / 20) ** t.tankEfficiencyExponent,
    maxHealth: t.baseHealth * (Math.max(1, stats.durability) / 21) ** t.healthDurabilityExponent,
  };
}

/** Speed in a biome: top speed, cut when traction falls short of what the road needs. */
export function speedIn(car: RunCar, biome: BiomeDef): number {
  const shortfall = Math.min(1, car.traction / biome.gripDemand);
  const factor = Math.max(RUN_TUNING.minTractionFactor, shortfall ** RUN_TUNING.tractionExponent);
  return car.topSpeedKmh * factor;
}

export function createRun(stats: StatBlock, seed: number): RunState {
  const car = runCarFromStats(stats);
  const rand = seededRandom(seed);
  const luck = emptyMaterials();
  const { min, max } = RUN_TUNING.findLuck;
  for (const id of MATERIAL_IDS) luck[id] = min + rand() * (max - min);
  const biome = biomeAt(0);
  return {
    car,
    distanceKm: 0,
    elapsedSeconds: 0,
    fuel: car.tankSeconds,
    health: car.maxHealth,
    speedKmh: speedIn(car, biome),
    biome,
    finds: emptyMaterials(),
    luck,
    finished: false,
    endReason: null,
  };
}

/**
 * Advances a run by `dtSeconds` of driving. Steps are split at biome borders so each stretch
 * uses the right road. Returns the run (changed in place).
 */
export function stepRun(run: RunState, dtSeconds: number): RunState {
  let remaining = dtSeconds;
  while (!run.finished && remaining > 1e-9) {
    const biome = biomeAt(run.distanceKm);
    run.biome = biome;
    const speed = speedIn(run.car, biome);
    run.speedKmh = speed;

    // How long until something changes: the time left, fuel running out, or the next biome.
    let dt = Math.min(remaining, run.fuel / biome.fuelDrain);
    const kmToBorder = biome.endKm - run.distanceKm;
    if (Number.isFinite(kmToBorder) && speed > 0) dt = Math.min(dt, (kmToBorder / speed) * 3600 + 1e-6);
    let km = (speed * dt) / 3600;
    // Health: stop exactly where it runs out.
    const damage = km * biome.roughness;
    if (damage >= run.health && biome.roughness > 0) {
      km = run.health / biome.roughness;
      dt = speed > 0 ? (km / speed) * 3600 : dt;
    }

    run.distanceKm += km;
    run.elapsedSeconds += dt;
    run.fuel = Math.max(0, run.fuel - dt * biome.fuelDrain);
    run.health = Math.max(0, run.health - km * biome.roughness);
    for (const id of MATERIAL_IDS) run.finds[id] += (biome.findsPerKm[id] ?? 0) * km * run.luck[id];
    remaining -= dt;

    if (run.health <= 1e-9) finish(run, 'breakdown');
    else if (run.fuel <= 1e-9) finish(run, 'fuel');
    else if (run.elapsedSeconds >= MAX_RUN_SECONDS) finish(run, 'fuel');
  }
  return run;
}

function finish(run: RunState, reason: RunEndReason): void {
  run.finished = true;
  run.endReason = reason;
  run.speedKmh = 0;
}

/** Plays a whole run instantly and returns the finished state. */
export function simulateRun(stats: StatBlock, seed: number): RunState {
  const run = createRun(stats, seed);
  while (!run.finished) stepRun(run, 1);
  return run;
}

/** Money for driving from `fromKm` to `toKm`, using each biome's pay per km. */
export function payoutBetween(fromKm: number, toKm: number): number {
  let total = 0;
  for (const biome of BIOMES) {
    const start = Math.max(fromKm, biome.startKm);
    const end = Math.min(toKm, biome.endKm);
    if (end > start) total += (end - start) * biome.moneyPerKm;
  }
  return total;
}

/** Rewards for a finished run, given the best distance before it. */
export function runRewards(run: RunState, previousBestKm: number): RunRewards {
  const newBest = run.distanceKm > previousBestKm;
  return {
    money: payoutBetween(0, run.distanceKm),
    bonusMoney: newBest ? payoutBetween(previousBestKm, run.distanceKm) * RUN_TUNING.newBestBonus : 0,
    finds: { ...run.finds },
    newBest,
  };
}

/** Fuel tanks, as stored in the save. */
export interface FuelState {
  tanks: number;
  /** When the refill timer last started or ticked over (ms since epoch). */
  lastRefillAt: number;
}

/** How many tanks can be stored and how long each takes to refill (the Fuel Depot raises both). */
export interface FuelLimits {
  maxTanks: number;
  refillMs: number;
}

export const BASE_FUEL_LIMITS: FuelLimits = { maxTanks: FUEL_TANKS.max, refillMs: FUEL_TANKS.refillMinutes * 60_000 };

/** Adds any tanks that have refilled by `now` (in place). Full tanks keep the timer at `now`. */
export function refillFuel(fuel: FuelState, now: number, limits: FuelLimits = BASE_FUEL_LIMITS): FuelState {
  const { maxTanks, refillMs } = limits;
  if (fuel.tanks >= maxTanks) {
    // A bigger depot never takes tanks away; a smaller limit (not possible today) would.
    fuel.tanks = Math.min(fuel.tanks, maxTanks);
    fuel.lastRefillAt = now;
    return fuel;
  }
  // A clock moved backwards restarts the timer rather than granting or losing tanks.
  if (now < fuel.lastRefillAt) fuel.lastRefillAt = now;
  const refilled = Math.floor((now - fuel.lastRefillAt) / refillMs);
  if (refilled > 0) {
    fuel.tanks = Math.min(maxTanks, fuel.tanks + refilled);
    fuel.lastRefillAt = fuel.tanks >= maxTanks ? now : fuel.lastRefillAt + refilled * refillMs;
  }
  return fuel;
}

/** Milliseconds until the next tank refills, or 0 when full. */
export function msUntilNextTank(fuel: FuelState, now: number, limits: FuelLimits = BASE_FUEL_LIMITS): number {
  if (fuel.tanks >= limits.maxTanks) return 0;
  return Math.max(0, fuel.lastRefillAt + limits.refillMs - now);
}

/** Uses one tank. Returns false if none is left. */
export function useTank(fuel: FuelState, now: number, limits: FuelLimits = BASE_FUEL_LIMITS): boolean {
  refillFuel(fuel, now, limits);
  if (fuel.tanks < 1) return false;
  // Starting from full: the refill timer starts now.
  if (fuel.tanks >= limits.maxTanks) fuel.lastRefillAt = now;
  fuel.tanks -= 1;
  return true;
}
