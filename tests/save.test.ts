import { describe, expect, it } from 'vitest';
import { BACKUP_KEY, conformTo, MemoryStorage, parseSave, SAVE_KEY, SaveManager } from '../src/core/save';
import { createNewState, SAVE_VERSION } from '../src/core/state';
import { emptyMaterials } from '../src/data/materials';

const T0 = 1_700_000_000_000;

function setup(nowValue = T0) {
  const storage = new MemoryStorage();
  let now = nowValue;
  const saves = new SaveManager(storage, () => now);
  return { storage, saves, setNow: (t: number) => (now = t) };
}

describe('SaveManager', () => {
  it('starts a new game when nothing is saved', () => {
    const { saves } = setup();
    const result = saves.load();
    expect(result.source).toBe('new');
    expect(result.awaySeconds).toBe(0);
    expect(result.state).toEqual(createNewState(T0));
  });

  it('round-trips a saved game', () => {
    const { saves } = setup();
    const state = createNewState(T0);
    state.resources.money = 1234.5;
    state.stats.playTimeSeconds = 99;
    expect(saves.save(state)).toBe(true);

    const result = saves.load();
    expect(result.source).toBe('save');
    expect(result.state).toEqual(state);
  });

  it('reports time away since the last save, never negative', () => {
    const { saves, setNow } = setup();
    saves.save(createNewState(T0));
    setNow(T0 + 90_000);
    expect(saves.load().awaySeconds).toBe(90);
    // Device clock moved backwards.
    setNow(T0 - 60_000);
    expect(saves.load().awaySeconds).toBe(0);
  });

  it('keeps the previous save as a backup and falls back to it if the main save is broken', () => {
    const { storage, saves } = setup();
    const first = createNewState(T0);
    first.resources.money = 10;
    saves.save(first);
    const second = createNewState(T0);
    second.resources.money = 20;
    saves.save(second);
    expect(parseSave(storage.getItem(BACKUP_KEY) ?? '', T0)?.resources.money).toBe(10);

    storage.setItem(SAVE_KEY, '{not valid json');
    const result = saves.load();
    expect(result.source).toBe('backup');
    expect(result.state.resources.money).toBe(10);
  });

  it('never overwrites a good backup with a broken save', () => {
    const { storage, saves } = setup();
    const good = createNewState(T0);
    good.resources.money = 5;
    saves.save(good);
    saves.save(good); // backup now holds the good save
    storage.setItem(SAVE_KEY, 'garbage');
    saves.save(createNewState(T0));
    expect(parseSave(storage.getItem(BACKUP_KEY) ?? '', T0)?.resources.money).toBe(5);
  });

  it('starts a new game when both saves are unreadable', () => {
    const { storage, saves } = setup();
    storage.setItem(SAVE_KEY, 'garbage');
    storage.setItem(BACKUP_KEY, '[]');
    expect(saves.load().source).toBe('new');
  });

  it('clear() removes the save and backup', () => {
    const { storage, saves } = setup();
    saves.save(createNewState(T0));
    saves.save(createNewState(T0));
    saves.clear();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(storage.getItem(BACKUP_KEY)).toBeNull();
  });

  it('reports failure instead of throwing when storage is full', () => {
    const storage = new MemoryStorage();
    storage.setItem = () => {
      throw new Error('QuotaExceededError');
    };
    const saves = new SaveManager(storage, () => T0);
    expect(saves.save(createNewState(T0))).toBe(false);
  });
});

describe('parseSave', () => {
  it('fills in missing fields and repairs invalid numbers', () => {
    const raw = JSON.stringify({
      version: SAVE_VERSION,
      createdAt: T0,
      lastSavedAt: T0,
      resources: { money: 'lots', materials: { scrapMetal: 3, unknownStuff: 9 } },
      stats: null,
      unknownField: true,
    });
    const state = parseSave(raw, T0);
    expect(state).toEqual({
      ...createNewState(T0),
      resources: { money: 0, materials: { ...emptyMaterials(), scrapMetal: 3 } },
    });
  });

  it('rejects text that is not a save object', () => {
    expect(parseSave('', T0)).toBeNull();
    expect(parseSave('42', T0)).toBeNull();
    expect(parseSave('[1,2]', T0)).toBeNull();
  });
});

describe('conformTo', () => {
  it('keeps arrays from the loaded data', () => {
    expect(conformTo({ list: [] as number[] }, { list: [1, 2] })).toEqual({ list: [1, 2] });
    expect(conformTo({ list: [] as number[] }, { list: 'x' })).toEqual({ list: [] });
  });
});
