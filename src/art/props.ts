import type { BiomePalette, PropKind } from '../data/biomes';
import { dither, mix, shade } from './color';
import { PixelGrid, seededRandom } from './PixelGrid';

/*
 * Objects that pass by beside the drive road: street lamps, signs, billboards, wrecks, cacti,
 * crystals and so on. Each is drawn in plain material colours, then lit for where it stands:
 * - roadside props (behind the road) get rim light from the sky and a touch of haze;
 * - foreground props (between the road and the camera) become dark, rim-lit silhouettes.
 * Lights (lamp heads, neon) stay bright and report glow spots for the scene to add.
 */

export const PROP_VARIANTS = 3;

export interface GlowSpot {
  /** Pixel position in the prop's grid. */
  x: number;
  y: number;
  /** Glow radius in pixels. */
  radius: number;
  color: number;
}

export interface PropArt {
  grid: PixelGrid;
  glows: GlowSpot[];
}

type Ramp = readonly [number, number, number, number];

const METAL: Ramp = [0x262836, 0x464a5c, 0x737a8e, 0xa8aec2];
const RUST: Ramp = [0x3a2018, 0x6a3824, 0x985832, 0xc27c48];
const WOOD: Ramp = [0x2a1c14, 0x4e3222, 0x704c32, 0x926a48];
const RUBBER: Ramp = [0x0e0e13, 0x1c1c25, 0x2e2e3a, 0x474756];
const CACTUS: Ramp = [0x1a3420, 0x2c5232, 0x467a44, 0x74a45c];
const SIGN_GREEN: Ramp = [0x0c3020, 0x14513a, 0x22704e, 0x3a906a];
const CONE: Ramp = [0x8a2a10, 0xd0501c, 0xf07a30, 0xffa860];

/** A grid plus the pixels that emit light (not darkened by lighting) and glow spots. */
class Canvas {
  readonly g: PixelGrid;
  readonly bright = new Set<number>();
  readonly glows: GlowSpot[] = [];
  constructor(w: number, h: number) {
    this.g = new PixelGrid(w, h);
  }
  set(x: number, y: number, c: number): void {
    this.g.set(Math.round(x), Math.round(y), c);
  }
  light(x: number, y: number, c: number): void {
    const rx = Math.round(x);
    const ry = Math.round(y);
    this.g.set(rx, ry, c);
    this.bright.add(ry * this.g.width + rx);
  }
  /** A box lit from the upper left. */
  box(x0: number, y0: number, x1: number, y1: number, r: Ramp): void {
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        let c = r[1];
        if (y === y0) c = r[3];
        else if (x === x1 || y === y1) c = r[0];
        else if (x === x0) c = r[2];
        else if (dither(x, y, 1 - (y - y0) / Math.max(1, (y1 - y0) * 0.5))) c = r[2];
        this.set(x, y, c);
      }
    }
  }
  /** A vertical cylinder (poles, barrels, trunks): light left, dark right. */
  cyl(x0: number, y0: number, x1: number, y1: number, r: Ramp): void {
    const w = x1 - x0 + 1;
    for (let y = y0; y <= y1; y++) {
      for (let x = x0; x <= x1; x++) {
        const t = w <= 1 ? 0.4 : (x - x0) / (w - 1);
        const c = t < 0.2 ? r[2] : t < 0.4 ? r[3] : t > 0.8 ? r[0] : r[1];
        this.set(x, y, c);
      }
    }
  }
  /** A filled ellipse lit from the upper left. */
  blob(cx: number, cy: number, rx: number, ry: number, r: Ramp, flatBottom = true): void {
    for (let y = Math.floor(cy - ry); y <= Math.ceil(cy + ry); y++) {
      if (flatBottom && y > cy + ry * 0.6) continue;
      for (let x = Math.floor(cx - rx); x <= Math.ceil(cx + rx); x++) {
        const dx = (x + 0.5 - cx) / rx;
        const dy = (y + 0.5 - cy) / ry;
        if (dx * dx + dy * dy > 1) continue;
        const lit = -dx * 0.6 - dy * 0.8;
        const c = lit > 0.55 ? r[3] : lit > 0.05 ? (dither(x, y, (lit - 0.05) * 2) ? r[2] : r[1]) : lit < -0.45 ? r[0] : r[1];
        this.set(x, y, c);
      }
    }
  }
}

function rockRamp(p: BiomePalette): Ramp {
  const base = mix(p.ground, p.feature, 0.5);
  return [shade(base, -0.45), base, mix(base, p.groundLight, 0.6), mix(p.groundLight, p.rim, 0.35)];
}

function plantRamp(p: BiomePalette): Ramp {
  const base = mix(0x3b6a3a, p.feature, 0.45);
  return [shade(base, -0.45), base, shade(base, 0.2), mix(shade(base, 0.3), p.rim, 0.3)];
}

function draw(c: Canvas, kind: PropKind, variant: number, p: BiomePalette): void {
  const { g } = c;
  const w = g.width;
  const h = g.height;
  const rand = seededRandom(variant * 97 + kind.length * 13 + 5);
  switch (kind) {
    case 'lamp': {
      // Street lamp: tall pole, an arm reaching over the road, a lamp head with a glow.
      const poleX = 3;
      c.cyl(poleX, 4, poleX + 1, h - 1, METAL);
      c.box(poleX - 1, h - 3, poleX + 2, h - 1, METAL);
      for (let x = poleX + 1; x < w - 3; x++) c.set(x, 4 + (x < poleX + 4 ? 0 : 0), METAL[2]);
      for (let x = poleX + 1; x < w - 3; x++) c.set(x, 5, METAL[0]);
      c.box(w - 6, 4, w - 1, 6, METAL);
      for (let x = w - 5; x <= w - 2; x++) c.light(x, 7, mix(p.glow, 0xffffff, 0.5));
      c.glows.push({ x: w - 3.5, y: 8, radius: 9, color: p.glow });
      break;
    }
    case 'pole': {
      // Wooden power pole with a crossbar and insulators.
      const x = Math.floor(w / 2) - 1;
      c.cyl(x, 0, x + 2, h - 1, WOOD);
      c.box(0, 4, w - 1, 5, WOOD);
      for (const ix of [1, w - 2, x + 1]) {
        c.set(ix, 3, 0x8aa6b8);
        c.set(ix, 2, 0xc8e0ec);
      }
      break;
    }
    case 'fence': {
      // Chain-link fence section with posts and a top rail.
      for (let px = 1; px < w; px += 12) c.cyl(px, 0, px + 1, h - 1, METAL);
      for (let x = 0; x < w; x++) c.set(x, 1, METAL[2]);
      for (let y = 3; y < h - 1; y++) {
        for (let x = 0; x < w; x++) if ((x + y) % 3 === 0 || (x - y + 99) % 3 === 0) if (g.get(x, y) === null && (x + y) % 2 === 0) c.set(x, y, METAL[1]);
      }
      break;
    }
    case 'billboard': {
      // A billboard on legs with two spotlights; the face shows a simple bold design.
      const boardH = Math.round(h * 0.5);
      c.cyl(6, boardH, 7, h - 1, METAL);
      c.cyl(w - 8, boardH, w - 7, h - 1, METAL);
      for (let y = boardH; y < h; y += 4) for (let x = 7; x < w - 7; x++) if ((x + y) % 4 === 0) c.set(x, y, METAL[0]);
      c.box(0, 2, w - 1, boardH, METAL);
      const faces = [
        [0xff3d8b, 0x2a1440, 0x3de8ff],
        [0xffb23c, 0x16203a, 0xff5a3c],
        [0x3de8ff, 0x101a2c, 0xf1eefb],
      ];
      const [a, bg, b] = faces[variant % faces.length] as [number, number, number];
      for (let y = 4; y <= boardH - 2; y++) {
        for (let x = 2; x <= w - 3; x++) {
          let col = bg;
          if (variant % 3 === 0 && Math.abs((x - 2) - (y - 4) * 2 - 6) < 3) col = a;
          if (variant % 3 === 1 && Math.hypot(x - w * 0.35, y - boardH * 0.55) < boardH * 0.32) col = a;
          if (variant % 3 === 2 && (y - 4) % 5 < 2 && x < w * 0.7) col = a;
          if (x > w * 0.72 && x < w - 5 && y > 6 && y < boardH - 4) col = b;
          c.light(x, y, mix(col, bg, p.night > 0.5 ? 0 : 0.25));
        }
      }
      // Spotlights.
      for (const lx of [Math.round(w * 0.25), Math.round(w * 0.75)]) {
        c.set(lx, 0, METAL[2]);
        c.light(lx, 1, mix(p.glow, 0xffffff, 0.5));
        c.glows.push({ x: lx, y: 3, radius: 6, color: p.glow });
      }
      if (p.night > 0.5) c.glows.push({ x: w / 2, y: boardH / 2, radius: Math.round(w * 0.55), color: a });
      break;
    }
    case 'sign': {
      const desert = p.disc === 'sun' && p.night < 0.3;
      const ramp = desert ? WOOD : SIGN_GREEN;
      const boardH = Math.round(h * 0.45);
      c.cyl(3, boardH, 4, h - 1, METAL);
      c.cyl(w - 5, boardH, w - 4, h - 1, METAL);
      c.box(0, 0, w - 1, boardH, ramp);
      // An arrow and a few "text" bars (no real writing).
      const ink = desert ? 0x2a1c14 : 0xe8f0e8;
      for (let y = 3; y < boardH - 2; y += 3) for (let x = 3; x < w * 0.6 - (y % 2) * 3; x++) c.set(x, y, ink);
      const ax = Math.round(w * 0.75);
      const ay = Math.round(boardH / 2);
      for (let i = 0; i < 4; i++) {
        c.set(ax - 3 + i, ay, ink);
        c.set(ax + i - 1, ay - 3 + i, ink);
        c.set(ax + i - 1, ay + 3 - i, ink);
      }
      break;
    }
    case 'wreck': {
      // A rusted car shell sitting on its rims.
      const body = [
        { x: 0.5, y: h - 2.5 },
        { x: 0.5, y: h * 0.45 },
        { x: w * 0.2, y: h * 0.38 },
        { x: w * 0.32, y: 1.5 },
        { x: w * 0.66, y: 1.5 },
        { x: w * 0.8, y: h * 0.4 },
        { x: w - 0.5, y: h * 0.5 },
        { x: w - 0.5, y: h - 2.5 },
      ];
      g.fillPolygon(body, RUST[1]);
      g.paint(RUST[3], (x, y, col) => col === RUST[1] && g.get(x, y - 1) === null);
      g.paint(RUST[2], (x, y, col) => col === RUST[1] && y < h * 0.55 && dither(x, y, 0.5));
      g.paint(RUST[0], (_x, y, col) => col !== null && y >= h - 4);
      // Empty windows.
      g.paint(0x120c10, (x, y, col) => col !== null && y > 3 && y < h * 0.36 && x > w * 0.34 && x < w * 0.64 && x !== Math.round(w * 0.49));
      // Rust holes.
      for (let i = 0; i < 4; i++) c.set(2 + rand() * (w - 4), h * 0.5 + rand() * (h * 0.3), 0x1a0e0c);
      for (const wx of [w * 0.2, w * 0.78]) c.blob(wx, h - 2.5, 2.5, 2.5, RUBBER, false);
      break;
    }
    case 'tyres': {
      const count = 2 + (variant % 3);
      const tw = Math.min(w - 1, 12);
      for (let i = 0; i < count; i++) {
        const y1 = h - 1 - i * 4;
        const x0 = Math.round((w - tw) / 2 + (i % 2 ? 1 : -1) * (variant % 2));
        c.box(x0, y1 - 3, x0 + tw - 1, y1, RUBBER);
        for (let x = x0 + 2; x < x0 + tw - 2; x += 3) c.set(x, y1 - 2, RUBBER[3]);
      }
      break;
    }
    case 'barrel': {
      const colors: Ramp[] = [
        [0x14243a, 0x24426a, 0x3a6696, 0x5a8abc],
        [0x3a1414, 0x6a2424, 0x963a32, 0xbc5a4a],
        [0x3a3010, 0x6a5418, 0x967a28, 0xbca04a],
      ];
      const r = colors[variant % colors.length] as Ramp;
      c.cyl(1, 1, w - 2, h - 1, r);
      for (const ry of [3, Math.round(h / 2), h - 3]) for (let x = 1; x < w - 1; x++) c.set(x, ry, r[0]);
      for (let x = 2; x < w - 2; x++) c.set(x, 0, r[3]);
      break;
    }
    case 'cone': {
      const cx = (w - 1) / 2;
      for (let y = 0; y < h - 1; y++) {
        const half = 0.5 + (y / (h - 1)) * (w / 2 - 1);
        for (let x = Math.ceil(cx - half); x <= Math.floor(cx + half); x++) {
          const stripe = y > h * 0.35 && y < h * 0.55;
          c.set(x, y, stripe ? 0xf1eefb : x < cx ? CONE[2] : CONE[1]);
        }
      }
      c.box(0, h - 2, w - 1, h - 1, CONE);
      break;
    }
    case 'guardrail': {
      // Corrugated steel rail on short posts.
      for (const px of [3, Math.round(w / 2) + 3]) c.cyl(px, 3, px + 2, h - 1, METAL);
      for (let x = 0; x < w; x++) {
        c.set(x, 2, METAL[3]);
        c.set(x, 3, METAL[2]);
        c.set(x, 4, x % 4 < 2 ? METAL[1] : METAL[2]);
        c.set(x, 5, METAL[0]);
      }
      break;
    }
    case 'pine': {
      const ramp = plantRamp(p);
      const cx = Math.floor(w / 2);
      c.cyl(cx - 1, h - 5, cx, h - 1, WOOD);
      const top = 0;
      const bottom = h - 4;
      for (let y = top; y <= bottom; y++) {
        const row = y - top;
        const half = Math.floor(row * (w / 2 - 1) / (bottom - top)) - (row % 4 === 0 && row > 4 ? 1 : 0);
        for (let dx = -half; dx <= half; dx++) {
          const col = dx === -half ? ramp[2] : dx >= half - 1 ? ramp[0] : row % 4 === 1 && dx < 0 ? ramp[2] : ramp[1];
          c.set(cx + dx, y, col);
        }
      }
      c.set(cx, 0, ramp[3]);
      break;
    }
    case 'cactus': {
      const trunkX = Math.floor(w / 2) - 2;
      c.cyl(trunkX, 2, trunkX + 3, h - 1, CACTUS);
      c.set(trunkX + 1, 1, CACTUS[2]);
      c.set(trunkX + 2, 1, CACTUS[1]);
      const armY = Math.round(h * (0.35 + (variant % 2) * 0.15));
      // Left arm.
      c.box(trunkX - 4, armY, trunkX - 1, armY + 2, CACTUS);
      c.cyl(trunkX - 5, armY - 7, trunkX - 3, armY + 2, CACTUS);
      // Right arm, higher.
      if (variant !== 1) {
        c.box(trunkX + 4, armY - 4, trunkX + 6, armY - 2, CACTUS);
        c.cyl(trunkX + 6, armY - 10, trunkX + 8, armY - 2, CACTUS);
      }
      // Spines.
      for (let y = 3; y < h - 1; y += 3) c.set(trunkX + 1, y, CACTUS[3]);
      break;
    }
    case 'rock': {
      const ramp = rockRamp(p);
      c.blob(w * 0.42, h * 0.62, w * 0.42, h * 0.62, ramp);
      if (variant !== 0) c.blob(w * 0.75, h * 0.8, w * 0.24, h * 0.32, ramp);
      // Cracks.
      for (let i = 0; i < 3; i++) {
        let x = Math.round(w * (0.25 + rand() * 0.4));
        for (let y = Math.round(h * 0.4); y < h - 1 && g.get(x, y) !== null; y++) {
          if (rand() < 0.6) c.set(x, y, ramp[0]);
          x += rand() < 0.5 ? 0 : 1;
        }
      }
      break;
    }
    case 'grass': {
      const ramp = p.disc === 'sun' && p.night < 0.3 ? ([0x6a5228, 0x9a7a3a, 0xc4a050, 0xe8c878] as Ramp) : plantRamp(p);
      for (let x = 0; x < w; x++) {
        if (rand() < 0.35) continue;
        const bladeH = 2 + Math.floor(rand() * (h - 2));
        const lean = rand() < 0.5 ? -1 : 1;
        for (let k = 0; k < bladeH; k++) {
          const bx = x + (k > bladeH * 0.6 ? lean : 0);
          c.set(bx, h - 1 - k, k === bladeH - 1 ? ramp[3] : k < 2 ? ramp[0] : x % 2 ? ramp[1] : ramp[2]);
        }
      }
      break;
    }
    case 'crystal': {
      const shards = 2 + (variant % 2);
      const bright = mix(p.glow, 0xffffff, 0.35);
      for (let i = 0; i < shards; i++) {
        const sx = Math.round(w * (0.2 + (i / shards) * 0.65) + rand() * 2);
        const sh = Math.round(h * (0.45 + rand() * 0.55));
        const half = 1 + Math.floor(rand() * 2.5);
        const lean = (rand() - 0.5) * 0.4;
        for (let row = 0; row < sh; row++) {
          const span = Math.max(0, Math.round((row / sh) * half + (row > 1 ? 0.5 : 0)));
          const cx = sx + Math.round((sh - row) * lean);
          for (let dx = -span; dx <= span; dx++) {
            const y = h - sh + row;
            if (dx === -span) c.light(cx + dx, y, bright);
            else if (dx === 0) c.set(cx + dx, y, p.peak);
            else c.set(cx + dx, y, dx > 0 ? p.featureDark : p.feature);
          }
        }
        c.glows.push({ x: sx, y: h - sh * 0.6, radius: Math.max(5, Math.round(sh * 0.45)), color: p.glow });
      }
      break;
    }
  }
}

/** Grid sizes (w, h) per prop kind and variant, in pixels. */
function sizeOf(kind: PropKind, variant: number): [number, number] {
  const v = variant % PROP_VARIANTS;
  switch (kind) {
    case 'lamp':
      return [16, 42 + v * 3];
    case 'pole':
      return [13, 50 + v * 2];
    case 'fence':
      return [37, 16];
    case 'billboard':
      return [40 + v * 4, 44];
    case 'sign':
      return [24 + v * 2, 28];
    case 'wreck':
      return [32 + v * 3, 14];
    case 'tyres':
      return [14, 16];
    case 'barrel':
      return [9, 13];
    case 'cone':
      return [7, 10];
    case 'guardrail':
      return [48, 12];
    case 'pine':
      return [15 + v * 3, 32 + v * 7];
    case 'cactus':
      return [16, 24 + v * 6];
    case 'rock':
      return [12 + v * 6, 8 + v * 4];
    case 'grass':
      return [10 + v * 4, 7 + v];
    case 'crystal':
      return [14 + v * 3, 24 + v * 8];
  }
}

/**
 * Builds a prop. `near` props stand between the road and the camera: they're drawn as dark,
 * rim-lit silhouettes. Roadside props get rim light, haze and a little night darkening.
 */
export function buildProp(kind: PropKind, variant: number, palette: BiomePalette, near: boolean): PropArt {
  const [w, h] = sizeOf(kind, variant);
  const canvas = new Canvas(w, h);
  draw(canvas, kind, variant % PROP_VARIANTS, palette);

  const src = canvas.g;
  const out = new PixelGrid(w, h);
  const shadow = shade(palette.groundDark, -0.55);
  src.forEach((x, y, c) => {
    if (c === null) return;
    if (canvas.bright.has(y * w + x)) {
      out.set(x, y, c);
      return;
    }
    const top = src.get(x, y - 1) === null;
    const left = src.get(x - 1, y) === null;
    let col: number;
    if (near) {
      col = mix(c, shadow, 0.62);
      if (top) col = mix(col, palette.rim, 0.4);
      else if (left) col = mix(col, palette.rim, 0.15);
    } else {
      col = mix(c, palette.haze, 0.12);
      col = mix(col, palette.sky[0] ?? col, palette.night * 0.3);
      if (top) col = mix(col, palette.rim, 0.4);
      else if (left) col = mix(col, palette.rim, 0.18);
    }
    out.set(x, y, col);
  });
  if (!near) out.outline((x, y) => (src.get(x, y - 1) !== null || y >= h - 1 ? shade(palette.featureDark, -0.5) : shade(palette.featureDark, -0.3)));
  return { grid: out, glows: canvas.glows };
}
