import Phaser from 'phaser';
import { RUSTBUCKET_LAYOUT } from '../art/carArt';
import { buildClouds, buildFeature, buildMountains, buildRoad, buildSky, LANE_PERIOD } from '../art/landscape';
import type { CarState } from '../core/vehicle';
import { BIOMES_BY_ID, type BiomeId } from '../data/biomes';
import { CarView } from './CarView';
import { ensureGridTexture } from './textures';

/** Screen units scrolled per second for each km/h of speed (visual only). */
const SCROLL_PER_KMH = 6.5;
/** Fastest the road may visibly scroll, so fast cars stay readable. */
const MAX_SCROLL_SPEED = 1400;
/** Clouds drift slowly even when the car is parked. */
const CLOUD_DRIFT = 6;
/** Milliseconds for the scenery to fade from one biome to the next. */
const BIOME_FADE_MS = 700;

/** Draw order: scenery behind, then road, then car, then anything the scene adds on top. */
export const DRIVE_DEPTH = { scenery: 0, road: 1, car: 2, overlay: 5 } as const;

interface ScrollLayer {
  images: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  /** 1 = moves with the road, smaller = further away. */
  parallax: number;
  /** Width of one copy of the layer, in screen units. */
  span: number;
  drifts: boolean;
}

interface Scenery {
  container: Phaser.GameObjects.Container;
  layers: ScrollLayer[];
}

/**
 * The car driving along a scrolling road, with layered biome scenery behind it.
 * Draws into the area (0, 0)–(width, height) of its scene.
 */
export class DriveView {
  readonly car: CarView;
  readonly groundY: number;
  readonly scale: number;
  private readonly sceneries = new Map<BiomeId, Scenery>();
  private readonly road: ScrollLayer;
  private readonly pxWidth: number;
  private readonly pxHeight: number;
  private readonly roadTopPx: number;
  private biome: BiomeId;
  private scroll = 0;
  private cloudScroll = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    width: number,
    height: number,
    car: CarState,
    biome: BiomeId = 'rustHighway',
  ) {
    // One pixel-art pixel = `scale` screen units, shared by the car and the scenery.
    const fit = Math.min((width - 200) / CarView.widthAt(1), (height * 0.55) / CarView.heightAt(1));
    this.scale = Phaser.Math.Clamp(Math.floor(fit), 4, 9);
    const s = this.scale;

    this.pxWidth = Math.ceil(width / s / LANE_PERIOD) * LANE_PERIOD;
    this.pxHeight = Math.ceil(height / s);
    const groundPx = this.pxHeight - 4;
    this.roadTopPx = groundPx - 9;
    this.groundY = groundPx * s;

    const roadKey = `scenery/road/${this.pxWidth}x${this.pxHeight}`;
    ensureGridTexture(scene, roadKey, () => buildRoad(this.pxWidth, this.pxHeight - this.roadTopPx, 4, 5));
    this.road = this.makeLayer(roadKey, this.roadTopPx * s, 1, false);
    for (const image of this.road.images) image.setDepth(DRIVE_DEPTH.road);

    this.biome = biome;
    this.sceneryFor(biome).container.setAlpha(1);

    this.car = new CarView(scene, Math.round(width * 0.47), this.groundY, s, car);
    this.car.setDepth(DRIVE_DEPTH.car);
  }

  get currentBiome(): BiomeId {
    return this.biome;
  }

  /** Switches the scenery to a biome, fading unless `instant`. */
  setBiome(biome: BiomeId, instant = false): void {
    if (biome === this.biome) return;
    const from = this.sceneryFor(this.biome).container;
    const to = this.sceneryFor(biome).container;
    this.biome = biome;
    this.scene.tweens.killTweensOf([from, to]);
    // The new scenery fades in over the old one, which then hides.
    to.setDepth(DRIVE_DEPTH.scenery + 0.1);
    from.setDepth(DRIVE_DEPTH.scenery);
    if (instant) {
      to.setAlpha(1);
      from.setAlpha(0);
      return;
    }
    to.setAlpha(0);
    this.scene.tweens.add({
      targets: to,
      alpha: 1,
      duration: BIOME_FADE_MS,
      onComplete: () => from.setAlpha(0),
    });
  }

  /** Puts the road back to its starting position (for a new run). */
  resetScroll(): void {
    this.scroll = 0;
  }

  /** Advances the scenery and wheels for a car moving at `speedKmh`. */
  update(dtSeconds: number, speedKmh: number): void {
    const speed = Math.min(MAX_SCROLL_SPEED, speedKmh * SCROLL_PER_KMH);
    const distance = speed * dtSeconds;
    this.scroll += distance;
    this.cloudScroll += CLOUD_DRIFT * dtSeconds;

    this.positionLayer(this.road);
    for (const scenery of this.sceneries.values()) {
      if (scenery.container.alpha <= 0) continue;
      for (const layer of scenery.layers) this.positionLayer(layer);
    }

    const wheelRadius = (RUSTBUCKET_LAYOUT.wheelSize / 2 - 1.5) * this.scale;
    for (const wheel of this.car.wheels) wheel.rotation += distance / wheelRadius;
  }

  private positionLayer(layer: ScrollLayer): void {
    const offset = (this.scroll * layer.parallax + (layer.drifts ? this.cloudScroll : 0)) % layer.span;
    layer.images[0].x = -offset;
    layer.images[1].x = -offset + layer.span;
  }

  /** The scenery for a biome, built (hidden) the first time it's needed. */
  private sceneryFor(biome: BiomeId): Scenery {
    const existing = this.sceneries.get(biome);
    if (existing) return existing;

    const def = BIOMES_BY_ID[biome];
    const s = this.scale;
    const w = this.pxWidth;
    const roadTop = this.roadTopPx;
    const key = (name: string) => `scenery/${biome}/${name}/${w}x${this.pxHeight}`;
    const mountainTop = Math.round(roadTop * 0.12);
    const featureHeight = Math.round(roadTop * 0.3);

    ensureGridTexture(this.scene, key('sky'), () => buildSky(w, roadTop, Math.round(roadTop * 0.55), def.palette));
    ensureGridTexture(this.scene, key('clouds'), () => buildClouds(w, Math.round(this.pxHeight * 0.45), 7, def.palette));
    ensureGridTexture(this.scene, key('mountains'), () => buildMountains(w, roadTop - mountainTop, 11, def.palette));
    ensureGridTexture(this.scene, key('feature'), () =>
      buildFeature(def.feature, w, featureHeight, 23, def.palette),
    );

    const sky = this.scene.add.image(0, 0, key('sky')).setOrigin(0).setScale(s);
    const layers = [
      this.makeLayer(key('clouds'), 0, 0.04, true),
      this.makeLayer(key('mountains'), mountainTop * s, 0.1, false),
      this.makeLayer(key('feature'), (roadTop - featureHeight) * s, 0.35, false),
    ];
    const container = this.scene.add
      .container(0, 0, [sky, ...layers.flatMap((l) => l.images)])
      .setDepth(DRIVE_DEPTH.scenery)
      .setAlpha(0);
    const scenery = { container, layers };
    this.sceneries.set(biome, scenery);
    for (const layer of layers) this.positionLayer(layer);
    return scenery;
  }

  private makeLayer(textureKey: string, y: number, parallax: number, drifts: boolean): ScrollLayer {
    const s = this.scale;
    const span = this.pxWidth * s;
    const make = (x: number) => this.scene.add.image(x, y, textureKey).setOrigin(0).setScale(s);
    return { images: [make(0), make(span)], parallax, span, drifts };
  }
}
