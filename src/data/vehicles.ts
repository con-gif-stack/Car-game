import type {
  CarModelDef,
  PartDef,
  QualityDef,
  QualityId,
  SlotDef,
  SlotId,
  StatBlock,
  StatDef,
} from '../core/vehicle';

/*
 * Vehicle data: stats, part slots, part tiers, parts and car models.
 * All numbers here are placeholders; tune them with `npm run simulate`.
 */

/** Car stats, in the order they are shown. */
export const STATS: readonly StatDef[] = [
  // Bars are full for a fully upgraded Race-tier car (raise these when later tiers arrive).
  { id: 'power', label: 'Power', unit: 'hp', displayMax: 700 },
  { id: 'grip', label: 'Grip', displayMax: 160 },
  { id: 'handling', label: 'Handling', displayMax: 160 },
  { id: 'efficiency', label: 'Fuel Efficiency', displayMax: 200 },
  { id: 'durability', label: 'Durability', displayMax: 120 },
];

/** Part slots, in the order they are shown (design doc section 3A). */
export const SLOTS: readonly SlotDef[] = [
  { id: 'engine', label: 'Engine' },
  { id: 'transmission', label: 'Transmission' },
  { id: 'tires', label: 'Tires' },
  { id: 'suspension', label: 'Suspension' },
  { id: 'brakes', label: 'Brakes' },
  { id: 'exhaust', label: 'Exhaust' },
  { id: 'turbo', label: 'Turbo' },
  { id: 'fuelSystem', label: 'Fuel System' },
];

/** Part tiers, lowest first. Each tier replaces the last with a big jump in stats. */
export const QUALITIES: Record<QualityId, QualityDef> = {
  worn: { id: 'worn', label: 'Worn', color: 0xb3652d, rank: 0 },
  used: { id: 'used', label: 'Used', color: 0xa3abbb, rank: 1 },
  street: { id: 'street', label: 'Street', color: 0x5ccf6a, rank: 2 },
  sport: { id: 'sport', label: 'Sport', color: 0x3fa9f5, rank: 3 },
  race: { id: 'race', label: 'Race', color: 0xff9f1c, rank: 4 },
};

export const TIER_ORDER: readonly QualityId[] = ['worn', 'used', 'street', 'sport', 'race'];

/**
 * Stat multiplier for each tier, applied to the slot's base stats. Each tier must beat the
 * previous tier at max level, so a new tier is always an upgrade (checked by a test).
 */
export const TIER_STAT_MULTIPLIERS: Record<QualityId, number> = {
  worn: 1,
  used: 1.6,
  street: 2.6,
  sport: 4.2,
  race: 6.8,
};

interface SlotPartLine {
  /** Stats a Worn part in this slot gives at level 1; higher tiers scale these. */
  baseStats: Partial<StatBlock>;
  /** Name and description per tier, Worn first. null = no part at that tier. */
  tiers: readonly ([name: string, description: string] | null)[];
}

const PART_LINES: Record<SlotId, SlotPartLine> = {
  engine: {
    baseStats: { power: 52, efficiency: 6, durability: 4 },
    tiers: [
      ['Tired 1.3L Four', 'Starts on the third try. Burns a little oil.'],
      ['Used 1.6L Four', 'Some miles on it, but it pulls.'],
      ['Street 2.0L Four', 'Rev-happy and ready for the city.'],
      ['Sport 2.5L Six', 'Smooth, strong and hungry for the redline.'],
      ['Race 3.0L V8', 'Built to win. Barely street legal.'],
    ],
  },
  transmission: {
    baseStats: { power: 3, efficiency: 4 },
    tiers: [
      ['Sloppy 4-Speed', 'Second gear grinds if you rush it.'],
      ['Used 5-Speed', 'An extra gear for the highway.'],
      ['Street Short-Shift 5', 'Quick, crisp shifts.'],
      ['Sport Close-Ratio 6', 'Keeps the engine in its sweet spot.'],
      ['Race Sequential 6', 'Bang-bang shifts, no clutch needed.'],
    ],
  },
  tires: {
    baseStats: { grip: 12, handling: 4 },
    tiers: [
      ['Bald Tires', 'More slick than tread.'],
      ['Used All-Seasons', 'Tread you can actually see.'],
      ['Street Performance Tires', 'Sticky on warm tarmac.'],
      ['Sport Semi-Slicks', 'Barely-there tread, serious grip.'],
      ['Race Slicks', 'Pure rubber. Pure grip.'],
    ],
  },
  suspension: {
    baseStats: { grip: 4, handling: 6, durability: 3 },
    tiers: [
      ['Saggy Springs', 'Every bump, felt twice.'],
      ['Used Shocks', 'Bounces a little less.'],
      ['Street Lowering Kit', 'Sits low and turns flat.'],
      ['Sport Coilovers', 'Adjustable and planted.'],
      ['Race Adjustable Coilovers', 'Tuned to the millimetre.'],
    ],
  },
  brakes: {
    baseStats: { handling: 5, durability: 4 },
    tiers: [
      ['Squeaky Drums', 'They stop the car. Eventually.'],
      ['Used Disc Brakes', 'Stops when you ask, mostly.'],
      ['Street Slotted Discs', 'Cool-running and confident.'],
      ['Sport 4-Piston Calipers', 'Late braking, every corner.'],
      ['Race Carbon Brakes', 'Glows red. Stops dead.'],
    ],
  },
  exhaust: {
    baseStats: { power: 3, efficiency: 2 },
    tiers: [
      ['Rusted Muffler', 'Loud for all the wrong reasons.'],
      ['Used Muffler', 'Quieter, and no holes.'],
      ['Street Cat-Back', 'A deeper note and a bit more pull.'],
      ['Sport Headers', 'Lets the engine breathe.'],
      ['Race Straight Pipe', 'Wakes up the whole street.'],
    ],
  },
  turbo: {
    baseStats: { power: 14 },
    tiers: [
      null,
      ['Used Small Turbo', 'A little spool, a little push.'],
      ['Street Turbo Kit', 'Real boost for real roads.'],
      ['Sport Twin-Scroll Turbo', 'Boost arrives early and stays.'],
      ['Race Big Turbo', 'Lag, then a lot of everything.'],
    ],
  },
  fuelSystem: {
    baseStats: { efficiency: 8 },
    tiers: [
      ['Leaky Fuel Pump', 'Most of the fuel makes it to the engine.'],
      ['Used Fuel Pump', 'No more puddles under the car.'],
      ['Street Injectors', 'Clean, even fuelling.'],
      ['Sport High-Flow Pump', 'Feeds a hungry engine.'],
      ['Race Fuel Cell', 'Safe, light and holds plenty.'],
    ],
  },
};

/** Part id for a slot and tier, e.g. "engine-street". */
export function partId(slot: SlotId, quality: QualityId): string {
  return `${slot}-${quality}`;
}

function buildParts(): PartDef[] {
  const parts: PartDef[] = [];
  for (const slot of SLOTS) {
    const line = PART_LINES[slot.id];
    TIER_ORDER.forEach((quality, rank) => {
      const entry = line.tiers[rank];
      if (!entry) return;
      const multiplier = TIER_STAT_MULTIPLIERS[quality];
      const stats: Partial<StatBlock> = {};
      for (const [stat, value] of Object.entries(line.baseStats) as [keyof StatBlock, number][]) {
        stats[stat] = Math.round(value * multiplier * 10) / 10;
      }
      parts.push({ id: partId(slot.id, quality), slot: slot.id, name: entry[0], description: entry[1], quality, stats });
    });
  }
  return parts;
}

export const PARTS: Readonly<Record<string, PartDef>> = Object.fromEntries(
  buildParts().map((part) => [part.id, part]),
);

export const CAR_MODELS: Readonly<Record<string, CarModelDef>> = {
  rustbucket: {
    id: 'rustbucket',
    name: 'Rustbucket',
    description: 'An old hatchback held together by rust and hope.',
    baseStats: { handling: 4, durability: 10 },
    starterParts: {
      engine: 'engine-worn',
      transmission: 'transmission-worn',
      tires: 'tires-worn',
      suspension: 'suspension-worn',
      brakes: 'brakes-worn',
      exhaust: 'exhaust-worn',
      turbo: null,
      fuelSystem: 'fuelSystem-worn',
    },
  },
};

/** The car every new player starts with. */
export const STARTER_MODEL_ID = 'rustbucket';
