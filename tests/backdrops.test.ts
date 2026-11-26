import { describe, expect, it } from 'vitest';
import { buildAurora, buildBackdrop, buildBird, buildPuff, buildShimmer } from '../src/art/backdrops';
import type { PixelGrid } from '../src/art/PixelGrid';
import { BIOMES } from '../src/data/biomes';

const W = 216;
const H = 70;

const signature = (g: PixelGrid) => {
  let hash = 0;
  g.forEach((x, y, c) => {
    if (c !== null) hash = (hash * 31 + c + x * 7 + y * 13) % 1_000_000_007;
  });
  return hash;
};

describe('biome backdrops', () => {
  it('every biome has its own backdrop', () => {
    const kinds = new Set(BIOMES.map((b) => b.backdrop));
    expect(kinds.size).toBe(BIOMES.length);
    const looks = new Set(BIOMES.map((b) => signature(buildBackdrop(b.backdrop, W, H, 11, b.palette).grid)));
    expect(looks.size).toBe(BIOMES.length);
  });

  it('backdrops fill their bottom rows, so nothing shows through behind them', () => {
    for (const biome of BIOMES) {
      const { grid } = buildBackdrop(biome.backdrop, W, H, 11, biome.palette);
      for (let x = 0; x < W; x++) expect(grid.get(x, H - 1), `${biome.id} column ${x}`).not.toBeNull();
    }
  });

  it('backdrops wrap without a seam: the edge columns look like any neighbouring columns', () => {
    for (const biome of BIOMES) {
      const { grid } = buildBackdrop(biome.backdrop, W, H, 11, biome.palette);
      const differ = (a: number, b: number) => {
        let n = 0;
        for (let y = 0; y < H; y++) if ((grid.get(a, y) === null) !== (grid.get(b, y) === null)) n++;
        return n;
      };
      let largest = 0;
      for (let x = 1; x < W; x++) largest = Math.max(largest, differ(x - 1, x));
      expect(differ(W - 1, 0), biome.id).toBeLessThanOrEqual(largest);
    }
  });

  it('smoke vents and warning lights lie inside the layer', () => {
    for (const biome of BIOMES) {
      const { vents, beacons } = buildBackdrop(biome.backdrop, W, H, 11, biome.palette);
      for (const p of [...vents, ...beacons]) {
        expect(p.x).toBeGreaterThanOrEqual(0);
        expect(p.x).toBeLessThan(W);
        expect(p.y).toBeGreaterThanOrEqual(-1);
        expect(p.y).toBeLessThan(H);
      }
    }
    const industrial = BIOMES.find((b) => b.ambient === 'smoke')!;
    expect(buildBackdrop(industrial.backdrop, W, H, 11, industrial.palette).vents.length).toBeGreaterThan(0);
  });

  it('builds the ambient sprites', () => {
    const p = BIOMES[0]!.palette;
    expect(buildBird(0, 0).width).toBe(7);
    expect(signature(buildBird(0, 1))).not.toBe(signature(buildBird(1, 1)));
    expect(buildPuff(5, 0xffffff).get(5, 5)).not.toBeNull();
    let lit = 0;
    buildShimmer(W, 8, 5, p).forEach((_x, _y, c) => c !== null && lit++);
    expect(lit).toBeGreaterThan(20);
    lit = 0;
    buildAurora(W, 30, 9, p).forEach((_x, _y, c) => c !== null && lit++);
    expect(lit).toBeGreaterThan(100);
  });
});
