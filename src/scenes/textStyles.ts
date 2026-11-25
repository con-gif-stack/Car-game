import type Phaser from 'phaser';
import { FONT_FAMILY, FONT_SCALE } from '../ui/theme';

type TextStyle = Phaser.Types.GameObjects.Text.TextStyle;

/** Actual font size for a nominal size (see FONT_SCALE). */
export const fontPx = (size: number) => Math.round(size * FONT_SCALE);

/**
 * A plain text style in the pixel font. The font has a single, heavy weight, so `bold` is
 * accepted for readability at call sites but draws the same (a faked bold would smear the pixels).
 */
export const textStyle = (size: number, color: string, _bold = false): TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${fontPx(size)}px`,
  color,
});

/** A text style that wraps at `width`. */
export const wrapStyle = (
  size: number,
  color: string,
  width: number,
  bold = false,
  align: 'left' | 'center' | 'right' = 'left',
): TextStyle => ({
  ...textStyle(size, color, bold),
  align,
  wordWrap: { width },
});

/** Text drawn over scenery gets a dark outline and a hard drop shadow so it stays readable. */
export const overlayStyle = (size: number, color: string, bold = false): TextStyle => ({
  ...textStyle(size, color, bold),
  stroke: '#07050f',
  strokeThickness: Math.max(4, Math.round(size / 7)),
  shadow: { offsetX: 0, offsetY: Math.max(3, Math.round(size / 12)), color: '#07050f', blur: 0, fill: true, stroke: true },
});
