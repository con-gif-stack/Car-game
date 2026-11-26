import { BIOMES_BY_ID, type BiomePalette, type SceneryFeature } from '../data/biomes';
import { bayer, dither, mix, shade } from './color';
import { PixelGrid, seededRandom } from './PixelGrid';

/*
 * Scenery for the drive road, generated in code. Each biome supplies a palette and a
 * middle-distance silhouette (junk piles, pines, factories, mesas, crystal spires). The style
 * follows the art references: banded skies, layered depth, colour built up in dithered steps,
 * with rim light from the sky on top edges and air (haze) between the far layers and the
 * camera. Every layer except the sky wraps left to right so it can scroll forever.
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

/** Lane dash pattern length; road layer widths must be a multiple of this to wrap cleanly. */
export const LANE_PERIOD = 12;

export const wrap = (x: number, w: number) => ((Math.round(x) % w) + w) % w;

/** Smooth, wrapping height noise in [-1, 1] built from whole-period sine waves. */
export function wrappingNoise(w: number, rand: () => number, octaves: readonly number[]): (x: number) => number {
  const waves = octaves.map((k, i) => ({ k, phase: rand() * Math.PI * 2, amp: 1 / (i + 1) }));
  const total = waves.reduce((sum, wave) => sum + wave.amp, 0);
  return (x) =>
    waves.reduce((sum, wave) => sum + wave.amp * Math.sin((2 * Math.PI * wave.k * x) / w + wave.phase), 0) / total;
}

/**
 * Banded sky with short dithered steps between bands. Bands reach the last colour at
 * `horizonY`. With `stars`, night skies get a scatter of stars in the upper bands.
 */
export function buildSky(
  w: number,
  h: number,
  horizonY: number,
  palette: BiomePalette = DEFAULT_PALETTE,
  stars = false,
  seed = 3,
): PixelGrid {
  const g = new PixelGrid(w, h);
  const sky = palette.sky;
  const bands = sky.length - 1;
  g.forEach((x, y) => {
    const t = Math.min(1, y / Math.max(1, horizonY)) * bands;
    const band = Math.min(bands, Math.floor(t));
    // Only the last 35% of each band dithers into the next.
    const blend = Math.max(0, (t - band - 0.65) / 0.35);
    const index = dither(x, y, blend) ? Math.min(bands, band + 1) : band;
    g.set(x, y, sky[index] ?? null);
  });
  if (stars && palette.night >= 0.5) {
    const rand = seededRandom(seed);
    const count = Math.round(w * h * 0.004 * palette.night);
    for (let i = 0; i < count; i++) {
      const x = Math.floor(rand() * w);
      const y = Math.floor(rand() * horizonY * 0.55);
      const bright = rand() < 0.2;
      const base = g.get(x, y) ?? 0;
      g.set(x, y, mix(base, 0xffffff, bright ? 0.85 : 0.45));
      if (bright && rand() < 0.5) {
        for (const [dx, dy] of [[1, 0], [-1, 0], [0, 1], [0, -1]] as const) {
          g.set(x + dx, y + dy, mix(g.get(x + dx, y + dy) ?? base, 0xffffff, 0.3));
        }
      }
    }
  }
  return g;
}

/** A sun or moon with a dithered halo, for placing low in the sky. */
export function buildSkyDisc(radius: number, palette: BiomePalette): PixelGrid {
  const halo = radius * 3;
  const size = halo * 2;
  const g = new PixelGrid(size, size);
  const c = halo;
  const sun = palette.disc === 'sun';
  const core = sun ? mix(palette.rim, 0xffffff, 0.55) : mix(palette.rim, 0xffffff, 0.75);
  const edge = sun ? palette.rim : mix(palette.rim, palette.haze, 0.3);
  g.forEach((x, y) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d <= radius) {
      // Moon: a darker crescent and a few craters.
      if (!sun && Math.hypot(x + 0.5 - c - radius * 0.45, y + 0.5 - c + radius * 0.2) < radius * 0.85) {
        g.set(x, y, mix(edge, palette.sky[2] ?? edge, 0.5));
        return;
      }
      g.set(x, y, d > radius - 1.2 ? edge : core);
      return;
    }
    const t = 1 - (d - radius) / (halo - radius);
    if (t > 0 && dither(x, y, t * t * 0.9)) g.set(x, y, mix(edge, palette.haze, 0.35));
  });
  return g;
}

/** Drifting clouds: flat-bottomed puffs, rim-lit on top and shaded underneath. */
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
    // Shade: rim-lit top edge, body, then a dithered step into the shadowed underside.
    const rimTop = mix(colors.light, palette.rim, 0.4);
    cloud.forEach((x, y, c) => {
      if (c === null) return;
      const top = cloud.get(x, y - 1) === null;
      const under = (y + 0.5 - (cy - thickness * 0.2)) / (thickness * 0.6);
      const color = top ? rimTop : under > 1 ? colors.shadow : dither(x, y, under) ? colors.shadow : colors.base;
      g.set(x, y, color);
    });
  }
  return g;
}

/**
 * A low far ridge with one big peak in front (snow-capped, or a paler summit), filled to the
 * bottom. Lit faces catch the sky's light along their edges; shadow faces dither into the lit
 * ones; everything fades into the haze towards the base.
 */
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
  const slope = (top: (x: number) => number, x: number) => (top(x + 4) - top(x - 4)) / 8;
  const far = (c: number) => mix(c, palette.haze, 0.35);
  const ridgeRim = mix(far(palette.ridge), palette.rim, 0.35);
  const mountainRim = mix(palette.mountain, palette.rim, 0.3);

  for (let x = 0; x < w; x++) {
    const rTop = Math.round(ridgeTop(x));
    const rShadow = slope(ridgeTop, x) > 0;
    for (let y = rTop; y < h; y++) {
      const color = y === rTop && !rShadow ? ridgeRim : rShadow ? far(palette.ridgeShadow) : far(palette.ridge);
      g.set(x, y, color);
    }

    const mTop = Math.round(mainTop(x));
    const s = slope(mainTop, x);
    for (let y = mTop; y < h; y++) {
      const capped = y < capEdge(x);
      // Near the ridge line the shadow face dithers into the lit face; lower down the edge is hard,
      // so the turn of the slope doesn't leave a dotted column.
      const soft = y - mTop < 6;
      const inShadow = soft ? dither(x, y, Math.min(1, Math.max(0, (s + 0.06) / 0.12))) : s > 0;
      let color: number;
      if (capped) {
        color = inShadow ? palette.peakShadow : y === mTop ? mix(palette.peak, 0xffffff, 0.4) : palette.peak;
      } else if (inShadow) {
        color = palette.mountainShadow;
      } else {
        color = y - mTop < 2 ? mountainRim : palette.mountain;
      }
      // The lower slopes sink into the haze.
      if (!capped && dither(x + 1, y, (y / h - 0.62) / 0.38)) color = mix(color, palette.haze, 0.3);
      g.set(x, y, color);
    }
  }
  return g;
}

/** A static haze band: the haze colour, thickening downwards in dithered steps. */
export function buildHaze(w: number, h: number, palette: BiomePalette): PixelGrid {
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    const t = y / Math.max(1, h - 1);
    // Mostly clear, with a dithered fade into a solid band at the very bottom.
    const density = t > 0.85 ? 1 : ((t - 0.25) / 0.6) ** 2 * 0.7;
    if (t > 0.25 && dither(x, y, density)) g.set(x, y, palette.haze);
  });
  return g;
}

/**
 * Lights a filled silhouette made of the feature colour: rim light on top edges, light on
 * the left, dark on the right, and darkness gathering towards the base. Pixels of other
 * colours (windows, strata) are left as they are.
 */
export function lightSilhouette(g: PixelGrid, palette: BiomePalette): void {
  const w = g.width;
  const h = g.height;
  const rimTop = mix(palette.featureLight, palette.rim, 0.45);
  const updates: [number, number, number][] = [];
  g.forEach((x, y, c) => {
    if (c !== palette.feature) return;
    const above = g.get(x, y - 1) === null;
    const left = g.get(wrap(x - 1, w), y) === null;
    const right = g.get(wrap(x + 1, w), y) === null;
    const base = (y / h - 0.6) / 0.4;
    let color: number = c;
    if (above) color = rimTop;
    else if (left) color = palette.featureLight;
    else if (right) color = palette.featureDark;
    else if (g.get(x, y - 2) === null && dither(x, y, 0.5)) color = palette.featureLight;
    else if (dither(x, y, base)) color = palette.featureDark;
    updates.push([x, y, color]);
  });
  for (const [x, y, color] of updates) g.set(x, y, color);
}

/** Fills a solid band along the bottom of a silhouette layer. */
function fillBand(g: PixelGrid, top: number, color: number): void {
  for (let x = 0; x < g.width; x++) for (let y = top; y < g.height; y++) g.set(x, y, color);
}

/** Pine forest: stepped triangles over a solid band, lit from the left, rim-lit tips. */
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
    g.set(wrap(x, w), top, mix(palette.featureLight, palette.rim, 0.5));
    x += 2 + Math.floor(rand() * 4);
  }
  // Darkness gathers at the foot of the forest.
  g.forEach((px, py, c) => {
    if (c === palette.feature && dither(px, py, (py / h - 0.65) / 0.35)) g.set(px, py, palette.featureDark);
  });
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
      g.set(wrap(cx + 3, w), base - 4, palette.glow);
    } else {
      for (let dy = 0; dy < 6; dy++) for (let dx = 0; dx < 3; dx++) g.set(wrap(cx + dx, w), base - dy, palette.featureDark);
    }
  }
  // Scattered scrap glints.
  g.forEach((x, y, c) => {
    if (c === palette.feature && rand() < 0.025) g.set(x, y, palette.featureLight);
  });
  lightSilhouette(g, palette);
  return g;
}

/** Factory skyline: blocky buildings, smokestacks with warning lights, and lit windows. */
function buildFactories(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.8), palette.feature);
  const lights: [number, number][] = [];
  let x = 0;
  while (x < w) {
    const width = 6 + Math.floor(rand() * 10);
    const top = Math.round(h * (0.35 + rand() * 0.4));
    for (let dx = 0; dx < width; dx++) for (let y = top; y < h; y++) g.set(wrap(x + dx, w), y, palette.feature);
    // Saw-tooth roof on some halls.
    if (rand() < 0.4) {
      for (let dx = 0; dx < width; dx++) for (let k = 1; k <= dx % 4; k++) g.set(wrap(x + dx, w), top - k, palette.feature);
    }
    // Windows.
    for (let y = top + 2; y < h - 2; y += 3) {
      for (let dx = 1; dx < width - 1; dx += 3) if (rand() < 0.35) lights.push([wrap(x + dx, w), y]);
    }
    // Smokestack with a red light on top.
    if (rand() < 0.45) {
      const sx = x + Math.floor(width / 2);
      const stackTop = Math.max(1, top - Math.round(h * (0.2 + rand() * 0.2)));
      for (let y = stackTop; y < top; y++) {
        g.set(wrap(sx, w), y, palette.featureDark);
        g.set(wrap(sx + 1, w), y, (y - stackTop) % 5 === 1 ? palette.featureLight : palette.featureDark);
      }
      g.set(wrap(sx, w), stackTop - 1, 0xff4d4d);
    }
    x += width + Math.floor(rand() * 4);
  }
  lightSilhouette(g, palette);
  for (const [lx, ly] of lights) g.set(lx, ly, rand() < 0.7 ? palette.glow : mix(palette.glow, 0xffffff, 0.5));
  return g;
}

/** Desert mesas: flat-topped rock towers with banded strata. */
function buildMesas(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.82), palette.feature);
  const strata = mix(palette.feature, palette.featureDark, 0.6);
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
        g.set(wrap(x + dx, w), y, stratum ? strata : palette.feature);
      }
    }
    x += width + 4 + Math.floor(rand() * 14);
  }
  lightSilhouette(g, palette);
  return g;
}

/** Strange crystal spires for the unknown lands, with glowing seams. */
function buildSpires(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  fillBand(g, Math.round(h * 0.8), palette.feature);
  let x = 0;
  while (x < w) {
    const height = Math.round(h * (0.3 + rand() * 0.65));
    const half = 1 + Math.floor(rand() * 3);
    const seam = rand() < 0.4;
    for (let row = 0; row < height; row++) {
      const span = Math.round((row / height) * half);
      for (let dx = -span; dx <= span; dx++) {
        const color = dx === -span ? palette.peak : dx === 0 && seam && row % 3 !== 0 ? palette.glow : palette.feature;
        g.set(wrap(x + dx, w), h - height + row, color);
      }
    }
    x += 3 + Math.floor(rand() * 8);
  }
  lightSilhouette(g, palette);
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

/** A palette for a closer, darker copy of the feature layer (more depth between it and the road). */
export function nearPalette(palette: BiomePalette): BiomePalette {
  return {
    ...palette,
    featureLight: mix(palette.featureLight, palette.featureDark, 0.45),
    feature: mix(palette.feature, palette.groundDark, 0.45),
    featureDark: mix(palette.featureDark, 0x000000, 0.35),
    glow: palette.glow,
  };
}

/**
 * Road seen from the side: kerb, asphalt shaded lighter towards the far side, specks and
 * cracks, lane dashes with a shadow, and a dark near edge. The palette tints the asphalt.
 */
export function buildRoad(w: number, h: number, laneY: number, seed: number, palette?: BiomePalette): PixelGrid {
  if (w % LANE_PERIOD !== 0) throw new Error(`Road width must be a multiple of ${LANE_PERIOD}`);
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const tint = (c: number) => (palette ? mix(c, palette.ground, 0.18) : c);
  const asphalt = tint(R.asphalt);
  const far = palette ? mix(asphalt, palette.haze, 0.12) : asphalt;
  const near = shade(asphalt, -0.18);
  const curb = palette ? mix(R.curb, palette.rim, 0.15) : R.curb;
  g.forEach((x, y) => {
    let color: number;
    if (y === 0) color = curb;
    else if (y === 1) color = tint(R.asphaltDark);
    else if (y >= h - 2) color = R.roadEdge;
    else if (y === laneY && x % LANE_PERIOD < LANE_PERIOD / 2) color = R.lane;
    else if (y === laneY + 1 && x % LANE_PERIOD < LANE_PERIOD / 2) color = tint(R.asphaltDark);
    else {
      const t = (y - 2) / Math.max(1, h - 4);
      color = t < 0.3 ? (dither(x, y, t / 0.3) ? asphalt : far) : t > 0.75 ? (dither(x, y, (t - 0.75) / 0.25) ? near : asphalt) : asphalt;
      if (rand() < 0.06) color = tint(R.asphaltSpeck);
    }
    g.set(x, y, color);
  });
  // Cracks: short dark zig-zags.
  if (palette) {
    for (let i = 0; i < Math.round(w / 40); i++) {
      let cx = Math.floor(rand() * w);
      let cy = 2 + Math.floor(rand() * (h - 5));
      for (let k = 0; k < 4 + rand() * 4; k++) {
        if (cy === laneY) break;
        g.set(wrap(cx, w), cy, tint(R.roadEdge));
        cx += 1;
        if (rand() < 0.4) cy += rand() < 0.5 ? 1 : -1;
        cy = Math.min(h - 3, Math.max(2, cy));
      }
    }
  }
  return g;
}

/**
 * The ground in front of the road, close to the camera: a ragged top edge (grass tufts,
 * stones), darker towards the bottom of the screen, with pebbles and dithered texture.
 */
export function buildVerge(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const edge = wrappingNoise(w, rand, [5, 11, 23, 41]);
  const lip = 3;
  const tufts = new Set<number>();
  for (let i = 0; i < w / 6; i++) tufts.add(Math.floor(rand() * w));
  for (let x = 0; x < w; x++) {
    const top = Math.round(lip + edge(x) * 1.5) - (tufts.has(x) ? 2 : 0);
    for (let y = Math.max(0, top); y < h; y++) {
      const t = (y - top) / Math.max(1, h - top);
      let color: number;
      if (y === top) color = mix(palette.groundLight, palette.rim, 0.25);
      else if (y === top + 1) color = palette.groundLight;
      else if (t < 0.45) color = dither(x, y, (t - 0.1) / 0.35) ? palette.ground : palette.groundLight;
      else color = dither(x, y, (t - 0.45) / 0.55) ? palette.groundDark : palette.ground;
      // Texture: a sparse ordered pattern of darker flecks.
      if (y > top + 1 && bayer(x * 3, y * 5) < 0.07) color = shade(color, -0.25);
      g.set(x, y, color);
    }
  }
  // Pebbles: little lit stones.
  for (let i = 0; i < w / 10; i++) {
    const px = Math.floor(rand() * w);
    const py = lip + 3 + Math.floor(rand() * (h - lip - 4));
    const stone = mix(palette.groundLight, palette.feature, 0.3);
    g.set(px, py, shade(stone, 0.2));
    g.set(wrap(px + 1, w), py, stone);
    g.set(px, py + 1, shade(stone, -0.3));
    g.set(wrap(px + 1, w), py + 1, shade(stone, -0.4));
  }
  return g;
}
