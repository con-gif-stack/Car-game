import Phaser from 'phaser';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';

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
  area: { x: number; y: number; width: number; height: number };
  lines: DialogLine[];
  align?: 'left' | 'center';
  buttonLabel: string;
  onButton: () => void;
  /** Called when the dimmed backdrop is tapped. Omit to make the backdrop do nothing. */
  onBackdrop?: () => void;
}

const PANEL_MARGIN = 52;
const PANEL_PADDING = 48;
const BUTTON_HEIGHT = 96;

/** A centred panel over a dimmed backdrop with text lines and one button. Destroy it to close. */
export function openDialog(scene: Phaser.Scene, options: DialogOptions): Phaser.GameObjects.Container {
  const { area, lines, align = 'left' } = options;
  const items: Phaser.GameObjects.GameObject[] = [];

  const backdrop = scene.add
    .rectangle(area.x, area.y, area.width, area.height, 0x000000, 0.65)
    .setOrigin(0)
    .setInteractive();
  if (options.onBackdrop) backdrop.on('pointerup', options.onBackdrop);
  items.push(backdrop);

  const panelWidth = area.width - 2 * PANEL_MARGIN;
  const panelX = area.x + PANEL_MARGIN;
  const textWidth = panelWidth - 2 * PANEL_PADDING;

  const texts = lines.map((line) =>
    scene.add
      .text(0, 0, line.text, {
        fontFamily: FONT_FAMILY,
        fontSize: `${line.size}px`,
        fontStyle: line.bold ? 'bold' : 'normal',
        color: line.color,
        align,
        wordWrap: { width: textWidth },
      })
      .setOrigin(align === 'center' ? 0.5 : 0, 0),
  );
  const contentHeight = texts.reduce((sum, t, i) => sum + t.height + (lines[i]?.gapAfter ?? 12), 0);
  const panelHeight = PANEL_PADDING + contentHeight + 24 + BUTTON_HEIGHT + PANEL_PADDING;
  const panelY = area.y + Math.max(PANEL_MARGIN / 2, (area.height - panelHeight) / 2);

  const panel = scene.add
    .rectangle(panelX, panelY, panelWidth, panelHeight, COLORS.panel)
    .setOrigin(0)
    .setRounded(28)
    .setStrokeStyle(3, COLORS.panelBorder)
    .setInteractive(); // Swallows taps so they don't reach the backdrop.
  items.push(panel);

  let y = panelY + PANEL_PADDING;
  const textX = align === 'center' ? area.x + area.width / 2 : panelX + PANEL_PADDING;
  texts.forEach((t, i) => {
    t.setPosition(textX, y);
    y += t.height + (lines[i]?.gapAfter ?? 12);
    items.push(t);
  });

  const buttonY = panelY + panelHeight - PANEL_PADDING - BUTTON_HEIGHT;
  const button = scene.add
    .rectangle(area.x + area.width / 2, buttonY, textWidth, BUTTON_HEIGHT, COLORS.panelRaised)
    .setOrigin(0.5, 0)
    .setRounded(24)
    .setStrokeStyle(3, COLORS.accent)
    .setInteractive({ useHandCursor: true });
  button.on('pointerup', options.onButton);
  const label = scene.add
    .text(area.x + area.width / 2, buttonY + BUTTON_HEIGHT / 2, options.buttonLabel, {
      fontFamily: FONT_FAMILY,
      fontSize: '34px',
      fontStyle: 'bold',
      color: TEXT_COLORS.primary,
    })
    .setOrigin(0.5);
  items.push(button, label);

  return scene.add.container(0, 0, items).setDepth(1000);
}

/** Hex colour number to a CSS colour string. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
