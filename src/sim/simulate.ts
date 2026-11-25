import { formatPrecise } from '../core/format';
import { computeIdleRates, computeOfflineEarnings } from '../core/idle';
import { emptyResources, type Resources } from '../core/state';
import {
  buyLevelUp,
  buyNextTier,
  canAfford,
  levelUpCost,
  nextTierPart,
  salvageMagnetCost,
  spend,
  tierCost,
} from '../core/upgrades';
import { carProgress, computeCarStats, createCar, getPart, type CarState, type QualityId } from '../core/vehicle';
import { ECONOMY, PLANNED_RUNS, type Cost } from '../data/economy';
import { MATERIAL_IDS, MATERIALS } from '../data/materials';
import { QUALITIES, SLOTS, STARTER_MODEL_ID, TIER_ORDER } from '../data/vehicles';

/*
 * Balance simulator: plays the economy forward for a type of player, buying upgrades
 * sensibly, and records when each purchase and milestone happens. Used by `npm run simulate`
 * and by the balance test that enforces the one-week rule.
 */

export interface PlayerProfile {
  name: string;
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
  kind: 'tier' | 'level' | 'magnet';
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
}

const DAY = 86_400;

interface Option {
  kind: Purchase['kind'];
  label: string;
  cost: Cost;
  buy: () => boolean;
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
  const car = createCar('sim', STARTER_MODEL_ID);
  const resources = emptyResources();
  let magnetLevel = 0;
  let t = 0;
  let lastRunDay = -1;

  const purchases: Purchase[] = [];
  const tierMilestones = TIER_ORDER.slice(1).map((quality) => ({ quality, day: null as number | null }));
  const turboMilestone: Milestone = { label: 'First turbo fitted', day: null };

  const rates = () => computeIdleRates(computeCarStats(car), magnetLevel, carProgress(car));
  const earn = (seconds: number, offline: boolean) => {
    const r = rates();
    if (offline) {
      const earned = computeOfflineEarnings(r, seconds);
      resources.money += earned.money;
      for (const id of MATERIAL_IDS) resources.materials[id] += earned.materials[id];
    } else {
      resources.money += r.moneyPerSecond * seconds;
      for (const id of MATERIAL_IDS) resources.materials[id] += r.materialsPerSecond[id] * seconds;
    }
  };

  const runRewards = () => {
    const progress = carProgress(car);
    const scale =
      (computeCarStats(car).power / 58) ** PLANNED_RUNS.powerExponent * (1 + PLANNED_RUNS.progressBonus * progress);
    for (const [id, amount] of Object.entries(PLANNED_RUNS.materialsPerRun)) {
      resources.materials[id as keyof typeof resources.materials] += (amount ?? 0) * scale * PLANNED_RUNS.runsPerDay;
    }
    if (progress >= PLANNED_RUNS.ceramicFromProgress) {
      resources.materials.ceramic += PLANNED_RUNS.ceramicPerRun * scale * PLANNED_RUNS.runsPerDay;
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
    const magnetCost = salvageMagnetCost(magnetLevel);
    if (magnetCost) {
      list.push({
        kind: 'magnet',
        label: `Salvage Magnet level ${magnetLevel + 1}`,
        cost: magnetCost,
        buy: () => spend(resources, magnetCost) && (magnetLevel += 1) > 0,
      });
    }
    return list;
  };

  /**
   * Strategy: buy any affordable new tier first. Otherwise save for the cheapest tier that only
   * lacks money, and spend the surplus on levels and the magnet, cheapest first.
   */
  const shop = () => {
    for (;;) {
      const all = options();
      const byMoney = (a: Option, b: Option) => (a.cost.money ?? 0) - (b.cost.money ?? 0);
      const tiers = all.filter((o) => o.kind === 'tier').sort(byMoney);
      const affordableTier = tiers.find((o) => canAfford(resources, o.cost));
      let pick = affordableTier;
      if (!pick) {
        const goal = tiers.find((o) => canAfford({ ...resources, money: Infinity }, o.cost));
        const surplus = minus(resources, goal?.cost ?? {});
        pick = all.filter((o) => o.kind !== 'tier' && canAfford(surplus, o.cost)).sort(byMoney)[0];
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
    // Driving runs (assumed until Step 5): the day's runs happen at the first check-in.
    const day = Math.floor(t / DAY);
    if (day > lastRunDay) {
      lastRunDay = day;
      runRewards();
    }
    shop();
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
  return {
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
  lines.push(`Offline cap ${ECONOMY.offline.capHours}h · runs assumed: ${PLANNED_RUNS.runsPerDay}/day`);
  lines.push('');
  lines.push('Milestones:');
  for (const m of result.milestones) lines.push(`  ${m.label.padEnd(34)} ${m.day === null ? 'not reached' : fmtDay(m.day)}`);
  lines.push('');
  lines.push('Part tiers bought:');
  for (const purchase of result.purchases.filter((x) => x.kind === 'tier')) {
    lines.push(`  ${fmtDay(purchase.day).padEnd(10)} ${purchase.label}`);
  }
  const counts = { level: 0, magnet: 0 };
  for (const purchase of result.purchases) if (purchase.kind !== 'tier') counts[purchase.kind] += 1;
  lines.push(`  (plus ${counts.level} part levels and ${counts.magnet} Salvage Magnet levels)`);
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
