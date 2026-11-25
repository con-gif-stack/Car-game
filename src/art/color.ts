/*
 * Colour helpers for generated pixel art: blending, shade ramps and ordered dithering.
 * Colours are 0xRRGGBB numbers.
 */

/** 4x4 ordered-dither thresholds, for the classic stepped pixel-art gradient. */
export const BAYER4 = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5] as const;

/** Dither threshold in (0, 1) for a pixel position. */
export function bayer(x: number, y: number): number {
  const i = (((y % 4) + 4) % 4) * 4 + (((x % 4) + 4) % 4);
  return ((BAYER4[i] ?? 0) + 0.5) / 16;
}

/** True where a pixel should take the "next" colour for a blend amount t in [0, 1]. */
export function dither(x: number, y: number, t: number): boolean {
  return t > bayer(x, y);
}

/** Linear blend between two colours: t = 0 gives a, t = 1 gives b. */
export function mix(a: number, b: number, t: number): number {
  const k = Math.min(1, Math.max(0, t));
  const ch = (shift: number) => {
    const ca = (a >> shift) & 0xff;
    const cb = (b >> shift) & 0xff;
    return Math.round(ca + (cb - ca) * k) & 0xff;
  };
  return (ch(16) << 16) | (ch(8) << 8) | ch(0);
}

/** Lighter (t > 0, towards white) or darker (t < 0, towards black) version of a colour. */
export function shade(color: number, t: number): number {
  return t >= 0 ? mix(color, 0xffffff, t) : mix(color, 0x000000, -t);
}

/**
 * A shade ramp of `n` colours from `dark` through `base` to `light` (index 0 darkest).
 * Good for 4–5 tone pixel shading.
 */
export function ramp(base: number, light: number, dark: number, n: number): number[] {
  const out: number[] = [];
  const mid = (n - 1) / 2;
  for (let i = 0; i < n; i++) {
    out.push(i <= mid ? mix(dark, base, mid === 0 ? 1 : i / mid) : mix(base, light, (i - mid) / (n - 1 - mid)));
  }
  return out;
}

/** Picks from a ramp by a value in [0, 1], dithering between neighbouring shades. */
export function rampAt(colors: readonly number[], t: number, x: number, y: number): number {
  const v = Math.min(1, Math.max(0, t)) * (colors.length - 1);
  const i = Math.floor(v);
  const next = Math.min(colors.length - 1, i + 1);
  return (dither(x, y, v - i) ? colors[next] : colors[i]) ?? 0;
}
