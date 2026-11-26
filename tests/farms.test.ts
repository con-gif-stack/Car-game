import { describe, expect, it } from 'vitest';
import { buildDeposit, buildFarmGround } from '../src/art/farmArt';
import {
  activeFarms,
  createFarmState,
  crewsOf,
  DEPOSITS,
  farmDeposits,
  FarmSim,
  farmRates,
  isFarmUnlocked,
  moveAllDrones,
  moveDroneFrom,
  moveDroneTo,
  regenPerSecond,
} from '../src/core/farm';
import { GameModel } from '../src/core/GameModel';
import { MemoryStorage, parseSave, SaveManager } from '../src/core/save';
import { createNewState, emptyResources } from '../src/core/state';
import { buyLocalUpgrade, localUpgradeCost } from '../src/core/upgrades';
import { FARMS, FARMS_BY_ID, MAP_HEIGHT, MAP_WIDTH, type DepositKind } from '../src/data/farm';
import { MATERIALS_BY_ID, RARITIES } from '../src/data/materials';

const T0 = 1_700_000_000_000;

describe('farm data', () => {
  it('deposit ids are unique and every pile sits on the map', () => {
    expect(new Set(DEPOSITS.map((d) => d.id)).size).toBe(DEPOSITS.length);
    for (const d of DEPOSITS) {
      expect(d.x, d.id).toBeGreaterThan(0);
      expect(d.x, d.id).toBeLessThan(MAP_WIDTH);
      expect(d.y, d.id).toBeGreaterThan(0);
      expect(d.y, d.id).toBeLessThan(MAP_HEIGHT);
    }
  });

  it('each new farm has one rare pile near the garage and its own upgrade', () => {
    for (const farm of FARMS.filter((f) => f.id !== 'junkyard')) {
      const rare = farm.deposits.filter((d) => d.rare && d.range === 0);
      expect(rare, farm.id).toHaveLength(1);
      expect(RARITIES[MATERIALS_BY_ID[rare[0]!.material].rarity].rank).toBeGreaterThanOrEqual(2);
      expect(farm.local).not.toBeNull();
    }
    expect(FARMS_BY_ID.junkyard.deposits.some((d) => d.rare)).toBe(false);
  });

  it('a farm unlocks when its biome is reached (the Junkyard always)', () => {
    expect(isFarmUnlocked([], 'junkyard')).toBe(true);
    expect(isFarmUnlocked(['junkyard'], 'desert')).toBe(false);
    expect(isFarmUnlocked(['junkyard', 'desert'], 'desert')).toBe(true);
  });
});

describe('one fleet of drones', () => {
  it('drones without a station work the Junkyard; extra stations are trimmed', () => {
    const farm = createFarmState();
    farm.droneCount = 4;
    expect(crewsOf(farm).junkyard).toBe(4);
    farm.crews.desert = 3;
    farm.crews.industrial = 3;
    const crews = crewsOf(farm);
    expect(crews.desert + crews.industrial + crews.junkyard + crews.rustHighway).toBe(4);
  });

  it('moves all drones to a farm, or one at a time within the Relay Masts limit', () => {
    const farm = createFarmState();
    farm.droneCount = 5;
    moveAllDrones(farm, 'rustHighway');
    expect(crewsOf(farm).rustHighway).toBe(5);
    expect(moveDroneTo(farm, 'desert', 1)).toBe(false);
    expect(moveDroneTo(farm, 'desert', 2)).toBe(true);
    expect(crewsOf(farm).desert).toBe(1);
    expect(activeFarms(farm)).toEqual(['rustHighway', 'desert']);
    expect(moveDroneTo(farm, 'industrial', 2)).toBe(false);
    expect(moveDroneFrom(farm, 'desert')).toBe(true);
    expect(crewsOf(farm).desert).toBe(0);
    expect(moveDroneFrom(farm, 'rustHighway')).toBe(false);
  });

  it('only farms with drones produce, and each farm gives its own materials', () => {
    const farm = createFarmState();
    farm.droneCount = 4;
    moveAllDrones(farm, 'desert');
    const desert = farmRates(farm);
    expect(desert.materials.ceramic).toBeGreaterThan(0);
    expect(desert.materials.titanium).toBe(0);
    moveAllDrones(farm, 'industrial');
    const industrial = farmRates(farm);
    expect(industrial.materials.titanium).toBeGreaterThan(0);
    expect(industrial.materials.ceramic).toBe(0);
    expect(farmRates(farm, undefined, 'desert').money).toBe(0);
  });

  it('live drones fly only to piles on their own farm', () => {
    const farm = createFarmState();
    farm.droneCount = 3;
    moveAllDrones(farm, 'rustHighway');
    const sim = new FarmSim(2);
    const highway = new Set(farmDeposits('rustHighway').map((d) => d.id));
    for (let i = 0; i < 3000; i++) {
      sim.step(farm, 0.1);
      for (const drone of sim.drones) {
        expect(drone.farm).toBe('rustHighway');
        if (drone.target) expect(highway.has(drone.target)).toBe(true);
      }
    }
  });

  it('rare piles are not dug deeper by better drones, but the farm upgrade speeds them up', () => {
    const farm = createFarmState();
    const rare = FARMS_BY_ID.industrial.deposits.find((d) => d.rare)!;
    const common = FARMS_BY_ID.industrial.deposits.find((d) => !d.rare)!;
    const before = { rare: regenPerSecond(farm, rare), common: regenPerSecond(farm, common) };
    farm.droneModel = 3;
    expect(regenPerSecond(farm, rare)).toBe(before.rare);
    expect(regenPerSecond(farm, common)).toBeGreaterThan(before.common);
    farm.local.industrial = 2;
    expect(regenPerSecond(farm, rare)).toBeCloseTo(before.rare * (1 + 2 * FARMS_BY_ID.industrial.local!.regrowBonusPerLevel));
  });

  it('farm upgrades stop at their maximum; the Junkyard has none', () => {
    const farm = createFarmState();
    const resources = emptyResources();
    resources.money = 1e12;
    for (const id of Object.keys(resources.materials) as (keyof typeof resources.materials)[]) resources.materials[id] = 1e9;
    expect(localUpgradeCost(farm, 'junkyard')).toBeNull();
    const max = FARMS_BY_ID.desert.local!.maxLevel;
    for (let i = 0; i < max; i++) expect(buyLocalUpgrade(farm, 'desert', resources)).toBe(true);
    expect(buyLocalUpgrade(farm, 'desert', resources)).toBe(false);
  });
});

describe('the game and biome farms', () => {
  const setup = () => {
    const state = createNewState(T0);
    state.unlockedFeatures.push('drones');
    state.farm.droneCount = 4;
    const model = new GameModel(state, new SaveManager(new MemoryStorage(), () => T0), () => T0);
    return { state, model };
  };

  it("drones can't be sent to a farm that isn't unlocked, and its piles can't be scavenged", () => {
    const { state, model } = setup();
    expect(model.moveAllDrones('desert')).toBe(false);
    expect(model.scavenge('des-tires-1')).toBeNull();
    state.unlockedBiomes.push('desert');
    expect(model.moveAllDrones('desert')).toBe(true);
    expect(crewsOf(state.farm).desert).toBe(4);
    expect(model.scavenge('des-tires-1')).not.toBeNull();
  });

  it('Relay Masts let the fleet split between farms', () => {
    const { state, model } = setup();
    state.unlockedBiomes.push('rustHighway');
    expect(model.maxFarmsAtOnce()).toBe(1);
    expect(model.moveDroneTo('rustHighway')).toBe(false);
    state.workshop.relayMasts = 1;
    expect(model.maxFarmsAtOnce()).toBe(2);
    expect(model.moveDroneTo('rustHighway')).toBe(true);
    expect(crewsOf(state.farm)).toMatchObject({ junkyard: 3, rustHighway: 1 });
  });

  it('a v6 save loads with its drones at the Junkyard', () => {
    const v6 = { version: 6, createdAt: T0, lastSavedAt: T0, farm: { deposits: {}, droneCount: 3, droneModel: 0, scavenged: 30 } };
    const state = parseSave(JSON.stringify(v6), T0)!;
    expect(crewsOf(state.farm).junkyard).toBe(3);
    expect(state.farm.deposits['des-plane-1']).toBe(FARMS_BY_ID.desert.deposits[0]!.max);
    expect(state.workshop.relayMasts).toBe(0);
  });
});

describe('farm art', () => {
  it('draws every pile kind at every fill stage, and every farm ground', () => {
    const kinds = new Set<DepositKind>(DEPOSITS.map((d) => d.kind));
    for (const kind of kinds) {
      for (let stage = 1; stage <= 3; stage++) {
        let filled = 0;
        buildDeposit(kind, stage, 3).forEach((_x, _y, c) => c !== null && filled++);
        expect(filled, `${kind} ${stage}`).toBeGreaterThan(15);
      }
    }
    for (const farm of FARMS) {
      const g = buildFarmGround(40, 30, 5, farm.ground, farm.id);
      let empty = 0;
      g.forEach((_x, _y, c) => c === null && empty++);
      expect(empty, farm.id).toBe(0);
    }
  });
});
