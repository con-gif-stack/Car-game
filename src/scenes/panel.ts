import Phaser from 'phaser';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import { textStyle } from './textStyles';
import { addButton, addFrame, addRule, type ButtonTone, type PixelButton } from './ui';

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
  /** Pop in when opened. Turn off when rebuilding a panel that is already showing. Default true. */
  animate?: boolean;
  /** Edge colour of the frame. */
  edgeColor?: number;
}

export interface PanelButtonOptions {
  onClick: () => void;
  /** Disabled buttons are grey and ignore taps. Default true. */
  enabled?: boolean;
  /** Colour scheme. Default 'primary' (warm orange). */
  tone?: ButtonTone;
  height?: number;
  /** Icon texture key shown before the label. */
  icon?: string;
}

const MARGIN = 52;
const PADDING = 48;
const ICON_SCALE = 4;
const HEADER_HEIGHT = 64;

type Placeable = Phaser.GameObjects.Components.Transform & Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject;

/**
 * Builds a centred pixel-framed panel over a dimmed backdrop, top to bottom: add lines, rows and
 * buttons, then call `finish()`. Destroy `container` to close it.
 */
export class Panel {
  readonly container: Phaser.GameObjects.Container;
  readonly innerWidth: number;
  private readonly body: Phaser.GameObjects.Container;
  private readonly backdrop: Phaser.GameObjects.Rectangle;
  private readonly left: number;
  private readonly centerX: number;
  private readonly panelX: number;
  private readonly panelWidth: number;
  /** Objects with their y offset from the top of the content, and the line they belong to. */
  private readonly placed: { obj: Placeable; y: number; group: number }[] = [];
  private cursor = 0;
  private group = 0;
  private revealTimers: Phaser.Time.TimerEvent[] = [];
  private headerTitle: { text: string; color: number } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly options: PanelOptions,
  ) {
    const { area } = options;
    this.panelWidth = Math.round((area.width - 2 * MARGIN) / UI_PIXEL) * UI_PIXEL;
    this.panelX = area.x + (area.width - this.panelWidth) / 2;
    this.innerWidth = this.panelWidth - 2 * PADDING;
    this.left = this.panelX + PADDING;
    this.centerX = area.x + area.width / 2;

    this.backdrop = scene.add
      .rectangle(area.x, area.y, area.width, area.height, 0x05030c, 0.72)
      .setOrigin(0)
      .setInteractive();
    if (options.onBackdrop) this.backdrop.on('pointerup', options.onBackdrop);
    this.body = scene.add.container(0, 0);
    this.container = scene.add.container(0, 0, [this.backdrop, this.body]).setDepth(1000);
  }

  /** A title plate sitting on the panel's top edge. */
  header(title: string, color: number = COLORS.accent): void {
    this.headerTitle = { text: title, color };
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
        ...textStyle(size, color, opts.bold),
        align,
        wordWrap: { width: this.innerWidth },
      })
      .setOrigin(align === 'center' ? 0.5 : 0, 0);
    this.group++;
    this.placeAt(t, 0);
    this.cursor += t.height + (opts.gapAfter ?? 12);
    return t;
  }

  /**
   * A row with an optional icon, a title (and optional line under it) on the left, and a value
   * on the right. Returns the value text, if any.
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
    /** Icon pixel scale (material icons are 12 pixels square, interface icons 16). */
    iconScale?: number;
    /** Draws the row on a card. */
    card?: boolean;
  }): Phaser.GameObjects.Text | null {
    this.group++;
    const size = opts.size ?? 30;
    const iconScale = opts.iconScale ?? ICON_SCALE;
    const iconPx = opts.icon ? (this.scene.textures.get(opts.icon).getSourceImage().width as number) : 0;
    const iconSize = iconPx * iconScale;
    const inset = opts.card ? 20 : 0;
    const textX = this.left + inset + (opts.icon ? iconSize + 18 : 0);
    const title = this.scene.add.text(textX, 0, opts.title, textStyle(size, opts.titleColor ?? TEXT_COLORS.primary, true));
    const sub = opts.sub
      ? this.scene.add.text(textX, 0, opts.sub, {
          ...textStyle(Math.round(size * 0.75), opts.subColor ?? TEXT_COLORS.secondary),
          wordWrap: { width: this.innerWidth - iconSize - 18 - 160 - 2 * inset },
        })
      : null;
    const textHeight = title.height + (sub ? sub.height + 2 : 0);
    const content = Math.max(iconSize, textHeight);
    const height = content + 2 * (opts.card ? 14 : 0);
    const top = (height - textHeight) / 2;

    if (opts.card) {
      const card = addFrame(this.scene, this.left, 0, this.innerWidth, height, { kind: 'card', color: COLORS.panelBorder });
      this.placeAt(card, 0);
    }
    if (opts.icon) {
      const icon = this.scene.add.image(this.left + inset, 0, opts.icon).setOrigin(0).setScale(iconScale);
      this.placeAt(icon, (height - iconSize) / 2);
    }
    this.placeAt(title, top);
    if (sub) this.placeAt(sub, top + title.height + 2);
    let valueText: Phaser.GameObjects.Text | null = null;
    if (opts.value !== undefined) {
      valueText = this.scene.add
        .text(this.left + this.innerWidth - inset, 0, opts.value, textStyle(size, opts.valueColor ?? TEXT_COLORS.primary, true))
        .setOrigin(1, 0);
      this.placeAt(valueText, (height - valueText.height) / 2);
    }
    this.cursor += height + (opts.gapAfter ?? 14);
    return valueText;
  }

  /** A full-width button. */
  button(label: string, opts: PanelButtonOptions): PixelButton {
    this.group++;
    const height = opts.height ?? 96;
    const button = addButton(this.scene, this.centerX, 0, this.innerWidth, height, label, {
      onClick: opts.onClick,
      enabled: opts.enabled,
      tone: opts.tone,
      icon: opts.icon,
      fontSize: height < 90 ? 30 : 34,
    });
    this.placeAt(button, height / 2);
    this.cursor += height + 16;
    return button;
  }

  /** A dithered divider line. */
  divider(gapAfter = 20): void {
    this.group++;
    this.placeAt(addRule(this.scene, this.left, 0, this.innerWidth), 6);
    this.cursor += 14 + gapAfter;
  }

  gap(height: number): void {
    this.cursor += height;
  }

  /** Draws the panel frame and moves everything into place, centred in the area. */
  finish(): Phaser.GameObjects.Container {
    const { area } = this.options;
    const headerSpace = this.headerTitle ? HEADER_HEIGHT / 2 + 8 : 0;
    const panelHeight = PADDING + headerSpace + this.cursor + PADDING - 16;
    const panelY = area.y + Math.max(MARGIN / 2 + headerSpace, (area.height - panelHeight) / 2);
    const background = addFrame(this.scene, this.panelX, panelY, this.panelWidth, panelHeight, {
      kind: 'panel',
      color: this.options.edgeColor ?? COLORS.panelBorder,
    }).setInteractive(); // Swallows taps so they don't reach the backdrop.
    this.body.add(background);

    if (this.headerTitle) {
      const title = this.scene.add.text(this.centerX, panelY, this.headerTitle.text, textStyle(30, TEXT_COLORS.primary, true)).setOrigin(0.5);
      const plateWidth = Math.min(this.panelWidth - 80, title.width + 96);
      const plate = addFrame(this.scene, this.centerX, panelY, plateWidth, HEADER_HEIGHT, {
        kind: 'plate',
        color: this.headerTitle.color,
        originX: 0.5,
        originY: 0.5,
      });
      title.setStroke('#07050f', 6);
      title.y -= 2;
      this.body.add([plate, title]);
    }

    const top = panelY + PADDING + headerSpace;
    for (const { obj, y } of this.placed) {
      obj.y += top + y;
      this.body.add(obj);
    }

    if (this.options.animate ?? true) {
      this.backdrop.setAlpha(0);
      this.scene.tweens.add({ targets: this.backdrop, alpha: 1, duration: 160 });
      this.body.setAlpha(0).setY(36);
      this.scene.tweens.add({ targets: this.body, alpha: 1, y: 0, duration: 240, ease: 'Back.easeOut' });
    }
    return this.container;
  }

  /**
   * Reveals the panel's lines one after another (call after `finish`). Lines before `fromGroup`
   * show at once. Returns the time (ms) when the last line appears.
   */
  reveal(staggerMs: number, fromGroup = 0, startDelayMs = 250): number {
    let last = 0;
    for (const { obj, group } of this.placed) {
      if (group < fromGroup) continue;
      const delay = startDelayMs + (group - fromGroup) * staggerMs;
      last = Math.max(last, delay);
      obj.setVisible(false);
      const targetX = obj.x;
      const timer = this.scene.time.delayedCall(delay, () => {
        if (!obj.active) return;
        obj.setVisible(true);
        obj.x = targetX - 40;
        this.scene.tweens.add({ targets: obj, x: targetX, duration: 220, ease: 'Cubic.easeOut' });
      });
      // Skipping shows the line at once, in place.
      (timer as Phaser.Time.TimerEvent & { reveal?: () => void }).reveal = () => {
        this.scene.tweens.killTweensOf(obj);
        obj.x = targetX;
        obj.setVisible(true);
      };
      this.revealTimers.push(timer);
    }
    return last;
  }

  /** Shows every line still waiting to be revealed. */
  skipReveal(): void {
    for (const timer of this.revealTimers) {
      timer.remove(false);
      (timer as Phaser.Time.TimerEvent & { reveal?: () => void }).reveal?.();
    }
    this.revealTimers = [];
  }

  /** Number of the most recently added line (for `reveal`). */
  get lineCount(): number {
    return this.group;
  }

  private placeAt(obj: Placeable, offset: number): void {
    obj.y = 0;
    this.placed.push({ obj, y: this.cursor + offset, group: this.group });
  }
}

/** Hex colour number to a CSS colour string. */
export function cssColor(color: number): string {
  return `#${color.toString(16).padStart(6, '0')}`;
}
