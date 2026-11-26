import {
  DRONE_BRANCHES,
  DRONE_BRANCHES_BY_ID,
  DRONE_MODELS,
  DRONES,
  GARAGE_POSITION,
  HAUL_VALUE,
  JUNKYARD_DEPOSITS,
  SCAVENGE,
  type DepositDef,
  type DroneBranchId,
} from '../data/farm';
import { emptyMaterials, type MaterialId } from '../data/materials';
import { seededRandom } from './random';
import type { MaterialStock } from './state';

/*
 * The farm: deposits that regrow, scavenging by hand, and drones that fly out, mine, and
 * haul back to the garage. `FarmSim` runs the drones live while the game is open;
 * `farmRates` gives the same model's average rates, for time away and the balance simulator.
 */

/** Saved farm progress. */
export interface FarmState {
  /** Units left in each deposit, by deposit id. */
  deposits: Record<string, number>;
  droneCount: number;
  /** Index into DRONE_MODELS. */
  droneModel: number;
  /** Total taps spent scavenging by hand. */
  scavenged: number;
  /** Level of each branch of the drone upgrade tree. */
  branches: Record<DroneBranchId, number>;
}

/** True when a material can't be stored right now (drones leave its piles alone). */
export type FullCheck = (material: MaterialId) => boolean;

const NEVER_FULL: FullCheck = () => false;

export interface Haul {
  money: number;
  materials: MaterialStock;
}

export const DEPOSITS: readonly DepositDef[] = JUNKYARD_DEPOSITS;
const DEPOSITS_BY_ID: Record<string, DepositDef> = Object.fromEntries(DEPOSITS.map((d) => [d.id, d]));

export function createFarmState(): FarmState {
  return {
    deposits: Object.fromEntries(DEPOSITS.map((d) => [d.id, d.max])),
    droneCount: 0,
    droneModel: 0,
    scavenged: 0,
    branches: emptyBranches(),
  };
}

function emptyBranches(): Record<DroneBranchId, number> {
  return Object.fromEntries(DRONE_BRANCHES.map((b) => [b.id, 0])) as Record<DroneBranchId, number>;
}

/** Highest level a branch can reach with the current drone model. */
export function branchMaxLevel(farm: FarmState, id: DroneBranchId): number {
  const branch = DRONE_BRANCHES_BY_ID[id];
  const byModel = branch.levelsPerModel * (Math.floor(farm.droneModel) + 1);
  return Array.isArray(branch.cost) ? Math.min(byModel, branch.cost.length) : byModel;
}

/** Most levels a branch has in total (with the best drone model). */
export function branchTotalLevels(id: DroneBranchId): number {
  const branch = DRONE_BRANCHES_BY_ID[id];
  const byModel = branch.levelsPerModel * DRONE_MODELS.length;
  return Array.isArray(branch.cost) ? Math.min(byModel, branch.cost.length) : byModel;
}

export function branchLevel(farm: FarmState, id: DroneBranchId): number {
  return Math.max(0, Math.floor(farm.branches?.[id] ?? 0));
}

/** Multiplier from a branch's levels (1 = no upgrades). */
export function branchMultiplier(farm: FarmState, id: DroneBranchId): number {
  return 1 + DRONE_BRANCHES_BY_ID[id].bonusPerLevel * branchLevel(farm, id);
}

export interface DroneStats {
  speed: number;
  capacity: number;
  mineRate: number;
  heapYield: number;
}

/** Drone performance: the model's base values with the upgrade tree's bonuses. */
export function droneStats(farm: FarmState): DroneStats {
  const model = droneModel(farm);
  const drills = branchMultiplier(farm, 'drills');
  return {
    speed: model.speed * branchMultiplier(farm, 'speed'),
    capacity: model.capacity * branchMultiplier(farm, 'cargo'),
    mineRate: model.mineRate * drills,
    // Drills also dig deeper: piles regrow faster (two thirds of the mining bonus).
    heapYield: model.heapYield * (1 + (drills - 1) * (2 / 3)),
  };
}

/** True if drones can reach a deposit with their current Range. */
export function inReach(farm: FarmState, deposit: DepositDef): boolean {
  return deposit.range <= branchLevel(farm, 'range');
}

/** Deposits the drones can reach and whose material can still be stored. */
export function workableDeposits(farm: FarmState, full: FullCheck = NEVER_FULL): DepositDef[] {
  return DEPOSITS.filter((d) => inReach(farm, d) && !full(d.material));
}

export function depositDef(id: string): DepositDef | undefined {
  return DEPOSITS_BY_ID[id];
}

export function droneModel(farm: FarmState) {
  const index = Math.min(DRONE_MODELS.length - 1, Math.max(0, Math.floor(farm.droneModel)));
  return DRONE_MODELS[index] as (typeof DRONE_MODELS)[number];
}

/** Money a load of materials is worth as scrap. */
export function haulValue(materials: Partial<Record<MaterialId, number>>): number {
  let total = 0;
  for (const [id, amount] of Object.entries(materials)) total += (amount ?? 0) * (HAUL_VALUE[id as MaterialId] ?? 0);
  return total;
}

/** Units per second a deposit regrows, with the drones' dig-deeper bonus. */
function regenPerSecond(farm: FarmState, deposit: DepositDef): number {
  return (deposit.regenPerMinute / 60) * droneStats(farm).heapYield;
}

/** Deposits regrow over time, up to their maximum. */
export function regrowDeposits(farm: FarmState, seconds: number): void {
  if (!(seconds > 0)) return;
  for (const deposit of DEPOSITS) {
    const current = farm.deposits[deposit.id] ?? deposit.max;
    farm.deposits[deposit.id] = Math.min(deposit.max, current + regenPerSecond(farm, deposit) * seconds);
  }
}

/** Keeps deposit amounts within range and the drone numbers valid. */
export function repairFarm(farm: FarmState, maxDrones = DRONES.maxCount): FarmState {
  const deposits: Record<string, number> = {};
  for (const deposit of DEPOSITS) {
    const value = farm.deposits?.[deposit.id];
    deposits[deposit.id] =
      typeof value === 'number' && Number.isFinite(value) ? Math.min(deposit.max, Math.max(0, value)) : deposit.max;
  }
  return {
    deposits,
    droneCount: Math.min(maxDrones, Math.max(0, Math.floor(farm.droneCount))),
    droneModel: Math.min(DRONE_MODELS.length - 1, Math.max(0, Math.floor(farm.droneModel))),
    scavenged: Math.max(0, Math.floor(farm.scavenged)),
    branches: repairBranches(farm, Math.min(DRONE_MODELS.length - 1, Math.max(0, Math.floor(farm.droneModel)))),
  };
}

function repairBranches(farm: FarmState, model: number): Record<DroneBranchId, number> {
  const branches = emptyBranches();
  const probe = { ...farm, droneModel: model };
  for (const branch of DRONE_BRANCHES) {
    const value = farm.branches?.[branch.id];
    const level = typeof value === 'number' && Number.isFinite(value) ? Math.floor(value) : 0;
    branches[branch.id] = Math.min(branchMaxLevel(probe, branch.id), Math.max(0, level));
  }
  return branches;
}

/**
 * Scavenges by hand from a deposit: takes one tap's worth if there's enough left.
 * Returns what was found (the material and its scrap value), or null if the deposit is bare.
 */
export function scavenge(farm: FarmState, depositId: string): Haul | null {
  const deposit = DEPOSITS_BY_ID[depositId];
  if (!deposit || !inReach(farm, deposit)) return null;
  const left = farm.deposits[depositId] ?? 0;
  const units = Math.min(SCAVENGE.unitsPerTap, left);
  if (units < SCAVENGE.unitsPerTap * 0.5) return null;
  farm.deposits[depositId] = left - units;
  farm.scavenged += 1;
  const materials = emptyMaterials();
  materials[deposit.material] = units;
  return { money: haulValue({ [deposit.material]: units }), materials };
}

function distance(a: { x: number; y: number }, b: { x: number; y: number }): number {
  return Math.hypot(a.x - b.x, a.y - b.y);
}

/** One drone's round trip to a deposit (seconds): fly out, fill up, fly back, unload. */
function tripSeconds(farm: FarmState, deposit: DepositDef): number {
  const drone = droneStats(farm);
  return (2 * distance(GARAGE_POSITION, deposit)) / drone.speed + drone.capacity / drone.mineRate + DRONES.unloadSeconds;
}

/**
 * Average hauling rates of the drones (units and money per second), assuming they keep
 * working steadily. Each deposit can't give more than it regrows.
 */
export function farmRates(farm: FarmState, full: FullCheck = NEVER_FULL): Haul {
  const materials = emptyMaterials();
  const deposits = workableDeposits(farm, full);
  if (farm.droneCount <= 0 || deposits.length === 0) return { money: 0, materials };
  const drone = droneStats(farm);
  const totalWeight = deposits.reduce((sum, d) => sum + d.weight, 0);
  const averageTrip = deposits.reduce((sum, d) => sum + (d.weight / totalWeight) * tripSeconds(farm, d), 0);
  const unitsPerSecond = (farm.droneCount * drone.capacity) / averageTrip;
  for (const deposit of deposits) {
    const wanted = unitsPerSecond * (deposit.weight / totalWeight);
    materials[deposit.material] += Math.min(wanted, regenPerSecond(farm, deposit));
  }
  return { money: haulValue(materials), materials };
}

export type DronePhase = 'waiting' | 'outbound' | 'mining' | 'returning' | 'unloading';

/** A drone in flight (not saved: drones restart at the garage when the game loads). */
export interface Drone {
  x: number;
  y: number;
  phase: DronePhase;
  target: string | null;
  cargo: number;
  material: MaterialId | null;
  timer: number;
}

/** Runs the drones live. Call `step` from the game tick. */
export class FarmSim {
  readonly drones: Drone[] = [];
  private readonly rand: () => number;

  constructor(seed = 1) {
    this.rand = seededRandom(seed);
  }

  /** Adds drones up to the farm's drone count (new ones take off one after another). */
  sync(farm: FarmState): void {
    while (this.drones.length < farm.droneCount) {
      this.drones.push({
        x: GARAGE_POSITION.x,
        y: GARAGE_POSITION.y,
        phase: 'waiting',
        target: null,
        cargo: 0,
        material: null,
        timer: this.drones.length * 0.8,
      });
    }
    this.drones.length = Math.min(this.drones.length, farm.droneCount);
  }

  /** Advances every drone and regrows deposits. Returns what was unloaded at the garage. */
  step(farm: FarmState, dt: number, full: FullCheck = NEVER_FULL): Haul {
    this.sync(farm);
    regrowDeposits(farm, dt);
    const unloaded = emptyMaterials();
    const model = droneStats(farm);

    for (const drone of this.drones) {
      switch (drone.phase) {
        case 'waiting':
          drone.timer -= dt;
          if (drone.timer <= 0) this.chooseTarget(drone, farm, full);
          break;
        case 'outbound': {
          const target = drone.target ? DEPOSITS_BY_ID[drone.target] : undefined;
          if (!target) {
            drone.phase = 'returning';
            break;
          }
          if (this.moveToward(drone, target, model.speed * dt)) drone.phase = 'mining';
          break;
        }
        case 'mining': {
          const target = drone.target ? DEPOSITS_BY_ID[drone.target] : undefined;
          const left = target ? (farm.deposits[target.id] ?? 0) : 0;
          const take = Math.min(model.mineRate * dt, model.capacity - drone.cargo, left);
          if (target && take > 0) {
            farm.deposits[target.id] = left - take;
            drone.cargo += take;
            drone.material = target.material;
          }
          const full = drone.cargo >= model.capacity - 1e-9;
          const bare = left - Math.max(0, take) <= 1e-9;
          if (full || bare) drone.phase = drone.cargo > 0 ? 'returning' : 'waiting';
          if (drone.phase === 'waiting') drone.timer = 0.5;
          break;
        }
        case 'returning':
          if (this.moveToward(drone, GARAGE_POSITION, model.speed * dt)) {
            drone.phase = 'unloading';
            drone.timer = DRONES.unloadSeconds;
          }
          break;
        case 'unloading':
          drone.timer -= dt;
          if (drone.timer <= 0) {
            if (drone.material) unloaded[drone.material] += drone.cargo;
            drone.cargo = 0;
            drone.material = null;
            drone.phase = 'waiting';
            drone.timer = 0;
          }
          break;
      }
    }
    return { money: haulValue(unloaded), materials: unloaded };
  }

  /** Picks a deposit at random, weighted by how often drones should visit it. */
  private chooseTarget(drone: Drone, farm: FarmState, full: FullCheck): void {
    const available = workableDeposits(farm, full).filter((d) => (farm.deposits[d.id] ?? 0) >= 0.5);
    if (available.length === 0) {
      drone.timer = 2;
      return;
    }
    const total = available.reduce((sum, d) => sum + d.weight, 0);
    let pick = this.rand() * total;
    let chosen = available[available.length - 1] as DepositDef;
    for (const deposit of available) {
      pick -= deposit.weight;
      if (pick <= 0) {
        chosen = deposit;
        break;
      }
    }
    drone.target = chosen.id;
    drone.phase = 'outbound';
  }

  /** Moves a drone toward a point. Returns true when it arrives. */
  private moveToward(drone: Drone, to: { x: number; y: number }, step: number): boolean {
    const dx = to.x - drone.x;
    const dy = to.y - drone.y;
    const dist = Math.hypot(dx, dy);
    if (dist <= step) {
      drone.x = to.x;
      drone.y = to.y;
      return true;
    }
    drone.x += (dx / dist) * step;
    drone.y += (dy / dist) * step;
    return false;
  }
}
