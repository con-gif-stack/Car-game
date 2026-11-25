import type { DepositKind } from '../data/farm';
import { PixelGrid, seededRandom } from './PixelGrid';

/*
 * Placeholder top-down pixel art for the Junkyard farm, generated in code: dusty ground,
 * the garage building, deposits (scrap heaps, tyre stacks, wire tangles, engine blocks) at
 * several fill levels, car wrecks, and the drones in each of their four models.
 * The view is top-down and slightly angled: things show a top face and a little of the front.
 */

export const JUNKYARD_GROUND = {
  light: 0x7d6953,
  base: 0x725e4b,
  dark: 0x665443,
  gravel: 0x9c8870,
  oil: 0x2e2826,
  track: 0x5a493b,
} as const;

const OUTLINE = 0x1a1414;

/** Dusty junkyard ground with darker patches, gravel, oil stains and tyre tracks. */
export function buildFarmGround(w: number, h: number, seed: number): PixelGrid {
  const rand = seededRandom(seed);
  const G = JUNKYARD_GROUND;
  const g = new PixelGrid(w, h);
  // Blotchy base: a coarse random field smoothed by sampling a few points.
  const blobs = Array.from({ length: Math.round((w * h) / 90) }, () => ({
    x: rand() * w,
    y: rand() * h,
    r: 2 + rand() * 5,
    dark: rand() < 0.5,
  }));
  g.forEach((x, y) => {
    let color: number = G.base;
    for (const b of blobs) {
      if ((x - b.x) ** 2 + (y - b.y) ** 2 < b.r * b.r) {
        color = b.dark ? G.dark : G.light;
        break;
      }
    }
    g.set(x, y, color);
  });
  // Gravel specks.
  for (let i = 0; i < (w * h) / 30; i++) g.set(Math.floor(rand() * w), Math.floor(rand() * h), G.gravel);
  // Oil stains.
  for (let i = 0; i < Math.max(3, (w * h) / 3000); i++) {
    const cx = rand() * w;
    const cy = rand() * h;
    const r = 1.5 + rand() * 3;
    g.paint(G.oil, (x, y) => ((x + 0.5 - cx) / (r * 1.6)) ** 2 + ((y + 0.5 - cy) / r) ** 2 <= 1);
  }
  return g;
}

/** Faint tyre tracks between two points (drawn onto the ground). */
export function drawTracks(g: PixelGrid, from: { x: number; y: number }, to: { x: number; y: number }): void {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
  const nx = -(to.y - from.y) / Math.max(1, steps);
  const ny = (to.x - from.x) / Math.max(1, steps);
  for (let i = 0; i <= steps; i++) {
    if (i % 3 === 2) continue;
    const t = i / Math.max(1, steps);
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    for (const side of [-2, 2]) g.set(Math.round(x + nx * side), Math.round(y + ny * side), JUNKYARD_GROUND.track);
  }
}

/** The garage: a corrugated roof, a front with a roll-up door, and a landing pad in front. */
export function buildGarage(): PixelGrid {
  const w = 44;
  const h = 40;
  const g = new PixelGrid(w, h);
  const roof = 0x8a8f9c;
  const roofDark = 0x6c717e;
  const wall = 0x5b5f6b;
  const door = 0x3c3f48;
  const doorLine = 0x2c2e35;
  const neon = 0xff2e88;
  // Roof (top face) with corrugation lines.
  for (let y = 2; y < 18; y++) for (let x = 4; x < w - 4; x++) g.set(x, y, x % 4 === 0 ? roofDark : roof);
  // Front wall.
  for (let y = 18; y < 28; y++) for (let x = 4; x < w - 4; x++) g.set(x, y, wall);
  // Roll-up door.
  for (let y = 20; y < 28; y++) for (let x = 14; x < w - 14; x++) g.set(x, y, y % 2 === 0 ? doorLine : door);
  // Neon strip over the door.
  for (let x = 14; x < w - 14; x++) g.set(x, 19, neon);
  g.outline(OUTLINE);
  // Landing pad: a painted circle in front.
  const cx = w / 2;
  const cy = 34;
  g.paint(0xd8c46a, (x, y, c) => c === null && Math.abs(Math.hypot((x + 0.5 - cx) / 1.6, y + 0.5 - cy) - 4) < 0.7);
  return g;
}

/** A rusted car wreck seen from above (decoration). */
export function buildWreck(seed: number): PixelGrid {
  const rand = seededRandom(seed);
  const g = new PixelGrid(22, 12);
  const body = rand() < 0.5 ? 0x6e5a4a : 0x5b6a6a;
  for (let y = 1; y < 11; y++) for (let x = 1; x < 21; x++) g.set(x, y, body);
  // Windscreen and roof.
  for (let y = 3; y < 9; y++) for (let x = 7; x < 14; x++) g.set(x, y, x < 9 || x > 12 ? 0x2a3138 : 0x4d4a48);
  // Rust.
  for (let i = 0; i < 14; i++) g.set(1 + Math.floor(rand() * 20), 1 + Math.floor(rand() * 10), i % 2 ? 0x8a4b23 : 0xb3652d);
  g.outline(OUTLINE);
  return g;
}

/** Fill stage for a deposit (0 = bare, 3 = full) from how much is left. */
export function depositStage(amount: number, max: number): number {
  const ratio = max > 0 ? amount / max : 0;
  return ratio <= 0.02 ? 0 : ratio < 0.34 ? 1 : ratio < 0.67 ? 2 : 3;
}

/** A deposit at a fill stage (0 = bare ground marks, 3 = full). */
export function buildDeposit(kind: DepositKind, stage: number, seed: number): PixelGrid {
  const rand = seededRandom(seed * 31 + stage);
  const size = 26;
  const g = new PixelGrid(size, size);
  const c = size / 2;
  if (stage <= 0) {
    // Just a scuffed patch where the pile was.
    g.paint(0x5a493b, (x, y) => ((x + 0.5 - c) / 9) ** 2 + ((y + 0.5 - c - 3) / 4) ** 2 <= 1);
    return g;
  }
  const scale = 0.45 + stage * 0.18;

  switch (kind) {
    case 'scrapHeap': {
      const palette = [0x9a9ca6, 0x7c7f88, 0x5d6068, 0x8a4b23, 0xb3652d];
      // A mound of overlapping scrap shards.
      for (let i = 0; i < 40 * stage; i++) {
        const a = rand() * Math.PI * 2;
        const r = Math.sqrt(rand()) * 10 * scale;
        const x = Math.round(c + Math.cos(a) * r * 1.3);
        const y = Math.round(c + 2 + Math.sin(a) * r * 0.8 - (10 * scale - r) * 0.5);
        const color = palette[Math.floor(rand() * palette.length)] ?? 0x7c7f88;
        g.set(x, y, color);
        g.set(x + 1, y, color);
      }
      break;
    }
    case 'tireStack': {
      // Stacks of tyres: dark rings seen from above at a slight angle.
      const stacks = stage >= 3 ? 3 : stage;
      for (let s = 0; s < stacks; s++) {
        const sx = c + (s - (stacks - 1) / 2) * 8;
        const height = 1 + Math.floor(rand() * 2) + stage;
        for (let k = 0; k < height; k++) {
          const sy = c + 6 - k * 2;
          g.paint(k === height - 1 ? 0x34343e : 0x1c1c22, (x, y) => Math.abs(Math.hypot((x + 0.5 - sx) / 1.3, (y + 0.5 - sy) * 1.4) - 2.6) < 1.2);
        }
        g.paint(0x101014, (x, y) => Math.hypot((x + 0.5 - sx) / 1.3, (y + 0.5 - (c + 6 - (height - 1) * 2)) * 1.4) < 1.2);
      }
      break;
    }
    case 'wireTangle': {
      // Loops of copper wire.
      for (let loop = 0; loop < 2 + stage * 2; loop++) {
        const lx = c + (rand() - 0.5) * 10 * scale;
        const ly = c + 2 + (rand() - 0.5) * 6 * scale;
        const r = 2 + rand() * 3 * scale;
        g.paint(loop % 2 ? 0xd0743a : 0xf2a66a, (x, y, col) => col === null && Math.abs(Math.hypot((x + 0.5 - lx) / 1.4, y + 0.5 - ly) - r) < 0.6);
      }
      break;
    }
    case 'engineBlocks': {
      // Cast aluminium engine blocks: boxes with a light top face.
      for (let b = 0; b < stage + 1; b++) {
        const bx = Math.round(c - 8 + (b % 2) * 8 + rand() * 2);
        const by = Math.round(c - 2 + Math.floor(b / 2) * 5 - stage);
        for (let y = 0; y < 6; y++) {
          for (let x = 0; x < 7; x++) g.set(bx + x, by + y, y < 2 ? 0xe6e9ef : y < 5 ? 0xb8bdc8 : 0x7f8594);
        }
        g.set(bx + 2, by + 3, 0x5c616e);
        g.set(bx + 4, by + 3, 0x5c616e);
      }
      break;
    }
  }
  g.outline(OUTLINE);
  return g;
}

/** Size of a drone sprite (square, in pixels). */
export const DRONE_SIZE = 18;

/**
 * A drone seen from above. Models: 0 Scrap Drone (rusty, mismatched rotors, a bent arm),
 * 1 Patched Drone (grey frame with orange patches), 2 Sleek Drone (white shell, cyan light),
 * 3 Hover Drone (no rotors: a disc riding a glowing ring). `frame` (0/1) animates the rotors
 * or the glow.
 */
export function buildDrone(model: number, frame: number): PixelGrid {
  const s = DRONE_SIZE;
  const c = s / 2;
  const g = new PixelGrid(s, s);
  const blur = frame % 2 === 0;

  if (model >= 3) {
    // Hover drone: a glowing ring around a dark disc with a bright core.
    const glow = blur ? 0x7ff7ff : 0x2ee6ff;
    g.paint(glow, (x, y) => Math.abs(Math.hypot(x + 0.5 - c, y + 0.5 - c) - 7) < (blur ? 1.1 : 0.8));
    g.fillCircle(c, c, 5.2, 0x3a2a66);
    g.paint(0x7f5fd0, (x, y, col) => col === 0x3a2a66 && x + y < s - 2);
    g.fillCircle(c, c, 1.8, blur ? 0xffffff : 0xc9f8ff);
    g.outline(OUTLINE);
    return g;
  }

  const styles = [
    { arm: 0x6e5a4a, body: 0x8a4b23, bodyLight: 0xb3652d, rotors: [0x9a9ca6, 0x3c3f48, 0xb3652d, 0x9a9ca6], light: 0xffb02e },
    { arm: 0x5d6068, body: 0x7c7f88, bodyLight: 0x9a9ca6, rotors: [0x3c3f48, 0x3c3f48, 0x3c3f48, 0x3c3f48], light: 0xff9f1c },
    { arm: 0xb8bdc8, body: 0xe6e9ef, bodyLight: 0xffffff, rotors: [0x9fd8ff, 0x9fd8ff, 0x9fd8ff, 0x9fd8ff], light: 0x2ee6ff },
  ][model] ?? { arm: 0x6e5a4a, body: 0x8a4b23, bodyLight: 0xb3652d, rotors: [0x9a9ca6, 0x3c3f48, 0xb3652d, 0x9a9ca6], light: 0xffb02e };

  // Arms to four rotors; the scrap drone has one bent arm.
  const corners = [
    [3, 3],
    [s - 4, 3],
    [3, s - 4],
    [s - 4, s - 4],
  ];
  if (model === 0) corners[3] = [s - 5, s - 3];
  for (const [x, y] of corners) {
    const steps = 8;
    for (let i = 0; i <= steps; i++) {
      g.set(Math.round(c + ((x ?? c) - c) * (i / steps)), Math.round(c + ((y ?? c) - c) * (i / steps)), styles.arm);
    }
  }
  // Rotors: a blade (two frames, crossed) or a blur disc.
  corners.forEach(([x, y], i) => {
    const color = styles.rotors[i] ?? 0x3c3f48;
    const cx = (x ?? c) + 0.5;
    const cy = (y ?? c) + 0.5;
    if (model === 2) {
      g.paint(color, (px, py) => Math.hypot(px + 0.5 - cx, py + 0.5 - cy) < 2.6 && (px + py + (blur ? 0 : 1)) % 2 === 0);
    } else {
      for (let d = -2; d <= 2; d++) {
        if (blur) g.set(Math.round(cx - 0.5 + d), Math.round(cy - 0.5 + d), color);
        else g.set(Math.round(cx - 0.5 + d), Math.round(cy - 0.5 - d), color);
      }
    }
  });
  // Body.
  const bodyR = model === 2 ? 3.6 : 3.1;
  g.fillCircle(c, c, bodyR, styles.body);
  g.paint(styles.bodyLight, (x, y, col) => col === styles.body && x + y < s - 3);
  if (model === 1) {
    // Patches.
    g.set(Math.floor(c) + 1, Math.floor(c) + 1, 0xff9f1c);
    g.set(Math.floor(c) - 2, Math.floor(c), 0xff9f1c);
  }
  // Status light (blinks between frames on the scrap drone).
  if (model !== 0 || blur) g.set(Math.floor(c), Math.floor(c) - 1, styles.light);
  if (model === 0) g.set(Math.floor(c) + 2, Math.floor(c) + 2, 0xd0743a); // loose wire
  g.outline(OUTLINE);
  return g;
}
