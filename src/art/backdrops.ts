import type { BackdropKind, BiomePalette } from '../data/biomes';
import { dither, mix, shade } from './color';
import { buildMountains, wrap, wrappingNoise } from './landscape';
import { PixelGrid, seededRandom, type Point } from './PixelGrid';

/*
 * The far backdrop of each biome on the drive road: the layer between the sky and the
 * biome's middle-distance silhouette. Each biome has its own (landfill hills and a crane,
 * snowy peaks, a city skyline, desert buttes, floating crystal islands). Layers wrap left to
 * right, are filled to the bottom, and sink into the haze towards their base.
 *
 * Also the small sprites for the sky's ambient motion: birds, smoke puffs, heat shimmer and
 * the aurora.
 */

export interface Backdrop {
  grid: PixelGrid;
  /** Chimney and cooling-tower tops: where smoke rises from (grid pixels). */
  vents: Point[];
  /** Blinking warning lights (grid pixels). */
  beacons: Point[];
}

const WARNING_RED = 0xff4d4d;

/** Distant colours sink into the haze. */
const far = (c: number, p: BiomePalette, t = 0.35) => mix(c, p.haze, t);

function setW(g: PixelGrid, x: number, y: number, color: number): void {
  g.set(wrap(x, g.width), Math.round(y), color);
}

function rect(g: PixelGrid, x: number, y: number, w: number, h: number, color: number): void {
  for (let dx = 0; dx < w; dx++) for (let dy = 0; dy < h; dy++) setW(g, x + dx, y + dy, color);
}

/** A straight line (x wraps). */
function line(g: PixelGrid, x0: number, y0: number, x1: number, y1: number, color: number): void {
  const steps = Math.max(1, Math.ceil(Math.max(Math.abs(x1 - x0), Math.abs(y1 - y0))));
  for (let i = 0; i <= steps; i++) {
    const t = i / steps;
    setW(g, x0 + (x1 - x0) * t, y0 + (y1 - y0) * t, color);
  }
}

/** A low far ridge across the whole layer, rim-lit on its sunny slopes. */
function farRidge(g: PixelGrid, p: BiomePalette, top: (x: number) => number, hazeAmount = 0.35): void {
  const rim = mix(far(p.ridge, p, hazeAmount), p.rim, 0.35);
  for (let x = 0; x < g.width; x++) {
    const t = Math.round(top(x));
    const shadowSide = top(x + 3) - top(x - 3) > 0;
    for (let y = Math.max(0, t); y < g.height; y++) {
      const color = y === t && !shadowSide ? rim : shadowSide ? far(p.ridgeShadow, p, hazeAmount) : far(p.ridge, p, hazeAmount);
      g.set(x, y, color);
    }
  }
}

/** Fills a surface from `top(x)` down, lit or shadowed by its slope, with a rim on lit tops. */
function fillSurface(
  g: PixelGrid,
  top: (x: number) => number,
  colors: { lit: number; shadow: number; rim: number },
  texture?: (x: number, y: number, color: number) => number,
): void {
  for (let x = 0; x < g.width; x++) {
    const t = Math.round(top(x));
    const slope = (top(x + 3) - top(x - 3)) / 6;
    for (let y = Math.max(0, t); y < g.height; y++) {
      const soft = y - t < 4;
      const inShadow = soft ? dither(x, y, Math.min(1, Math.max(0, (slope + 0.08) / 0.16))) : slope > 0;
      let color = inShadow ? colors.shadow : y - t < 1 ? colors.rim : colors.lit;
      if (texture) color = texture(x, y, color);
      g.set(x, y, color);
    }
  }
}

/** The lower part of the layer sinks into the haze in dithered steps. Glowing pixels keep their colour. */
function sinkIntoHaze(g: PixelGrid, p: BiomePalette, from: number, keep: readonly number[] = []): void {
  const h = g.height;
  g.forEach((x, y, c) => {
    if (c === null || keep.includes(c)) return;
    if (dither(x + 1, y, (y / h - from) / (1 - from))) g.set(x, y, mix(c, p.haze, 0.3));
  });
}

/** Junkyard: low landfill hills under a giant scrap crane, power pylons and a car crusher. */
function buildScrapHills(w: number, h: number, seed: number, p: BiomePalette): Backdrop {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const beacons: Point[] = [];
  const ridgeNoise = wrappingNoise(w, rand, [2, 5, 11]);
  farRidge(g, p, (x) => h * 0.5 + ridgeNoise(x) * h * 0.07);

  const hillNoise = wrappingNoise(w, rand, [3, 7, 17]);
  const lumpNoise = wrappingNoise(w, rand, [29, 47, 71]);
  const hillTop = (x: number) => h * 0.68 + hillNoise(x) * h * 0.08 + lumpNoise(x) * h * 0.025;
  const steel = far(p.mountainShadow, p, 0.2);
  const steelLit = mix(steel, p.rim, 0.3);

  // Power pylons with sagging wires between them.
  const pylons = 3;
  const pylonHeight = Math.round(h * 0.3);
  const pylonX = (i: number) => Math.round(((i + 0.15) / pylons) * w);
  for (let i = 0; i < pylons; i++) {
    const x0 = pylonX(i);
    // The last pylon's wires run on to the first one, across the wrap.
    const x1 = pylonX(i + 1);
    const y0 = hillTop(x0) - pylonHeight + 2;
    const y1 = hillTop(wrap(x1, w)) - pylonHeight + 2;
    const span = x1 - x0;
    for (let k = 0; k <= span; k++) {
      const t = k / span;
      const sag = Math.sin(Math.PI * t) * h * 0.06;
      for (const arm of [-4, 4]) setW(g, x0 + k + arm, y0 + (y1 - y0) * t + sag, far(p.mountainShadow, p, 0.45));
    }
  }
  for (let i = 0; i < pylons; i++) {
    const x = pylonX(i);
    const base = Math.round(hillTop(x)) + 2;
    const top = base - pylonHeight;
    line(g, x - 3, base, x, top, steel);
    line(g, x + 3, base, x + 1, top, steel);
    for (let y = top + 4; y < base; y += 4) line(g, x - 2, y, x + 3, y + 3, steel);
    rect(g, x - 5, top + 2, 12, 1, steel);
    rect(g, x - 3, top + 5, 8, 1, steel);
    setW(g, x, top, steelLit);
  }

  // The crusher: a block with a hopper on top and one lit window.
  const cx = Math.round(w * 0.64);
  const crusherTop = Math.round(h * 0.42);
  const crusherBase = Math.round(hillTop(cx + 6)) + 3;
  rect(g, cx, crusherTop, 13, crusherBase - crusherTop, steel);
  rect(g, cx + 2, crusherTop - 5, 7, 5, steel);
  for (let y = crusherTop - 5; y < crusherBase; y++) setW(g, cx + (y < crusherTop ? 2 : 0), y, steelLit);
  rect(g, cx + 9, crusherTop + 3, 2, 2, p.glow);

  // The giant crane: a lattice mast, a long jib, a counterweight and a hanging claw.
  const mx = Math.round(w * 0.28);
  const mastTop = Math.round(h * 0.1);
  const mastBase = Math.round(hillTop(mx + 1)) + 3;
  for (let y = mastTop; y < mastBase; y++) {
    setW(g, mx, y, steelLit);
    setW(g, mx + 3, y, steel);
    if ((y - mastTop) % 4 === 0) rect(g, mx, y, 4, 1, steel);
    setW(g, mx + 1 + (Math.floor((y - mastTop) / 2) % 2), y, steel);
  }
  rect(g, mx - 12, mastTop, 52, 2, steel);
  for (let x = mx + 4; x < mx + 40; x += 3) setW(g, x, mastTop + 2, steel);
  rect(g, mx - 12, mastTop + 2, 6, 4, steel);
  line(g, mx + 1, mastTop - 5, mx + 38, mastTop, steel);
  line(g, mx + 1, mastTop - 5, mx - 12, mastTop, steel);
  for (let x = mx - 12; x < mx + 40; x++) setW(g, x, mastTop, steelLit);
  const cableX = mx + 32;
  const clawY = mastTop + Math.round(h * 0.2);
  for (let y = mastTop + 2; y < clawY; y++) setW(g, cableX, y, far(p.mountainShadow, p, 0.4));
  rect(g, cableX - 2, clawY, 5, 2, steel);
  for (const side of [-1, 1]) {
    setW(g, cableX + side * 3, clawY + 2, steel);
    setW(g, cableX + side * 3, clawY + 3, steel);
    setW(g, cableX + side * 2, clawY + 4, steel);
  }
  beacons.push({ x: mx + 1, y: mastTop - 6 });
  setW(g, mx + 1, mastTop - 6, WARNING_RED);

  // The landfill hills, with glints of scrap.
  fillSurface(
    g,
    hillTop,
    { lit: p.mountain, shadow: p.mountainShadow, rim: mix(p.mountain, p.rim, 0.3) },
    (x, y, c) => ((x * 7 + y * 13) % 37 === 0 ? mix(c, p.peak, 0.7) : (x * 5 + y * 3) % 23 === 0 ? shade(c, -0.25) : c),
  );
  sinkIntoHaze(g, p, 0.72, [p.glow]);
  return { grid: g, vents: [], beacons };
}

/** Rust Highway: the snowy peaks, with an old highway viaduct crossing the valley. */
function buildSnowPeaks(w: number, h: number, seed: number, p: BiomePalette): Backdrop {
  const g = buildMountains(w, h, seed, p);
  const deckY = Math.round(h * 0.62);
  const from = Math.round(w * 0.05);
  const to = Math.round(w * 0.55);
  const deck = far(p.mountainShadow, p, 0.25);
  const deckLit = mix(deck, p.rim, 0.4);
  for (let x = from; x < to; x++) {
    setW(g, x, deckY, deckLit);
    setW(g, x, deckY + 1, deck);
    setW(g, x, deckY + 2, shade(deck, -0.2));
    // Railing posts.
    if (x % 3 === 0) setW(g, x, deckY - 1, deck);
  }
  for (let x = from + 4; x < to - 2; x += 14) {
    for (let y = deckY + 3; y < h; y++) {
      setW(g, x, y, deck);
      setW(g, x + 1, y, shade(deck, -0.2));
    }
    // Arched braces under the deck.
    for (let k = 1; k < 7; k++) {
      const drop = Math.round(Math.sqrt(k) * 1.2);
      setW(g, x - k, deckY + 2 + 4 - drop, deck);
      setW(g, x + 1 + k, deckY + 2 + 4 - drop, deck);
    }
  }
  return { grid: g, vents: [], beacons: [] };
}

/** Industrial Zone: a far city skyline with lit windows, cooling towers and striped chimneys. */
function buildSkyline(w: number, h: number, seed: number, p: BiomePalette): Backdrop {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const vents: Point[] = [];
  const beacons: Point[] = [];
  const ridgeNoise = wrappingNoise(w, rand, [2, 4, 9]);
  farRidge(g, p, (x) => h * 0.62 + ridgeNoise(x) * h * 0.05, 0.45);

  // A hazy back row of thin towers.
  const backColor = far(p.mountain, p, 0.45);
  for (let x = 0; x < w; ) {
    const width = 3 + Math.floor(rand() * 6);
    const top = Math.round(h * (0.38 + rand() * 0.25));
    rect(g, x, top, width, h - top, backColor);
    if (rand() < 0.5) for (let y = top + 2; y < h; y += 3) if (rand() < 0.3) setW(g, x + 1, y, mix(p.glow, backColor, 0.55));
    x += width + Math.floor(rand() * 3);
  }

  const window = mix(p.glow, p.mountain, 0.3);
  const windowBright = mix(p.glow, 0xffffff, 0.3);
  const rimTop = mix(p.mountain, p.rim, 0.35);
  // Two cooling towers at least, then a random mix of towers and chimneys.
  const towerSpots = [Math.round(w * 0.14), Math.round(w * 0.62)];
  for (let x = 0; x < w; ) {
    const roll = rand();
    const due = towerSpots.length > 0 && x >= (towerSpots[0] ?? w);
    if (due) towerSpots.shift();
    if ((due || roll < 0.08) && x + 22 < w) {
      // Cooling tower: a waisted concrete shell, lit on the left.
      const width = 14 + Math.floor(rand() * 6);
      const height = Math.round(h * (0.3 + rand() * 0.1));
      const top = h - height;
      const cx = x + width / 2;
      for (let y = top; y < h; y++) {
        const t = (y - top) / height;
        const shape = t < 0.6 ? 0.7 + 0.12 * ((0.6 - t) / 0.6) ** 2 : 0.7 + 0.3 * ((t - 0.6) / 0.4) ** 2;
        const half = (width / 2) * shape;
        for (let px = Math.round(cx - half); px <= Math.round(cx + half); px++) {
          const u = (px - (cx - half)) / (2 * half);
          let color = u < 0.35 ? p.peak : u > 0.7 ? p.peakShadow : dither(px, y, (u - 0.35) / 0.35) ? p.peakShadow : p.peak;
          if (y === top) color = mix(p.peak, p.rim, 0.5);
          setW(g, px, y, color);
        }
      }
      vents.push({ x: Math.round(cx), y: top - 1 });
      x += width + 2 + Math.floor(rand() * 3);
      continue;
    }
    if (roll < 0.28) {
      // Chimney: a thin striped stack with a warning light.
      const top = Math.round(h * (0.08 + rand() * 0.15));
      for (let y = top; y < h; y++) {
        const band = Math.floor((y - top) / 4) % 2 === 0 ? mix(0xd0d0d8, p.haze, 0.55) : mix(WARNING_RED, p.haze, 0.6);
        setW(g, x, y, y - top < 16 ? band : p.mountainShadow);
        setW(g, x + 1, y, y - top < 16 ? shade(band, -0.25) : p.mountainShadow);
      }
      vents.push({ x, y: top - 1 });
      beacons.push({ x, y: top });
      x += 3 + Math.floor(rand() * 3);
      continue;
    }
    // Tower block.
    const width = 5 + Math.floor(rand() * 9);
    const top = Math.round(h * (0.28 + rand() * 0.42));
    for (let dx = 0; dx < width; dx++) {
      for (let y = top; y < h; y++) {
        const color = y === top ? rimTop : dx >= width - 2 ? p.mountainShadow : p.mountain;
        setW(g, x + dx, y, color);
      }
    }
    // Stepped crown on some.
    if (rand() < 0.35 && width > 6) rect(g, x + 2, top - 3, width - 4, 3, p.mountain);
    for (let y = top + 2; y < h - 1; y += 3) {
      for (let dx = 1; dx < width - 2; dx += 2) {
        const r = rand();
        if (r < 0.28) setW(g, x + dx, y, r < 0.05 ? windowBright : window);
      }
    }
    if (top < h * 0.42 && rand() < 0.6) {
      const mast = 4 + Math.floor(rand() * 6);
      const ax = x + Math.floor(width / 2);
      for (let y = top - mast; y < top; y++) setW(g, ax, y, p.mountainShadow);
      beacons.push({ x: ax, y: top - mast - 1 });
    }
    x += width + Math.floor(rand() * 3);
  }
  rect(g, 0, Math.round(h * 0.9), w, h, p.mountainShadow);
  for (const b of beacons) setW(g, b.x, b.y, WARNING_RED);
  sinkIntoHaze(g, p, 0.7, [window, windowBright, WARNING_RED, p.glow]);
  return { grid: g, vents, beacons };
}

/** Desert Canyons: a long plateau, flat-topped buttes with banded cliffs, and dunes in front. */
function buildButtes(w: number, h: number, seed: number, p: BiomePalette): Backdrop {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const plateauNoise = wrappingNoise(w, rand, [3, 8, 21]);
  const notches = new Set<number>();
  for (let i = 0; i < w / 40; i++) notches.add(Math.floor(rand() * w));
  const plateau = (x: number) => {
    const xi = wrap(x, w);
    let notch = 0;
    for (const n of notches) if (Math.abs(n - xi) < 4) notch = 3 - Math.abs(n - xi);
    return h * 0.46 + plateauNoise(x) * h * 0.02 + notch;
  };
  farRidge(g, p, plateau, 0.45);
  // Faint strata in the far plateau.
  g.forEach((x, y, c) => {
    if (c !== null && y > plateau(x) + 2 && y % 5 === 0) g.set(x, y, mix(c, p.mountainShadow, 0.15));
  });

  const floor = h * 0.8;
  const buttes: { cx: number; half: number; top: number; talus: number; cliff: number }[] = [];
  for (let x = Math.floor(rand() * 10); x < w - 10; ) {
    const half = 10 + Math.floor(rand() * 16);
    const top = Math.round(h * (0.3 + rand() * 0.22));
    const talus = 4 + Math.floor(rand() * 5);
    buttes.push({ cx: x + half + talus, half, top, talus, cliff: Math.round((floor - top) * (0.6 + rand() * 0.15)) });
    x += 2 * (half + talus) + 6 + Math.floor(rand() * 26);
  }
  const profile = (x: number): { top: number; butte: (typeof buttes)[number] | null } => {
    let best = { top: floor, butte: null as (typeof buttes)[number] | null };
    for (const b of buttes) {
      const raw = Math.abs(wrap(x, w) - b.cx);
      const dx = Math.min(raw, w - raw);
      let top: number;
      if (dx <= b.half) top = b.top;
      else if (dx <= b.half + b.talus) top = b.top + b.cliff + ((dx - b.half) / b.talus) * (floor - b.top - b.cliff);
      else continue;
      if (top < best.top) best = { top, butte: b };
    }
    return best;
  };
  const strata = (c: number) => mix(c, p.featureDark, 0.3);
  for (let x = 0; x < w; x++) {
    const { top, butte } = profile(x);
    const t0 = Math.round(top);
    for (let y = t0; y < h; y++) {
      let color: number;
      if (!butte || y > floor) {
        color = far(p.ridgeShadow, p, 0.2);
      } else {
        const raw = Math.abs(x - butte.cx);
        const signed = Math.min(raw, w - raw) * (x < butte.cx ? -1 : 1);
        const onCliff = Math.abs(signed) <= butte.half && y < butte.top + butte.cliff;
        if (onCliff) {
          const u = (signed + butte.half) / (2 * butte.half);
          color = u < 0.18 ? p.peak : u > 0.62 ? p.mountainShadow : dither(x, y, (u - 0.18) / 0.44) ? p.mountain : p.peak;
          if ((y - butte.top) % 5 === 4) color = strata(color);
          if (y === t0) color = mix(p.peak, p.rim, 0.5);
        } else {
          // Talus slopes: rubble, lit on the left, with a few loose stones.
          color = signed < 0 ? p.mountain : p.mountainShadow;
          if ((x * 7 + y * 11) % 17 === 0) color = shade(color, 0.12);
          if (y === t0) color = mix(color, p.rim, 0.25);
        }
      }
      g.set(x, y, color);
    }
  }

  // Dunes in front, with bright crests.
  const duneNoise = wrappingNoise(w, rand, [2, 5, 9]);
  fillSurface(g, (x) => h * 0.84 + duneNoise(x) * h * 0.05, {
    lit: p.ridge,
    shadow: p.ridgeShadow,
    rim: mix(p.ridge, p.rim, 0.5),
  });
  sinkIntoHaze(g, p, 0.82);
  return { grid: g, vents: [], beacons: [] };
}

/** The Unknown: huge leaning crystal shards and rock islands floating in the air. */
function buildShardIslands(w: number, h: number, seed: number, p: BiomePalette): Backdrop {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const ridgeNoise = wrappingNoise(w, rand, [3, 7, 19, 37]);
  farRidge(g, p, (x) => h * 0.58 - Math.abs(ridgeNoise(x)) * h * 0.12, 0.3);

  const lit = mix(p.peak, p.mountain, 0.45);
  for (let x = Math.floor(rand() * 8); x < w; ) {
    const height = Math.round(h * (0.3 + rand() * 0.62));
    const half = 3 + Math.floor(rand() * 5);
    const lean = (rand() - 0.5) * 0.5;
    const seam = rand() < 0.5;
    for (let row = 0; row < height; row++) {
      const y = h - row;
      const t = row / height;
      const span = Math.max(0, Math.round(half * (1 - t)));
      const cx = x + lean * row;
      for (let dx = -span; dx <= span; dx++) {
        let color = dx < 0 ? lit : p.mountainShadow;
        if (dx === -span) color = mix(p.peak, p.rim, 0.3);
        if (dx === 0) color = seam && row % 4 !== 0 ? p.glow : p.mountain;
        setW(g, cx + dx, y, color);
      }
    }
    x += 2 * half + 4 + Math.floor(rand() * 18);
  }
  rect(g, 0, Math.round(h * 0.88), w, h, p.mountainShadow);

  // Floating islands: flat grassy-crystal tops over rocky undersides that taper to a point.
  const islands = Math.max(2, Math.round(w / 90));
  for (let i = 0; i < islands; i++) {
    const cx = ((i + 0.3 + rand() * 0.4) / islands) * w;
    const cy = h * (0.12 + rand() * 0.25);
    const r = 11 + rand() * 10;
    const depth = r * (0.9 + rand() * 0.5);
    for (let dy = -2; dy < depth; dy++) {
      const half = dy < 0 ? r * (0.85 + dy * 0.06) : r * (1 - dy / depth) ** 0.8;
      for (let dx = Math.round(-half); dx <= Math.round(half); dx++) {
        let color: number;
        if (dy < 0) color = dy === -2 ? mix(p.peak, p.rim, 0.5) : p.peak;
        else color = dx < -half * 0.3 ? p.mountain : dither(cx + dx, cy + dy, 0.6) ? p.mountainShadow : p.featureDark;
        setW(g, cx + dx, cy + dy, color);
      }
    }
    // Crystals on top and glowing drips below.
    for (let k = 0; k < 3; k++) {
      const kx = cx + (rand() - 0.5) * r * 1.2;
      const tall = 2 + Math.floor(rand() * 4);
      for (let y = 0; y < tall; y++) setW(g, kx, cy - 3 - y, y === tall - 1 ? mix(p.glow, 0xffffff, 0.5) : p.glow);
    }
    for (let k = 0; k < 2; k++) setW(g, cx + (rand() - 0.5) * 2, cy + depth + k * 2, p.glow);
  }
  sinkIntoHaze(g, p, 0.75, [p.glow]);
  return { grid: g, vents: [], beacons: [] };
}

/** The far backdrop layer for a biome. */
export function buildBackdrop(kind: BackdropKind, w: number, h: number, seed: number, palette: BiomePalette): Backdrop {
  switch (kind) {
    case 'scrapHills':
      return buildScrapHills(w, h, seed, palette);
    case 'snowPeaks':
      return buildSnowPeaks(w, h, seed, palette);
    case 'skyline':
      return buildSkyline(w, h, seed, palette);
    case 'buttes':
      return buildButtes(w, h, seed, palette);
    case 'shardIslands':
      return buildShardIslands(w, h, seed, palette);
  }
}

/** A bird seen from far off: wings up (frame 0) or down (frame 1). */
export function buildBird(frame: number, color: number): PixelGrid {
  const g = new PixelGrid(7, 4);
  const pixels =
    frame === 0
      ? [[0, 0], [1, 1], [2, 2], [3, 2], [4, 2], [5, 1], [6, 0]]
      : [[0, 2], [1, 1], [2, 1], [3, 2], [4, 1], [5, 1], [6, 2], [3, 3]];
  for (const [x, y] of pixels) g.set(x as number, y as number, color);
  return g;
}

/** A soft puff of smoke: dense in the middle, dithered at the edge. */
export function buildPuff(radius: number, color: number): PixelGrid {
  const size = radius * 2 + 1;
  const g = new PixelGrid(size, size);
  g.forEach((x, y) => {
    const d = Math.hypot(x - radius, y - radius) / radius;
    if (d <= 1 && dither(x, y, 1.15 - d)) g.set(x, y, d < 0.5 && y < radius ? shade(color, 0.12) : color);
  });
  return g;
}

/** Heat shimmer: broken, wavering streaks of light just above the horizon (wraps). */
export function buildShimmer(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const color = mix(palette.rim, palette.haze, 0.4);
  for (let i = 0; i < w / 4; i++) {
    const x = Math.floor(rand() * w);
    const y = Math.floor(rand() * h);
    const length = 3 + Math.floor(rand() * 9);
    for (let k = 0; k < length; k++) if (dither(x + k, y, 0.7)) setW(g, x + k, y, color);
  }
  return g;
}

/** Aurora curtains: wavy ribbons of light hanging in the sky (wraps; draw additively). */
export function buildAurora(w: number, h: number, seed: number, palette: BiomePalette): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(w, h);
  const centre = wrappingNoise(w, rand, [1, 3, 5]);
  const length = wrappingNoise(w, rand, [4, 9, 17]);
  const low = mix(palette.glow, 0x000000, 0.2);
  const high = mix(palette.peak, 0x000000, 0.25);
  for (let x = 0; x < w; x++) {
    const base = h * 0.62 + centre(x) * h * 0.25;
    const len = h * (0.25 + 0.2 * (length(x) + 1));
    for (let k = 0; k < len; k++) {
      const t = k / len;
      // Strongest at the bottom edge of the curtain, fading upwards, with vertical rays.
      const ray = (Math.sin(x * 0.9) + 1) / 2;
      if (dither(x, Math.round(base - k), (1 - t) * (0.55 + 0.45 * ray))) g.set(x, Math.round(base - k), t < 0.35 ? low : high);
    }
  }
  return g;
}
