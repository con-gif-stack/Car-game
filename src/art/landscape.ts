import { PixelGrid, seededRandom } from './PixelGrid';

/*
 * Placeholder scenery for idle driving, generated in code. The look follows the first art
 * reference: a banded pink-and-blue sunset sky, pink clouds, a snowy blue mountain and a deep
 * navy pine treeline. Every layer except the sky wraps left to right so it can scroll forever.
 */

export const SUNSET_PALETTE = {
  /** Sky bands from top to horizon. */
  sky: [0x2b4486, 0x38579d, 0x4a6db5, 0x6689c8, 0x8fa2d4, 0xbea1cd, 0xe49fbb, 0xf3b2a9, 0xf7caa6],
  cloudLight: 0xffd9e3,
  cloud: 0xf2a3bc,
  cloudShadow: 0xc97fa7,
  cloudBlueLight: 0xb3b6e6,
  cloudBlue: 0x8e93cf,
  cloudBlueShadow: 0x6f76b6,
  ridge: 0x8792cc,
  ridgeShadow: 0x7480c0,
  mountain: 0x5767a9,
  mountainShadow: 0x445494,
  snow: 0xf3eff9,
  snowShadow: 0xc4c5ea,
  treeLight: 0x2e4277,
  tree: 0x1f2d5b,
  treeDark: 0x162147,
  curb: 0x9c9eba,
  asphalt: 0x34374d,
  asphaltSpeck: 0x404360,
  asphaltDark: 0x282a3b,
  lane: 0xe9dfc4,
  roadEdge: 0x191a26,
} as const;

const P = SUNSET_PALETTE;

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
export function buildSky(w: number, h: number, horizonY: number): PixelGrid {
  const g = new PixelGrid(w, h);
  const bands = P.sky.length - 1;
  g.forEach((x, y) => {
    const t = Math.min(1, y / Math.max(1, horizonY)) * bands;
    const band = Math.min(bands, Math.floor(t));
    // Only the last 35% of each band dithers into the next.
    const blend = Math.max(0, (t - band - 0.65) / 0.35);
    const threshold = ((BAYER4[(y % 4) * 4 + (x % 4)] ?? 0) + 0.5) / 16;
    const index = blend > threshold ? Math.min(bands, band + 1) : band;
    g.set(x, y, P.sky[index] ?? null);
  });
  return g;
}

/** Drifting clouds: flat-bottomed puffs, lit on top and shaded underneath. */
export function buildClouds(w: number, h: number, seed: number): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const count = Math.max(3, Math.round(w / 30));

  for (let i = 0; i < count; i++) {
    const blue = rand() < 0.35;
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
      const color =
        top ? (blue ? P.cloudBlueLight : P.cloudLight)
        : y + 0.5 > cy ? (blue ? P.cloudBlueShadow : P.cloudShadow)
        : blue ? P.cloudBlue : P.cloud;
      g.set(x, y, color);
    });
  }
  return g;
}

/** A low far ridge with one big snow-capped peak in front, filled down to the bottom edge. */
export function buildMountains(w: number, h: number, seed: number): PixelGrid {
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
  const snowEdge = (x: number) => peakTop + h * 0.2 + rangeNoise(x * 7) * h * 0.05;

  // Shade by the overall slope (a few pixels either side), not single-pixel bumps,
  // so shadow sides form solid faces instead of thin vertical stripes.
  const facesAway = (top: (x: number) => number, x: number) => top(x + 4) > top(x - 4);

  for (let x = 0; x < w; x++) {
    const rTop = Math.round(ridgeTop(x));
    const rShadow = facesAway(ridgeTop, x);
    for (let y = rTop; y < h; y++) g.set(x, y, rShadow ? P.ridgeShadow : P.ridge);

    const mTop = Math.round(mainTop(x));
    const mShadow = facesAway(mainTop, x);
    for (let y = mTop; y < h; y++) {
      const snowy = y < snowEdge(x);
      const color = snowy ? (mShadow ? P.snowShadow : P.snow) : mShadow ? P.mountainShadow : P.mountain;
      g.set(x, y, color);
    }
  }
  return g;
}

/** Pine forest: stepped triangles over a solid band, lit from the left. */
export function buildTreeline(w: number, h: number, seed: number): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const bandTop = Math.round(h * 0.7);
  for (let x = 0; x < w; x++) for (let y = bandTop; y < h; y++) g.set(x, y, P.tree);

  let x = 0;
  while (x < w) {
    const height = Math.round(h * (0.35 + rand() * 0.6));
    const top = h - height;
    for (let row = 0; row < height; row++) {
      // Stepped sides: every third row the tree narrows back a little, like branches.
      const half = Math.floor(row * 0.3) - (row % 3 === 0 && row > 3 ? 1 : 0);
      for (let dx = -half; dx <= half; dx++) {
        const color = dx === -half && half > 0 ? P.treeLight : dx === half && half > 0 ? P.treeDark : P.tree;
        g.set(wrap(x + dx, w), top + row, color);
      }
    }
    x += 2 + Math.floor(rand() * 4);
  }
  return g;
}

/** Road seen from the side: kerb, asphalt with specks, lane dashes, dark near edge. */
export function buildRoad(w: number, h: number, laneY: number, seed: number): PixelGrid {
  if (w % LANE_PERIOD !== 0) throw new Error(`Road width must be a multiple of ${LANE_PERIOD}`);
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    let color: number = P.asphalt;
    if (y === 0) color = P.curb;
    else if (y === 1) color = P.asphaltDark;
    else if (y >= h - 2) color = P.roadEdge;
    else if (y === laneY && x % LANE_PERIOD < LANE_PERIOD / 2) color = P.lane;
    else if (rand() < 0.06) color = P.asphaltSpeck;
    g.set(x, y, color);
  });
  return g;
}
