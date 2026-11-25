import Phaser from 'phaser';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';

export interface Area {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface PanelOptions {
  /** Area the panel covers with its backdrop and centres in (scene camera coordinates). */
  area: Area;
  /** Called when the dimmed backdrop is tapped. Omit to make the backdrop do nothing. */
  onBackdrop?: () => void;
  /** Default alignment for text lines. */
  align?: 'left' | 'center';
}

export interface ButtonOptions {
  onClick: () => void;
  /** Disabled buttons are dimmed and ignore taps. Default true. */
  enabled?: boolean;
  /** Outline colour when enabled. Default the accent colour. */
  color?: number;
  height?: number;
}

const MARGIN = 52;
const PADDING = 48;
const ICON_SCALE = 4;

/**
 * Builds a centred panel over a dimmed backdrop, top to bottom: add lines, rows and buttons,
 * then call `finish()`. Destroy `container` to close it.
 */
export class Panel {
  readonly container: Phaser.GameObjects.Container;
  readonly innerWidth: number;
  private readonly left: number;
  private readonly centerX: number;
  private readonly panelX: number;
  private readonly panelWidth: number;
  /** Objects with their y offset from the top of the content. */
  private readonly placed: { obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject; y: number }[] = [];
  private cursor = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: PanelOptions,
  ) {
    const { area } = options;
    this.panelWidth = area.width - 2 * MARGIN;
    this.panelX = area.x + MARGIN;
    this.innerWidth = this.panelWidth - 2 * PADDING;
    this.left = this.panelX + PADDING;
    this.centerX = area.x + area.width / 2;

    const backdrop = scene.add
      .rectangle(area.x, area.y, area.width, area.height, 0x000000, 0.65)
      .setOrigin(0)
      .setInteractive();
    if (options.onBackdrop) backdrop.on('pointerup', options.onBackdrop);
    this.container = scene.add.container(0, 0, [backdrop]).setDepth(1000);
  }

  /** A line of text. */
  text(
    content: string,
    size: number,
    color: string,
    opts: { bold?: boolean; gapAfter?: number; align?: 'left' | 'center' } = {},
  ): Phaser.GameObjects.Text {
    const align = opts.align ?? this.options.align ?? 'left';
    const t = this.scene.add
      .text(align === 'center' ? this.centerX : this.left, 0, content, {
        fontFamily: FONT_FAMILY,
        fontSize: `${size}px`,
        fontStyle: opts.bold ? 'bold' : 'normal',
        color,
        align,
        wordWrap: { width: this.innerWidth },
      })
      .setOrigin(align === 'center' ? 0.5 : 0, 0);
    this.place(t, t.height + (opts.gapAfter ?? 12));
    return t;
  }

  /**
   * A row with an optional icon, a title (and optional line under it) on the left, and a value
   * on the right.
   */
  row(opts: {
    icon?: string;
    title: string;
    titleColor?: string;
    sub?: string;
    subColor?: string;
    value?: string;
    valueColor?: string;
    size?: number;
    gapAfter?: number;
    /** Icon pixel scale (icons are 12 pixels square). */
    iconScale?: number;
  }): void {
    const size = opts.size ?? 30;
    const iconScale = opts.iconScale ?? ICON_SCALE;
    const iconSize = opts.icon ? 12 * iconScale : 0;
    const textX = this.left + (opts.icon ? iconSize + 18 : 0);
    const title = this.scene.add.text(textX, 0, opts.title, {
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      fontStyle: 'bold',
      color: opts.titleColor ?? TEXT_COLORS.primary,
    });
    const sub = opts.sub
      ? this.scene.add.text(textX, 0, opts.sub, {
          fontFamily: FONT_FAMILY,
          fontSize: `${Math.round(size * 0.75)}px`,
          color: opts.subColor ?? TEXT_COLORS.secondary,
          wordWrap: { width: this.innerWidth - iconSize - 18 - 160 },
        })
      : null;
    const textHeight = title.height + (sub ? sub.height + 2 : 0);
    const height = Math.max(iconSize, textHeight);
    const top = (height - textHeight) / 2;

    if (opts.icon) {
      const icon = this.scene.add.image(this.left, 0, opts.icon).setOrigin(0).setScale(iconScale);
      this.placeAt(icon, (height - iconSize) / 2);
    }
    this.placeAt(title, top);
    if (sub) this.placeAt(sub, top + title.height + 2);
    if (opts.value !== undefined) {
      const value = this.scene.add
        .text(this.left + this.innerWidth, 0, opts.value, {
          fontFamily: FONT_FAMILY,
          fontSize: `${size}px`,
          fontStyle: 'bold',
          color: opts.valueColor ?? TEXT_COLORS.primary,
        })
        .setOrigin(1, 0);
      this.placeAt(value, (height - value.height) / 2);
    }
    this.cursor += height + (opts.gapAfter ?? 14);
  }

  /** A full-width button. */
  button(label: string, opts: ButtonOptions): void {
    const enabled = opts.enabled ?? true;
    const height = opts.height ?? 96;
    const rect = this.scene.add
      .rectangle(this.centerX, 0, this.innerWidth, height, enabled ? COLORS.panelRaised : COLORS.panel)
      .setOrigin(0.5, 0)
      .setRounded(24)
      .setStrokeStyle(3, enabled ? (opts.color ?? COLORS.accent) : COLORS.panelBorder);
    if (enabled) {
      rect.setInteractive({ useHandCursor: true });
      rect.on('pointerup', opts.onClick);
    }
    const text = this.scene.add
      .text(this.centerX, 0, label, {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        fontStyle: 'bold',
        color: enabled ? TEXT_COLORS.primary : TEXT_COLORS.muted,
        align: 'center',
        wordWrap: { width: this.innerWidth - 40 },
      })
      .setOrigin(0.5);
    this.placeAt(rect, 0);
    this.placeAt(text, height / 2);
    this.cursor += height + 16;
  }

  /** A thin divider line. */
  divider(gapAfter = 20): void {
    const line = this.scene.add.rectangle(this.left, 0, this.innerWidth, 2, COLORS.panelBorder).setOrigin(0);
    this.placeAt(line, 4);
    this.cursor += 6 + gapAfter;
  }

  gap(height: number): void {
    this.cursor += height;
  }

  /** Draws the panel background and moves everything into place, centred in the area. */
  finish(): Phaser.GameObjects.Container {
    const { area } = this.options;
    const panelHeight = PADDING + this.cursor + PADDING - 16;
    const panelY = area.y + Math.max(MARGIN / 2, (area.height - panelHeight) / 2);
    const background = this.scene.add
      .rectangle(this.panelX, panelY, this.panelWidth, panelHeight, COLORS.panel)
      .setOrigin(0)
      .setRounded(28)
      .setStrokeStyle(3, COLORS.panelBorder)
      .setInteractive(); // Swallows taps so they don't reach the backdrop.
    this.container.add(background);
    for (const { obj, y } of this.placed) {
      obj.y += panelY + PADDING + y;
      this.container.add(obj);
    }
    return this.container;
  }

  private place(obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, height: number): void {
    this.placeAt(obj, 0);
    this.cursor += height;
  }

  private placeAt(obj: Phaser.GameObjects.Components.Transform & Phaser.GameObjects.GameObject, offset: number): void {
    obj.y = 0;
    this.placed.push({ obj, y: this.cursor + offset });
  }
}

/** Hex colour number to a CSS colour string. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
