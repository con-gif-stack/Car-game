import type { DepositKind, FarmId, GroundPalette } from '../data/farm';
import { dither, mix, shade } from './color';
import { PixelGrid, seededRandom } from './PixelGrid';

/*
 * Placeholder top-down pixel art for the farms, generated in code: each farm's ground, the
 * garage building, deposits (scrap heaps, tyre stacks, wire tangles, engine blocks, car and
 * plane wrecks, pipe stacks, cable drums, old machines, ceramic insulators) at several fill
 * levels, car wrecks, and the drones in each of their four models.
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

/**
 * A farm's ground: blotchy base with darker patches, gravel and stains, plus each farm's own
 * details (painted bays on the truck stop, slab joints in the factory yard, ripples in the sand).
 */
export function buildFarmGround(w: number, h: number, seed: number, G: GroundPalette = JUNKYARD_GROUND, style: FarmId = 'junkyard'): PixelGrid {
  const rand = seededRandom(seed);
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
  switch (style) {
    case 'rustHighway': {
      // Faded parking bays and cracks in the old truck-stop asphalt.
      const paint = mix(0xd8c46a, G.base, 0.55);
      for (const row of [Math.round(h * 0.12), Math.round(h * 0.5)]) {
        for (let x = 6; x < w - 6; x += 14) for (let y = row; y < row + 8; y++) if (rand() < 0.75) g.set(x, y, paint);
        for (let x = 6; x < w - 6; x++) if (rand() < 0.6) g.set(x, row + 8, paint);
      }
      for (let i = 0; i < (w * h) / 900; i++) {
        let x = Math.floor(rand() * w);
        let y = Math.floor(rand() * h);
        for (let k = 0; k < 10; k++) {
          g.set(x, y, G.oil);
          x += rand() < 0.5 ? 1 : 0;
          y += rand() < 0.6 ? 1 : -1;
        }
      }
      break;
    }
    case 'industrial': {
      // Concrete slabs with dark joints and the odd lighter, newer slab.
      const slab = 14;
      g.forEach((x, y, c) => {
        if (x % slab === 0 || y % slab === 0) g.set(x, y, G.dark);
        else if ((Math.floor(x / slab) * 7 + Math.floor(y / slab) * 3) % 11 === 0 && c === G.base) g.set(x, y, G.light);
      });
      break;
    }
    case 'desert': {
      // Wind ripples: wavy lighter and darker lines across the sand.
      g.forEach((x, y, c) => {
        const wave = Math.sin(x * 0.35 + y * 0.08) * 1.5 + y;
        const band = ((wave % 6) + 6) % 6;
        if (band < 0.8) g.set(x, y, G.light);
        else if (band > 5.2 && c !== G.oil) g.set(x, y, G.dark);
      });
      break;
    }
    case 'junkyard':
      break;
  }
  addGroundDetails(g, rand, G, style);
  return g;
}

/** Faint tyre tracks between two points (drawn onto the ground). */
export function drawTracks(g: PixelGrid, from: { x: number; y: number }, to: { x: number; y: number }, color: number = JUNKYARD_GROUND.track): void {
  const steps = Math.ceil(Math.hypot(to.x - from.x, to.y - from.y));
  const nx = -(to.y - from.y) / Math.max(1, steps);
  const ny = (to.x - from.x) / Math.max(1, steps);
  for (let i = 0; i <= steps; i++) {
    if (i % 3 === 2) continue;
    const t = i / Math.max(1, steps);
    const x = from.x + (to.x - from.x) * t;
    const y = from.y + (to.y - from.y) * t;
    for (const side of [-2, 2]) g.set(Math.round(x + nx * side), Math.round(y + ny * side), color);
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
    case 'carWreck': {
      // A stripped car shell, silver panels, seen from above; fewer panels as it empties.
      const len = Math.round(10 + stage * 3);
      const x0 = Math.round(c - len / 2);
      const y0 = Math.round(c - 3);
      const panel = [0xc9ced8, 0xa9afbc, 0x8a909e];
      for (let y = 0; y < 8; y++) {
        for (let x = 0; x < len; x++) {
          if ((x === 0 || x === len - 1) && (y === 0 || y === 7)) continue;
          const missing = stage < 3 && rand() < 0.25 * (3 - stage);
          g.set(x0 + x, y0 + y, missing ? 0x4a4038 : y < 2 ? panel[0]! : y < 6 ? panel[1]! : panel[2]!);
        }
      }
      for (let y = 2; y < 6; y++) for (let x = Math.round(len * 0.35); x < Math.round(len * 0.6); x++) g.set(x0 + x, y0 + y, 0x2a3138);
      break;
    }
    case 'raceWreck': {
      // A crashed race car: low and wide, red and white livery, carbon-weave panels.
      const x0 = Math.round(c - 9);
      const y0 = Math.round(c - 3 - stage * 0.5);
      for (let y = 0; y < 7 + stage; y++) {
        for (let x = 0; x < 18; x++) {
          if ((x < 2 || x > 15) && (y < 1 || y > 5 + stage)) continue;
          const carbon = x > 5 && x < 12 && y > 1;
          const col = carbon ? ((Math.floor(x / 1) + y) % 2 ? 0x1c1e26 : 0x3a3e4c) : x < 5 ? 0xd8343c : y < 2 ? 0xf1eefb : 0xb8282e;
          g.set(x0 + x, y0 + y, col);
        }
      }
      // A broken rear wing.
      for (let y = -2; y < 0; y++) for (let x = 13; x < 18; x++) g.set(x0 + x, y0 + y, 0x1c1e26);
      break;
    }
    case 'pipeStack': {
      // Steel pipes stacked in a pyramid, seen end-on.
      const rows = stage + 1;
      for (let row = 0; row < rows; row++) {
        const count = rows - row;
        for (let i = 0; i < count; i++) {
          const px = c + (i - (count - 1) / 2) * 6;
          const py = c + 8 - row * 5;
          g.paint(0x8a8d96, (x, y) => Math.hypot(x + 0.5 - px, y + 0.5 - py) < 3);
          g.paint(0xb3b6bf, (x, y, col) => col === 0x8a8d96 && x + 0.5 < px - 0.5 && y + 0.5 < py);
          g.paint(0x1c1d22, (x, y) => Math.hypot(x + 0.5 - px, y + 0.5 - py) < 1.6);
          if (rand() < 0.5) g.set(Math.round(px + 1), Math.round(py + 2), 0x8a4b23);
        }
      }
      break;
    }
    case 'cableDrum': {
      // Wooden cable drums wound with copper cable.
      const drums = Math.min(3, stage);
      for (let i = 0; i < drums; i++) {
        const dx = c + (i - (drums - 1) / 2) * 9;
        const dy = c + 2 - (i % 2) * 3;
        g.paint(0x8a5a32, (x, y) => Math.hypot((x + 0.5 - dx) / 1.15, y + 0.5 - dy) < 4.6);
        g.paint(0xd0743a, (x, y) => Math.hypot((x + 0.5 - dx) / 1.15, y + 0.5 - dy) < 3.4);
        g.paint(0xf2a66a, (x, y, col) => col === 0xd0743a && (x + y) % 3 === 0);
        g.paint(0x5a3a22, (x, y) => Math.hypot((x + 0.5 - dx) / 1.15, y + 0.5 - dy) < 1.2);
      }
      break;
    }
    case 'machinery': {
      // An old machine tool: a grey-blue body, hazard stripes and a titanium glint.
      const w0 = 10 + stage * 2;
      const x0 = Math.round(c - w0 / 2);
      const y0 = Math.round(c - 5);
      for (let y = 0; y < 10; y++) {
        for (let x = 0; x < w0; x++) {
          const top = y < 3;
          const stripe = y === 9 && (x % 4 < 2);
          g.set(x0 + x, y0 + y, stripe ? 0xffd23f : top ? 0x8a97ad : y === 9 ? 0x1c1e26 : 0x5c6a80);
        }
      }
      for (let x = 2; x < w0 - 2; x += 3) g.set(x0 + x, y0 + 5, 0x2a3040);
      g.set(x0 + 2, y0 + 1, 0xe6f2ff);
      g.set(x0 + 3, y0 + 1, 0xb9d4ff);
      break;
    }
    case 'planeWreck': {
      // An aircraft fuselage with stubby wings; smaller pieces as it's stripped.
      const len = 8 + stage * 4;
      const x0 = Math.round(c - len / 2);
      const y0 = Math.round(c - 2);
      for (let x = 0; x < len; x++) {
        for (let y = 0; y < 5; y++) {
          if ((x === 0 || x === len - 1) && (y === 0 || y === 4)) continue;
          g.set(x0 + x, y0 + y, y === 0 ? 0xeef0f4 : y < 3 ? 0xc6cad4 : 0x9a9fab);
        }
        if (x % 3 === 1 && x > 1 && x < len - 2) g.set(x0 + x, y0 + 1, 0x3a4a5a);
      }
      if (stage >= 2) {
        const wx = x0 + Math.round(len * 0.4);
        for (let k = 0; k < 6; k++) {
          for (let t = 0; t < 3; t++) {
            g.set(wx + t + Math.floor(k / 2), y0 - 1 - k, 0xb8bdc8);
            g.set(wx + t + Math.floor(k / 2), y0 + 5 + k, 0x9a9fab);
          }
        }
      }
      break;
    }
    case 'insulators': {
      // Ribbed ceramic insulators from old power lines, piled up.
      const count = 2 + stage * 2;
      for (let i = 0; i < count; i++) {
        const ix = Math.round(c - 8 + (i % 4) * 5 + rand());
        const iy = Math.round(c + 4 - Math.floor(i / 4) * 5 - rand() * 2);
        for (let k = 0; k < 3; k++) {
          const half = 2 - (k === 1 ? 1 : 0);
          for (let x = -half; x <= half; x++) g.set(ix + x, iy - k, k === 2 ? 0xffffff : x < 0 ? 0xf2ece0 : 0xc8bfae);
        }
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

const PUDDLE = 0x343c4c;
const PUDDLE_SHINE = 0x8f9fbc;
const WEED = [0x5f7032, 0x75873c, 0x4a5a28] as const;

/**
 * Bigger ground features so the yard isn't one flat texture: puddles that catch the sky,
 * weeds, loose bolts, drain grates, and broad light and shade across the dunes.
 */
function addGroundDetails(g: PixelGrid, rand: () => number, G: GroundPalette, style: FarmId): void {
  const w = g.width;
  const h = g.height;
  const area = w * h;
  const puddle = (cx: number, cy: number, r: number) => {
    g.paint(PUDDLE, (x, y) => ((x + 0.5 - cx) / (r * 1.7)) ** 2 + ((y + 0.5 - cy) / r) ** 2 <= 1);
    // Sky glints along the far edge, a darker lip along the near one.
    g.forEach((x, y, c) => {
      if (c !== PUDDLE) return;
      if (g.get(x, y - 1) !== PUDDLE && dither(x, y, 0.6)) g.set(x, y, PUDDLE_SHINE);
      else if (g.get(x, y + 1) !== PUDDLE) g.set(x, y, shade(G.dark, -0.2));
    });
  };
  const weeds = (count: number) => {
    for (let i = 0; i < count; i++) {
      const cx = Math.floor(rand() * w);
      const cy = Math.floor(rand() * h);
      for (let k = 0; k < 4 + rand() * 5; k++) {
        const x = cx + Math.round((rand() - 0.5) * 5);
        const y = cy + Math.round((rand() - 0.5) * 3);
        const color = WEED[Math.floor(rand() * WEED.length)] ?? WEED[0];
        g.set(x, y, color);
        if (rand() < 0.6) g.set(x, y - 1, shade(color, 0.2));
      }
    }
  };
  switch (style) {
    case 'junkyard': {
      for (let i = 0; i < Math.max(3, area / 5000); i++) puddle(rand() * w, rand() * h, 2 + rand() * 2.5);
      weeds(Math.round(area / 900));
      // Loose bolts and scraps catching the light.
      for (let i = 0; i < area / 400; i++) {
        const x = Math.floor(rand() * w);
        const y = Math.floor(rand() * h);
        g.set(x, y, 0xa9adb8);
        g.set(x, y + 1, 0x5d6068);
      }
      break;
    }
    case 'rustHighway': {
      for (let i = 0; i < Math.max(2, area / 8000); i++) puddle(rand() * w, rand() * h, 2 + rand() * 2);
      weeds(Math.round(area / 700));
      break;
    }
    case 'industrial': {
      for (let i = 0; i < Math.max(3, area / 6000); i++) puddle(rand() * w, rand() * h, 1.5 + rand() * 2.5);
      // Drain grates on the slab joints.
      for (let i = 0; i < area / 3000; i++) {
        const x0 = Math.floor((rand() * w) / 14) * 14 + 5;
        const y0 = Math.floor((rand() * h) / 14) * 14 + 5;
        for (let y = 0; y < 4; y++) for (let x = 0; x < 5; x++) g.set(x0 + x, y0 + y, x % 2 === 0 ? 0x2a2a2e : 0x4a4a50);
      }
      weeds(Math.round(area / 2500));
      break;
    }
    case 'desert': {
      // Broad dune light and shade, then dry scrub.
      g.forEach((x, y, c) => {
        if (c === G.oil) return;
        const dune = Math.sin(x * 0.045 + Math.sin(y * 0.03) * 2.2) * Math.cos(y * 0.05 + x * 0.01);
        if (dune > 0.45 && dither(x, y, (dune - 0.45) * 2.5)) g.set(x, y, mix(G.light, 0xffffff, 0.12));
        else if (dune < -0.45 && dither(x, y, (-dune - 0.45) * 2.5)) g.set(x, y, shade(G.dark, -0.06));
      });
      for (let i = 0; i < area / 1500; i++) {
        const cx = Math.floor(rand() * w);
        const cy = Math.floor(rand() * h);
        for (let k = 0; k < 6; k++) g.set(cx + Math.round((rand() - 0.5) * 4), cy + Math.round((rand() - 0.5) * 3), k % 2 ? 0x8a6a3a : 0x6e5430);
      }
      break;
    }
  }
}

/**
 * The yard's boundary, drawn onto the ground around the left, right and top edges: a chain-link
 * fence (Junkyard), guardrail under a row of pines (truck stop), a brick wall with a pipe
 * (factory), or rock outcrops (desert).
 */
export function drawYardEdge(g: PixelGrid, style: FarmId, seed: number): void {
  const rand = seededRandom(seed);
  const w = g.width;
  const h = g.height;
  const side = (fn: (x: number, y: number, inner: number) => void, depth: number) => {
    for (let y = 0; y < h; y++) for (let d = 0; d < depth; d++) {
      fn(d, y, d);
      fn(w - 1 - d, y, d);
    }
  };
  switch (style) {
    case 'junkyard': {
      const post = 0x6c6f7a;
      const mesh = 0x9a9ca6;
      // Top: the fence seen from the front, with posts and diamond mesh.
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < 7; y++) {
          if (y === 0) g.set(x, y, mix(mesh, 0xffffff, 0.2));
          else if (x % 12 === 0) g.set(x, y, post);
          else if ((x + y) % 3 === 0 || (x - y + 300) % 3 === 0) g.set(x, y, mesh);
        }
        g.set(x, 7, 0x2a2420);
      }
      // Sides: the fence seen from above, a rail with posts.
      side((x, y, d) => {
        if (d === 1) g.set(x, y, y % 12 < 2 ? post : mesh);
        else if (d === 0 && y % 12 < 2) g.set(x, y, shade(post, -0.3));
        else if (d === 2 && y % 12 < 2) g.set(x, y, 0x2a2420);
      }, 3);
      break;
    }
    case 'rustHighway': {
      // Pine tops along the top, a steel guardrail in front of them.
      for (let x = -4; x < w + 4; x += 5 + Math.floor(rand() * 3)) {
        const r = 3 + rand() * 2;
        const cy = 2 + rand() * 2;
        g.paint(0x1f3a2e, (px, py) => Math.hypot(px + 0.5 - x, (py + 0.5 - cy) * 1.2) < r);
        g.paint(0x2e5240, (px, py, c) => c === 0x1f3a2e && px + 0.5 < x && py + 0.5 < cy);
      }
      for (let x = 0; x < w; x++) {
        g.set(x, 7, 0xb8bcc6);
        g.set(x, 8, 0x8a8e98);
        g.set(x, 9, x % 10 === 0 ? 0x5a5e68 : 0x2a2c32);
      }
      side((x, y, d) => {
        if (d === 0) g.set(x, y, 0x8a8e98);
        else if (d === 1) g.set(x, y, y % 10 === 0 ? 0x5a5e68 : 0xb8bcc6);
      }, 2);
      break;
    }
    case 'industrial': {
      const brick = 0x7a4a3a;
      const brickDark = 0x5e382c;
      const mortar = 0x4a3a34;
      const wall = (x: number, y: number) => {
        const row = Math.floor(y / 2);
        const offset = row % 2 === 0 ? 0 : 3;
        return y % 2 === 1 || (x + offset) % 6 === 0 ? mortar : (x + row) % 5 === 0 ? brickDark : brick;
      };
      for (let x = 0; x < w; x++) {
        for (let y = 0; y < 8; y++) g.set(x, y, y === 0 ? 0x9a9a9e : wall(x, y));
        // A pipe running along the wall, with joints.
        g.set(x, 4, x % 16 === 0 ? 0x5a5e66 : 0x9aa0aa);
        g.set(x, 5, 0x6a7078);
        g.set(x, 8, 0x222226);
      }
      side((x, y, d) => {
        if (d < 2) g.set(x, y, d === 0 ? 0x9a9a9e : wall(y, x));
        else g.set(x, y, 0x3a3a3e);
      }, 3);
      break;
    }
    case 'desert': {
      // Sandstone outcrops along the edges, lit from the top left.
      const rock = (cx: number, cy: number, r: number) => {
        g.paint(0x9a643c, (x, y) => ((x + 0.5 - cx) / r) ** 2 + ((y + 0.5 - cy) / (r * 0.8)) ** 2 <= 1);
        g.paint(0xc8875a, (x, y, c) => c === 0x9a643c && x + 0.5 < cx + r * 0.1 && y + 0.5 < cy);
        g.paint(0x6e4428, (_x, y, c) => c === 0x9a643c && y + 0.5 > cy + r * 0.4);
      };
      for (let x = 0; x < w; x += 6 + Math.floor(rand() * 8)) rock(x, 2 + rand() * 3, 3 + rand() * 3);
      for (let y = 10; y < h; y += 8 + Math.floor(rand() * 14)) {
        rock(rand() * 3, y, 2.5 + rand() * 2.5);
        rock(w - 1 - rand() * 3, y + 4, 2.5 + rand() * 2.5);
      }
      break;
    }
  }
}

/** A road leaving the garage pad down off the bottom of the map. */
export function drawGarageRoad(g: PixelGrid, from: { x: number; y: number }, G: GroundPalette): void {
  const half = 7;
  const packed = mix(G.track, G.dark, 0.5);
  const gravel = mix(G.gravel, G.light, 0.5);
  for (let y = Math.round(from.y); y < g.height; y++) {
    for (let dx = -half; dx <= half; dx++) {
      const x = Math.round(from.x) + dx;
      const edge = Math.abs(dx) === half;
      const rut = Math.abs(dx) === 3 || Math.abs(dx) === 4;
      const color = edge ? (dither(x, y, 0.5) ? gravel : G.light) : rut ? shade(G.track, -0.25) : dither(x, y, 0.2) ? G.track : packed;
      g.set(x, y, color);
    }
  }
}

/** A soft dithered ellipse, drawn black at low alpha under things standing on the ground. */
export function buildContactShadow(w: number, h: number): PixelGrid {
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    const d = Math.hypot((x + 0.5 - w / 2) / (w / 2), (y + 0.5 - h / 2) / (h / 2));
    if (d <= 1 && dither(x, y, 1.25 - d)) g.set(x, y, 0x000000);
  });
  return g;
}

/** A big, soft cloud shadow that drifts across the yard (drawn black at low alpha). */
export function buildCloudShadow(w: number, h: number, seed: number): PixelGrid {
  const rand = seededRandom(seed);
  const blobs = Array.from({ length: 5 }, () => ({ x: w * (0.25 + rand() * 0.5), y: h * (0.3 + rand() * 0.4), r: Math.min(w, h) * (0.2 + rand() * 0.2) }));
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    let best = 0;
    for (const b of blobs) best = Math.max(best, 1 - Math.hypot((x - b.x) / (b.r * 1.5), (y - b.y) / b.r));
    if (best > 0 && dither(x, y, Math.min(1, best * 2.2))) g.set(x, y, 0x000000);
  });
  return g;
}

/** Darkness gathering at the edges of the screen (drawn black at low alpha). */
export function buildVignette(w: number, h: number): PixelGrid {
  const g = new PixelGrid(w, h);
  const band = Math.min(w, h) * 0.18;
  g.forEach((x, y) => {
    const edge = Math.min(x, y, w - 1 - x, h - 1 - y);
    const t = 1 - edge / band;
    if (t > 0 && dither(x, y, t * t)) g.set(x, y, 0x000000);
  });
  return g;
}

/** A crow seen from above: folded (frame 0) or wings spread (frame 1). */
export function buildCrow(frame: number): PixelGrid {
  const g = new PixelGrid(9, 7);
  const body = 0x1a1820;
  const sheen = 0x3a3a52;
  for (let y = 2; y < 6; y++) for (let x = 3; x < 6; x++) g.set(x, y, body);
  g.set(4, 1, body);
  g.set(4, 0, 0xd8a040);
  g.set(4, 6, body);
  if (frame === 1) {
    for (let x = 0; x < 3; x++) {
      g.set(x, 3, body);
      g.set(8 - x, 3, body);
      g.set(x, 2, x === 1 ? sheen : body);
      g.set(8 - x, 2, x === 1 ? sheen : body);
    }
  } else {
    g.set(4, 3, sheen);
  }
  return g;
}

/** A tumbleweed: a loose ball of dry twigs (two frames for rolling). */
export function buildTumbleweed(frame: number): PixelGrid {
  const g = new PixelGrid(11, 11);
  const colors = [0x8a6a3a, 0xa8844a, 0x6e5430];
  for (let i = 0; i < 26; i++) {
    const a = (i / 26) * Math.PI * 2 + frame * 0.6;
    const r = 2 + ((i * 7) % 4);
    const x = Math.round(5 + Math.cos(a) * r);
    const y = Math.round(5 + Math.sin(a) * r);
    g.set(x, y, colors[i % 3] ?? 0x8a6a3a);
  }
  g.outline(0x3a2a18);
  return g;
}
