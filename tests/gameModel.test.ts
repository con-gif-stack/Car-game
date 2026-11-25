import { describe, expect, it } from 'vitest';
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
