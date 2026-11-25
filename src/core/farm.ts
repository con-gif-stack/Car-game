import { DRONE_MODELS, DRONES, GARAGE_POSITION, HAUL_VALUE, JUNKYARD_DEPOSITS, SCAVENGE, type DepositDef } from '../data/farm';
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
}

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
  };
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
  return (deposit.regenPerMinute / 60) * droneModel(farm).heapYield;
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
export function repairFarm(farm: FarmState): FarmState {
  const deposits: Record<string, number> = {};
  for (const deposit of DEPOSITS) {
    const value = farm.deposits?.[deposit.id];
    deposits[deposit.id] =
      typeof value === 'number' && Number.isFinite(value) ? Math.min(deposit.max, Math.max(0, value)) : deposit.max;
  }
  return {
    deposits,
    droneCount: Math.min(DRONES.maxCount, Math.max(0, Math.floor(farm.droneCount))),
    droneModel: Math.min(DRONE_MODELS.length - 1, Math.max(0, Math.floor(farm.droneModel))),
    scavenged: Math.max(0, Math.floor(farm.scavenged)),
  };
}

/**
 * Scavenges by hand from a deposit: takes one tap's worth if there's enough left.
 * Returns what was found (the material and its scrap value), or null if the deposit is bare.
 */
export function scavenge(farm: FarmState, depositId: string): Haul | null {
  const deposit = DEPOSITS_BY_ID[depositId];
  if (!deposit) return null;
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
  const model = droneModel(farm);
  return (2 * distance(GARAGE_POSITION, deposit)) / model.speed + model.capacity / model.mineRate + DRONES.unloadSeconds;
}

/**
 * Average hauling rates of the drones (units and money per second), assuming they keep
 * working steadily. Each deposit can't give more than it regrows.
 */
export function farmRates(farm: FarmState): Haul {
  const materials = emptyMaterials();
  if (farm.droneCount <= 0) return { money: 0, materials };
  const model = droneModel(farm);
  const totalWeight = DEPOSITS.reduce((sum, d) => sum + d.weight, 0);
  const averageTrip = DEPOSITS.reduce((sum, d) => sum + (d.weight / totalWeight) * tripSeconds(farm, d), 0);
  const unitsPerSecond = (farm.droneCount * model.capacity) / averageTrip;
  for (const deposit of DEPOSITS) {
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
  step(farm: FarmState, dt: number): Haul {
    this.sync(farm);
    regrowDeposits(farm, dt);
    const unloaded = emptyMaterials();
    const model = droneModel(farm);

    for (const drone of this.drones) {
      switch (drone.phase) {
        case 'waiting':
          drone.timer -= dt;
          if (drone.timer <= 0) this.chooseTarget(drone, farm);
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
  private chooseTarget(drone: Drone, farm: FarmState): void {
    const available = DEPOSITS.filter((d) => (farm.deposits[d.id] ?? 0) >= 0.5);
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
