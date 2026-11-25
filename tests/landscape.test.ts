import { describe, expect, it } from 'vitest';
import {
  buildClouds,
  buildMountains,
  buildRoad,
  buildSky,
  buildTreeline,
  LANE_PERIOD,
  SUNSET_PALETTE,
} from '../src/art/landscape';
import type { PixelGrid } from '../src/art/PixelGrid';

const W = 144;

/** Height of the first filled pixel in a column (the skyline). */
function topOf(g: PixelGrid, x: number): number {
  for (let y = 0; y < g.height; y++) if (g.get(x, y) !== null) return y;
  return g.height;
}

/**
 * True if the skyline steps no more across the wrap point (last column to first) than it does
 * anywhere inside the layer, so the repeat has no visible seam.
 */
function wrapsCleanly(g: PixelGrid): boolean {
  let largestStep = 0;
  for (let x = 1; x < g.width; x++) largestStep = Math.max(largestStep, Math.abs(topOf(g, x) - topOf(g, x - 1)));
  return Math.abs(topOf(g, 0) - topOf(g, g.width - 1)) <= largestStep;
}

describe('landscape layers', () => {
  it('sky goes from the top colour to the horizon colour', () => {
    const sky = buildSky(W, 80, 60);
    expect(sky.get(0, 0)).toBe(SUNSET_PALETTE.sky[0]);
    expect(sky.get(0, 79)).toBe(SUNSET_PALETTE.sky[SUNSET_PALETTE.sky.length - 1]);
  });

  it('scrolling layers wrap without a seam', () => {
    expect(wrapsCleanly(buildMountains(W, 60, 11))).toBe(true);
    expect(wrapsCleanly(buildTreeline(W, 30, 23))).toBe(true);
    expect(wrapsCleanly(buildRoad(W, 12, 4, 5))).toBe(true);
  });

  it('mountain and trees reach the bottom edge, so no gaps show behind them', () => {
    const mountains = buildMountains(W, 60, 11);
    const trees = buildTreeline(W, 30, 23);
    for (let x = 0; x < W; x++) {
      expect(mountains.get(x, 59)).not.toBeNull();
      expect(trees.get(x, 29)).not.toBeNull();
    }
  });

  it('has clouds and snow', () => {
    let cloudPixels = 0;
    buildClouds(W, 40, 7).forEach((_x, _y, c) => c !== null && cloudPixels++);
    expect(cloudPixels).toBeGreaterThan(50);
    let snow = 0;
    buildMountains(W, 60, 11).forEach((_x, _y, c) => (c === SUNSET_PALETTE.snow || c === SUNSET_PALETTE.snowShadow) && snow++);
    expect(snow).toBeGreaterThan(10);
  });

  it('road width must fit the lane dash pattern', () => {
    expect(() => buildRoad(LANE_PERIOD * 10 + 1, 12, 4, 5)).toThrow();
  });
});
