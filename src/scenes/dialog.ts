import type Phaser from 'phaser';
import { Panel, type Area } from './panel';

export { cssColor } from './panel';

export interface DialogLine {
  text: string;
  size: number;
  color: string;
  bold?: boolean;
  /** Space below this line. Default 12. */
  gapAfter?: number;
}

export interface DialogOptions {
  /** Area the dialog covers and centres in (the scene camera's coordinates). */
  area: Area;
  lines: DialogLine[];
  align?: 'left' | 'center';
  buttonLabel: string;
  onButton: () => void;
  /** Called when the dimmed backdrop is tapped. Omit to make the backdrop do nothing. */
  onBackdrop?: () => void;
}

/** A simple panel: text lines and one button. Destroy the result to close it. */
export function openDialog(scene: Phaser.Scene, options: DialogOptions): Phaser.GameObjects.Container {
  const panel = new Panel(scene, { area: options.area, align: options.align, onBackdrop: options.onBackdrop });
  for (const line of options.lines) {
    panel.text(line.text, line.size, line.color, { bold: line.bold, gapAfter: line.gapAfter });
  }
  panel.gap(24);
  panel.button(options.buttonLabel, { onClick: options.onButton });
  return panel.finish();
}
