/**
 * Core timing settings. Balance numbers (costs, earnings) will live in their own data files
 * under src/data/ as they are added.
 */
export const GAME_CONFIG = {
  /** How many times per second the game simulation ticks. */
  ticksPerSecond: 10,
  /**
   * The most time one frame may simulate. Longer gaps (tab hidden, phone locked) are not
   * simulated tick by tick; they are reported as time away instead.
   */
  maxCatchUpSeconds: 1,
  /** Seconds between automatic saves while the game is open. */
  autosaveIntervalSeconds: 10,
} as const;
