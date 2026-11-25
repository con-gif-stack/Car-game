import { describe, expect, it } from 'vitest';
import {
  buildBrake,
  buildRustbucketBody,
  buildWheel,
  buildWornWheel,
  lookForCar,
  MAX_RUST_PATCHES,
  RUSTBUCKET_LAYOUT,
  RUSTBUCKET_PALETTE,
} from '../src/art/carArt';
import { buildDeposit, buildDrone, buildFarmGround, buildGarage, buildWreck, depositStage } from '../src/art/farmArt';
import { emptyResources } from '../src/core/state';
import { buyNextTier } from '../src/core/upgrades';
import { createStarterGarage, getActiveCar } from '../src/core/vehicle';
import { MATERIAL_IDS } from '../src/data/materials';
import { SLOTS } from '../src/data/vehicles';
import { PixelGrid, pointInPolygon } from '../src/art/PixelGrid';

describe('PixelGrid', () => {
  it('fills polygons and circles by pixel centre', () => {
    const g = new PixelGrid(10, 10);
    g.fillPolygon(
      [
        { x: 2, y: 2 },
        { x: 6, y: 2 },
        { x: 6, y: 6 },
        { x: 2, y: 6 },
      ],
      1,
    );
    expect(g.get(2, 2)).toBe(1);
    expect(g.get(5, 5)).toBe(1);
    expect(g.get(6, 6)).toBeNull();
    expect(pointInPolygon(0, 0, [{ x: 1, y: 1 }, { x: 2, y: 1 }, { x: 2, y: 2 }])).toBe(false);
  });

  it('outlines only empty pixels next to the shape', () => {
    const g = new PixelGrid(5, 5);
    g.set(2, 2, 1);
    g.outline(9);
    expect([g.get(1, 2), g.get(3, 2), g.get(2, 1), g.get(2, 3)]).toEqual([9, 9, 9, 9]);
    expect(g.get(1, 1)).toBeNull();
    expect(g.get(2, 2)).toBe(1);
  });

  it('converts to RGBA bytes', () => {
    const g = new PixelGrid(1, 2);
    g.set(0, 0, 0x112233);
    expect([...g.toRgba()]).toEqual([0x11, 0x22, 0x33, 255, 0, 0, 0, 0]);
  });
});

describe('car art', () => {
  it('is generated the same way every time', () => {
    expect(buildRustbucketBody().toRgba()).toEqual(buildRustbucketBody().toRgba());
    expect(buildWornWheel().toRgba()).toEqual(buildWornWheel().toRgba());
  });

  it('has rust on the body and dark wheel wells behind the wheels', () => {
    const body = buildRustbucketBody();
    let rust = 0;
    body.forEach((_x, _y, c) => {
      if (c === RUSTBUCKET_PALETTE.rust || c === RUSTBUCKET_PALETTE.rustLight) rust++;
    });
    expect(rust).toBeGreaterThan(20);
    for (const c of RUSTBUCKET_LAYOUT.wheelCenters) {
      expect(body.get(c.x, c.y - 4)).toBe(RUSTBUCKET_PALETTE.wheelWell);
    }
  });

  it('wheel fits its grid with room for the outline', () => {
    const wheel = buildWornWheel();
    expect(wheel.width).toBe(RUSTBUCKET_LAYOUT.wheelSize);
    for (let i = 0; i < wheel.width; i++) {
      expect(wheel.get(i, 0)).toBeNull();
      expect(wheel.get(0, i)).toBeNull();
    }
  });
});

describe('car looks follow the installed parts', () => {
  const rich = () => {
    const r = emptyResources();
    r.money = 1e12;
    for (const id of MATERIAL_IDS) r.materials[id] = 1e12;
    return r;
  };

  it('a new car is fully rusty, stock height, with worn wheels and no intercooler', () => {
    const look = lookForCar(getActiveCar(createStarterGarage()));
    expect(look).toEqual({ rustPatches: MAX_RUST_PATCHES, exhaustRank: 0, turbo: false, rideDrop: 0, wheelRank: 0, brakeRank: 0 });
  });

  it('a fully upgraded car has no rust, sits lower, and shows race parts', () => {
    const car = getActiveCar(createStarterGarage());
    const wallet = rich();
    for (const slot of SLOTS) while (buyNextTier(car, slot.id, wallet));
    expect(lookForCar(car)).toEqual({ rustPatches: 0, exhaustRank: 4, turbo: true, rideDrop: 2, wheelRank: 4, brakeRank: 4 });
  });

  it('restoring the car only removes rust, it never adds new patches', () => {
    let previous = buildRustbucketBody(lookForCar(getActiveCar(createStarterGarage())));
    for (const patches of [12, 6, 0]) {
      const body = buildRustbucketBody({ rustPatches: patches, exhaustRank: 0, turbo: false, rideDrop: 0, wheelRank: 0, brakeRank: 0 });
      const isRust = (c: number | null) => c === RUSTBUCKET_PALETTE.rust || c === RUSTBUCKET_PALETTE.rustLight || c === RUSTBUCKET_PALETTE.rustDark;
      body.forEach((x, y, c) => {
        if (isRust(c)) expect(isRust(previous.get(x, y))).toBe(true);
      });
      previous = body;
    }
  });

  it('each wheel tier looks different, and spoked rims are see-through for the brakes', () => {
    const wheels = [0, 1, 2, 3, 4].map((rank) => buildWheel(rank).toRgba().join(','));
    expect(new Set(wheels).size).toBe(5);
    const c = RUSTBUCKET_LAYOUT.wheelSize / 2;
    let open = 0;
    buildWheel(2).forEach((x, y, col) => {
      if (col === null && Math.hypot(x + 0.5 - c, y + 0.5 - c) < 4) open++;
    });
    expect(open).toBeGreaterThan(0);
    expect(buildBrake(2).toRgba()).not.toEqual(buildBrake(4).toRgba());
  });
});

describe('farm art', () => {
  it('each drone model looks different, and its two animation frames differ', () => {
    const looks = [0, 1, 2, 3].map((model) => buildDrone(model, 0).toRgba().join(','));
    expect(new Set(looks).size).toBe(4);
    for (const model of [0, 1, 2, 3]) {
      expect(buildDrone(model, 0).toRgba()).not.toEqual(buildDrone(model, 1).toRgba());
    }
  });

  it('deposits shrink as they are emptied', () => {
    expect(depositStage(60, 60)).toBe(3);
    expect(depositStage(30, 60)).toBe(2);
    expect(depositStage(5, 60)).toBe(1);
    expect(depositStage(0, 60)).toBe(0);
    const filled = (stage: number) => {
      let n = 0;
      buildDeposit('scrapHeap', stage, 1).forEach((_x, _y, c) => c !== null && n++);
      return n;
    };
    expect(filled(3)).toBeGreaterThan(filled(1));
  });

  it('builds the ground, garage and wrecks deterministically', () => {
    expect(buildFarmGround(60, 40, 5).toRgba()).toEqual(buildFarmGround(60, 40, 5).toRgba());
    expect(buildGarage().width).toBeGreaterThan(0);
    expect(buildWreck(1).toRgba()).toEqual(buildWreck(1).toRgba());
  });
});
