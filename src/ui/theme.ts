/**
 * The game's look: night-time indigo panels with warm sunset and neon accents, a pixel font,
 * and pixel-art frames (see `src/art/uiArt.ts`). Matches the dusk and night biomes on the road.
 */
export const COLORS = {
  background: 0x0a0818,
  panel: 0x17122e,
  panelRaised: 0x231b45,
  panelBorder: 0x3b2f6a,
  /** Neon pink: headings, highlights, "needs attention" dots. */
  accent: 0xff3d8b,
  /** Neon cyan: secondary actions and stat bars. */
  accentAlt: 0x3de8ff,
  /** Warm sunset orange: primary actions. */
  accentWarm: 0xff9a3c,
  /** Lamp and sign glow. */
  glow: 0xffc070,
  textSecondary: 0xa7a2c8,
  money: 0xffd23f,
  good: 0x6fe08a,
  bad: 0xff5d6c,
  /** Near-black outline used around pixel frames and text. */
  outline: 0x07050f,
} as const;

export const TEXT_COLORS = {
  primary: '#f1eefb',
  secondary: '#a7a2c8',
  muted: '#6a6490',
  accent: '#ff3d8b',
  warm: '#ffb067',
  good: '#6fe08a',
  bad: '#ff5d6c',
  dark: '#14102a',
} as const;

/** The bundled pixel font (Jersey 10, OFL; loaded in main.ts before the game starts). */
export const FONT_FAMILY = '"Jersey 10", ui-monospace, monospace';

/**
 * The pixel font is small for its nominal size, so every size given to the text helpers is
 * scaled by this. Sizes in the code stay comparable to an ordinary font.
 */
export const FONT_SCALE = 1.32;

/** Screen units per pixel-art pixel for UI frames, buttons and icons. */
export const UI_PIXEL = 4;
