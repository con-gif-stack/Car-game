import { GAME_CONFIG } from '../data/gameConfig';
import { FixedStepClock } from './clock';
import { Emitter } from './events';
import { ECONOMY } from '../data/economy';
import { computeIdleRates, computeOfflineEarnings, type IdleRates } from './idle';
import type { SaveManager } from './save';
import type { GameState, PendingOffline } from './state';
import { computeCarStats, getActiveCar } from './vehicle';

export type GameEvents = {
  /** One fixed simulation step has run. */
  tick: [dtSeconds: number];
  /** The game was saved successfully. */
  saved: [savedAt: number];
  /** The game came back after being hidden (tab switched, phone locked). */
  resumed: [awaySeconds: number];
  /** Offline earnings are waiting to be collected (sent with the new totals). */
  offlineEarnings: [pending: PendingOffline];
  /** The player collected offline earnings. */
  offlineCollected: [money: number];
};

/**
 * The game's logic and state, kept separate from Phaser so it can be unit-tested.
 * Phaser calls update() every frame, and pause()/resume() when the page is hidden or shown.
 */
export class GameModel {
  readonly events = new Emitter<GameEvents>();
  /** Seconds the player was away before this session started, or before the last resume. */
  lastAwaySeconds: number;

  private readonly clock = new FixedStepClock(
    1 / GAME_CONFIG.ticksPerSecond,
    GAME_CONFIG.maxCatchUpSeconds,
  );
  /** Counted in whole ticks rather than seconds, so floating-point error can't delay a save. */
  private ticksSinceSave = 0;
  private readonly ticksPerAutosave = Math.round(
    GAME_CONFIG.autosaveIntervalSeconds * GAME_CONFIG.ticksPerSecond,
  );
  private pausedAt: number | null = null;
  private savingEnabled = true;

  constructor(
    readonly state: GameState,
    private readonly saves: SaveManager,
    private readonly now: () => number,
    awaySeconds = 0,
  ) {
    this.lastAwaySeconds = awaySeconds;
    state.stats.sessions += 1;
    this.applyTimeAway(awaySeconds);
  }

  /** Current idle earnings of the active car. */
  idleRates(): IdleRates {
    return computeIdleRates(computeCarStats(getActiveCar(this.state.garage)));
  }

  /** Adds waiting offline earnings to the player's resources. Returns the money collected. */
  collectOffline(): number {
    const pending = this.state.pendingOffline;
    const money = pending.money;
    if (money <= 0 && pending.distanceKm <= 0) return 0;
    this.state.resources.money += money;
    this.state.stats.distanceKm += pending.distanceKm;
    this.state.pendingOffline = { money: 0, distanceKm: 0, seconds: 0, capped: false };
    this.save();
    this.events.emit('offlineCollected', money);
    return money;
  }

  /** Advances the game by real elapsed time, running whole fixed ticks and autosaving. */
  update(elapsedSeconds: number): void {
    if (this.pausedAt !== null) return;
    const steps = this.clock.advance(elapsedSeconds);
    for (let i = 0; i < steps; i++) {
      this.tick(this.clock.stepSeconds);
    }
    this.ticksSinceSave += steps;
    if (this.ticksSinceSave >= this.ticksPerAutosave) {
      this.save();
    }
  }

  /** Saves now. Returns false if saving is off or storage refused the write. */
  save(): boolean {
    if (!this.savingEnabled) return false;
    this.ticksSinceSave = 0;
    this.state.lastSavedAt = this.now();
    const ok = this.saves.save(this.state);
    if (ok) this.events.emit('saved', this.state.lastSavedAt);
    return ok;
  }

  /** Called when the game is hidden: saves and remembers when it stopped. */
  pause(): void {
    if (this.pausedAt !== null) return;
    this.pausedAt = this.now();
    this.save();
  }

  /** Called when the game is shown again: reports how long it was away. */
  resume(): void {
    if (this.pausedAt === null) return;
    const awaySeconds = Math.max(0, (this.now() - this.pausedAt) / 1000);
    this.pausedAt = null;
    this.clock.reset();
    this.lastAwaySeconds = awaySeconds;
    this.events.emit('resumed', awaySeconds);
    this.applyTimeAway(awaySeconds);
  }

  /**
   * Deletes all saved progress. Saving stays off afterwards so the current state can't be
   * written back; reload the page to start a new game.
   */
  wipeSave(): void {
    this.savingEnabled = false;
    this.saves.clear();
  }

  private tick(dtSeconds: number): void {
    const rates = this.idleRates();
    this.state.resources.money += rates.moneyPerSecond * dtSeconds;
    this.state.stats.distanceKm += rates.kmPerSecond * dtSeconds;
    this.state.stats.playTimeSeconds += dtSeconds;
    this.events.emit('tick', dtSeconds);
  }

  /**
   * Credits time spent away. Short absences are added straight away; longer ones are held
   * as pending earnings for the player to collect.
   */
  private applyTimeAway(awaySeconds: number): void {
    const earned = computeOfflineEarnings(this.idleRates(), awaySeconds);
    if (earned.seconds <= 0) return;
    if (awaySeconds < ECONOMY.offline.minSecondsForSummary) {
      this.state.resources.money += earned.money;
      this.state.stats.distanceKm += earned.distanceKm;
      return;
    }
    const pending = this.state.pendingOffline;
    pending.money += earned.money;
    pending.distanceKm += earned.distanceKm;
    pending.seconds += earned.seconds;
    pending.capped = pending.capped || earned.capped;
    this.save();
    this.events.emit('offlineEarnings', { ...pending });
  }
}
