import Phaser from 'phaser';
import {
  buildBrake,
  buildRustbucketBody,
  buildWheel,
  lookForCar,
  RUSTBUCKET_LAYOUT,
  type CarLook,
} from '../art/carArt';
import type { CarState } from '../core/vehicle';
import { ensureGridTexture } from './textures';

/** Texture keys for a look; each variant is generated once and then reused. */
function textureKeys(look: CarLook) {
  const bodyKey = `car/rustbucket/body/r${look.rustPatches}-x${look.exhaustRank}-t${look.turbo ? 1 : 0}`;
  return {
    body: bodyKey,
    wheel: `car/wheel/${look.wheelRank}`,
    brake: `car/brake/${look.brakeRank}`,
  };
}

/**
 * The player's car in side view: body, brakes (fixed) and wheels (spinning), styled by the
 * installed parts. The container's origin is the point on the ground midway along the car.
 */
export class CarView extends Phaser.GameObjects.Container {
  readonly bodySprite: Phaser.GameObjects.Image;
  readonly wheels: Phaser.GameObjects.Image[];
  private readonly brakes: Phaser.GameObjects.Image[];
  private readonly baseBodyY: number;
  private look: CarLook | null = null;
  private shudder: Phaser.Tweens.Tween | null = null;

  constructor(
    scene: Phaser.Scene,
    x: number,
    y: number,
    private readonly pixelScale: number,
    car: CarState,
  ) {
    super(scene, x, y);
    const L = RUSTBUCKET_LAYOUT;
    const s = pixelScale;
    // Body-grid coordinates, shifted so the container origin is ground level, centred.
    const toX = (px: number) => (px - L.bodyWidth / 2) * s;
    const toY = (py: number) => (py - L.groundY) * s;
    this.baseBodyY = toY(0);

    const shadow = scene.add.ellipse(0, 0, L.bodyWidth * s * 0.95, 3 * s, 0x000000, 0.45);
    this.bodySprite = scene.add.image(toX(0), this.baseBodyY, '__DEFAULT').setOrigin(0).setScale(s);
    this.brakes = L.wheelCenters.map((c) => scene.add.image(toX(c.x), toY(c.y), '__DEFAULT').setScale(s));
    this.wheels = L.wheelCenters.map((c) => scene.add.image(toX(c.x), toY(c.y), '__DEFAULT').setScale(s));

    this.add([shadow, this.bodySprite, ...this.brakes, ...this.wheels]);
    scene.add.existing(this);
    this.setCar(car);
  }

  /** Width of the car on screen. */
  static widthAt(pixelScale: number): number {
    return RUSTBUCKET_LAYOUT.bodyWidth * pixelScale;
  }

  /** Height from the ground to the roof (with outline) on screen. */
  static heightAt(pixelScale: number): number {
    return (RUSTBUCKET_LAYOUT.groundY + 1) * pixelScale;
  }

  /** Restyles the car for its installed parts. Returns true if the look changed. */
  setCar(car: CarState): boolean {
    const look = lookForCar(car);
    if (this.look && JSON.stringify(this.look) === JSON.stringify(look)) return false;
    this.look = look;
    const keys = textureKeys(look);
    ensureGridTexture(this.scene, keys.body, () => buildRustbucketBody(look));
    ensureGridTexture(this.scene, keys.wheel, () => buildWheel(look.wheelRank));
    ensureGridTexture(this.scene, keys.brake, () => buildBrake(look.brakeRank));

    this.bodySprite.setTexture(keys.body);
    for (const wheel of this.wheels) wheel.setTexture(keys.wheel);
    for (const brake of this.brakes) brake.setTexture(keys.brake);
    // Lower suspension: the body sits closer to the wheels.
    this.bodySprite.y = this.baseBodyY + look.rideDrop * this.pixelScale;
    if (this.shudder) this.startIdleShudder();
    return true;
  }

  /** A tired engine idling: the body shudders by one pixel. */
  startIdleShudder(): void {
    this.shudder?.remove();
    this.bodySprite.y = this.baseBodyY + (this.look?.rideDrop ?? 0) * this.pixelScale;
    this.shudder = this.scene.tweens.add({
      targets: this.bodySprite,
      y: this.bodySprite.y + this.pixelScale,
      duration: 90,
      yoyo: true,
      repeat: -1,
      repeatDelay: 900,
      ease: 'Stepped',
    });
  }
}
