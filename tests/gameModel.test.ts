import { describe, expect, it } from 'vitest';
import { ECONOMY } from '../src/data/economy';
import { MATERIAL_IDS } from '../src/data/materials';
import { GAME_CONFIG } from '../src/data/gameConfig';
import { GameModel } from '../src/core/GameModel';
import { MemoryStorage, SAVE_KEY, SaveManager } from '../src/core/save';
import { createNewState } from '../src/core/state';

const T0 = 1_700_000_000_000;

function setup() {
  const storage = new MemoryStorage();
  let now = T0;
  const clock = () => now;
  const saves = new SaveManager(storage, clock);
  const model = new GameModel(createNewState(T0), saves, clock);
  return {
    storage,
    saves,
    model,
    advanceWallClock: (seconds: number) => (now += seconds * 1000),
  };
}

/** Simulates `seconds` of play at 60 frames per second. */
function play(model: GameModel, seconds: number) {
  for (let i = 0; i < seconds * 60; i++) model.update(1 / 60);
}

describe('GameModel', () => {
  it('counts a new session when created', () => {
    expect(setup().model.state.stats.sessions).toBe(1);
  });

  it('ticks at a fixed rate and tracks play time', () => {
    const { model } = setup();
    let ticks = 0;
    model.events.on('tick', () => ticks++);
    play(model, 3);
    expect(ticks).toBe(3 * GAME_CONFIG.ticksPerSecond);
    expect(model.state.stats.playTimeSeconds).toBeCloseTo(3);
  });

  it('autosaves on the configured interval', () => {
    const { model, storage } = setup();
    let saves = 0;
    model.events.on('saved', () => saves++);
    play(model, GAME_CONFIG.autosaveIntervalSeconds - 1);
    expect(saves).toBe(0);
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    play(model, 1);
    expect(saves).toBe(1);
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
  });

  it('saves on pause and reports time away on resume', () => {
    const { model, storage, advanceWallClock } = setup();
    const awayReports: number[] = [];
    model.events.on('resumed', (seconds) => awayReports.push(seconds));

    model.pause();
    expect(storage.getItem(SAVE_KEY)).not.toBeNull();
    advanceWallClock(300);
    model.resume();

    expect(awayReports).toEqual([300]);
    expect(model.lastAwaySeconds).toBe(300);
  });

  it('does not tick while paused', () => {
    const { model } = setup();
    model.pause();
    play(model, 2);
    expect(model.state.stats.playTimeSeconds).toBe(0);
  });

  it('ignores resume without a pause', () => {
    const { model } = setup();
    let resumed = false;
    model.events.on('resumed', () => (resumed = true));
    model.resume();
    expect(resumed).toBe(false);
  });

  it('earns money and distance while ticking', () => {
    const { model } = setup();
    const rates = model.idleRates();
    play(model, 5);
    expect(model.state.resources.money).toBeCloseTo(rates.moneyPerSecond * 5);
    expect(model.state.resources.materials.scrapMetal).toBeCloseTo(rates.materialsPerSecond.scrapMetal * 5);
    expect(model.state.resources.materials.titanium).toBeCloseTo(rates.materialsPerSecond.titanium * 5);
    expect(model.state.stats.distanceKm).toBeCloseTo(rates.kmPerSecond * 5);
  });

  it('adds short absences straight away, without a summary', () => {
    const { model, advanceWallClock } = setup();
    let summaries = 0;
    model.events.on('offlineEarnings', () => summaries++);
    model.pause();
    advanceWallClock(ECONOMY.offline.minSecondsForSummary - 1);
    model.resume();
    expect(summaries).toBe(0);
    expect(model.state.resources.money).toBeGreaterThan(0);
    expect(model.state.pendingOffline.money).toBe(0);
  });

  it('holds longer absences as pending earnings until collected', () => {
    const { model, saves, advanceWallClock } = setup();
    const summaries: number[] = [];
    model.events.on('offlineEarnings', (p) => summaries.push(p.money));
    model.pause();
    advanceWallClock(3600);
    model.resume();

    const expected = model.idleRates().moneyPerSecond * 3600 * ECONOMY.offline.efficiency;
    expect(model.state.resources.money).toBe(0);
    expect(model.state.pendingOffline.money).toBeCloseTo(expected);
    expect(summaries).toHaveLength(1);
    // Pending earnings are saved, so closing the game before collecting loses nothing.
    expect(saves.load().state.pendingOffline.money).toBeCloseTo(expected);

    const expectedScrap = model.idleRates().materialsPerSecond.scrapMetal * 3600 * ECONOMY.offline.efficiency;
    expect(model.state.pendingOffline.materials.scrapMetal).toBeCloseTo(expectedScrap);
    expect(model.collectOffline()).toBeCloseTo(expected);
    expect(model.state.resources.money).toBeCloseTo(expected);
    expect(model.state.resources.materials.scrapMetal).toBeCloseTo(expectedScrap);
    expect(model.state.resources.materials.titanium).toBeGreaterThan(0);
    expect(model.state.pendingOffline.money).toBe(0);
    expect(model.collectOffline()).toBe(0);
  });

  it('adds up absences that were not collected in between', () => {
    const { model, advanceWallClock } = setup();
    for (let i = 0; i < 2; i++) {
      model.pause();
      advanceWallClock(600);
      model.resume();
    }
    expect(model.state.pendingOffline.seconds).toBe(1200);
  });

  it('credits time away from before the game was opened', () => {
    const storage = new MemoryStorage();
    const saves = new SaveManager(storage, () => T0);
    const model = new GameModel(createNewState(T0), saves, () => T0, 7200);
    expect(model.state.pendingOffline.seconds).toBe(7200);
  });

  it('buys tiers, levels and the Salvage Magnet: spends, installs, saves and announces it', () => {
    const { model, saves } = setup();
    const bought: string[] = [];
    model.events.on('purchased', (kind, slot) => bought.push(`${kind}:${slot}`));
    const { resources } = model.state;

    expect(model.buyNextTier('exhaust')).toBe(false); // can't afford yet
    resources.money = 1e9;
    for (const id of MATERIAL_IDS) resources.materials[id] = 1e6;

    expect(model.buyNextTier('exhaust')).toBe(true);
    expect(model.activeCar.parts.exhaust).toEqual({ partId: 'exhaust-used', level: 1 });
    expect(model.buyLevelUp('exhaust')).toBe(true);
    expect(model.activeCar.parts.exhaust?.level).toBe(2);
    expect(model.buySalvageMagnet()).toBe(true);
    expect(model.state.workshop.salvageMagnetLevel).toBe(1);
    expect(resources.money).toBeLessThan(1e9);
    expect(bought).toEqual(['tier:exhaust', 'level:exhaust', 'salvageMagnet:null']);

    // Purchases are saved straight away.
    const saved = saves.load().state;
    expect(saved.garage.cars[0]?.parts.exhaust).toEqual({ partId: 'exhaust-used', level: 2 });
    expect(saved.workshop.salvageMagnetLevel).toBe(1);
  });

  it('upgrading parts raises progress, so rare materials drop faster', () => {
    const { model } = setup();
    const before = model.idleRates().materialsPerSecond.titanium;
    model.state.resources.money = 1e9;
    for (const id of MATERIAL_IDS) model.state.resources.materials[id] = 1e6;
    for (const slot of ['engine', 'tires', 'brakes', 'exhaust'] as const) model.buyNextTier(slot);
    expect(model.idleRates().materialsPerSecond.titanium).toBeGreaterThan(before);
  });

  it('stops saving after the save is wiped', () => {
    const { model, storage } = setup();
    model.save();
    model.wipeSave();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
    expect(model.save()).toBe(false);
    model.pause();
    expect(storage.getItem(SAVE_KEY)).toBeNull();
  });
});
