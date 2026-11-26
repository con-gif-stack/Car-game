import { ECONOMY } from '../data/economy';
import { GAME_CONFIG } from '../data/gameConfig';
import { MATERIAL_IDS } from '../data/materials';
import { FixedStepClock } from './clock';
import { Emitter } from './events';
import type { DroneBranchId, FarmId } from '../data/farm';
import type { GarageUpgradeId } from '../data/garage';
import type { MaterialId } from '../data/materials';
import {
  depositDef,
  farmOf,
  FarmSim,
  farmRates,
  haulValue,
  isFarmUnlocked,
  moveAllDrones,
  moveDroneFrom,
  moveDroneTo,
  regrowDeposits,
  scavenge as scavengeDeposit,
  type FullCheck,
  type Haul,
} from './farm';
import { fitToStorage, fuelLimits, garageLevel, isFull, maxDrones, refineryRecipe, stepRefinery, storeMaterials } from './garage';
import { combineRates, computeOfflineEarnings, trickleRates, type IncomeRates } from './idle';
import type { SaveManager } from './save';
import { emptyPendingOffline, type Earnings, type GameState, type PendingOffline } from './state';
import type { MilestoneDef } from '../data/milestones';
import { checkMilestones } from './milestones';
import { createRun, msUntilNextTank, refillFuel, runRewards, useTank, type RunRewards, type RunState } from './run';
import {
  buyDrone,
  buyDroneBranch,
  buyDroneModel,
  buyGarageUpgrade,
  buyLocalUpgrade,
  buyLevelUp,
  buyNextTier,
  salvageMagnetCost,
  spend,
} from './upgrades';
import { carProgress, computeCarStats, getActiveCar, type CarState, type SlotId } from './vehicle';

export type PurchaseKind = 'tier' | 'level' | 'salvageMagnet' | 'drone' | 'droneModel' | 'droneBranch' | 'garage' | 'farmLocal';

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
  /** Drones unloaded a haul at the garage. */
  hauled: [haul: Haul];
  /** Drones were moved between farms. */
  crewsChanged: [];
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

  /** The drones flying on the farm right now (not saved). */
  readonly farmSim = new FarmSim(7);

  /** True when a material's storage is full (drones and scavenging leave it alone). */
  readonly isFull: FullCheck = (material: MaterialId) => isFull(this.state.resources, this.state.workshop, material);

  /** Most drones the garage can run right now. */
  maxDrones(): number {
    return maxDrones(this.state.workshop);
  }

  /** How many farms the drones can work at once (Relay Masts add more). */
  maxFarmsAtOnce(): number {
    return 1 + garageLevel(this.state.workshop, 'relayMasts');
  }

  isFarmUnlocked(id: FarmId): boolean {
    return isFarmUnlocked(this.state.unlockedBiomes, id);
  }

  /** Sends every drone to one farm. Returns false for a farm not unlocked yet. */
  moveAllDrones(to: FarmId): boolean {
    if (!this.isFarmUnlocked(to)) return false;
    moveAllDrones(this.state.farm, to);
    return this.afterCrewChange();
  }

  /** Moves one more drone to a farm (with Relay Masts). Returns false if not possible. */
  moveDroneTo(to: FarmId): boolean {
    if (!this.isFarmUnlocked(to) || !moveDroneTo(this.state.farm, to, this.maxFarmsAtOnce())) return false;
    return this.afterCrewChange();
  }

  /** Moves one drone away from a farm to the biggest other crew. Returns false if not possible. */
  moveDroneFrom(from: FarmId): boolean {
    if (!moveDroneFrom(this.state.farm, from)) return false;
    return this.afterCrewChange();
  }

  /** Buys the next level of a farm's own upgrade. Returns false if not possible. */
  buyLocalUpgrade(id: FarmId): boolean {
    const ok = this.isFarmUnlocked(id) && buyLocalUpgrade(this.state.farm, id, this.state.resources);
    return this.afterPurchase(ok, 'farmLocal', null);
  }

  private afterCrewChange(): boolean {
    this.save();
    this.events.emit('crewsChanged');
    return true;
  }

  /** Average idle income right now: drone hauls plus the rare-material trickle. */
  incomeRates(): IncomeRates {
    const farm = farmRates(this.state.farm, this.isFull);
    const trickle = trickleRates(this.state.workshop.salvageMagnetLevel, carProgress(this.activeCar));
    return combineRates(
      { moneyPerSecond: farm.money, materialsPerSecond: farm.materials },
      { moneyPerSecond: 0, materialsPerSecond: trickle },
    );
  }

  /** Scavenges a deposit by hand. Returns what was found, or null if the deposit is bare. */
  scavenge(depositId: string): Haul | null {
    const deposit = depositDef(depositId);
    if (!deposit || !this.isFarmUnlocked(farmOf(deposit)) || this.isFull(deposit.material)) return null;
    const haul = scavengeDeposit(this.state.farm, depositId);
    if (!haul) return null;
    this.addEarnings(haul);
    this.announce(checkMilestones(this.state));
    return haul;
  }

  /** Builds one more drone. Returns false if not possible. */
  buyDrone(): boolean {
    return this.afterPurchase(buyDrone(this.state.farm, this.state.resources, this.maxDrones()), 'drone', null);
  }

  /** Buys the next level of a drone-tree branch. Returns false if not possible. */
  buyDroneBranch(id: DroneBranchId): boolean {
    return this.afterPurchase(buyDroneBranch(this.state.farm, id, this.state.resources), 'droneBranch', null);
  }

  /** Buys the next level of a garage upgrade. Returns false if not possible. */
  buyGarageUpgrade(id: GarageUpgradeId): boolean {
    const ok = buyGarageUpgrade(this.state.workshop, id, this.state.resources);
    // A freshly built refinery starts on its first recipe.
    if (ok && id === 'refinery' && !refineryRecipe(this.state.workshop.refineryRecipe)) this.state.workshop.refineryRecipe = 'aluminum';
    return this.afterPurchase(ok, 'garage', null);
  }

  /** Picks what the refinery makes ('' stops it). Returns false for a recipe not unlocked yet. */
  setRefineryRecipe(id: string): boolean {
    const recipe = refineryRecipe(id);
    if (id !== '' && (!recipe || recipe.level > this.state.workshop.refinery)) return false;
    if (this.state.workshop.refineryRecipe !== id) this.state.workshop.refineryProgress = 0;
    this.state.workshop.refineryRecipe = id;
    this.save();
    return true;
  }

  /** Upgrades every drone to the next model. Returns false if not possible. */
  buyDroneModel(): boolean {
    return this.afterPurchase(buyDroneModel(this.state.farm, this.state.resources), 'droneModel', null);
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
  fuel(): { tanks: number; msUntilNext: number; maxTanks: number; refillMs: number } {
    const limits = fuelLimits(this.state.workshop);
    const fuel = refillFuel(this.state.run.fuel, this.now(), limits);
    return { tanks: fuel.tanks, msUntilNext: msUntilNextTank(fuel, this.now(), limits), ...limits };
  }

  /** Starts a drive run, using one fuel tank. Returns null if there is no fuel. */
  startRun(): RunState | null {
    if (!useTank(this.state.run.fuel, this.now(), fuelLimits(this.state.workshop))) return null;
    this.save();
    const seed = this.state.createdAt + this.state.run.runsCompleted * 7919;
    return createRun(computeCarStats(this.activeCar), seed);
  }

  /** Applies a finished run: rewards, best distance, milestones. Returns what it achieved. */
  finishRun(run: RunState): RunSummary {
    const record = this.state.run;
    const previousBestKm = record.bestDistanceKm;
    const found = runRewards(run, previousBestKm);
    this.state.resources.money += found.money + found.bonusMoney;
    // Finds beyond the storage limit are left behind.
    const rewards = { ...found, finds: storeMaterials(this.state.resources, this.state.workshop, found.finds) };
    record.bestDistanceKm = Math.max(previousBestKm, run.distanceKm);
    this.state.stats.distanceKm += run.distanceKm;
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

  /** Adds money and materials; materials stop at the storage limits. */
  private addEarnings(earned: Earnings): void {
    this.state.resources.money += earned.money;
    storeMaterials(this.state.resources, this.state.workshop, earned.materials);
  }

  private tick(dtSeconds: number): void {
    const { resources, workshop } = this.state;
    // Drones fly, mine and unload; what reaches the garage is stored (and paid as scrap).
    const unloaded = this.farmSim.step(this.state.farm, dtSeconds, this.isFull);
    if (MATERIAL_IDS.some((id) => unloaded.materials[id] > 0)) {
      const stored = storeMaterials(resources, workshop, unloaded.materials);
      const haul = { money: haulValue(stored), materials: stored };
      resources.money += haul.money;
      this.events.emit('hauled', haul);
    }
    // The refinery works through its recipe.
    stepRefinery(resources, workshop, dtSeconds);
    // The rare-material trickle.
    const trickle = trickleRates(workshop.salvageMagnetLevel, carProgress(this.activeCar));
    for (const id of MATERIAL_IDS) trickle[id] *= dtSeconds;
    storeMaterials(resources, workshop, trickle);
    this.state.stats.playTimeSeconds += dtSeconds;
    this.events.emit('tick', dtSeconds);
  }

  /**
   * Credits time spent away. Short absences are added straight away; longer ones are held
   * as pending earnings for the player to collect.
   */
  private applyTimeAway(awaySeconds: number): void {
    const { resources, workshop } = this.state;
    const raw = computeOfflineEarnings(this.incomeRates(), awaySeconds);
    // Deposits regrow while the player is away.
    regrowDeposits(this.state.farm, awaySeconds);
    if (raw.seconds <= 0) return;
    const pending = this.state.pendingOffline;
    // Storage fills up: hauls beyond the limit (counting earnings not yet collected) aren't made,
    // so they earn no scrap money either.
    const materials = fitToStorage(raw.materials, resources, workshop, pending.materials);
    const lost = overflow(raw.materials, materials);
    const earned = { ...raw, materials, money: Math.max(0, raw.money - haulValue(lost)) };
    // The refinery runs while away too, on the materials already in storage.
    const refined = stepRefinery(resources, workshop, raw.seconds);
    if (awaySeconds < ECONOMY.offline.minSecondsForSummary) {
      this.addEarnings(earned);
      return;
    }
    // What the refinery made is shown in the summary, so it waits there with the rest.
    for (const id of MATERIAL_IDS) {
      resources.materials[id] -= refined.produced[id];
      earned.materials[id] += refined.produced[id];
    }
    pending.money += earned.money;
    for (const id of MATERIAL_IDS) pending.materials[id] += earned.materials[id];
    pending.seconds += earned.seconds;
    pending.capped = pending.capped || earned.capped;
    this.save();
    this.events.emit('offlineEarnings', { ...pending, materials: { ...pending.materials } });
  }
}

/** The part of `wanted` that didn't fit (`wanted − fitted`, never negative). */
function overflow(wanted: Record<MaterialId, number>, fitted: Record<MaterialId, number>): Record<MaterialId, number> {
  const lost = { ...wanted };
  for (const id of MATERIAL_IDS) lost[id] = Math.max(0, wanted[id] - fitted[id]);
  return lost;
}
