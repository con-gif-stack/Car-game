import Phaser from 'phaser';
import { buildBarFill, buildFrame, buildGlow, buildRule, type FrameKind } from '../art/uiArt';
import { buildUiIcon, HUD_ICON_COLORS, type HudIcon, type UiIcon } from '../art/uiIcons';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import { textStyle } from './textStyles';
import { ensureGridTexture } from './textures';

/*
 * Pixel-art interface widgets: frames, buttons, bars and icons, drawn from the generated art in
 * src/art/uiArt.ts at UI_PIXEL screen units per pixel. Sizes snap to whole pixels.
 */

const PX = UI_PIXEL;

/** Rounds a size in screen units to whole UI pixels (at least `min` pixels). */
export const toPx = (units: number, min = 7) => Math.max(min, Math.round(units / PX));

/** Texture key for a frame of the given pixel size (created on first use). */
export function frameKey(scene: Phaser.Scene, kind: FrameKind, wPx: number, hPx: number, color: number): string {
  const key = `ui/frame/${kind}/${wPx}x${hPx}/${color.toString(16)}`;
  ensureGridTexture(scene, key, () => buildFrame(wPx, hPx, kind, color));
  return key;
}

export interface FrameOptions {
  kind?: FrameKind;
  /** Edge colour for panels/cards, fill colour for plates and buttons. */
  color?: number;
  originX?: number;
  originY?: number;
}

/** A framed rectangle (top-left at x, y unless an origin is given). */
export function addFrame(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  opts: FrameOptions = {},
): Phaser.GameObjects.Image {
  const kind = opts.kind ?? 'panel';
  const color = opts.color ?? COLORS.panelBorder;
  const key = frameKey(scene, kind, toPx(width), toPx(height), color);
  return scene.add
    .image(x, y, key)
    .setOrigin(opts.originX ?? 0, opts.originY ?? 0)
    .setScale(PX);
}

/** Swaps a frame image to a new look, keeping its size. */
export function restyleFrame(image: Phaser.GameObjects.Image, kind: FrameKind, color: number): void {
  const wPx = Math.round(image.width);
  const hPx = Math.round(image.height);
  image.setTexture(frameKey(image.scene, kind, wPx, hPx, color));
}

/** A dithered divider line. */
export function addRule(scene: Phaser.Scene, x: number, y: number, width: number, color: number = COLORS.panelBorder): Phaser.GameObjects.Image {
  const wPx = toPx(width, 4);
  const key = `ui/rule/${wPx}/${color.toString(16)}`;
  ensureGridTexture(scene, key, () => buildRule(wPx, color));
  return scene.add.image(x, y, key).setOrigin(0).setScale(PX);
}

/** Texture key for an interface icon. HUD icons default to their own colour. */
export function uiIconKey(scene: Phaser.Scene, icon: UiIcon, color?: number): string {
  const c = color ?? HUD_ICON_COLORS[icon as HudIcon] ?? COLORS.textSecondary;
  const key = `ui/icon/${icon}/${c.toString(16)}`;
  ensureGridTexture(scene, key, () => buildUiIcon(icon, c));
  return key;
}

/** Texture key for a dithered glow (use with additive blending). */
export function glowKey(scene: Phaser.Scene, radius: number, color: number): string {
  const key = `ui/glow/${radius}/${color.toString(16)}`;
  ensureGridTexture(scene, key, () => buildGlow(radius, color));
  return key;
}

export type ButtonTone = 'primary' | 'secondary' | 'accent' | 'neutral' | 'gold';

const TONE_COLORS: Record<ButtonTone, number> = {
  primary: COLORS.accentWarm,
  secondary: COLORS.accentAlt,
  accent: COLORS.accent,
  neutral: 0x4a4372,
  gold: COLORS.money,
};

const TONE_TEXT: Record<ButtonTone, string> = {
  primary: TEXT_COLORS.dark,
  secondary: TEXT_COLORS.dark,
  accent: TEXT_COLORS.primary,
  neutral: TEXT_COLORS.primary,
  gold: TEXT_COLORS.dark,
};

export interface ButtonOptions {
  onClick: () => void;
  tone?: ButtonTone;
  enabled?: boolean;
  fontSize?: number;
  /** Icon texture key shown left of the label. */
  icon?: string;
}

/**
 * A pixel-art button centred on (x, y). It presses down while touched and fires `onClick` when
 * released over it. Disabled buttons are grey and ignore taps.
 */
export class PixelButton extends Phaser.GameObjects.Container {
  readonly background: Phaser.GameObjects.Image;
  readonly label: Phaser.GameObjects.Text;
  private readonly icon: Phaser.GameObjects.Image | null;
  private readonly wPx: number;
  private readonly hPx: number;
  private tone: ButtonTone;
  private enabled: boolean;
  private pressed = false;
  private pulseTween: Phaser.Tweens.Tween | null = null;

  constructor(scene: Phaser.Scene, x: number, y: number, width: number, height: number, text: string, private opts: ButtonOptions) {
    super(scene, x, y);
    this.tone = opts.tone ?? 'primary';
    this.enabled = opts.enabled ?? true;
    this.wPx = toPx(width);
    this.hPx = toPx(height);
    this.background = scene.add.image(0, 0, '__DEFAULT').setScale(PX).setOrigin(0.5);
    this.label = scene.add
      .text(0, -PX, text, {
        ...textStyle(opts.fontSize ?? 34, TEXT_COLORS.primary, true),
        align: 'center',
        wordWrap: { width: this.wPx * PX - 48 },
      })
      .setOrigin(0.5);
    this.icon = opts.icon ? scene.add.image(0, -PX, opts.icon).setScale(PX * 0.75) : null;
    this.add(this.icon ? [this.background, this.icon, this.label] : [this.background, this.label]);
    this.setSize(this.wPx * PX, this.hPx * PX);

    this.background.setInteractive({ useHandCursor: true });
    this.background.on('pointerdown', () => {
      if (!this.enabled) return;
      this.pressed = true;
      this.redraw();
    });
    this.background.on('pointerout', () => {
      if (!this.pressed) return;
      this.pressed = false;
      this.redraw();
    });
    this.background.on('pointerup', () => {
      const wasPressed = this.pressed;
      this.pressed = false;
      this.redraw();
      if (this.enabled && wasPressed) this.opts.onClick();
    });
    this.redraw();
    scene.add.existing(this);
  }

  setEnabled(enabled: boolean): this {
    if (this.enabled === enabled) return this;
    this.enabled = enabled;
    this.pressed = false;
    if (this.background.input) this.background.input.cursor = enabled ? 'pointer' : 'default';
    if (!enabled) this.pulse(false);
    this.redraw();
    return this;
  }

  setTone(tone: ButtonTone): this {
    if (this.tone === tone) return this;
    this.tone = tone;
    this.redraw();
    return this;
  }

  setLabel(text: string): this {
    if (this.label.text !== text) {
      this.label.setText(text);
      this.layoutIcon();
    }
    return this;
  }

  /** A gentle breathing scale, to draw the eye (e.g. Start run). */
  pulse(on: boolean): this {
    if (on && !this.pulseTween) {
      this.pulseTween = this.scene.tweens.add({
        targets: this,
        scale: 1.035,
        duration: 650,
        yoyo: true,
        repeat: -1,
        ease: 'Sine.easeInOut',
      });
    } else if (!on && this.pulseTween) {
      this.pulseTween.remove();
      this.pulseTween = null;
      this.setScale(1);
    }
    return this;
  }

  private redraw(): void {
    const kind: FrameKind = !this.enabled ? 'buttonOff' : this.pressed ? 'buttonDown' : 'button';
    this.background.setTexture(frameKey(this.scene, kind, this.wPx, this.hPx, TONE_COLORS[this.tone]));
    // Pressed buttons sink: the label moves down with the face.
    const dy = this.pressed ? PX : -PX;
    this.label.y = dy;
    this.label.setColor(this.enabled ? TONE_TEXT[this.tone] : TEXT_COLORS.muted);
    if (this.icon) {
      this.icon.y = dy;
      this.icon.setAlpha(this.enabled ? 1 : 0.5);
    }
    this.layoutIcon();
  }

  private layoutIcon(): void {
    if (!this.icon) return;
    const gap = 14;
    const total = this.icon.displayWidth + gap + this.label.width;
    this.icon.x = -total / 2 + this.icon.displayWidth / 2;
    this.label.x = this.icon.x + this.icon.displayWidth / 2 + gap + this.label.width / 2;
  }
}

/** Adds a PixelButton centred on (x, y). */
export function addButton(
  scene: Phaser.Scene,
  x: number,
  y: number,
  width: number,
  height: number,
  text: string,
  opts: ButtonOptions,
): PixelButton {
  return new PixelButton(scene, x, y, width, height, text, opts);
}

export interface BarOptions {
  /** Pixels per segment (0 = smooth). */
  segment?: number;
  /** Below this fraction the bar flashes. */
  lowAt?: number;
}

/** A recessed bar with a pixel fill. Its left edge is at x, vertically centred on y. */
export class PixelBar {
  readonly track: Phaser.GameObjects.Image;
  readonly fill: Phaser.GameObjects.Image;
  private readonly innerWPx: number;
  private readonly innerHPx: number;
  private color: number;
  private ratio = -1;
  private flashTween: Phaser.Tweens.Tween | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    private readonly opts: BarOptions = {},
  ) {
    const wPx = toPx(width, 8);
    const hPx = toPx(height, 6);
    this.innerWPx = wPx - 4;
    this.innerHPx = hPx - 4;
    this.color = color;
    this.track = scene.add.image(x, y, frameKey(scene, 'inset', wPx, hPx, color)).setOrigin(0, 0.5).setScale(PX);
    this.fill = scene.add
      .image(x + 2 * PX, y, this.fillKey())
      .setOrigin(0, 0.5)
      .setScale(PX);
    this.set(0);
  }

  get objects(): Phaser.GameObjects.Image[] {
    return [this.track, this.fill];
  }

  setColor(color: number): void {
    if (color === this.color) return;
    this.color = color;
    this.fill.setTexture(this.fillKey());
    const r = this.ratio;
    this.ratio = -1;
    this.set(r);
  }

  set(ratio: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    const px = Math.round(this.innerWPx * r);
    if (px === Math.round(this.innerWPx * this.ratio)) return;
    this.ratio = r;
    this.fill.setVisible(px > 0);
    this.fill.setCrop(0, 0, px, this.innerHPx);
    const low = this.opts.lowAt !== undefined && r > 0 && r < this.opts.lowAt;
    if (low && !this.flashTween) {
      this.flashTween = this.scene.tweens.add({ targets: this.fill, alpha: 0.35, duration: 260, yoyo: true, repeat: -1 });
    } else if (!low && this.flashTween) {
      this.flashTween.remove();
      this.flashTween = null;
      this.fill.setAlpha(1);
    }
  }

  setVisible(visible: boolean): void {
    this.track.setVisible(visible);
    this.fill.setVisible(visible && this.ratio > 0);
  }

  private fillKey(): string {
    const segment = this.opts.segment ?? 0;
    const key = `ui/barfill/${this.innerWPx}x${this.innerHPx}/${this.color.toString(16)}/${segment}`;
    ensureGridTexture(this.scene, key, () => buildBarFill(this.innerWPx, this.innerHPx, this.color, segment));
    return key;
  }
}

/** A notification dot: a small pixel gem. */
export function addDot(scene: Phaser.Scene, x: number, y: number, color: number = COLORS.accent): Phaser.GameObjects.Image {
  const key = `ui/dot/${color.toString(16)}`;
  ensureGridTexture(scene, key, () => buildFrame(7, 7, 'plate', color));
  return scene.add.image(x, y, key).setScale(PX);
}
