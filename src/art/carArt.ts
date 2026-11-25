import { carProgress, getInstalledPart, type CarState, type SlotId } from '../core/vehicle';
import { QUALITIES } from '../data/vehicles';
import { PixelGrid, seededRandom, type Point } from './PixelGrid';

/*
 * Placeholder pixel art for the starter car, generated in code: an old, rusty hatchback in
 * side view, facing right. The body, wheels and brakes are separate sprites so wheels can spin.
 * Installed parts change the look (see CarLook). Colours come from the palette below.
 */

export const RUSTBUCKET_PALETTE = {
  outline: 0x111116,
  outlineSoft: 0x24403c,
  paintLight: 0x86b3a8,
  paint: 0x5f8f86,
  paintDark: 0x426a64,
  paintShadow: 0x2e4a47,
  glass: 0x1f2c3a,
  glassLight: 0x4d6b82,
  rustLight: 0xb8692f,
  rust: 0x8a4b23,
  rustDark: 0x5a2f17,
  bumper: 0x5d5d66,
  bumperLight: 0x7c7c86,
  chrome: 0x9a9aa4,
  headlight: 0xe8dc9a,
  headlightDim: 0xb8ab6c,
  taillight: 0xb8352a,
  taillightLight: 0xe0574a,
  wheelWell: 0x0b0b0f,
  tire: 0x1c1c22,
  tireLight: 0x34343e,
  rim: 0x8d8f98,
  rimLight: 0xb4b6be,
  rimDark: 0x585a63,
  alloy: 0xc9ccd4,
  alloyLight: 0xeef0f4,
  alloyDark: 0x8a8e99,
  gunmetal: 0x5a5e6a,
  gunmetalLight: 0x8b90a0,
  raceRim: 0x1a1a20,
  raceLip: 0xff9f1c,
  disc: 0x6c707b,
  discDark: 0x474a54,
  pipeBurnt: 0x4a5a8a,
  pipeBurntLight: 0x7f8fc8,
  meshDark: 0x2b2d36,
  meshLight: 0x6a6d78,
} as const;

/** Caliper colour by brake tier rank (Street and up show through spoked rims). */
const CALIPER_COLORS = [0x585a63, 0x585a63, 0xa3abbb, 0xd0342c, 0xe0b030];

/** What the car looks like, worked out from its installed parts. */
export interface CarLook {
  /** Rust patches left on the body (all of them on a new car, none when fully upgraded). */
  rustPatches: number;
  /** Tier rank of the exhaust (0 = Worn). */
  exhaustRank: number;
  /** Intercooler showing in the front bumper. */
  turbo: boolean;
  /** Pixels the body sits lower (better suspension). */
  rideDrop: number;
  /** Tier rank of the tyres, which sets the rim style. */
  wheelRank: number;
  /** Tier rank of the brakes, which sets the caliper colour. */
  brakeRank: number;
}

/** Total rust patches the body can have (8 around the arches, 10 elsewhere). */
export const MAX_RUST_PATCHES = 18;

function rank(car: CarState, slot: SlotId): number {
  const part = getInstalledPart(car, slot);
  return part ? QUALITIES[part.quality].rank : -1;
}

export function lookForCar(car: CarState): CarLook {
  const suspension = rank(car, 'suspension');
  return {
    // Rust is cleaned up as the car is restored: gone once every part is at the top tier.
    rustPatches: Math.round(MAX_RUST_PATCHES * Math.max(0, 1 - carProgress(car) / 4)),
    exhaustRank: Math.max(0, rank(car, 'exhaust')),
    turbo: car.parts.turbo !== null,
    rideDrop: suspension >= 3 ? 2 : suspension >= 2 ? 1 : 0,
    wheelRank: Math.max(0, rank(car, 'tires')),
    brakeRank: Math.max(0, rank(car, 'brakes')),
  };
}

const STOCK_LOOK: CarLook = { rustPatches: MAX_RUST_PATCHES, exhaustRank: 0, turbo: false, rideDrop: 0, wheelRank: 0, brakeRank: 0 };

/** Positions in body-grid pixels, so the view can line the wheels up with the arches. */
export const RUSTBUCKET_LAYOUT = {
  bodyWidth: 75,
  bodyHeight: 27,
  wheelSize: 18,
  /** Wheel centres (between pixels, so the 18-pixel wheel sits exactly on them). */
  wheelCenters: [
    { x: 17, y: 22 },
    { x: 57, y: 22 },
  ] as readonly Point[],
  /** Where the tyres touch the ground. */
  groundY: 30,
} as const;

const P = RUSTBUCKET_PALETTE;
const PAINT_COLORS = new Set<number>([P.paintLight, P.paint, P.paintDark, P.paintShadow]);

const BODY_SHAPE: Point[] = [
  { x: 2, y: 24 },
  { x: 2, y: 14 },
  { x: 4, y: 12 },
  { x: 9, y: 6 },
  { x: 13, y: 4 },
  { x: 37, y: 4 },
  { x: 39, y: 5 },
  { x: 48, y: 11 },
  { x: 64, y: 12 },
  { x: 69, y: 13 },
  { x: 72, y: 16 },
  { x: 72, y: 24 },
];

const WINDOW_SHAPE: Point[] = [
  { x: 11, y: 11.5 },
  { x: 11, y: 7 },
  { x: 14, y: 5 },
  { x: 36, y: 5 },
  { x: 38, y: 6 },
  { x: 45, y: 11.5 },
];

const ARCH_RADIUS = 8.6;

export function buildRustbucketBody(look: CarLook = STOCK_LOOK): PixelGrid {
  const { bodyWidth, bodyHeight, wheelCenters } = RUSTBUCKET_LAYOUT;
  const g = new PixelGrid(bodyWidth, bodyHeight);

  // Base paint, then shading by height: lower body darker, sills darkest.
  g.fillPolygon(BODY_SHAPE, P.paint);
  g.paint(P.paintDark, (_x, y, c) => c !== null && y >= 19);
  g.paint(P.paintShadow, (_x, y, c) => c !== null && y >= 22);
  // Highlight along the top edge of every column.
  for (let x = 0; x < g.width; x++) {
    for (let y = 0; y < g.height; y++) {
      if (g.get(x, y) !== null) {
        g.set(x, y, P.paintLight);
        break;
      }
    }
  }
  // Crease along the side, just under the windows.
  g.paint(P.paintLight, (x, y, c) => c !== null && y === 13 && x >= 5 && x <= 66);
  g.paint(P.paintShadow, (x, y, c) => c !== null && y === 12 && x >= 10 && x <= 47);

  // Windows with a diagonal reflection, split by the door pillar.
  g.fillPolygon(WINDOW_SHAPE, P.glass);
  g.paint(P.glassLight, (x, y, c) => c === P.glass && (((x - y) % 14) + 14) % 14 === 0);
  g.paint(P.paintShadow, (x, _y, c) => (c === P.glass || c === P.glassLight) && (x === 27 || x === 28));

  // Door seams, handle and mirror.
  g.paint(P.paintShadow, (x, y, c) => c !== null && x === 28 && y >= 13 && y <= 22);
  g.paint(P.paintShadow, (x, y, c) => c !== null && x === 45 && y >= 12 && y <= 21);
  for (let x = 31; x <= 33; x++) {
    g.set(x, 15, P.chrome);
    g.set(x, 16, P.paintShadow);
  }
  g.set(46, 10, P.paintShadow);
  g.set(47, 10, P.paintShadow);
  g.set(46, 11, P.paintShadow);

  // Bumpers and lights.
  g.paint(P.bumper, (x, y, c) => c !== null && y >= 20 && (x <= 5 || x >= 67));
  g.paint(P.bumperLight, (_x, y, c) => c === P.bumper && y === 20);
  for (let y = 15; y <= 16; y++) {
    g.set(71, y, P.headlight);
    g.set(70, y, P.headlightDim);
  }
  for (let y = 14; y <= 16; y++) {
    g.set(2, y, P.taillight);
    g.set(3, y, y === 14 ? P.taillightLight : P.taillight);
  }

  addRust(g, seededRandom(1987), wheelCenters, look.rustPatches);
  if (look.turbo) drawIntercooler(g);

  // Wheel wells: dark openings behind the wheels.
  for (const center of wheelCenters) {
    g.paint(
      P.wheelWell,
      (x, y, c) => c !== null && (x + 0.5 - center.x) ** 2 + (y + 0.5 - center.y) ** 2 <= ARCH_RADIUS ** 2,
    );
  }

  drawExhaust(g, look.exhaustRank);

  // As in the reference car: a dark shade of the paint along the top, near-black underneath.
  g.outline((_x, y) => (y <= 14 ? P.outlineSoft : P.outline));
  return g;
}

/** Exhaust tip under the rear bumper, better with each tier. */
function drawExhaust(g: PixelGrid, exhaustRank: number): void {
  switch (exhaustRank) {
    case 0: // Rusty stub.
      for (let x = 3; x <= 6; x++) g.set(x, 25, x === 3 ? P.rimDark : x === 4 ? P.rust : P.bumper);
      break;
    case 1: // Clean pipe.
      for (let x = 2; x <= 6; x++) g.set(x, 25, x === 2 ? P.rimDark : P.bumperLight);
      break;
    case 2: // Chrome tip.
      for (let x = 1; x <= 6; x++) g.set(x, 25, x === 1 ? P.rimDark : P.chrome);
      g.set(1, 24, P.chrome);
      g.set(2, 24, P.alloyLight);
      break;
    case 3: // Twin chrome tips.
      for (let x = 1; x <= 6; x++) {
        g.set(x, 25, x === 1 ? P.rimDark : P.chrome);
        if (x <= 4) g.set(x, 24, x === 1 ? P.rimDark : P.alloyLight);
      }
      break;
    default: // Big heat-tinted race pipe.
      for (let x = 1; x <= 7; x++) {
        g.set(x, 24, x === 1 ? P.outline : P.pipeBurntLight);
        g.set(x, 25, x === 1 ? P.outline : P.pipeBurnt);
      }
  }
}

/** Intercooler mesh showing through the front bumper when a turbo is fitted. */
function drawIntercooler(g: PixelGrid): void {
  for (let x = 67; x <= 71; x++) {
    for (let y = 21; y <= 22; y++) g.set(x, y, (x + y) % 2 === 0 ? P.meshDark : P.meshLight);
  }
}

/**
 * Scatters patches of rust over painted areas, mostly low down and around the wheel arches.
 * Only the first `patches` are painted, so restoring the car removes rust patch by patch while
 * the rest stay exactly where they were.
 */
function addRust(g: PixelGrid, rand: () => number, wheelCenters: readonly Point[], patches: number): void {
  const isPaint = (x: number, y: number) => {
    const c = g.get(x, y);
    return c !== null && PAINT_COLORS.has(c);
  };
  const pickColor = () => {
    const r = rand();
    return r < 0.5 ? P.rust : r < 0.8 ? P.rustLight : P.rustDark;
  };

  const starts: Point[] = [];
  // Around the top of each arch, where real cars rust first.
  for (const center of wheelCenters) {
    for (let i = 0; i < 4; i++) {
      const angle = Math.PI + rand() * Math.PI;
      const r = ARCH_RADIUS + 0.5 + rand() * 1.5;
      starts.push({ x: Math.floor(center.x + Math.cos(angle) * r), y: Math.floor(center.y + Math.sin(angle) * r) });
    }
  }
  // Lower doors and sills, plus a few spots higher up.
  for (let i = 0; i < 10; i++) {
    const high = rand() < 0.25;
    starts.push({
      x: Math.floor(4 + rand() * 66),
      y: Math.floor(high ? 4 + rand() * 10 : 16 + rand() * 8),
    });
  }

  starts.forEach((start, index) => {
    let { x, y } = start;
    const length = 3 + Math.floor(rand() * 7);
    for (let step = 0; step < length; step++) {
      const color = pickColor();
      if (index < patches && isPaint(x, y)) g.set(x, y, color);
      const dir = Math.floor(rand() * 4);
      x += dir === 0 ? 1 : dir === 1 ? -1 : 0;
      y += dir === 2 ? 1 : dir === 3 ? -1 : 0;
    }
  });
}

/**
 * A wheel (tyre and rim) for a tyre tier rank. Steel rims (Worn, Used) are solid; alloy rims
 * have open spokes so the brake behind them shows through.
 */
export function buildWheel(wheelRank: number): PixelGrid {
  const size = RUSTBUCKET_LAYOUT.wheelSize;
  const c = size / 2;
  const g = new PixelGrid(size, size);
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - c, y + 0.5 - c);
  const angleOf = (x: number, y: number) => Math.atan2(y + 0.5 - c, x + 0.5 - c);

  g.fillCircle(c, c, 7.4, P.tire);
  // Light catching the upper-left of the tyre.
  g.paint(P.tireLight, (x, y, col) => col === P.tire && dist(x, y) > 6.1 && x + y < size - 4);
  // Outline the tyre now, before the rim is cut out, so the gaps between spokes stay open.
  g.outline(P.outline);

  if (wheelRank <= 1) {
    // Steel rim with wheel nuts; rusty on the worn wheel.
    g.fillCircle(c, c, 4.7, P.rimDark);
    g.fillCircle(c, c, 3.9, P.rim);
    g.paint(P.rimLight, (x, y, col) => col === P.rim && x + y < size - 3 && dist(x, y) > 2);
    for (const angle of [0.25, 0.75, 1.25, 1.75]) {
      const a = angle * Math.PI;
      g.set(Math.floor(c + Math.cos(a) * 2.3), Math.floor(c + Math.sin(a) * 2.3), P.rimDark);
    }
    g.fillCircle(c, c, 1.1, P.rimDark);
    if (wheelRank === 0) {
      const rand = seededRandom(42);
      for (let i = 0; i < 4; i++) {
        const a = rand() * Math.PI * 2;
        const r = 3 + rand() * 1.2;
        g.set(Math.floor(c + Math.cos(a) * r), Math.floor(c + Math.sin(a) * r), i % 2 ? P.rust : P.rustLight);
      }
    }
  } else {
    // Alloy rims: Street silver 5-spoke, Sport gunmetal 8-spoke, Race black with an orange lip.
    const spokes = wheelRank === 2 ? 5 : wheelRank === 3 ? 8 : 6;
    const [face, faceLight, lip] =
      wheelRank === 2
        ? [P.alloy, P.alloyLight, P.alloyDark]
        : wheelRank === 3
          ? [P.gunmetal, P.gunmetalLight, P.alloy]
          : [P.raceRim, P.gunmetal, P.raceLip];
    const spokeWidth = wheelRank === 3 ? 0.22 : 0.32;
    g.paint(null, (x, y) => dist(x, y) <= 4.9);
    g.paint(lip, (x, y) => dist(x, y) > 4 && dist(x, y) <= 4.9);
    g.paint(face, (x, y) => {
      const d = dist(x, y);
      if (d > 4 || d < 1.2) return false;
      const sector = (((angleOf(x, y) / (2 * Math.PI)) * spokes) % 1 + 1) % 1;
      return sector < spokeWidth || sector > 1 - spokeWidth / 2;
    });
    g.paint(faceLight, (x, y, col) => col === face && x + y < size - 4);
    g.fillCircle(c, c, 1.4, face);
    g.set(Math.floor(c), Math.floor(c), P.outline);
  }
  return g;
}

/** The worn starter wheel. */
export function buildWornWheel(): PixelGrid {
  return buildWheel(0);
}

/**
 * Brake disc and caliper, drawn behind the wheel and not rotating. Only visible through
 * spoked rims (Street tyres and up). The caliper colour shows the brake tier.
 */
export function buildBrake(brakeRank: number): PixelGrid {
  const size = RUSTBUCKET_LAYOUT.wheelSize;
  const c = size / 2;
  const g = new PixelGrid(size, size);
  g.fillCircle(c, c, 4.6, P.disc);
  g.paint(P.discDark, (x, y, col) => col === P.disc && Math.hypot(x + 0.5 - c, y + 0.5 - c) < 2.4);
  const caliper = CALIPER_COLORS[Math.min(CALIPER_COLORS.length - 1, Math.max(0, brakeRank))] ?? P.rimDark;
  // Caliper hugging the upper-rear of the disc.
  g.paint(caliper, (x, y) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    const a = Math.atan2(y + 0.5 - c, x + 0.5 - c);
    return d >= 2.6 && d <= 4.8 && a > -2.6 && a < -1.7;
  });
  return g;
}
