import { createStarterGarage, type GarageState } from './vehicle';

/**
 * The save-file version. Bump it whenever the shape of GameState changes in a way that
 * needs converting old saves, and add a migration in save.ts.
 */
export const SAVE_VERSION = 2;

export interface Resources {
  /** Primary currency. */
  money: number;
  /** Used for vehicle upgrades and progression. */
  materials: number;
  /** Used for advanced upgrades and specialized parts. */
  rareMaterials: number;
}

export interface GameStats {
  /** Total seconds the game has been open and running. */
  playTimeSeconds: number;
  /** Total distance idle-driven, including while away (km). */
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
  stats: GameStats;
}

export interface WorkshopState {
  /** Salvage Magnet level: raises the idle trickle of rare materials. */
  salvageMagnetLevel: number;
}

export interface PendingOffline {
  money: number;
  materials: number;
  rareMaterials: number;
  distanceKm: number;
  /** Seconds away that counted toward these earnings. */
  seconds: number;
  /** True if any absence went past the offline cap. */
  capped: boolean;
}

export function createNewState(now: number): GameState {
  return {
    version: SAVE_VERSION,
    createdAt: now,
    lastSavedAt: now,
    resources: {
      money: 0,
      materials: 0,
      rareMaterials: 0,
    },
    garage: createStarterGarage(),
    pendingOffline: emptyPendingOffline(),
    workshop: { salvageMagnetLevel: 0 },
    stats: {
      playTimeSeconds: 0,
      distanceKm: 0,
      sessions: 0,
    },
  };
}

export function emptyPendingOffline(): PendingOffline {
  return { money: 0, materials: 0, rareMaterials: 0, distanceKm: 0, seconds: 0, capped: false };
}
