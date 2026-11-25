import Phaser from 'phaser';
import { buildRustbucketBody, buildWornWheel, RUSTBUCKET_LAYOUT } from '../art/carArt';
import { ensureGridTexture } from './textures';

const BODY_KEY = 'car/rustbucket/body';
const WHEEL_KEY = 'car/wheel/worn';

/**
 * The player's car in side view, built from a body sprite and separate wheel sprites.
 * The container's origin is the point on the ground midway along the car.
 */
export class CarView extends Phaser.GameObjects.Container {
  readonly bodySprite: Phaser.GameObjects.Image;
  readonly wheels: Phaser.GameObjects.Image[];

  constructor(scene: Phaser.Scene, x: number, y: number, pixelScale: number) {
    super(scene, x, y);
    ensureGridTexture(scene, BODY_KEY, buildRustbucketBody);
    ensureGridTexture(scene, WHEEL_KEY, buildWornWheel);

    const L = RUSTBUCKET_LAYOUT;
    const s = pixelScale;
    // Body-grid coordinates, shifted so the container origin is ground level, centred.
    const toX = (px: number) => (px - L.bodyWidth / 2) * s;
    const toY = (py: number) => (py - L.groundY) * s;

    const shadow = scene.add.ellipse(0, 0, L.bodyWidth * s * 0.95, 3 * s, 0x000000, 0.45);
    this.bodySprite = scene.add.image(toX(0), toY(0), BODY_KEY).setOrigin(0).setScale(s);
    this.wheels = L.wheelCenters.map((c) => scene.add.image(toX(c.x), toY(c.y), WHEEL_KEY).setScale(s));

    this.add([shadow, this.bodySprite, ...this.wheels]);
    scene.add.existing(this);
  }

  /** Width of the car on screen. */
  static widthAt(pixelScale: number): number {
    return RUSTBUCKET_LAYOUT.bodyWidth * pixelScale;
  }

  /** Height from the ground to the roof (with outline) on screen. */
  static heightAt(pixelScale: number): number {
    return (RUSTBUCKET_LAYOUT.groundY + 1) * pixelScale;
  }

  /** A tired engine idling: the body shudders by one pixel. */
  startIdleShudder(pixelScale: number): void {
    this.scene.tweens.add({
      targets: this.bodySprite,
      y: this.bodySprite.y + pixelScale,
      duration: 90,
      yoyo: true,
      repeat: -1,
      repeatDelay: 900,
      ease: 'Stepped',
    });
  }
}
