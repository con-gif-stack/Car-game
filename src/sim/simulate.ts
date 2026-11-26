import { formatPrecise } from '../core/format';
import { branchLevel, DEPOSITS, farmRates, haulValue, inReach, scavenge } from '../core/farm';
import {
  fitToStorage,
  fuelLimits,
  garageLevel,
  garageUpgradeCost,
  isFull,
  maxDrones,
  refineryRecipes,
  stepRefinery,
  storageCap,
  storeMaterials,
} from '../core/garage';
import { combineRates, computeOfflineEarnings, trickleRates, type IncomeRates } from '../core/idle';
import { checkMilestones } from '../core/milestones';
import { runRewards, simulateRun, useTank } from '../core/run';
import { createNewState, type Resources } from '../core/state';
import {
  buyDroneBranch,
  buyGarageUpgrade,
  buyLevelUp,
  buyNextTier,
  buyDrone,
  buyDroneModel,
  canAfford,
  costMaterials,
  droneBranchCost,
  droneBuildCost,
  droneModelCost,
  levelUpCost,
  nextTierPart,
  salvageMagnetCost,
  spend,
  tierCost,
} from '../core/upgrades';
import { carProgress, computeCarStats, getActiveCar, getPart, type CarState, type QualityId } from '../core/vehicle';
import { BIOMES } from '../data/biomes';
import { ECONOMY, type Cost } from '../data/economy';
import { MATERIAL_IDS, MATERIALS, type MaterialId } from '../data/materials';
import { DRONE_BRANCHES, DRONE_MODELS } from '../data/farm';
import { GARAGE_UPGRADES, type GarageUpgradeId } from '../data/garage';
import { QUALITIES, SLOTS, TIER_ORDER } from '../data/vehicles';

/*
 * Balance simulator: plays the economy forward for a type of player, buying upgrades
 * sensibly, and records when each purchase and milestone happens. Used by `npm run simulate`
 * and by the balance test that enforces the one-week rule.
 */

export interface PlayerProfile {
  name: string;
  /** Taps spent scavenging by hand at each check-in. */
  tapsPerCheckIn?: number;
  /** Times per day the player opens the game, evenly spread. */
  checkInsPerDay: number;
  /** Minutes the game stays open each time. */
  sessionMinutes: number;
}

export const PROFILES: readonly PlayerProfile[] = [
  { name: 'Casual', checkInsPerDay: 2, sessionMinutes: 5 },
  { name: 'Regular', checkInsPerDay: 4, sessionMinutes: 10 },
];

export interface Purchase {
  day: number;
  kind: 'tier' | 'level' | 'magnet' | 'drone' | 'tree' | 'garage';
  label: string;
}

export interface Milestone {
  label: string;
  /** Day reached, or null if not reached within the simulation. */
  day: number | null;
}

export interface SimResult {
  profile: PlayerProfile;
  purchases: Purchase[];
  milestones: Milestone[];
  /** Longest stretch between two part-tier purchases (the required upgrades), in days. */
  longestTierWait: { days: number; endedWith: string };
  /** Longest stretch with nothing bought at all, in days. */
  longestPurchaseGap: { days: number; endedWith: string };
  /** True if every slot reached the top tier. */
  finished: boolean;
  days: number;
  /** What the player holds when the simulation ends. */
  finalResources: Resources;
  /** Day each biome was first reached on a run (null if never), in road order. */
  biomes: { name: string; day: number | null }[];
  /** Longest wait between reaching one biome and the next, in days. */
  longestBiomeWait: { days: number; endedWith: string };
  runsDriven: number;
  bestDistanceKm: number;
}

const DAY = 86_400;

interface Option {
  kind: Purchase['kind'];
  label: string;
  cost: Cost;
  buy: () => boolean;
  /** Bought as soon as it's affordable (it grows income or unblocks something). */
  priority?: boolean;
}

function lowestRank(car: CarState): number {
  let lowest = Infinity;
  for (const slot of SLOTS) {
    const part = getPart(car.parts[slot.id]?.partId);
    lowest = Math.min(lowest, part ? QUALITIES[part.quality].rank : -1);
  }
  return lowest;
}

/** Resources left after setting aside `reserve` (can go negative). */
function minus(resources: Resources, reserve: Cost): Resources {
  const materials = { ...resources.materials };
  for (const id of MATERIAL_IDS) materials[id] -= reserve.materials?.[id] ?? 0;
  return { money: resources.money - (reserve.money ?? 0), materials };
}

export function simulate(profile: PlayerProfile, maxDays = 180): SimResult {
  const state = createNewState(0);
  const car = getActiveCar(state.garage);
  const resources = state.resources;
  const workshop = state.workshop;
  const full = (id: MaterialId) => isFull(resources, workshop, id);
  let t = 0;
  let runsDriven = 0;
  const biomeDays = new Map<string, number>([[BIOMES[0]?.id ?? '', 0]]);

  const purchases: Purchase[] = [];
  const tierMilestones = TIER_ORDER.slice(1).map((quality) => ({ quality, day: null as number | null }));
  const turboMilestone: Milestone = { label: 'First turbo fitted', day: null };

  const rates = (): IncomeRates => {
    const farm = farmRates(state.farm, full);
    return combineRates(
      { moneyPerSecond: farm.money, materialsPerSecond: farm.materials },
      { moneyPerSecond: 0, materialsPerSecond: trickleRates(workshop.salvageMagnetLevel, carProgress(car)) },
    );
  };
  /** Scavenging by hand: a few taps on the deposits at each check-in (the first unlocks drones). */
  const tapDeposits = () => {
    const taps = profile.tapsPerCheckIn ?? 25;
    for (let i = 0; i < taps; i++) {
      const deposit = DEPOSITS[i % DEPOSITS.length];
      if (!deposit || !inReach(state.farm, deposit) || full(deposit.material)) continue;
      const haul = scavenge(state.farm, deposit.id);
      if (!haul) continue;
      resources.money += haul.money;
      storeMaterials(resources, workshop, haul.materials);
    }
  };
  /** Idle earnings over a stretch of time, stopping at the storage limits, plus the refinery. */
  const earn = (seconds: number, offline: boolean) => {
    const r = rates();
    const earned = offline
      ? computeOfflineEarnings(r, seconds)
      : { seconds, money: r.moneyPerSecond * seconds, materials: Object.fromEntries(MATERIAL_IDS.map((id) => [id, r.materialsPerSecond[id] * seconds])) as Record<MaterialId, number> };
    const fitted = fitToStorage(earned.materials, resources, workshop);
    const lost = Object.fromEntries(MATERIAL_IDS.map((id) => [id, earned.materials[id] - fitted[id]])) as Record<MaterialId, number>;
    resources.money += Math.max(0, earned.money - haulValue(lost));
    for (const id of MATERIAL_IDS) resources.materials[id] += fitted[id];
    stepRefinery(resources, workshop, earned.seconds);
  };

  /** Spends every fuel tank available now on drive runs, collecting rewards and milestones. */
  const driveRuns = () => {
    while (useTank(state.run.fuel, t * 1000, fuelLimits(workshop))) {
      const run = simulateRun(computeCarStats(car), 1000 + runsDriven);
      const rewards = runRewards(run, state.run.bestDistanceKm);
      resources.money += rewards.money + rewards.bonusMoney;
      storeMaterials(resources, workshop, rewards.finds);
      state.run.bestDistanceKm = Math.max(state.run.bestDistanceKm, run.distanceKm);
      state.run.runsCompleted += 1;
      runsDriven += 1;
      for (const milestone of checkMilestones(state)) {
        const biome = milestone.reward.unlockBiome;
        if (biome && !biomeDays.has(biome)) biomeDays.set(biome, t / DAY);
      }
    }
  };

  const options = (): Option[] => {
    const list: Option[] = [];
    for (const slot of SLOTS) {
      const next = nextTierPart(car, slot.id);
      if (next) {
        list.push({
          kind: 'tier',
          label: `${QUALITIES[next.quality].label} ${slot.label}`,
          cost: tierCost(next),
          buy: () => buyNextTier(car, slot.id, resources),
        });
      }
      const installed = car.parts[slot.id];
      const part = getPart(installed?.partId);
      const cost = installed && part ? levelUpCost(part, installed.level) : null;
      if (installed && cost) {
        list.push({
          kind: 'level',
          label: `${slot.label} level ${installed.level + 1}`,
          cost,
          buy: () => buyLevelUp(car, slot.id, resources),
        });
      }
    }
    const farm = state.farm;
    const limit = maxDrones(workshop);
    const buildCost = farm.droneCount >= 1 ? droneBuildCost(farm.droneCount, limit) : null;
    if (buildCost) {
      list.push({
        kind: 'drone',
        label: `Drone #${farm.droneCount + 1}`,
        cost: buildCost,
        buy: () => buyDrone(farm, resources, limit),
        priority: true,
      });
    }
    const modelCost = farm.droneCount >= 1 ? droneModelCost(farm.droneModel) : null;
    if (modelCost) {
      list.push({
        kind: 'drone',
        label: DRONE_MODELS[farm.droneModel + 1]?.name ?? 'Drone model',
        cost: modelCost,
        buy: () => buyDroneModel(farm, resources),
        priority: true,
      });
    }
    if (farm.droneCount >= 1) {
      for (const branch of DRONE_BRANCHES) {
        const cost = droneBranchCost(farm, branch.id);
        if (!cost) continue;
        list.push({
          kind: 'tree',
          label: `${branch.name} ${branchLevel(farm, branch.id) + 1}`,
          cost,
          buy: () => buyDroneBranch(farm, branch.id, resources),
          // Range opens new piles; the other branches come out of spare money.
          priority: branch.id === 'range',
        });
      }
    }
    const magnetCost = salvageMagnetCost(workshop.salvageMagnetLevel);
    if (magnetCost) {
      list.push({
        kind: 'magnet',
        label: `Salvage Magnet level ${workshop.salvageMagnetLevel + 1}`,
        cost: magnetCost,
        buy: () => spend(resources, magnetCost) && (workshop.salvageMagnetLevel += 1) > 0,
      });
    }
    for (const upgrade of GARAGE_UPGRADES) {
      const cost = garageUpgradeCost(workshop, upgrade.id);
      if (!cost) continue;
      list.push({
        kind: 'garage',
        label: `${upgrade.name} ${garageLevel(workshop, upgrade.id) + 1}`,
        cost,
        buy: () => buyGarageUpgrade(workshop, upgrade.id, resources) && pickRecipe(),
        priority: garagePriority(upgrade.id, list),
      });
    }
    return list;
  };

  /** Most of a material any upcoming purchase needs (to know when storage is too small). */
  const neededBy = (list: Option[]) => {
    const need: Partial<Record<MaterialId, number>> = {};
    for (const option of list) {
      if (option.kind !== 'tier' && option.kind !== 'drone' && !(option.kind === 'tree' && option.priority)) continue;
      for (const [id, amount] of costMaterials(option.cost)) need[id] = Math.max(need[id] ?? 0, amount);
    }
    return need;
  };

  /** When a garage upgrade is urgent: bays at the drone limit, a full warehouse or one too small for what's next. */
  const garagePriority = (id: GarageUpgradeId, list: Option[]) => {
    if (id === 'droneBays') return state.farm.droneCount >= 1 && state.farm.droneCount >= maxDrones(workshop);
    if (id === 'warehouse') {
      // Full storage stops the drones (and their money), so make room straight away.
      const need = neededBy(list);
      return MATERIAL_IDS.some((m) => (need[m] ?? 0) > storageCap(workshop, m) || full(m));
    }
    return false;
  };

  /** Runs the refinery on whatever the next purchases lack most, rarest first. */
  const pickRecipe = () => {
    const recipes = refineryRecipes(garageLevel(workshop, 'refinery'));
    if (recipes.length === 0) return true;
    const need = neededBy(options());
    const lacking = (m: MaterialId) => (need[m] ?? 0) > resources.materials[m];
    const byRarity = [...recipes].reverse();
    const choice = byRarity.find((r) => Object.keys(r.outputs).some((m) => lacking(m as MaterialId))) ?? recipes.find((r) => r.id === 'aluminum');
    if (choice) workshop.refineryRecipe = choice.id;
    return true;
  };

  /**
   * Strategy: buy any affordable new tier or drone upgrade first (drones grow income). Otherwise
   * save for the cheapest tier that only lacks money, and spend the surplus on levels and the
   * magnet, cheapest first.
   */
  const shop = () => {
    for (;;) {
      const all = options();
      const byMoney = (a: Option, b: Option) => (a.cost.money ?? 0) - (b.cost.money ?? 0);
      const tiers = all.filter((o) => o.kind === 'tier').sort(byMoney);
      const affordableTier = tiers.find((o) => canAfford(resources, o.cost));
      const affordableDrone = all.filter((o) => o.priority).sort(byMoney).find((o) => canAfford(resources, o.cost));
      let pick = affordableTier ?? affordableDrone;
      if (!pick) {
        const goal = tiers.find((o) => canAfford({ ...resources, money: Infinity }, o.cost));
        const surplus = minus(resources, goal?.cost ?? {});
        pick = all.filter((o) => o.kind !== 'tier' && !o.priority && canAfford(surplus, o.cost)).sort(byMoney)[0];
      }
      if (!pick || !pick.buy()) return;
      purchases.push({ day: t / DAY, kind: pick.kind, label: pick.label });
    }
  };

  const recordMilestones = () => {
    const rank = lowestRank(car);
    for (const m of tierMilestones) {
      if (m.day === null && rank >= QUALITIES[m.quality].rank) m.day = t / DAY;
    }
    if (turboMilestone.day === null && car.parts.turbo) turboMilestone.day = t / DAY;
  };

  const gap = DAY / profile.checkInsPerDay;
  const session = profile.sessionMinutes * 60;
  const topRank = TIER_ORDER.length - 1;

  while (t < maxDays * DAY) {
    // Each check-in: drive runs on whatever fuel has refilled, then shop, then drive again
    // if new parts were bought (players like to test upgrades straight away).
    tapDeposits();
    checkMilestones(state);
    driveRuns();
    shop();
    pickRecipe();
    driveRuns();
    checkMilestones(state);
    recordMilestones();
    if (lowestRank(car) >= topRank) break;
    earn(session, false);
    earn(gap - session, true);
    t += gap;
  }

  const gapsBetween = (list: Purchase[]) => {
    let worst = { days: 0, endedWith: '' };
    let previous = 0;
    for (const p of list) {
      if (p.day - previous > worst.days) worst = { days: p.day - previous, endedWith: p.label };
      previous = p.day;
    }
    return worst;
  };

  const tierLabel = (q: QualityId) => `All parts ${QUALITIES[q].label} or better`;
  // Biomes in road order (the last, endless one has no unlock milestone).
  const biomes = BIOMES.slice(0, -1).map((b) => ({ name: b.name, day: biomeDays.get(b.id) ?? null }));
  let longestBiomeWait = { days: 0, endedWith: '' };
  for (let i = 1; i < biomes.length; i++) {
    const prev = biomes[i - 1]?.day;
    const next = biomes[i]?.day ?? null;
    const wait = (next ?? t / DAY) - (prev ?? t / DAY);
    if (wait > longestBiomeWait.days) longestBiomeWait = { days: wait, endedWith: biomes[i]?.name ?? '' };
  }
  return {
    biomes,
    longestBiomeWait,
    runsDriven,
    bestDistanceKm: state.run.bestDistanceKm,
    profile,
    purchases,
    milestones: [
      ...tierMilestones.slice(0, 1).map((m) => ({ label: tierLabel(m.quality), day: m.day })),
      turboMilestone,
      ...tierMilestones.slice(1).map((m) => ({ label: tierLabel(m.quality), day: m.day })),
    ],
    longestTierWait: gapsBetween(purchases.filter((p) => p.kind === 'tier')),
    longestPurchaseGap: gapsBetween(purchases),
    finished: lowestRank(car) >= topRank,
    days: t / DAY,
    finalResources: resources,
  };
}

const fmtDay = (day: number) => (day < 1 ? `${(day * 24).toFixed(1)}h` : `day ${day.toFixed(1)}`);

/** A readable report of one simulation. */
export function formatReport(result: SimResult): string {
  const lines: string[] = [];
  const p = result.profile;
  lines.push(`=== ${p.name} player: ${p.checkInsPerDay} check-ins a day, ${p.sessionMinutes} min each ===`);
  const fuel = fuelLimits(createNewState(0).workshop);
  lines.push(
    `Offline cap ${ECONOMY.offline.capHours}h · fuel to start: ${fuel.maxTanks} tanks, one per ${fuel.refillMs / 60_000} min`,
  );
  lines.push('');
  lines.push(`Biomes reached on runs (${result.runsDriven} runs, best ${result.bestDistanceKm.toFixed(1)} km):`);
  for (const b of result.biomes) lines.push(`  ${b.name.padEnd(34)} ${b.day === null ? 'not reached' : fmtDay(b.day)}`);
  lines.push(
    `  Longest wait for the next biome: ${result.longestBiomeWait.days.toFixed(2)} days (${result.longestBiomeWait.endedWith})`,
  );
  lines.push('');
  lines.push('Milestones:');
  for (const m of result.milestones) lines.push(`  ${m.label.padEnd(34)} ${m.day === null ? 'not reached' : fmtDay(m.day)}`);
  lines.push('');
  lines.push('Part tiers bought:');
  for (const purchase of result.purchases.filter((x) => x.kind === 'tier')) {
    lines.push(`  ${fmtDay(purchase.day).padEnd(10)} ${purchase.label}`);
  }
  const counts = { level: 0, magnet: 0, drone: 0, tree: 0, garage: 0 };
  for (const purchase of result.purchases) if (purchase.kind !== 'tier') counts[purchase.kind] += 1;
  lines.push(
    `  (plus ${counts.level} part levels, ${counts.magnet} Salvage Magnet levels, ${counts.drone} drones and models, ` +
      `${counts.tree} drone-tree levels and ${counts.garage} garage upgrades)`,
  );
  lines.push('Drones, models and Range:');
  for (const purchase of result.purchases.filter((x) => x.kind === 'drone' || (x.kind === 'tree' && x.label.startsWith('Range')))) {
    lines.push(`  ${fmtDay(purchase.day).padEnd(10)} ${purchase.label}`);
  }
  lines.push('Garage upgrades:');
  for (const purchase of result.purchases.filter((x) => x.kind === 'garage')) {
    lines.push(`  ${fmtDay(purchase.day).padEnd(10)} ${purchase.label}`);
  }
  const tree = result.purchases.filter((x) => x.kind === 'tree' && !x.label.startsWith('Range'));
  const last = new Map<string, Purchase>();
  for (const purchase of tree) last.set(purchase.label.replace(/ \d+$/, ''), purchase);
  lines.push(
    'Drone tree reached: ' + ([...last.values()].map((x) => `${x.label} (${fmtDay(x.day)})`).join(', ') || 'nothing'),
  );
  lines.push('');
  lines.push(
    `Longest wait between part tiers: ${result.longestTierWait.days.toFixed(2)} days (ending with ${result.longestTierWait.endedWith})`,
  );
  lines.push(
    `Longest time with nothing to buy: ${result.longestPurchaseGap.days.toFixed(2)} days (ending with ${result.longestPurchaseGap.endedWith})`,
  );
  lines.push(result.finished ? `Every slot at the top tier by ${fmtDay(result.days)}.` : 'Did not reach the top tier everywhere.');
  lines.push(
    'Left over at the end: ' +
      MATERIALS.map((m) => `${m.name} ${formatPrecise(result.finalResources.materials[m.id])}`).join(', '),
  );
  return lines.join('\n');
}
