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
