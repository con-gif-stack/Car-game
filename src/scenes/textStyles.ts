import type Phaser from 'phaser';
import { FONT_FAMILY } from '../ui/theme';

/** A plain text style. */
export const textStyle = (size: number, color: string, bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  color,
  fontStyle: bold ? 'bold' : 'normal',
});

/** Text drawn over scenery gets a dark outline so it stays readable on a bright sky. */
export const overlayStyle = (size: number, color: string, bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
  ...textStyle(size, color, bold),
  stroke: '#0b0b14',
  strokeThickness: Math.max(4, Math.round(size / 7)),
});
