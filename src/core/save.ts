import { createNewState, SAVE_VERSION, type GameState } from './state';
import { repairBiomes, repairFeatures, repairMilestones } from './milestones';
import { repairGarage } from './vehicle';

/** The subset of the browser's localStorage that saving needs. Swappable for tests or native storage. */
export interface KeyValueStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

/** In-memory storage: used in tests, and as a fallback when the browser blocks localStorage. */
export class MemoryStorage implements KeyValueStorage {
  private readonly data = new Map<string, string>();

  getItem(key: string): string | null {
    return this.data.get(key) ?? null;
  }

  setItem(key: string, value: string): void {
    this.data.set(key, value);
  }

  removeItem(key: string): void {
    this.data.delete(key);
  }
}

export const SAVE_KEY = 'idle-car-game/save';
export const BACKUP_KEY = 'idle-car-game/save-backup';

export interface LoadResult {
  state: GameState;
  /** Where the state came from: the main save, the backup, or a brand-new game. */
  source: 'save' | 'backup' | 'new';
  /** Seconds between the last save and now (0 for a new game, never negative). */
  awaySeconds: number;
}

type RawSave = Record<string, unknown>;

/**
 * Converts a save from version N to N + 1, keyed by N. Add one entry each time
 * SAVE_VERSION is bumped. Example: `1: (save) => ({ ...save, version: 2, newField: 0 })`.
 */
const MIGRATIONS: Record<number, (save: RawSave) => RawSave> = {
  // v1 → v2: parts became tiers with levels. Installed parts were stored as a part id string
  // and are now { partId, level }; the starter part ids were renamed to "<slot>-<tier>".
  1: (save) => {
    const renamed: Record<string, string> = {
      'worn-engine': 'engine-worn',
      'worn-transmission': 'transmission-worn',
      'bald-tires': 'tires-worn',
      'saggy-suspension': 'suspension-worn',
      'squeaky-brakes': 'brakes-worn',
      'rusted-exhaust': 'exhaust-worn',
      'leaky-fuel-pump': 'fuelSystem-worn',
    };
    const garage = isRecord(save.garage) ? save.garage : {};
    const cars = Array.isArray(garage.cars) ? garage.cars : [];
    const migratedCars = cars.map((car: unknown) => {
      if (!isRecord(car) || !isRecord(car.parts)) return car;
      const parts: RawSave = {};
      for (const [slot, value] of Object.entries(car.parts)) {
        parts[slot] = typeof value === 'string' ? { partId: renamed[value] ?? value, level: 1 } : value;
      }
      return { ...car, parts };
    });
    return { ...save, version: 2, garage: { ...garage, cars: migratedCars } };
  },
  // v2 → v3: one generic "materials" and one "rareMaterials" number became a stock of named
  // materials. Old materials become Scrap Metal; old rare materials become Titanium.
  2: (save) => {
    const convert = (raw: unknown): unknown => {
      if (!isRecord(raw)) return raw;
      const { materials, rareMaterials, ...rest } = raw;
      return {
        ...rest,
        materials: {
          scrapMetal: typeof materials === 'number' ? materials : 0,
          titanium: typeof rareMaterials === 'number' ? rareMaterials : 0,
        },
      };
    };
    return { ...save, version: 3, resources: convert(save.resources), pendingOffline: convert(save.pendingOffline) };
  },
  // v3 → v4: drive runs, milestones and biomes were added. Their defaults (no runs yet, full
  // fuel tanks, only the Junkyard unlocked) are filled in when the save is loaded.
  3: (save) => ({ ...save, version: 4 }),
};

function isRecord(value: unknown): value is RawSave {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

/** Runs every migration needed to bring an old save up to the current version. */
export function migrate(save: RawSave): RawSave {
  let current = save;
  let version = typeof current.version === 'number' ? current.version : 1;
  while (version < SAVE_VERSION) {
    const step = MIGRATIONS[version];
    if (!step) throw new Error(`No save migration from version ${version}`);
    current = step(current);
    version += 1;
  }
  return current;
}

/**
 * Builds a value shaped exactly like `defaults`, taking each field from `loaded` when it has the
 * right type. Missing or broken fields fall back to the default, and unknown fields are dropped.
 */
export function conformTo<T>(defaults: T, loaded: unknown): T {
  if (typeof defaults === 'number') {
    return (typeof loaded === 'number' && Number.isFinite(loaded) ? loaded : defaults) as T;
  }
  if (typeof defaults === 'string' || typeof defaults === 'boolean') {
    return (typeof loaded === typeof defaults ? loaded : defaults) as T;
  }
  if (Array.isArray(defaults)) {
    return (Array.isArray(loaded) ? loaded : defaults) as T;
  }
  if (isRecord(defaults)) {
    const source = isRecord(loaded) ? loaded : {};
    const result: RawSave = {};
    for (const key of Object.keys(defaults)) {
      result[key] = conformTo(defaults[key], source[key]);
    }
    return result as T;
  }
  return defaults;
}

/** Parses saved text into a valid GameState, or returns null if it is unreadable. */
export function parseSave(raw: string, now: number): GameState | null {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (!isRecord(parsed)) return null;
    const migrated = migrate(parsed);
    const state = conformTo(createNewState(now), migrated);
    // conformTo can't check list contents, so lists are validated separately.
    state.garage = repairGarage(migrated.garage);
    state.milestones = repairMilestones(migrated.milestones);
    state.unlockedBiomes = repairBiomes(migrated.unlockedBiomes);
    state.unlockedFeatures = repairFeatures(migrated.unlockedFeatures);
    state.version = SAVE_VERSION;
    return state;
  } catch {
    return null;
  }
}

export class SaveManager {
  constructor(
    private readonly storage: KeyValueStorage,
    private readonly now: () => number,
  ) {}

  /** Loads the main save, falling back to the backup, then to a new game. */
  load(): LoadResult {
    const now = this.now();
    for (const [key, source] of [
      [SAVE_KEY, 'save'],
      [BACKUP_KEY, 'backup'],
    ] as const) {
      const raw = this.read(key);
      if (raw === null) continue;
      const state = parseSave(raw, now);
      if (state) {
        const awaySeconds = Math.max(0, (now - state.lastSavedAt) / 1000);
        return { state, source, awaySeconds };
      }
    }
    return { state: createNewState(now), source: 'new', awaySeconds: 0 };
  }

  /**
   * Writes the state. The previous save is kept as a backup first, so a bad save can be
   * recovered. Returns false if storage refused the write (e.g. storage full or disabled).
   */
  save(state: GameState): boolean {
    try {
      const previous = this.storage.getItem(SAVE_KEY);
      if (previous !== null && parseSave(previous, this.now()) !== null) {
        this.storage.setItem(BACKUP_KEY, previous);
      }
      this.storage.setItem(SAVE_KEY, JSON.stringify(state));
      return true;
    } catch {
      return false;
    }
  }

  /** Deletes the save and its backup. */
  clear(): void {
    try {
      this.storage.removeItem(SAVE_KEY);
      this.storage.removeItem(BACKUP_KEY);
    } catch {
      // Storage unavailable: nothing to clear.
    }
  }

  private read(key: string): string | null {
    try {
      return this.storage.getItem(key);
    } catch {
      return null;
    }
  }
}
