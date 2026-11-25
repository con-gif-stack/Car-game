import Phaser from 'phaser';
import {
  buildClouds,
  buildMountains,
  buildRoad,
  buildSky,
  buildTreeline,
  LANE_PERIOD,
} from '../art/landscape';
import { RUSTBUCKET_LAYOUT } from '../art/carArt';
import { CarView } from './CarView';
import { ensureGridTexture } from './textures';

/** Screen units scrolled per second for each km/h of speed (visual only). */
const SCROLL_PER_KMH = 6.5;
/** Fastest the road may visibly scroll, so fast cars stay readable. */
const MAX_SCROLL_SPEED = 1400;
/** Clouds drift slowly even when the car is parked. */
const CLOUD_DRIFT = 6;

interface ScrollLayer {
  images: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  /** 1 = moves with the road, smaller = further away. */
  parallax: number;
  /** Width of one copy of the layer, in screen units. */
  span: number;
}

/**
 * The car idle-driving along a scrolling road, with layered scenery behind it.
 * Draws into the area (0, 0)–(width, height) of its scene.
 */
export class DriveView {
  readonly car: CarView;
  readonly groundY: number;
  readonly scale: number;
  private readonly layers: ScrollLayer[] = [];
  private scroll = 0;
  private cloudScroll = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
  ) {
    // One pixel-art pixel = `scale` screen units, shared by the car and the scenery.
    const fit = Math.min((width - 200) / CarView.widthAt(1), (height * 0.55) / CarView.heightAt(1));
    this.scale = Phaser.Math.Clamp(Math.floor(fit), 4, 9);
    const s = this.scale;

    const pxWidth = Math.ceil(width / s / LANE_PERIOD) * LANE_PERIOD;
    const pxHeight = Math.ceil(height / s);
    const groundPx = pxHeight - 4;
    const roadTopPx = groundPx - 9;
    this.groundY = groundPx * s;

    const key = (name: string) => `scenery/${name}/${pxWidth}x${pxHeight}`;
    ensureGridTexture(scene, key('sky'), () => buildSky(pxWidth, roadTopPx, Math.round(roadTopPx * 0.55)));
    ensureGridTexture(scene, key('clouds'), () => buildClouds(pxWidth, Math.round(pxHeight * 0.45), 7));
    const mountainTop = Math.round(roadTopPx * 0.12);
    ensureGridTexture(scene, key('mountains'), () => buildMountains(pxWidth, roadTopPx - mountainTop, 11));
    const treeHeight = Math.round(roadTopPx * 0.3);
    ensureGridTexture(scene, key('trees'), () => buildTreeline(pxWidth, treeHeight, 23));
    ensureGridTexture(scene, key('road'), () => buildRoad(pxWidth, pxHeight - roadTopPx, 4, 5));

    scene.add.image(0, 0, key('sky')).setOrigin(0).setScale(s);
    this.addLayer(key('clouds'), 0, pxWidth, 0.04);
    this.addLayer(key('mountains'), mountainTop * s, pxWidth, 0.1);
    this.addLayer(key('trees'), (roadTopPx - treeHeight) * s, pxWidth, 0.35);
    this.addLayer(key('road'), roadTopPx * s, pxWidth, 1);

    this.car = new CarView(scene, Math.round(width * 0.47), this.groundY, s);
  }

  /** Advances the scenery and wheels for a car moving at `speedKmh`. */
  update(dtSeconds: number, speedKmh: number): void {
    const speed = Math.min(MAX_SCROLL_SPEED, speedKmh * SCROLL_PER_KMH);
    const distance = speed * dtSeconds;
    this.scroll += distance;
    this.cloudScroll += CLOUD_DRIFT * dtSeconds;

    for (const layer of this.layers) {
      const extra = layer.parallax < 0.05 ? this.cloudScroll : 0;
      const offset = (this.scroll * layer.parallax + extra) % layer.span;
      layer.images[0].x = -offset;
      layer.images[1].x = -offset + layer.span;
    }

    const wheelRadius = (RUSTBUCKET_LAYOUT.wheelSize / 2 - 1.5) * this.scale;
    for (const wheel of this.car.wheels) wheel.rotation += distance / wheelRadius;
  }

  private addLayer(textureKey: string, y: number, pxWidth: number, parallax: number): void {
    const s = this.scale;
    const span = pxWidth * s;
    const make = (x: number) => this.scene.add.image(x, y, textureKey).setOrigin(0).setScale(s);
    this.layers.push({ images: [make(0), make(span)], parallax, span });
  }
}
