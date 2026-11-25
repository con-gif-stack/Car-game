import type { CarModelDef, PartDef, QualityDef, QualityId, SlotDef, StatDef } from '../core/vehicle';

/*
 * Vehicle data: stats, part slots, parts and car models.
 * All numbers here are placeholders until the economy is balanced in Steps 3–4.
 */

/** Car stats, in the order they are shown. */
export const STATS: readonly StatDef[] = [
  { id: 'power', label: 'Power', unit: 'hp', displayMax: 300 },
  { id: 'grip', label: 'Grip', displayMax: 100 },
  { id: 'handling', label: 'Handling', displayMax: 100 },
  { id: 'efficiency', label: 'Fuel Efficiency', displayMax: 100 },
  { id: 'durability', label: 'Durability', displayMax: 100 },
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

export const QUALITIES: Record<QualityId, QualityDef> = {
  worn: { id: 'worn', label: 'Worn', color: 0xb3652d },
};

const partList: PartDef[] = [
  {
    id: 'worn-engine',
    slot: 'engine',
    name: 'Tired 1.3L Four',
    description: 'Starts on the third try. Burns a little oil.',
    quality: 'worn',
    stats: { power: 52, efficiency: 6, durability: 4 },
  },
  {
    id: 'worn-transmission',
    slot: 'transmission',
    name: 'Sloppy 4-Speed',
    description: 'Second gear grinds if you rush it.',
    quality: 'worn',
    stats: { power: 3, efficiency: 4 },
  },
  {
    id: 'bald-tires',
    slot: 'tires',
    name: 'Bald Tires',
    description: 'More slick than tread.',
    quality: 'worn',
    stats: { grip: 12, handling: 4 },
  },
  {
    id: 'saggy-suspension',
    slot: 'suspension',
    name: 'Saggy Springs',
    description: 'Every bump, felt twice.',
    quality: 'worn',
    stats: { grip: 4, handling: 6, durability: 3 },
  },
  {
    id: 'squeaky-brakes',
    slot: 'brakes',
    name: 'Squeaky Drums',
    description: 'They stop the car. Eventually.',
    quality: 'worn',
    stats: { handling: 5, durability: 4 },
  },
  {
    id: 'rusted-exhaust',
    slot: 'exhaust',
    name: 'Rusted Muffler',
    description: 'Loud for all the wrong reasons.',
    quality: 'worn',
    stats: { power: 3, efficiency: 2 },
  },
  {
    id: 'leaky-fuel-pump',
    slot: 'fuelSystem',
    name: 'Leaky Fuel Pump',
    description: 'Most of the fuel makes it to the engine.',
    quality: 'worn',
    stats: { efficiency: 8 },
  },
];

export const PARTS: Readonly<Record<string, PartDef>> = Object.fromEntries(
  partList.map((part) => [part.id, part]),
);

export const CAR_MODELS: Readonly<Record<string, CarModelDef>> = {
  rustbucket: {
    id: 'rustbucket',
    name: 'Rustbucket',
    description: 'An old hatchback held together by rust and hope.',
    baseStats: { handling: 4, durability: 10 },
    starterParts: {
      engine: 'worn-engine',
      transmission: 'worn-transmission',
      tires: 'bald-tires',
      suspension: 'saggy-suspension',
      brakes: 'squeaky-brakes',
      exhaust: 'rusted-exhaust',
      turbo: null,
      fuelSystem: 'leaky-fuel-pump',
    },
  },
};

/** The car every new player starts with. */
export const STARTER_MODEL_ID = 'rustbucket';
