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
export type QualityId = 'worn';

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
}

export interface PartDef {
  id: string;
  slot: SlotId;
  name: string;
  description: string;
  quality: QualityId;
  /** What the part adds to the car's stats. */
  stats: Partial<StatBlock>;
}

export interface CarModelDef {
  id: string;
  name: string;
  description: string;
  /** Stats from the car's body and chassis, before any parts. */
  baseStats: Partial<StatBlock>;
  /** Parts fitted when the car is first obtained (null = empty slot). */
  starterParts: Record<SlotId, string | null>;
}

/** A car the player owns, as stored in the save. */
export interface CarState {
  id: string;
  modelId: string;
  /** Installed part id per slot, or null for an empty slot. */
  parts: Record<SlotId, string | null>;
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

function addStats(into: StatBlock, add: Partial<StatBlock>): void {
  for (const stat of STATS) into[stat.id] += add[stat.id] ?? 0;
}

export function getPart(partId: string | null): PartDef | null {
  return partId === null ? null : (PARTS[partId] ?? null);
}

/** The car's total stats: its base stats plus every installed part. */
export function computeCarStats(car: CarState): StatBlock {
  const stats = emptyStats();
  const model = CAR_MODELS[car.modelId];
  if (model) addStats(stats, model.baseStats);
  for (const slot of SLOTS) {
    const part = getPart(car.parts[slot.id]);
    if (part) addStats(stats, part.stats);
  }
  return stats;
}

export function createCar(id: string, modelId: string): CarState {
  const model = CAR_MODELS[modelId];
  if (!model) throw new Error(`Unknown car model: ${modelId}`);
  return { id, modelId, parts: { ...model.starterParts } };
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

/** Checks one saved car, dropping it if unusable and fixing any slot that holds an invalid part. */
function repairCar(raw: unknown): CarState | null {
  if (!isRecord(raw) || typeof raw.id !== 'string' || typeof raw.modelId !== 'string') return null;
  const model = CAR_MODELS[raw.modelId];
  if (!model) return null;
  const savedParts = isRecord(raw.parts) ? raw.parts : {};
  const parts = {} as Record<SlotId, string | null>;
  for (const slot of SLOTS) {
    const value = savedParts[slot.id];
    const part = typeof value === 'string' ? PARTS[value] : undefined;
    if (value === null) parts[slot.id] = null;
    else if (part && part.slot === slot.id) parts[slot.id] = part.id;
    else parts[slot.id] = model.starterParts[slot.id];
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
