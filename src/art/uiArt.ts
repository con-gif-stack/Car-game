import { dither, mix, shade } from './color';
import { PixelGrid } from './PixelGrid';

/*
 * Pixel-art UI pieces, generated in code at pixel size (one grid pixel = UI_PIXEL screen units):
 * framed panels, buttons, header plates, bar tracks and fills, glows and the speedometer dial.
 * Frames are built at their full size (not stretched), so their dithered gradients stay crisp.
 */

/** Frame looks. */
export type FrameKind =
  /** Pop-up panels and screen sections: dark gradient body, coloured edge. */
  | 'panel'
  /** Cards inside a section: a little lighter, flatter. */
  | 'card'
  /** A recessed slot (bar tracks, odometer digits). */
  | 'inset'
  /** A bright header strip in the given colour. */
  | 'plate'
  /** Button, raised. */
  | 'button'
  /** Button, pressed. */
  | 'buttonDown'
  /** Button that can't be used. */
  | 'buttonOff';

const OUTLINE = 0x07050f;
const PANEL_TOP = 0x261d4c;
const PANEL_BOTTOM = 0x130f28;
const CARD_TOP = 0x2a2150;
const CARD_BOTTOM = 0x1d1740;
const INSET = 0x0c0a1c;
const OFF = 0x3a3554;

/**
 * Distance of a pixel from the frame's edge, in rings: 0 is the outline, 1 the edge colour,
 * 2+ the body. Negative means outside (the cut corners).
 */
export function frameRing(x: number, y: number, w: number, h: number, chamfer = 2): number {
  const rx = w - 1 - x;
  const by = h - 1 - y;
  return Math.min(x, y, rx, by, x + y - chamfer, rx + y - chamfer, x + by - chamfer, rx + by - chamfer);
}

/** A frame of `w` x `h` pixels. `color` is the edge colour (panel, card) or the fill (plate, buttons). */
export function buildFrame(w: number, h: number, kind: FrameKind, color: number): PixelGrid {
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    const ring = frameRing(x, y, w, h);
    if (ring < 0) return;
    if (ring === 0) {
      g.set(x, y, OUTLINE);
      return;
    }
    g.set(x, y, frameBody(kind, color, x, y, h, ring));
  });
  return g;
}

function frameBody(kind: FrameKind, color: number, x: number, y: number, h: number, ring: number): number {
  const t = y / Math.max(1, h - 1);
  switch (kind) {
    case 'panel':
    case 'card': {
      if (ring === 1) return y < h / 2 ? shade(color, 0.15) : color;
      const top = kind === 'panel' ? PANEL_TOP : CARD_TOP;
      const bottom = kind === 'panel' ? PANEL_BOTTOM : CARD_BOTTOM;
      if (y === 2) return mix(top, 0xffffff, 0.1);
      if (y === h - 3) return shade(bottom, -0.3);
      // Coarse bands with dithered steps: a gradient that reads as pixel art.
      const bands = 4;
      const v = t * bands;
      const band = Math.floor(v);
      const step = dither(x, y, (v - band - 0.6) / 0.4) ? band + 1 : band;
      return mix(top, bottom, Math.min(bands, step) / bands);
    }
    case 'inset': {
      if (ring === 1) return y < 2 ? shade(INSET, -0.4) : mix(INSET, color, 0.35);
      if (y === 2) return shade(INSET, -0.3);
      return INSET;
    }
    case 'plate': {
      if (ring === 1) return shade(color, -0.35);
      if (y === 2) return shade(color, 0.45);
      if (y >= h - 3) return shade(color, -0.25);
      return dither(x, y, (t - 0.35) * 1.5) ? shade(color, -0.1) : color;
    }
    case 'button':
    case 'buttonDown':
    case 'buttonOff': {
      const base = kind === 'buttonOff' ? OFF : color;
      const pressed = kind === 'buttonDown';
      const lip = pressed ? 1 : 3;
      if (ring === 1) return shade(base, -0.45);
      if (y >= h - 1 - lip) return shade(base, -0.4);
      if (y === 2 && !pressed) return shade(base, 0.5);
      // Lighter top half dithering into the base colour.
      const top = shade(base, pressed ? 0 : 0.18);
      const bottom = shade(base, pressed ? -0.15 : -0.05);
      return dither(x, y, (t - 0.3) * 2) ? bottom : top;
    }
  }
}

/** A bar fill: light top row, darker bottom, with segment gaps every `segment` pixels (0 = none). */
export function buildBarFill(w: number, h: number, color: number, segment = 0): PixelGrid {
  const g = new PixelGrid(w, h);
  g.forEach((x, y) => {
    if (segment > 0 && x % segment === segment - 1) {
      g.set(x, y, shade(color, -0.55));
      return;
    }
    const c = y === 0 ? shade(color, 0.45) : y >= h - 1 ? shade(color, -0.35) : y === 1 ? shade(color, 0.15) : color;
    g.set(x, y, c);
  });
  return g;
}

/** A soft round glow made of dithered pixels, for additive blending (lamps, lights, neon). */
export function buildGlow(radius: number, color: number, falloff = 1.6): PixelGrid {
  const size = radius * 2;
  const g = new PixelGrid(size, size);
  g.forEach((x, y) => {
    const d = Math.hypot(x + 0.5 - radius, y + 0.5 - radius) / radius;
    if (d >= 1) return;
    const strength = (1 - d) ** falloff;
    if (dither(x, y, strength * 1.4)) g.set(x, y, strength > 0.55 ? shade(color, 0.3) : color);
  });
  return g;
}

/** A light cone pointing right from its left-middle point (car headlights). */
export function buildLightCone(length: number, spread: number, color: number): PixelGrid {
  const h = spread * 2 + 1;
  const g = new PixelGrid(length, h);
  g.forEach((x, y) => {
    const t = x / length;
    const half = 1 + t * spread;
    const dy = Math.abs(y - spread);
    if (dy > half) return;
    const strength = (1 - t) * (1 - (dy / half) * 0.7);
    if (dither(x, y, strength * 1.2)) g.set(x, y, color);
  });
  return g;
}

/** Arc of the speedometer, in radians: from lower left, over the top, to lower right. */
export const DIAL_START = Math.PI * 0.75;
export const DIAL_SWEEP = Math.PI * 1.5;

/** Speedometer face: rim, dark face, tick marks along a 270° arc, the last part red. */
export function buildDial(size: number): PixelGrid {
  const g = new PixelGrid(size, size);
  const c = size / 2;
  const r = size / 2 - 0.5;
  g.forEach((x, y) => {
    const d = Math.hypot(x + 0.5 - c, y + 0.5 - c);
    if (d > r) return;
    if (d > r - 1) g.set(x, y, OUTLINE);
    else if (d > r - 3) g.set(x, y, y < c ? 0x8c86b0 : 0x524c78);
    else if (d > r - 4) g.set(x, y, OUTLINE);
    else g.set(x, y, dither(x, y, (y / size) * 0.6) ? 0x120e26 : 0x1b1638);
  });
  const ticks = 10;
  for (let i = 0; i <= ticks; i++) {
    const a = DIAL_START + (DIAL_SWEEP * i) / ticks;
    const major = i % 2 === 0;
    const red = i >= 8;
    const inner = r - (major ? 9 : 7);
    for (let k = inner; k <= r - 5; k += 0.5) {
      const x = Math.floor(c + Math.cos(a) * k);
      const y = Math.floor(c + Math.sin(a) * k);
      g.set(x, y, red ? 0xff4d5e : major ? 0xf1eefb : 0x9a94c4);
    }
  }
  // Hub.
  g.fillCircle(c, c, 2.5, 0x524c78);
  g.set(Math.floor(c), Math.floor(c), 0xf1eefb);
  return g;
}

/** The speedometer needle, pointing right from its left end. */
export function buildNeedle(length: number): PixelGrid {
  const g = new PixelGrid(length, 3);
  for (let x = 0; x < length; x++) {
    g.set(x, 1, 0xff5a3c);
    if (x < length * 0.6) {
      g.set(x, 0, 0xff9a6a);
      g.set(x, 2, 0xb8321e);
    }
  }
  return g;
}

/** A dithered horizontal rule (dividers in panels). */
export function buildRule(w: number, color: number): PixelGrid {
  const g = new PixelGrid(w, 2);
  for (let x = 0; x < w; x++) {
    const fade = Math.min(x, w - 1 - x) / Math.max(1, w * 0.15);
    if (dither(x, 0, fade)) g.set(x, 0, color);
    if (dither(x, 1, fade * 0.8)) g.set(x, 1, OUTLINE);
  }
  return g;
}

/**
 * Menu themes: each pop-up looks like a thing from the game's world. Neon is the default dark
 * indigo look; the others are a steel toolbox with pegboard (car parts), a blueprint (garage
 * plans and farms), a CRT terminal (drones) and a wooden crate (the materials store).
 */
export type PanelTheme = 'neon' | 'toolbox' | 'blueprint' | 'terminal' | 'crate';

/** Which piece of a themed panel: the panel itself, a card inside it, or its title plate. */
export type ThemePart = 'panel' | 'card' | 'plate';

/** Divider colour inside each theme. */
export const THEME_RULE: Record<PanelTheme, number> = {
  neon: 0x3b2f6a,
  toolbox: 0x5c616c,
  blueprint: 0x6f9be0,
  terminal: 0x1d6f6a,
  crate: 0x6e4628,
};

/** The default edge colour of cards: highlight colours given to a card tint its edge instead. */
const NEUTRAL_EDGE = 0x3b2f6a;

/**
 * A themed panel, card or plate of `w` x `h` pixels. `color` tints a card's edge (for
 * highlights such as "ready to buy"); the default panel border colour leaves the theme's own.
 */
export function buildThemedFrame(w: number, h: number, theme: PanelTheme, part: ThemePart, color: number): PixelGrid {
  if (theme === 'neon') return buildFrame(w, h, part, color);
  const g = new PixelGrid(w, h);
  const tint = (base: number) => (color === NEUTRAL_EDGE ? base : mix(base, color, 0.7));
  g.forEach((x, y) => {
    const ring = frameRing(x, y, w, h);
    if (ring < 0) return;
    if (ring === 0) {
      g.set(x, y, OUTLINE);
      return;
    }
    const t = y / Math.max(1, h - 1);
    const grad = (top: number, bottom: number, bands = 4) => {
      const v = t * bands;
      const band = Math.floor(v);
      const step = dither(x, y, (v - band - 0.6) / 0.4) ? band + 1 : band;
      return mix(top, bottom, Math.min(bands, step) / bands);
    };
    g.set(x, y, themedPixel(theme, part, x, y, w, h, ring, grad, tint));
  });
  decorateTheme(g, theme, part);
  return g;
}

function themedPixel(
  theme: Exclude<PanelTheme, 'neon'>,
  part: ThemePart,
  x: number,
  y: number,
  w: number,
  h: number,
  ring: number,
  grad: (top: number, bottom: number, bands?: number) => number,
  tint: (c: number) => number,
): number {
  switch (theme) {
    case 'toolbox': {
      if (part === 'panel') {
        if (ring === 1) return y < h / 2 ? 0xb4bac6 : 0x7a808c;
        if (ring === 2) return 0x8a909c;
        if (ring === 3) return 0x4a4e58;
        // Hazard stripes along the bottom of the box.
        if (y >= h - 8 && y <= h - 5) return (x + y) % 8 < 4 ? 0xffc43d : 0x1a1a1e;
        if (y === h - 9) return 0x14151b;
        // Pegboard: a grid of holes, each with a lit lower edge.
        const hx = (x - 6) % 8;
        const hy = (y - 6) % 8;
        if (hx === 0 && hy === 0) return 0x0e1015;
        if (hx === 0 && hy === 1) return 0x3a3f4c;
        return grad(0x2c303b, 0x1d2029);
      }
      if (part === 'plate') {
        // A painted warning sign with striped ends.
        if (ring === 1) return 0x7a4a10;
        const end = x < 8 || x > w - 9;
        if (end) return (x + y) % 6 < 3 ? 0xffc43d : 0x1a1a1e;
        if (y === 2) return 0xffe08a;
        if (y >= h - 3) return 0xc87a18;
        return dither(x, y, (y / h - 0.4) * 1.4) ? 0xe89422 : 0xffb02e;
      }
      if (ring === 1) return tint(0x6a707c);
      if (y === 2) return 0x4a4f5c;
      return grad(0x353944, 0x292c35, 3);
    }
    case 'blueprint': {
      if (part === 'plate') {
        // A red rubber stamp: double border, uneven ink.
        if (ring === 1) return 0xffd0c8;
        if (ring === 2) return 0xb8343a;
        if (ring === 3) return (x + y) % 3 === 0 ? 0xb8343a : 0xffb0a8;
        return dither(x * 3, y * 5, 0.14) ? 0xd8585c : 0xc23a3e;
      }
      if (part === 'card') {
        if (ring === 1) return (x + y) % 4 < 2 ? tint(0x9fbbe8) : 0x24497f;
        return grad(0x24497f, 0x1e4072, 3);
      }
      if (ring === 1) return 0xdce8ff;
      if (ring === 2) return 0x15305c;
      if (ring === 3) return 0x8fb2e8;
      const base = grad(0x1d4176, 0x163463);
      if (x % 32 === 0 || y % 32 === 0) return mix(base, 0x9fc0f4, 0.4);
      if (x % 8 === 0 || y % 8 === 0) return mix(base, 0x6f9be0, 0.2);
      return base;
    }
    case 'terminal': {
      if (part === 'plate') {
        if (ring === 1) return 0x0f5a60;
        if (y === 2) return 0xb8fbff;
        if (y >= h - 3) return 0x1fa8b8;
        return y % 2 === 0 ? 0x34d4ea : 0x3de8ff;
      }
      if (part === 'card') {
        if (ring === 1) return tint(0x1d6f6a);
        return y % 2 === 0 ? 0x0e2c27 : 0x0b2622;
      }
      // Plastic bezel, then the glowing screen with scanlines.
      if (ring === 1) return y < h / 2 ? 0x5a686e : 0x46525a;
      if (ring === 2) return 0x3a4448;
      if (ring === 3) return 0x262e32;
      if (ring === 4) return 0x1d6f6a;
      const screen = grad(0x0a1f1d, 0x061514);
      return y % 2 === 0 ? mix(screen, 0x3de8ff, 0.05) : screen;
    }
    case 'crate': {
      if (part === 'plate') {
        // A stencilled pine board.
        if (ring === 1) return 0x5e3c22;
        if (y === 2) return 0xe8c48a;
        if (y >= h - 3) return 0x9a6e3c;
        return (x * 3 + y * 7) % 13 === 0 ? 0xb08448 : 0xc89a5a;
      }
      if (part === 'card') {
        if (ring === 1) return tint(0x6e4628);
        if (y === 2) return 0x5a4030;
        return grad(0x3c2b20, 0x30231a, 3);
      }
      if (ring <= 4) {
        // The crate's plank frame, with grain.
        const grain = (x * 3 + y * 7) % 11 === 0 || (x * 5 + y * 2) % 17 === 0;
        if (ring === 1) return y < h / 2 ? 0xb07a44 : 0x8a5a32;
        if (ring === 4) return 0x3e2816;
        return grain ? 0x6e4628 : 0x8a5a32;
      }
      // Dark inside, with plank seams.
      const inside = grad(0x2c1f17, 0x1b130e);
      const row = Math.floor((y - 5) / 14);
      if ((y - 5) % 14 === 0) return 0x120c08;
      if ((x + row * 23) % 61 === 0) return 0x120c08;
      return inside;
    }
  }
}

/** Bolts, corner ticks, nails and lights on top of a themed frame. */
function decorateTheme(g: PixelGrid, theme: PanelTheme, part: ThemePart): void {
  const w = g.width;
  const h = g.height;
  const corners = (inset: number) => [
    [inset, inset],
    [w - 1 - inset, inset],
    [inset, h - 1 - inset],
    [w - 1 - inset, h - 1 - inset],
  ] as const;
  if (theme === 'toolbox' && part === 'panel') {
    for (const [cx, cy] of corners(6)) {
      for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) if (dx * dx + dy * dy <= 5) g.set(cx + dx, cy + dy, dy < 0 ? 0xdde2ea : 0xa8aeba);
      g.set(cx - 1, cy, 0x4a4e58);
      g.set(cx, cy, 0x4a4e58);
      g.set(cx + 1, cy, 0x4a4e58);
    }
  }
  if (theme === 'toolbox' && part === 'card' && w > 12) {
    for (const x of [3, w - 4]) {
      g.set(x, Math.floor(h / 2), 0xa8aeba);
      g.set(x, Math.floor(h / 2) + 1, 0x4a4e58);
    }
  }
  if (theme === 'blueprint' && part === 'panel') {
    for (const [cx, cy] of corners(6)) {
      const sx = cx < w / 2 ? 1 : -1;
      const sy = cy < h / 2 ? 1 : -1;
      for (let k = 0; k < 6; k++) {
        g.set(cx + sx * k, cy, 0xdce8ff);
        g.set(cx, cy + sy * k, 0xdce8ff);
      }
    }
  }
  if (theme === 'terminal' && part === 'panel') {
    // A power light on the bezel.
    for (let k = 0; k < 3; k++) g.set(w - 12 + k, h - 3, 0x6fe08a);
  }
  if (theme === 'crate' && (part === 'panel' || part === 'card')) {
    const inset = part === 'panel' ? 2 : 2;
    const nails = part === 'panel' ? [...corners(inset)] : [[3, Math.floor(h / 2)] as const, [w - 4, Math.floor(h / 2)] as const];
    if (part === 'panel') for (let x = 40; x < w - 20; x += 40) nails.push([x, inset], [x, h - 1 - inset]);
    for (const [nx, ny] of nails) {
      g.set(nx, ny, 0xd8d0c0);
      g.set(nx + 1, ny + 1, 0x2a1d16);
    }
  }
}
