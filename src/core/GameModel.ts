import { ECONOMY } from '../data/economy';
import { GAME_CONFIG } from '../data/gameConfig';
import { MATERIAL_IDS } from '../data/materials';
import { FixedStepClock } from './clock';
import { Emitter } from './events';
import { computeIdleRates, computeOfflineEarnings, type IdleRates } from './idle';
import type { SaveManager } from './save';
import { emptyPendingOffline, type Earnings, type GameState, type PendingOffline } from './state';
import type { MilestoneDef } from '../data/milestones';
import { checkMilestones } from './milestones';
import { createRun, msUntilNextTank, refillFuel, runRewards, useTank, type RunRewards, type RunState } from './run';
import { buyLevelUp, buyNextTier, salvageMagnetCost, spend } from './upgrades';
import { carProgress, computeCarStats, getActiveCar, type CarState, type SlotId } from './vehicle';

export type PurchaseKind = 'tier' | 'level' | 'salvageMagnet';

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
  /** Something was bought. `slot` is set for part purchases. */
  purchased: [kind: PurchaseKind, slot: SlotId | null];
  /** A drive run ended and its rewards were added. */
  runFinished: [summary: RunSummary];
  /** A milestone was reached (one event per milestone). */
  milestoneReached: [milestone: MilestoneDef];
};

/** What a finished run achieved. */
export interface RunSummary extends RunRewards {
  distanceKm: number;
  previousBestKm: number;
  endReason: RunState['endReason'];
  milestones: MilestoneDef[];
}

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

  get activeCar(): CarState {
    return getActiveCar(this.state.garage);
  }

  /** Current idle earnings of the active car. */
  idleRates(): IdleRates {
    const car = this.activeCar;
    return computeIdleRates(computeCarStats(car), this.state.workshop.salvageMagnetLevel, carProgress(car));
  }

  /** Buys the next part tier for a slot of the active car. Returns false if not possible. */
  buyNextTier(slot: SlotId): boolean {
    return this.afterPurchase(buyNextTier(this.activeCar, slot, this.state.resources), 'tier', slot);
  }

  /** Levels up the part in a slot of the active car. Returns false if not possible. */
  buyLevelUp(slot: SlotId): boolean {
    return this.afterPurchase(buyLevelUp(this.activeCar, slot, this.state.resources), 'level', slot);
  }

  /** Raises the Salvage Magnet one level. Returns false if maxed or unaffordable. */
  buySalvageMagnet(): boolean {
    const cost = salvageMagnetCost(this.state.workshop.salvageMagnetLevel);
    const ok = cost !== null && spend(this.state.resources, cost);
    if (ok) this.state.workshop.salvageMagnetLevel += 1;
    return this.afterPurchase(ok, 'salvageMagnet', null);
  }

  /** Fuel tanks right now (refilled up to the current time). */
  fuel(): { tanks: number; msUntilNext: number } {
    const fuel = refillFuel(this.state.run.fuel, this.now());
    return { tanks: fuel.tanks, msUntilNext: msUntilNextTank(fuel, this.now()) };
  }

  /** Starts a drive run, using one fuel tank. Returns null if there is no fuel. */
  startRun(): RunState | null {
    if (!useTank(this.state.run.fuel, this.now())) return null;
    this.save();
    const seed = this.state.createdAt + this.state.run.runsCompleted * 7919;
    return createRun(computeCarStats(this.activeCar), seed);
  }

  /** Applies a finished run: rewards, best distance, milestones. Returns what it achieved. */
  finishRun(run: RunState): RunSummary {
    const record = this.state.run;
    const previousBestKm = record.bestDistanceKm;
    const rewards = runRewards(run, previousBestKm);
    this.state.resources.money += rewards.money + rewards.bonusMoney;
    for (const id of MATERIAL_IDS) this.state.resources.materials[id] += rewards.finds[id];
    record.bestDistanceKm = Math.max(previousBestKm, run.distanceKm);
    record.runsCompleted += 1;
    const milestones = checkMilestones(this.state);
    this.save();
    const summary: RunSummary = {
      ...rewards,
      distanceKm: run.distanceKm,
      previousBestKm,
      endReason: run.endReason,
      milestones,
    };
    this.events.emit('runFinished', summary);
    this.announce(milestones);
    return summary;
  }

  /** Adds waiting offline earnings to the player's resources. Returns the money collected. */
  collectOffline(): number {
    const pending = this.state.pendingOffline;
    const money = pending.money;
    if (pending.seconds <= 0) return 0;
    this.addEarnings(pending);
    this.state.pendingOffline = emptyPendingOffline();
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

  private afterPurchase(ok: boolean, kind: PurchaseKind, slot: SlotId | null): boolean {
    if (!ok) return false;
    const milestones = checkMilestones(this.state);
    this.save();
    this.events.emit('purchased', kind, slot);
    this.announce(milestones);
    return true;
  }

  private announce(milestones: MilestoneDef[]): void {
    for (const milestone of milestones) this.events.emit('milestoneReached', milestone);
  }

  private addEarnings(earned: Earnings): void {
    const { resources, stats } = this.state;
    resources.money += earned.money;
    for (const id of MATERIAL_IDS) resources.materials[id] += earned.materials[id];
    stats.distanceKm += earned.distanceKm;
  }

  private tick(dtSeconds: number): void {
    const rates = this.idleRates();
    const materials = { ...rates.materialsPerSecond };
    for (const id of MATERIAL_IDS) materials[id] *= dtSeconds;
    this.addEarnings({
      money: rates.moneyPerSecond * dtSeconds,
      materials,
      distanceKm: rates.kmPerSecond * dtSeconds,
    });
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
      this.addEarnings(earned);
      return;
    }
    const pending = this.state.pendingOffline;
    pending.money += earned.money;
    for (const id of MATERIAL_IDS) pending.materials[id] += earned.materials[id];
    pending.distanceKm += earned.distanceKm;
    pending.seconds += earned.seconds;
    pending.capped = pending.capped || earned.capped;
    this.save();
    this.events.emit('offlineEarnings', { ...pending, materials: { ...pending.materials } });
  }
}
