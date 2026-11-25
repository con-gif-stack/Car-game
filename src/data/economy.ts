import type { QualityId, SlotId, StatId } from '../core/vehicle';

/*
 * Economy numbers: what the car earns and what upgrades cost.
 * Placeholders, tuned with `npm run simulate` against the one-week rule. Change them here, not in code.
 */

/** A price in one or more resources. Missing = free in that resource. */
export interface Cost {
  money?: number;
  materials?: number;
  rareMaterials?: number;
}

/** Cost that grows each level: base × growth^(level − 1). */
export interface CostCurve {
  base: number;
  growth: number;
}

/** A resource earned per km, scaled by how a car stat compares with the starter car's. */
export interface StatScaling {
  stat: StatId;
  /** Stat value that gives ×1 (the starter car's value). */
  reference: number;
}

export const ECONOMY = {
  idleDriving: {
    /** Idle cruising speed with zero power (km/h). */
    baseSpeedKmh: 20,
    /** Extra idle speed per point of Power (km/h). */
    speedKmhPerPower: 0.35,
    /** Money per km for the starter car (~1 per second at ~40 km/h). */
    moneyPerKm: 90,
    /** Better fuel efficiency = more money per km. */
    moneyScaling: { stat: 'efficiency', reference: 20 } as StatScaling,
    /** Materials salvaged per km for the starter car (~20 per hour). */
    materialsPerKm: 0.5,
    /** Better grip reaches more roadside scrap = more materials per km. */
    materialsScaling: { stat: 'grip', reference: 16 } as StatScaling,
  },
  /**
   * A very small idle trickle of rare materials (runs are the main source, from Step 5).
   * Upgraded with the Salvage Magnet.
   */
  rareTrickle: {
    basePerHour: 0.1,
    perLevelPerHour: 0.05,
    maxLevel: 10,
    cost: {
      money: { base: 400, growth: 2.3 } as CostCurve,
      materials: { base: 40, growth: 2.1 } as CostCurve,
    },
  },
  offline: {
    /** Longest time away that still earns (open question 5; placeholder). */
    capHours: 8,
    /** Share of the normal idle rate earned while away (1 = full rate). */
    efficiency: 1,
    /** Shorter absences are added straight away, without the "Welcome back" summary. */
    minSecondsForSummary: 60,
  },
} as const;

/** Part levels within a tier: small, steady boosts bought with money. */
export const PART_LEVELS = {
  maxLevel: 5,
  /** Each level above 1 adds this share of the part's level-1 stats. */
  bonusPerLevel: 0.1,
};

/** Price of buying each tier of part (replacing the one installed). Worn parts are never bought. */
export const TIER_COSTS: Record<Exclude<QualityId, 'worn'>, Cost> = {
  used: { money: 600, materials: 60 },
  street: { money: 9_000, materials: 450, rareMaterials: 3 },
  sport: { money: 110_000, materials: 3_200, rareMaterials: 14 },
  race: { money: 1_300_000, materials: 22_000, rareMaterials: 60 },
};

/** Money price of levelling a part of each tier, from level 1 to 2; later levels cost more. */
export const LEVEL_COSTS: Record<QualityId, CostCurve> = {
  worn: { base: 40, growth: 1.7 },
  used: { base: 450, growth: 1.7 },
  street: { base: 6_000, growth: 1.7 },
  sport: { base: 70_000, growth: 1.7 },
  race: { base: 800_000, growth: 1.7 },
};

/** Some slots are pricier than others. Multiplies both tier and level costs. */
export const SLOT_COST_MULTIPLIERS: Record<SlotId, number> = {
  engine: 1.5,
  transmission: 1.1,
  tires: 0.8,
  suspension: 1,
  brakes: 0.8,
  exhaust: 0.7,
  turbo: 1.3,
  fuelSystem: 0.8,
};

/**
 * ASSUMPTION used only by the balance simulator until driving runs exist (Step 5):
 * how many rare materials runs give per day. Step 5 replaces this with real run rewards.
 */
export const PLANNED_RUNS = {
  runsPerDay: 2,
  /** Rare materials per run for the starter car. */
  rarePerRun: 2,
  /** Rewards grow with the car: × (power / 58) ^ this. */
  powerExponent: 0.6,
};
