import type { BiomeId } from '../data/biomes';
import { FUEL_TANKS } from '../data/economy';
import { emptyMaterials, type MaterialId } from '../data/materials';
import { createFarmState, type FarmState } from './farm';
import type { FuelState } from './run';
import { createStarterGarage, type GarageState } from './vehicle';

/**
 * The save-file version. Bump it whenever the shape of GameState changes in a way that
 * needs converting old saves, and add a migration in save.ts.
 */
export const SAVE_VERSION = 5;

export type MaterialStock = Record<MaterialId, number>;

export interface Resources {
  /** Primary currency. */
  money: number;
  /** Amount held of each material (see src/data/materials.ts). */
  materials: MaterialStock;
}

export interface GameStats {
  /** Total seconds the game has been open and running. */
  playTimeSeconds: number;
  /** Total distance driven on runs (km). */
  distanceKm: number;
  /** How many times the game has been started. */
  sessions: number;
}

/** Everything that is saved between play sessions. */
export interface GameState {
  version: number;
  /** When this save was first created (ms since epoch). */
  createdAt: number;
  /** When the game was last saved (ms since epoch). Used to work out time away. */
  lastSavedAt: number;
  resources: Resources;
  /** The player's cars and which one is in use. */
  garage: GarageState;
  /** Earnings from time away, waiting for the player to collect them. */
  pendingOffline: PendingOffline;
  /** Garage-wide upgrades that aren't car parts. */
  workshop: WorkshopState;
  /** The farm: deposits, drones and hand scavenging. */
  farm: FarmState;
  /** Drive runs: records and fuel. */
  run: RunRecord;
  /** Ids of milestones reached (see src/data/milestones.ts). */
  milestones: string[];
  /** Biomes reached on runs, which can be farmed (the Junkyard always). */
  unlockedBiomes: BiomeId[];
  /** Features switched on by milestones, e.g. 'drones'. */
  unlockedFeatures: string[];
  stats: GameStats;
}

export interface RunRecord {
  /** Furthest distance reached on any run (km). */
  bestDistanceKm: number;
  runsCompleted: number;
  fuel: FuelState;
}

export interface WorkshopState {
  /** Salvage Magnet level: boosts the idle trickle of Rare-and-above materials. */
  salvageMagnetLevel: number;
}

/** Earnings (money and materials) over some period. */
export interface Earnings {
  money: number;
  materials: MaterialStock;
}

export interface PendingOffline extends Earnings {
  /** Seconds away that counted toward these earnings. */
  seconds: number;
  /** True if any absence went past the offline cap. */
  capped: boolean;
}

export function emptyResources(): Resources {
  return { money: 0, materials: emptyMaterials() };
}

export function createNewState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSavedAt: now,
    resources: emptyResources(),
    garage: createStarterGarage(),
    pendingOffline: emptyPendingOffline(),
    workshop: { salvageMagnetLevel: 0 },
    farm: createFarmState(),
    run: { bestDistanceKm: 0, runsCompleted: 0, fuel: { tanks: FUEL_TANKS.max, lastRefillAt: now } },
    milestones: [],
    unlockedBiomes: ['junkyard'],
    unlockedFeatures: [],
    stats: {
      playTimeSeconds: 0,
      distanceKm: 0,
      sessions: 0,
    },
  };
}

export function emptyPendingOffline(): PendingOffline {
  return { money: 0, materials: emptyMaterials(), seconds: 0, capped: false };
}
