import { PART_LEVELS } from '../data/economy';
import { CAR_MODELS, PARTS, SLOTS, STARTER_MODEL_ID, STATS } from '../data/vehicles';

export type StatId = 'power' | 'grip' | 'handling' | 'efficiency' | 'durability';
export type SlotId =
  | 'engine'
  | 'transmission'
  | 'tires'
  | 'suspension'
  | 'brakes'
  | 'exhaust'
  | 'turbo'
  | 'fuelSystem';
/** Part tiers, lowest first. */
export type QualityId = 'worn' | 'used' | 'street' | 'sport' | 'race';

export type StatBlock = Record<StatId, number>;

export interface StatDef {
  id: StatId;
  label: string;
  /** Unit shown after the value, if any (e.g. "hp"). */
  unit?: string;
  /** Value at which the stat bar is full. Placeholder until the economy is balanced. */
  displayMax: number;
}

export interface SlotDef {
  id: SlotId;
  label: string;
}

export interface QualityDef {
  id: QualityId;
  label: string;
  color: number;
  /** Position in the tier ladder: 0 = worn. */
  rank: number;
}

export interface PartDef {
  id: string;
  slot: SlotId;
  name: string;
  description: string;
  quality: QualityId;
  /** What the part adds to the car's stats at level 1. */
  stats: Partial<StatBlock>;
}

export interface CarModelDef {
  id: string;
  name: string;
  description: string;
  /** Stats from the car's body and chassis, before any parts. */
  baseStats: Partial<StatBlock>;
  /** Part ids fitted (at level 1) when the car is first obtained; null = empty slot. */
  starterParts: Record<SlotId, string | null>;
}

/** A part fitted to a car. */
export interface InstalledPart {
  partId: string;
  /** 1 to PART_LEVELS.maxLevel. */
  level: number;
}

/** A car the player owns, as stored in the save. */
export interface CarState {
  id: string;
  modelId: string;
  /** Installed part per slot, or null for an empty slot. */
  parts: Record<SlotId, InstalledPart | null>;
}

export interface GarageState {
  cars: CarState[];
  activeCarId: string;
}

export function emptyStats(): StatBlock {
  const stats = {} as StatBlock;
  for (const stat of STATS) stats[stat.id] = 0;
  return stats;
}

export function getPart(partId: string | null | undefined): PartDef | null {
  return partId ? (PARTS[partId] ?? null) : null;
}

/** The definition of the part installed in a slot, or null if the slot is empty. */
export function getInstalledPart(car: CarState, slot: SlotId): PartDef | null {
  return getPart(car.parts[slot]?.partId);
}

/** Multiplier on a part's stats from its level: level 1 = ×1, each level above adds a fixed share. */
export function levelMultiplier(level: number): number {
  return 1 + PART_LEVELS.bonusPerLevel * (Math.max(1, level) - 1);
}

/** A part's stat contribution at the given level. */
export function partStatsAtLevel(part: PartDef, level: number): Partial<StatBlock> {
  const multiplier = levelMultiplier(level);
  const result: Partial<StatBlock> = {};
  for (const stat of STATS) {
    const base = part.stats[stat.id];
    if (base) result[stat.id] = base * multiplier;
  }
  return result;
}

/** The car's total stats: its base stats plus every installed part at its level. */
export function computeCarStats(car: CarState): StatBlock {
  const stats = emptyStats();
  const model = CAR_MODELS[car.modelId];
  for (const stat of STATS) stats[stat.id] += model?.baseStats[stat.id] ?? 0;
  for (const slot of SLOTS) {
    const installed = car.parts[slot.id];
    const part = getPart(installed?.partId);
    if (!installed || !part) continue;
    const add = partStatsAtLevel(part, installed.level);
    for (const stat of STATS) stats[stat.id] += add[stat.id] ?? 0;
  }
  return stats;
}

export function createCar(id: string, modelId: string): CarState {
  const model = CAR_MODELS[modelId];
  if (!model) throw new Error(`Unknown car model: ${modelId}`);
  const parts = {} as Record<SlotId, InstalledPart | null>;
  for (const slot of SLOTS) {
    const partId = model.starterParts[slot.id];
    parts[slot.id] = partId ? { partId, level: 1 } : null;
  }
  return { id, modelId, parts };
}

export function createStarterGarage(): GarageState {
  return { cars: [createCar('car-1', STARTER_MODEL_ID)], activeCarId: 'car-1' };
}

export function getActiveCar(garage: GarageState): CarState {
  const car = garage.cars.find((c) => c.id === garage.activeCarId) ?? garage.cars[0];
  if (!car) throw new Error('Garage has no cars');
  return car;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Checks one saved part slot: returns a valid installed part, null for empty, or undefined if invalid. */
function repairInstalledPart(raw: unknown, slot: SlotId): InstalledPart | null | undefined {
  if (raw === null) return null;
  if (!isRecord(raw) || typeof raw.partId !== 'string') return undefined;
  const part = PARTS[raw.partId];
  if (!part || part.slot !== slot) return undefined;
  const level = typeof raw.level === 'number' && Number.isFinite(raw.level) ? Math.floor(raw.level) : 1;
  return { partId: part.id, level: Math.min(PART_LEVELS.maxLevel, Math.max(1, level)) };
}

/** Checks one saved car, dropping it if unusable and resetting any slot that holds an invalid part. */
function repairCar(raw: unknown): CarState | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.modelId !== 'string') return null;
  const model = CAR_MODELS[raw.modelId];
  if (!model) return null;
  const savedParts = isRecord(raw.parts) ? raw.parts : {};
  const stock = createCar(raw.id, raw.modelId);
  const parts = {} as Record<SlotId, InstalledPart | null>;
  for (const slot of SLOTS) {
    const repaired = repairInstalledPart(savedParts[slot.id], slot.id);
    parts[slot.id] = repaired === undefined ? stock.parts[slot.id] : repaired;
  }
  return { id: raw.id, modelId: raw.modelId, parts };
}

/** Makes a loaded garage safe to use: valid cars only, at least one car, a valid active car. */
export function repairGarage(raw: unknown): GarageState {
  const source = isRecord(raw) ? raw : {};
  const seen = new Set<string>();
  const cars: CarState[] = [];
  for (const entry of Array.isArray(source.cars) ? source.cars : []) {
    const car = repairCar(entry);
    if (car && !seen.has(car.id)) {
      seen.add(car.id);
      cars.push(car);
    }
  }
  if (cars.length === 0) return createStarterGarage();
  const first = cars[0] as CarState;
  const activeCarId =
    typeof source.activeCarId === 'string' && seen.has(source.activeCarId)
      ? source.activeCarId
      : first.id;
  return { cars, activeCarId };
}
