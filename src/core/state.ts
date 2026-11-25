import { createStarterGarage, type GarageState } from './vehicle';

/**
 * The save-file version. Bump it whenever the shape of GameState changes in a way that
 * needs converting old saves, and add a migration in save.ts.
 */
export const SAVE_VERSION = 1;

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
  stats: GameStats;
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
    stats: {
      playTimeSeconds: 0,
      sessions: 0,
    },
  };
}
