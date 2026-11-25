import { BIOMES_BY_ID, type BiomePalette, type SceneryFeature } from '../data/biomes';
import { PixelGrid, seededRandom } from './PixelGrid';

/*
 * Placeholder scenery for the drive road, generated in code. Each biome supplies a palette and
 * a middle-distance silhouette (junk piles, pines, factories, mesas, crystal spires). The style
 * follows the first art reference: banded skies, layered depth. Every layer except the sky
 * wraps left to right so it can scroll forever.
 */

/** The Rust Highway sunset palette (the original scenery), plus the road colours shared by all biomes. */
export const SUNSET_PALETTE = {
  sky: BIOMES_BY_ID.rustHighway.palette.sky,
  snow: BIOMES_BY_ID.rustHighway.palette.peak,
  snowShadow: BIOMES_BY_ID.rustHighway.palette.peakShadow,
  curb: 0x9c9eba,
  asphalt: 0x34374d,
  asphaltSpeck: 0x404360,
  asphaltDark: 0x282a3b,
  lane: 0xe9dfc4,
  roadEdge: 0x191a26,
} as const;

const DEFAULT_PALETTE: BiomePalette = BIOMES_BY_ID.rustHighway.palette;
const R = SUNSET_PALETTE;

/** 4x4 ordered-dither thresholds, for the classic stepped pixel-art gradient. */
const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];

/** Lane dash pattern length; road layer widths must be a multiple of this to wrap cleanly. */
export const LANE_PERIOD = 12;

const wrap = (x: number, w: number) => ((Math.round(x) % w) + w) % w;

/** Smooth, wrapping height noise in [-1, 1] built from whole-period sine waves. */
function wrappingNoise(w: number, rand: () => number, octaves: readonly number[]): (x: number) => number {
  const waves = octaves.map((k, i) => ({ k, phase: rand() * Math.PI * 2, amp: 1 / (i + 1) }));
  const total = waves.reduce((sum, wave) => sum + wave.amp, 0);
  return (x) =>
    waves.reduce((sum, wave) => sum + wave.amp * Math.sin((2 * Math.PI * wave.k * x) / w + wave.phase), 0) / total;
}

/** Banded sky with short dithered steps between bands. Bands reach the last colour at `horizonY`. */
export function buildSky(w: number, h: number, horizonY: number, palette: BiomePalette = DEFAULT_PALETTE): PixelGrid {
  const g = new PixelGrid(w, h);
  const sky = palette.sky;
  const bands = sky.length - 1;
  g.forEach((x, y) => {
    const t = Math.min(1, y / Math.max(1, horizonY)) * bands;
    const band = Math.min(bands, Math.floor(t));
    // Only the last 35% of each band dithers into the next.
    const blend = Math.max(0, (t - band - 0.65) / 0.35);
    const threshold = ((BAYER4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
    const index = blend > threshold ? Math.min(bands, band + 1) : band;
    g.set(x, y, sky[index] ?? null);
  });
  return g;
}

/** Drifting clouds: flat-bottomed puffs, lit on top and shaded underneath. */
export function buildClouds(w: number, h: number, seed: number, palette: BiomePalette = DEFAULT_PALETTE): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const count = Math.max(3, Math.round(w / 30));
  // Some clouds take the far-ridge colours, for variety.
  const alt = { light: palette.ridge, base: palette.ridgeShadow, shadow: palette.mountain };
  const main = { light: palette.cloudLight, base: palette.cloud, shadow: palette.cloudShadow };

  for (let i = 0; i < count; i++) {
    const colors = rand() < 0.35 ? alt : main;
    const cx = rand() * w;
    const cy = h * (0.2 + rand() * 0.65);
    const length = 10 + rand() * 26;
    const thickness = 2 + rand() * 3.5;
    const bottom = cy + thickness * 0.35;
    const puffs = 3 + Math.floor(rand() * 4);

    const cloud = new PixelGrid(w, h);
    for (let k = 0; k < puffs; k++) {
      const px = cx + (k / (puffs - 1) - 0.5) * length;
      const py = cy - rand() * thickness * 0.7;
      const ry = thickness * (0.6 + rand() * 0.6);
      const rx = ry * (1.6 + rand());
      for (let y = Math.floor(py - ry); y <= Math.ceil(py + ry); y++) {
        if (y + 0.5 > bottom) continue;
        for (let x = Math.floor(px - rx); x <= Math.ceil(px + rx); x++) {
          if (((x + 0.5 - px) / rx) ** 2 + ((y + 0.5 - py) / ry) ** 2 <= 1) cloud.set(wrap(x, w), y, 1);
        }
      }
    }
    // Shade: top edge light, lower part shadow, rest body colour.
    cloud.forEach((x, y, c) => {
      if (c === null) return;
      const top = cloud.get(x, y - 1) === null;
      g.set(x, y, top ? colors.light : y + 0.5 > cy ? colors.shadow : colors.base);
    });
  }
  return g;
}

/** A low far ridge with one big peak in front (snow-capped, or a paler summit), filled to the bottom. */
export function buildMountains(w: number, h: number, seed: number, palette: BiomePalette = DEFAULT_PALETTE): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const ridgeNoise = wrappingNoise(w, rand, [2, 3, 7, 13]);
  const rangeNoise = wrappingNoise(w, rand, [1, 4, 9, 17]);
  const peakX = w * 0.62;
  const peakTop = h * 0.05;

  const ridgeTop = (x: number) => h * 0.45 + ridgeNoise(x) * h * 0.12;
  const mainTop = (x: number) => {
    const dx = Math.min(Math.abs(x - peakX), w - Math.abs(x - peakX));
    const cone = peakTop + dx * 0.75 + rangeNoise(x) * h * 0.04;
    const range = h * 0.62 + rangeNoise(x) * h * 0.14;
    return Math.min(cone, range);
  };
  const capEdge = (x: number) => peakTop + h * 0.2 + rangeNoise(x * 7) * h * 0.05;

  // Shade by the overall slope (a few pixels either side), not single-pixel bumps,
  // so shadow sides form solid faces instead of thin vertical stripes.
  const facesAway = (top: (x: number) => number, x: number) => top(x + 4) > top(x - 4);

  for (let x = 0; x < w; x++) {
    const rTop = Math.round(ridgeTop(x));
    const rShadow = facesAway(ridgeTop, x);
    for (let y = rTop; y < h; y++) g.set(x, y, rShadow ? palette.ridgeShadow : palette.ridge);

    const mTop = Math.round(mainTop(x));
    const mShadow = facesAway(mainTop, x);
    for (let y = mTop; y < h; y++) {
      const capped = y < capEdge(x);
      const color = capped
        ? mShadow ? palette.peakShadow : palette.peak
        : mShadow ? palette.mountainShadow : palette.mountain;
      g.set(x, y, color);
    }
  }
  return g;
}

/** Shades a filled silhouette: light on the left edges, dark on the right edges. */
function shadeSilhouette(g: PixelGrid, palette: BiomePalette): void {
  const w = g.width;
  const light: [number, number][] = [];
  const dark: [number, number][] = [];
  g.forEach((x, y, c) => {
    if (c === null) return;
    if (g.get(wrap(x - 1, w), y) === null) light.push([x, y]);
    else if (g.get(wrap(x + 1, w), y) === null) dark.push([x, y]);
  });
  for (const [x, y] of light) g.set(x, y, palette.featureLight);
  for (const [x, y] of dark) g.set(x, y, palette.featureDark);
}

/** Fills a solid band along the bottom of a silhouette layer. */
function fillBand(g: PixelGrid, top: number, color: number): void {
  for (let x = 0; x < g.width; x++) for (let y = top; y < g.height; y++) g.set(x, y, color);
}

/** Pine forest: stepped triangles over a solid band, lit from the left. */
export function buildTreeline(w: number, h: number, seed: number, palette: BiomePalette = DEFAULT_PALETTE): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.7), palette.feature);

  let x = 0;
  while (x < w) {
    const height = Math.round(h * (0.35 + rand() * 0.6));
    const top = h - height;
    for (let row = 0; row < height; row++) {
      // Stepped sides: every third row the tree narrows back a little, like branches.
      const half = Math.floor(row * 0.3) - (row % 3 === 0 && row > 3 ? 1 : 0);
      for (let dx = -half; dx <= half; dx++) {
        const color =
          dx === -half && half > 0 ? palette.featureLight : dx === half && half > 0 ? palette.featureDark : palette.feature;
        g.set(wrap(x + dx, w), top + row, color);
      }
    }
    x += 2 + Math.floor(rand() * 4);
  }
  return g;
}

/** Scrap heaps: lumpy mounds with wrecked car shells and tyre stacks poking out. */
function buildJunk(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.75), palette.feature);
  const heapNoise = wrappingNoise(w, rand, [3, 7, 19, 31]);
  for (let x = 0; x < w; x++) {
    const top = Math.round(h * 0.45 + heapNoise(x) * h * 0.25 + (rand() < 0.15 ? -1 : 0));
    for (let y = Math.max(0, top); y < h; y++) g.set(x, y, palette.feature);
  }
  // Wrecked car shells and tyre stacks on the heaps.
  for (let i = 0; i < Math.max(2, Math.round(w / 40)); i++) {
    const cx = Math.floor(rand() * w);
    const base = Math.round(h * 0.45);
    if (rand() < 0.55) {
      for (let dx = 0; dx < 9; dx++) for (let dy = 0; dy < 3; dy++) g.set(wrap(cx + dx, w), base - dy, palette.feature);
      for (let dx = 2; dx < 6; dx++) for (let dy = 3; dy < 5; dy++) g.set(wrap(cx + dx, w), base - dy, palette.feature);
    } else {
      for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 3; dx++) g.set(wrap(cx + dx, w), base - dy, palette.featureDark);
    }
  }
  shadeSilhouette(g, palette);
  return g;
}

/** Factory skyline: blocky buildings, smokestacks and lit windows. */
function buildFactories(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.8), palette.feature);
  let x = 0;
  while (x < w) {
    const width = 6 + Math.floor(rand() * 10);
    const top = Math.round(h * (0.35 + rand() * 0.4));
    for (let dx = 0; dx < width; dx++) for (let y = top; y < h; y++) g.set(wrap(x + dx, w), y, palette.feature);
    // Windows.
    for (let y = top + 2; y < h - 2; y += 3) {
      for (let dx = 1; dx < width - 1; dx += 3) if (rand() < 0.35) g.set(wrap(x + dx, w), y, palette.cloudLight);
    }
    // Smokestack.
    if (rand() < 0.45) {
      const sx = x + Math.floor(width / 2);
      const stackTop = Math.max(0, top - Math.round(h * (0.2 + rand() * 0.2)));
      for (let y = stackTop; y < top; y++) {
        g.set(wrap(sx, w), y, palette.featureDark);
        g.set(wrap(sx + 1, w), y, (y - stackTop) % 5 === 1 ? palette.featureLight : palette.featureDark);
      }
    }
    x += width + Math.floor(rand() * 4);
  }
  shadeSilhouette(g, palette);
  return g;
}

/** Desert mesas: flat-topped rock towers with banded strata. */
function buildMesas(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.82), palette.feature);
  let x = 0;
  while (x < w) {
    const width = 10 + Math.floor(rand() * 20);
    const top = Math.round(h * (0.2 + rand() * 0.45));
    for (let dx = 0; dx < width; dx++) {
      // Sloped sides near the base.
      const edge = Math.min(dx, width - 1 - dx);
      const colTop = edge < 2 ? top + (2 - edge) * 3 : top;
      for (let y = colTop; y < h; y++) {
        const stratum = (y - top) % 6 === 0 && y > top;
        g.set(wrap(x + dx, w), y, stratum ? palette.featureDark : palette.feature);
      }
    }
    x += width + 4 + Math.floor(rand() * 14);
  }
  shadeSilhouette(g, palette);
  return g;
}

/** Strange crystal spires for the unknown lands. */
function buildSpires(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.8), palette.feature);
  let x = 0;
  while (x < w) {
    const height = Math.round(h * (0.3 + rand() * 0.65));
    const half = 1 + Math.floor(rand() * 3);
    for (let row = 0; row < height; row++) {
      const span = Math.round((row / height) * half);
      for (let dx = -span; dx <= span; dx++) {
        const color = dx === -span ? palette.peak : palette.feature;
        g.set(wrap(x + dx, w), h - height + row, color);
      }
    }
    x += 3 + Math.floor(rand() * 8);
  }
  return g;
}

/** The middle-distance silhouette layer for a biome. */
export function buildFeature(
  feature: SceneryFeature,
  w: number,
  h: number,
  seed: number,
  palette: BiomePalette,
): PixelGrid {
  switch (feature) {
    case 'pines':
      return buildTreeline(w, h, seed, palette);
    case 'junk':
      return buildJunk(w, h, seed, palette);
    case 'factories':
      return buildFactories(w, h, seed, palette);
    case 'mesas':
      return buildMesas(w, h, seed, palette);
    case 'spires':
      return buildSpires(w, h, seed, palette);
  }
}

/** Road seen from the side: kerb, asphalt with specks, lane dashes, dark near edge. */
export function buildRoad(w: number, h: number, laneY: number, seed: number): PixelGrid {
  if (w % LANE_PERIOD !== 0) throw new Error(`Road width must be a multiple of ${LANE_PERIOD}`);
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    let color: number = R.asphalt;
    if (y === 0) color = R.curb;
    else if (y === 1) color = R.asphaltDark;
    else if (y >= h - 2) color = R.roadEdge;
    else if (y === laneY && x % LANE_PERIOD < LANE_PERIOD / 2) color = R.lane;
    else if (rand() < 0.06) color = R.asphaltSpeck;
    g.set(x, y, color);
  });
  return g;
}
