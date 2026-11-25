import type { QualityId, SlotId, StatId } from '../core/vehicle';
import type { MaterialId } from './materials';

/*
 * Economy numbers: what the car earns and what upgrades cost.
 * Placeholders, tuned with `npm run simulate` against the one-week rule. Change them here, not in code.
 */

export type MaterialAmounts = Partial<Record<MaterialId, number>>;

/** A price in money and/or materials. Missing = free in that resource. */
export interface Cost {
  money?: number;
  materials?: MaterialAmounts;
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
    /** Better grip reaches more roadside scrap = more distance-based materials per km. */
    materialsScaling: { stat: 'grip', reference: 16 } as StatScaling,
  },
  /**
   * The Salvage Magnet boosts the idle trickle of Rare-and-above materials
   * (runs are their main source, from Step 5).
   */
  salvageMagnet: {
    /** Each level adds this share of the base trickle (level 10 = ×6). */
    bonusPerLevel: 0.5,
    maxLevel: 10,
    cost: {
      money: { base: 400, growth: 2.3 } as CostCurve,
      scrapMetal: { base: 30, growth: 2 } as CostCurve,
      copperWire: { base: 6, growth: 2 } as CostCurve,
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

type BuyableTier = Exclude<QualityId, 'worn'>;

/** Money price of buying each tier of part, before the slot multiplier. */
export const TIER_MONEY_COSTS: Record<BuyableTier, number> = {
  used: 600,
  street: 9_000,
  sport: 110_000,
  race: 1_560_000,
};

/**
 * Materials needed to build each part, chosen to match what the real part is made of.
 * Rare materials appear from Street (in a few slots), Epic Ceramic from Sport.
 */
export const PART_RECIPES: Record<SlotId, Record<BuyableTier, MaterialAmounts>> = {
  engine: {
    used: { scrapMetal: 40, copperWire: 6, aluminum: 6 },
    street: { scrapMetal: 250, aluminum: 50, copperWire: 40, titanium: 2 },
    sport: { scrapMetal: 3000, aluminum: 600, copperWire: 500, titanium: 48 },
    race: { scrapMetal: 24000, aluminum: 5400, copperWire: 4500, titanium: 234, ceramic: 57 },
  },
  transmission: {
    used: { scrapMetal: 30, aluminum: 4 },
    street: { scrapMetal: 180, aluminum: 40 },
    sport: { scrapMetal: 2000, aluminum: 500 },
    race: { scrapMetal: 15000, aluminum: 3900, carbonFiber: 117 },
  },
  tires: {
    used: { rubber: 30, scrapMetal: 10 },
    street: { rubber: 220, scrapMetal: 40 },
    sport: { rubber: 2600, scrapMetal: 400 },
    race: { rubber: 21000, carbonFiber: 99 },
  },
  suspension: {
    used: { scrapMetal: 25, rubber: 10 },
    street: { scrapMetal: 150, rubber: 60, aluminum: 30 },
    sport: { scrapMetal: 1600, rubber: 600, aluminum: 400, titanium: 26 },
    race: { scrapMetal: 12000, rubber: 4500, aluminum: 3000, titanium: 156 },
  },
  brakes: {
    used: { scrapMetal: 30 },
    street: { scrapMetal: 180, copperWire: 30 },
    sport: { scrapMetal: 1800, copperWire: 300, ceramic: 9 },
    race: { scrapMetal: 12000, carbonFiber: 117, ceramic: 78 },
  },
  exhaust: {
    used: { scrapMetal: 25 },
    street: { scrapMetal: 160 },
    sport: { scrapMetal: 1800, titanium: 33 },
    race: { scrapMetal: 15000, titanium: 195 },
  },
  turbo: {
    used: { aluminum: 8, copperWire: 6, scrapMetal: 20 },
    street: { aluminum: 60, copperWire: 40, titanium: 3 },
    sport: { aluminum: 800, copperWire: 500, titanium: 59 },
    race: { aluminum: 6600, titanium: 260, ceramic: 57 },
  },
  fuelSystem: {
    used: { rubber: 15, copperWire: 4 },
    street: { rubber: 100, copperWire: 30, aluminum: 25 },
    sport: { rubber: 1200, copperWire: 300, aluminum: 300 },
    race: { rubber: 9000, copperWire: 2400, aluminum: 2400, carbonFiber: 78 },
  },
};

/** Money price of levelling a part of each tier, from level 1 to 2; later levels cost more. */
export const LEVEL_COSTS: Record<QualityId, CostCurve> = {
  worn: { base: 40, growth: 1.7 },
  used: { base: 450, growth: 1.7 },
  street: { base: 6_000, growth: 1.7 },
  sport: { base: 70_000, growth: 1.7 },
  race: { base: 800_000, growth: 1.7 },
};

/** Some slots are pricier than others. Multiplies money costs (tiers and levels). */
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

/** Drive runs: how the car's stats turn into speed, fuel and toughness on the road. */
export const RUN_TUNING = {
  /** Top speed of the starter car (58 hp), in km/h. */
  baseSpeedKmh: 70,
  /** Top speed grows as (power / 58) ^ this, so upgraded cars race through early biomes. */
  speedPowerExponent: 1.4,
  /** Seconds of driving on a full tank for the starter car (fuel efficiency 20) in the Junkyard. */
  baseTankSeconds: 60,
  /** Tank time grows as (fuel efficiency / 20) ^ this. */
  tankEfficiencyExponent: 0.35,
  /** Car health of the starter car (durability 21). */
  baseHealth: 100,
  /** Health grows as (durability / 21) ^ this. */
  healthDurabilityExponent: 0.8,
  /** Speed multiplier is (traction / grip demand) ^ this when traction falls short… */
  tractionExponent: 0.8,
  /** …but never below this share of top speed. */
  minTractionFactor: 0.2,
  /** Each run's luck multiplies material finds by a random value in this range. */
  findLuck: { min: 0.7, max: 1.3 },
  /** Extra money per km of new ground beyond the previous best (× the biome's pay). */
  newBestBonus: 1,
};

/** Fuel tanks: each run uses one; they refill over time. */
export const FUEL_TANKS = {
  max: 3,
  refillMinutes: 40,
};
