import Phaser from 'phaser';
import { buildDial, buildNeedle, DIAL_START, DIAL_SWEEP } from '../art/uiArt';
import { BIOMES } from '../data/biomes';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import { overlayStyle, textStyle } from './textStyles';
import { ensureGridTexture } from './textures';
import { addDot, addFrame, PixelBar, uiIconKey } from './ui';

/*
 * Drive tab instruments: the speedometer, the route strip across the top of the road, the
 * odometer and the fuel cans. Each is a small Phaser widget used by DriveScene.
 */

const PX = UI_PIXEL;

/** A round pixel speedometer with a swinging needle and a digital readout. */
export class Speedometer {
  private readonly needle: Phaser.GameObjects.Image;
  private readonly readout: Phaser.GameObjects.Text;
  private shown = 0;
  private target = 0;
  maxKmh = 100;

  /** (x, y) is the dial's centre. */
  constructor(scene: Phaser.Scene, x: number, y: number, sizePx: number, depth: number) {
    ensureGridTexture(scene, `ui/dial/${sizePx}`, () => buildDial(sizePx));
    ensureGridTexture(scene, `ui/needle/${sizePx}`, () => buildNeedle(Math.round(sizePx * 0.4)));
    scene.add.image(x, y, `ui/dial/${sizePx}`).setScale(PX).setDepth(depth);
    this.needle = scene.add
      .image(x, y, `ui/needle/${sizePx}`)
      .setOrigin(1.5 / Math.round(sizePx * 0.4), 0.5)
      .setScale(PX)
      .setDepth(depth + 0.01);
    this.readout = scene.add
      .text(x, y + sizePx * PX * 0.3, '0', overlayStyle(34, TEXT_COLORS.primary, true))
      .setOrigin(0.5)
      .setDepth(depth + 0.02);
    scene.add
      .text(x, y + sizePx * PX * 0.3 + 32, 'km/h', textStyle(18, TEXT_COLORS.secondary))
      .setOrigin(0.5)
      .setDepth(depth + 0.02);
    this.draw();
  }

  set(speedKmh: number): void {
    this.target = speedKmh;
  }

  /** Eases the needle towards the current speed, with a little jitter while moving. */
  update(dt: number): void {
    this.shown += (this.target - this.shown) * Math.min(1, dt * 6);
    this.draw();
  }

  private draw(): void {
    const jitter = this.shown > 1 ? (Math.random() - 0.5) * 0.015 : 0;
    const t = Phaser.Math.Clamp(this.shown / this.maxKmh, 0, 1);
    this.needle.setRotation(DIAL_START + DIAL_SWEEP * t + jitter);
    const label = `${Math.round(this.shown)}`;
    if (this.readout.text !== label) this.readout.setText(label);
  }
}

/** A round number above a top speed, for the speedometer's scale. */
export function dialMax(topSpeedKmh: number): number {
  return Math.max(60, Math.ceil((topSpeedKmh * 1.15) / 20) * 20);
}

/**
 * The road as a strip of biome-coloured segments (equal widths, since later biomes are much
 * longer), with markers for the car and the best run so far.
 */
export class RouteStrip {
  private readonly car: Phaser.GameObjects.Image;
  private readonly best: Phaser.GameObjects.Image;
  private readonly segments: Phaser.GameObjects.Rectangle[] = [];
  private readonly left: number;
  private readonly segWidth: number;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    width: number,
    depth: number,
  ) {
    const height = 36;
    addFrame(scene, x, y, width, height, { kind: 'inset', color: COLORS.panelBorder }).setDepth(depth);
    this.left = x + 3 * PX;
    const inner = width - 6 * PX;
    this.segWidth = inner / BIOMES.length;
    BIOMES.forEach((biome, i) => {
      const color = biome.palette.sky[6] ?? COLORS.panelBorder;
      const seg = scene.add
        .rectangle(this.left + i * this.segWidth, y + 3 * PX, this.segWidth - (i < BIOMES.length - 1 ? PX : 0), height - 6 * PX, color)
        .setOrigin(0)
        .setDepth(depth + 0.01);
      // A darker lower half gives the strip some shading.
      scene.add
        .rectangle(seg.x, seg.y + seg.height / 2, seg.width, seg.height / 2, 0x000000, 0.25)
        .setOrigin(0)
        .setDepth(depth + 0.02);
      this.segments.push(seg);
    });
    this.best = scene.add.image(this.left, y - 2, uiIconKey(scene, 'flag')).setOrigin(0.15, 1).setScale(PX * 0.6).setDepth(depth + 0.03);
    this.car = addDot(scene, this.left, y + height / 2, COLORS.accentWarm).setScale(PX * 1.3).setDepth(depth + 0.04);
  }

  /** Screen x for a distance along the road. */
  xFor(km: number): number {
    let index = BIOMES.length - 1;
    for (let i = 0; i < BIOMES.length; i++) {
      const b = BIOMES[i];
      if (b && km < b.endKm) {
        index = i;
        break;
      }
    }
    const biome = BIOMES[index];
    if (!biome) return this.left;
    const length = Number.isFinite(biome.endKm) ? biome.endKm - biome.startKm : biome.startKm;
    const frac = Phaser.Math.Clamp((km - biome.startKm) / length, 0, 1);
    return this.left + (index + frac) * this.segWidth;
  }

  update(carKm: number, bestKm: number, reachedKm: number): void {
    this.car.x = this.xFor(carKm);
    this.best.setVisible(bestKm > 0);
    this.best.x = this.xFor(bestKm);
    BIOMES.forEach((biome, i) => this.segments[i]?.setAlpha(reachedKm >= biome.startKm ? 1 : 0.35));
  }
}

/** Distance in framed digit boxes, like a car's odometer. The last digit rolls in. */
export class Odometer {
  private readonly digits: Phaser.GameObjects.Text[] = [];
  private readonly boxes: Phaser.GameObjects.Image[] = [];
  private readonly baseY: number;
  private value = '';
  readonly objects: Phaser.GameObjects.GameObject[] = [];

  /** Five digits: 000.00. (x, y) is the top left. */
  constructor(
    private readonly scene: Phaser.Scene,
    x: number,
    y: number,
  ) {
    const boxW = 56;
    const boxH = 80;
    this.baseY = y + boxH / 2 - 2;
    let cx = x;
    for (let i = 0; i < 5; i++) {
      if (i === 3) {
        const dot = scene.add.rectangle(cx + 6, y + boxH - 14, 10, 10, 0xf1eefb).setOrigin(0);
        this.objects.push(dot);
        cx += 22;
      }
      const decimal = i >= 3;
      const box = addFrame(scene, cx, y, boxW, boxH, { kind: 'inset', color: decimal ? COLORS.accentWarm : COLORS.panelBorder });
      const digit = scene.add
        .text(cx + boxW / 2, this.baseY, '0', textStyle(50, decimal ? TEXT_COLORS.warm : TEXT_COLORS.primary))
        .setOrigin(0.5);
      this.boxes.push(box);
      this.digits.push(digit);
      this.objects.push(box, digit);
      cx += boxW + 6;
    }
    const unit = scene.add.text(cx + 6, y + boxH - 6, 'km', textStyle(30, TEXT_COLORS.secondary)).setOrigin(0, 1);
    this.objects.push(unit);
  }

  set(km: number): void {
    // Rounded down, like the distance shown everywhere else.
    const text = (Math.floor(Math.min(999.99, Math.max(0, km)) * 100) / 100).toFixed(2).padStart(6, '0').replace('.', '');
    if (text === this.value) return;
    const previous = this.value;
    this.value = text;
    this.digits.forEach((digit, i) => {
      const ch = text[i] ?? '0';
      // Leading zeros are dim, like an unlit drum.
      const leading = i < 2 && text.slice(0, i + 1).split('').every((c) => c === '0');
      digit.setAlpha(leading ? 0.35 : 1);
      if (digit.text === ch) return;
      digit.setText(ch);
      if (previous && i === text.length - 1) {
        this.scene.tweens.killTweensOf(digit);
        digit.y = this.baseY - 18;
        this.scene.tweens.add({ targets: digit, y: this.baseY, duration: 90, ease: 'Quad.easeOut' });
      }
    });
  }
}

/** The stored fuel tanks as jerry cans, with the refilling one showing its progress. */
export class FuelCans {
  private readonly cans: Phaser.GameObjects.Image[] = [];
  private readonly refill: PixelBar;
  readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly spacing = 92;

  constructor(
    scene: Phaser.Scene,
    private readonly x: number,
    private readonly y: number,
    count: number,
  ) {
    for (let i = 0; i < count; i++) {
      const can = scene.add.image(x + i * this.spacing, y, uiIconKey(scene, 'fuel')).setOrigin(0, 0.5).setScale(PX * 1.25);
      this.cans.push(can);
      this.objects.push(can);
    }
    this.refill = new PixelBar(scene, x, y + 52, 72, 16, COLORS.accentWarm);
    this.objects.push(...this.refill.objects);
  }

  /** `tanks` full; `progress` (0–1) towards the next one. */
  set(tanks: number, progress: number): void {
    this.cans.forEach((can, i) => {
      const full = i < tanks;
      can.setAlpha(full ? 1 : 0.25);
      can.setTint(full ? 0xffffff : 0x8a84b4);
    });
    const refilling = tanks < this.cans.length;
    this.refill.setVisible(refilling);
    if (refilling) {
      this.refill.track.x = this.x + tanks * this.spacing;
      this.refill.fill.x = this.refill.track.x + 2 * PX;
      this.refill.set(progress);
    }
  }

  /** Right edge, for placing text after the cans. */
  get right(): number {
    return this.x + this.cans.length * this.spacing;
  }

  get centerY(): number {
    return this.y;
  }
}
