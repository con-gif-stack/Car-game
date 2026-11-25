import { describe, expect, it } from 'vitest';
import { buildRustbucketBody, buildWornWheel, RUSTBUCKET_LAYOUT, RUSTBUCKET_PALETTE } from '../src/art/carArt';
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
