import Phaser from 'phaser';
import { RUSTBUCKET_LAYOUT } from '../art/carArt';
import {
  buildClouds,
  buildFeature,
  buildHaze,
  buildMountains,
  buildRoad,
  buildSky,
  buildSkyDisc,
  buildVerge,
  LANE_PERIOD,
  nearPalette,
} from '../art/landscape';
import { buildProp, PROP_VARIANTS } from '../art/props';
import { buildLightCone } from '../art/uiArt';
import { seededRandom } from '../core/random';
import type { CarState } from '../core/vehicle';
import { BIOMES_BY_ID, type BiomeId, type PropKind } from '../data/biomes';
import { CarView } from './CarView';
import { ensureGridTexture } from './textures';
import { glowKey } from './ui';

/** Screen units scrolled per second for each km/h of speed (visual only). */
const SCROLL_PER_KMH = 6.5;
/** Fastest the road may visibly scroll, so fast cars stay readable. */
const MAX_SCROLL_SPEED = 1400;
/** Clouds drift slowly even when the car is parked. */
const CLOUD_DRIFT = 6;
/** Milliseconds for the scenery to fade from one biome to the next. */
const BIOME_FADE_MS = 700;

/**
 * Draw order, back to front: scenery, roadside props, road, car lights, car, the ground in
 * front of the road, foreground props, then anything the scene adds on top.
 */
export const DRIVE_DEPTH = {
  scenery: 0,
  roadside: 0.5,
  road: 1,
  lights: 1.8,
  car: 2,
  verge: 3,
  foreground: 3.5,
  overlay: 5,
} as const;

export interface DriveViewOptions {
  /**
   * Pull the camera back: a smaller car and road, with a strip of ground and props passing in
   * front of them. The Drive tab uses this; the Garage showroom keeps the close-up.
   */
  pulledBack?: boolean;
}

interface ScrollLayer {
  images: [Phaser.GameObjects.Image, Phaser.GameObjects.Image];
  /** 1 = moves with the road, smaller = further away. */
  parallax: number;
  /** Width of one copy of the layer, in screen units. */
  span: number;
  drifts: boolean;
}

interface Scenery {
  /** Sky to the near silhouettes (behind the roadside props). */
  back: Phaser.GameObjects.Container;
  /** The road surface. */
  road: Phaser.GameObjects.Container;
  /** Ground in front of the road (pulled-back view only). */
  front: Phaser.GameObjects.Container | null;
  layers: ScrollLayer[];
}

interface PlacedProp {
  image: Phaser.GameObjects.Image;
  glows: Phaser.GameObjects.Image[];
}

/**
 * A lane of props that scroll past at one depth (roadside or foreground), spawned from a
 * seeded sequence so they never repeat in a visible pattern.
 */
class PropLane {
  private readonly props: PlacedProp[] = [];
  private readonly rand: () => number;
  /** Screen x where the next prop's left edge goes. */
  private cursor = 0;
  biome: BiomeId;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: {
      near: boolean;
      parallax: number;
      /** Pixel scale of the props. */
      scale: number;
      /** Screen y of the props' feet (lowest and highest). */
      baseY: [number, number];
      depth: number;
      /** Space between props, in screen units. */
      gap: [number, number];
      width: number;
      seed: number;
    },
    biome: BiomeId,
  ) {
    this.rand = seededRandom(opts.seed);
    this.biome = biome;
    this.refill();
  }

  /** Clears the lane and fills the screen with props of the current biome. */
  refill(): void {
    for (const prop of this.props) this.destroy(prop);
    this.props.length = 0;
    this.cursor = -this.opts.gap[1] * this.rand();
    this.fill();
  }

  scroll(distance: number, glowAlpha: number): void {
    const dx = distance * this.opts.parallax;
    this.cursor -= dx;
    for (let i = this.props.length - 1; i >= 0; i--) {
      const prop = this.props[i] as PlacedProp;
      prop.image.x -= dx;
      for (const glow of prop.glows) {
        glow.x -= dx;
        glow.setAlpha(glowAlpha);
      }
      if (prop.image.x + prop.image.displayWidth < -40) {
        this.destroy(prop);
        this.props.splice(i, 1);
      }
    }
    this.fill();
  }

  private fill(): void {
    while (this.cursor < this.opts.width + 40) this.spawn();
  }

  private spawn(): void {
    const { opts } = this;
    const def = BIOMES_BY_ID[this.biome];
    const kinds = opts.near ? def.props.foreground : def.props.roadside;
    const kind = kinds[Math.floor(this.rand() * kinds.length)] as PropKind;
    const variant = Math.floor(this.rand() * PROP_VARIANTS);
    const key = `prop/${this.biome}/${kind}/${variant}/${opts.near ? 'near' : 'far'}`;
    let glows: ReturnType<typeof buildProp>['glows'] = [];
    if (!this.scene.textures.exists(key)) {
      const art = buildProp(kind, variant, def.palette, opts.near);
      ensureGridTexture(this.scene, key, () => art.grid);
      this.scene.textures.get(key).customData = { glows: art.glows };
    }
    glows = (this.scene.textures.get(key).customData as { glows?: typeof glows }).glows ?? [];

    const s = opts.scale;
    const baseY = opts.baseY[0] + (opts.baseY[1] - opts.baseY[0]) * this.rand();
    const x = Math.round(this.cursor);
    const image = this.scene.add.image(x, baseY, key).setOrigin(0, 1).setScale(s).setDepth(opts.depth + baseY / 100000);
    const glowAlpha = 0.25 + 0.6 * def.palette.night;
    const glowImages = glows.map((g) =>
      this.scene.add
        .image(x + g.x * s, baseY - (image.height - g.y) * s, glowKey(this.scene, g.radius, g.color))
        .setScale(s)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(glowAlpha)
        .setDepth(opts.depth + 0.01),
    );
    this.props.push({ image, glows: glowImages });
    const gap = opts.gap[0] + (opts.gap[1] - opts.gap[0]) * this.rand();
    this.cursor = x + image.displayWidth + gap;
  }

  private destroy(prop: PlacedProp): void {
    prop.image.destroy();
    for (const glow of prop.glows) glow.destroy();
  }
}

/**
 * The car driving along a scrolling road, with layered biome scenery behind it and (when
 * pulled back) ground and props passing in front. Draws into the area (0, 0)–(width, height)
 * of its scene.
 */
export class DriveView {
  readonly car: CarView;
  readonly groundY: number;
  readonly scale: number;
  private readonly sceneries = new Map<BiomeId, Scenery>();
  private readonly pxWidth: number;
  private readonly pxHeight: number;
  private readonly roadTopPx: number;
  private readonly roadBottomPx: number;
  private readonly vergePx: number;
  private readonly lanes: PropLane[] = [];
  private readonly headlight: Phaser.GameObjects.Image;
  private readonly tailGlow: Phaser.GameObjects.Image;
  private biome: BiomeId;
  private scroll = 0;
  private cloudScroll = 0;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly width: number,
    height: number,
    car: CarState,
    biome: BiomeId = 'rustHighway',
    private readonly options: DriveViewOptions = {},
  ) {
    const pulledBack = options.pulledBack ?? false;
    // One pixel-art pixel = `scale` screen units, shared by the car and the scenery.
    const fit = Math.min((width - 200) / CarView.widthAt(1), (height * 0.55) / CarView.heightAt(1));
    this.scale = pulledBack ? Phaser.Math.Clamp(Math.floor(fit * 0.68), 4, 7) : Phaser.Math.Clamp(Math.floor(fit), 4, 9);
    const s = this.scale;

    this.pxWidth = Math.ceil(width / s / LANE_PERIOD) * LANE_PERIOD;
    this.pxHeight = Math.ceil(height / s);
    this.vergePx = pulledBack ? Math.round(this.pxHeight * 0.17) : 0;
    this.roadBottomPx = this.pxHeight - this.vergePx;
    const groundPx = this.roadBottomPx - 4;
    this.roadTopPx = groundPx - 9;
    this.groundY = groundPx * s;

    this.biome = biome;
    this.sceneryFor(biome);
    this.showScenery(biome, 1);

    this.car = new CarView(scene, Math.round(width * 0.47), this.groundY, s, car);
    this.car.setDepth(DRIVE_DEPTH.car);

    // Car lights: a headlight beam ahead and a red glow behind, stronger at night.
    const L = RUSTBUCKET_LAYOUT;
    const lightY = this.groundY + (15.5 - L.groundY) * s;
    ensureGridTexture(scene, 'car/headlight', () => buildLightCone(46, 9, 0xfff0c0));
    this.headlight = scene.add
      .image(this.car.x + (71.5 - L.bodyWidth / 2) * s, lightY, 'car/headlight')
      .setOrigin(0, 0.5)
      .setScale(s)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DRIVE_DEPTH.lights);
    this.tailGlow = scene.add
      .image(this.car.x + (2.5 - L.bodyWidth / 2) * s, lightY - 0.5 * s, glowKey(scene, 5, 0xff3a2a))
      .setScale(s)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setDepth(DRIVE_DEPTH.car + 0.1);
    this.updateLights();

    // The showroom close-up stays uncluttered: props only in the pulled-back road view.
    if (!pulledBack) return;

    // Props: behind the road on the far shoulder, and close in front of it.
    this.lanes.push(
      new PropLane(
        scene,
        {
          near: false,
          parallax: 0.72,
          scale: s,
          baseY: [(this.roadTopPx + 1) * s, (this.roadTopPx + 1) * s],
          depth: DRIVE_DEPTH.roadside,
          gap: [160, 620],
          width,
          seed: 17,
        },
        biome,
      ),
    );
    this.lanes.push(
      new PropLane(
        scene,
        {
          near: true,
          parallax: 1.75,
          scale: s + 2,
          baseY: [(this.roadBottomPx + this.vergePx * 0.55) * s, height + 2 * s],
          depth: DRIVE_DEPTH.foreground,
          gap: [420, 1300],
          width,
          seed: 29,
        },
        biome,
      ),
    );
  }

  get currentBiome(): BiomeId {
    return this.biome;
  }

  /** Switches the scenery to a biome, fading unless `instant`. New props come from the new biome. */
  setBiome(biome: BiomeId, instant = false): void {
    if (biome === this.biome) return;
    const from = this.sceneryFor(this.biome);
    const to = this.sceneryFor(biome);
    this.biome = biome;
    for (const lane of this.lanes) lane.biome = biome;
    const fromParts = this.parts(from);
    const toParts = this.parts(to);
    this.scene.tweens.killTweensOf([...fromParts, ...toParts]);
    // The new scenery fades in over the old one, which then hides.
    this.setDepths(to, 0.01);
    this.setDepths(from, 0);
    this.updateLights();
    if (instant) {
      this.showScenery(biome, 1);
      for (const part of fromParts) part.setAlpha(0);
      for (const lane of this.lanes) lane.refill();
      return;
    }
    for (const part of toParts) part.setAlpha(0);
    this.scene.tweens.add({
      targets: toParts,
      alpha: 1,
      duration: BIOME_FADE_MS,
      onComplete: () => {
        for (const part of fromParts) part.setAlpha(0);
      },
    });
  }

  /** Puts the road back to its starting position (for a new run). */
  resetScroll(): void {
    this.scroll = 0;
  }

  /** Advances the scenery, props and wheels for a car moving at `speedKmh`. */
  update(dtSeconds: number, speedKmh: number): void {
    const speed = Math.min(MAX_SCROLL_SPEED, speedKmh * SCROLL_PER_KMH);
    const distance = speed * dtSeconds;
    this.scroll += distance;
    this.cloudScroll += CLOUD_DRIFT * dtSeconds;

    for (const scenery of this.sceneries.values()) {
      if (scenery.back.alpha <= 0) continue;
      for (const layer of scenery.layers) this.positionLayer(layer);
    }
    const glowAlpha = 0.25 + 0.6 * BIOMES_BY_ID[this.biome].palette.night;
    for (const lane of this.lanes) lane.scroll(distance, glowAlpha);

    const wheelRadius = (RUSTBUCKET_LAYOUT.wheelSize / 2 - 1.5) * this.scale;
    for (const wheel of this.car.wheels) wheel.rotation += distance / wheelRadius;
  }

  private updateLights(): void {
    // A parked car in the showroom has its lights off.
    const night = this.options.pulledBack ? BIOMES_BY_ID[this.biome].palette.night : -1;
    this.headlight.setVisible(night >= 0);
    this.tailGlow.setVisible(night >= 0);
    this.headlight.setAlpha(0.12 + 0.45 * night);
    this.tailGlow.setAlpha(0.3 + 0.5 * night);
  }

  private parts(scenery: Scenery): Phaser.GameObjects.Container[] {
    return scenery.front ? [scenery.back, scenery.road, scenery.front] : [scenery.back, scenery.road];
  }

  private setDepths(scenery: Scenery, lift: number): void {
    scenery.back.setDepth(DRIVE_DEPTH.scenery + lift);
    scenery.road.setDepth(DRIVE_DEPTH.road + lift);
    scenery.front?.setDepth(DRIVE_DEPTH.verge + lift);
  }

  private showScenery(biome: BiomeId, alpha: number): void {
    for (const part of this.parts(this.sceneryFor(biome))) part.setAlpha(alpha);
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
    const p = def.palette;
    const s = this.scale;
    const w = this.pxWidth;
    const roadTop = this.roadTopPx;
    const size = `${w}x${this.pxHeight}${this.options.pulledBack ? 'b' : ''}`;
    const key = (name: string) => `scenery/${biome}/${name}/${size}`;
    const mountainTop = Math.round(roadTop * 0.12);
    const featureHeight = Math.round(roadTop * 0.3);
    const nearHeight = Math.round(roadTop * 0.15);
    const hazeTop = Math.round(roadTop * 0.58);
    const hazeBottom = roadTop - featureHeight + Math.round(featureHeight * 0.45);
    const discRadius = 7;

    ensureGridTexture(this.scene, key('sky'), () => buildSky(w, roadTop, Math.round(roadTop * 0.55), p, true));
    ensureGridTexture(this.scene, `scenery/${biome}/disc`, () => buildSkyDisc(discRadius, p));
    ensureGridTexture(this.scene, key('clouds'), () => buildClouds(w, Math.round(this.pxHeight * 0.45), 7, p));
    ensureGridTexture(this.scene, key('mountains'), () => buildMountains(w, roadTop - mountainTop, 11, p));
    ensureGridTexture(this.scene, key('haze'), () => buildHaze(w, hazeBottom - hazeTop, p));
    ensureGridTexture(this.scene, key('feature'), () => buildFeature(def.feature, w, featureHeight, 23, p));
    ensureGridTexture(this.scene, key('near'), () => buildFeature(def.feature, w, nearHeight, 41, nearPalette(p)));

    const sky = this.scene.add.image(0, 0, key('sky')).setOrigin(0).setScale(s);
    const disc = this.scene.add
      .image(this.width * 0.24, roadTop * 0.4 * s, `scenery/${biome}/disc`)
      .setScale(s);
    const haze = this.scene.add.image(0, hazeTop * s, key('haze')).setOrigin(0).setScale(s);
    const clouds = this.makeLayer(key('clouds'), 0, 0.04, true);
    const mountains = this.makeLayer(key('mountains'), mountainTop * s, 0.08, false);
    const feature = this.makeLayer(key('feature'), (roadTop - featureHeight) * s, 0.28, false);
    const near = this.makeLayer(key('near'), (roadTop - nearHeight + 1) * s, 0.48, false);
    const back = this.scene.add
      .container(0, 0, [sky, disc, ...clouds.images, ...mountains.images, haze, ...feature.images, ...near.images])
      .setDepth(DRIVE_DEPTH.scenery)
      .setAlpha(0);

    // Road: from its top edge down to the verge (or the bottom of the stage).
    const roadHeight = this.roadBottomPx - roadTop + (this.options.pulledBack ? 0 : this.pxHeight - this.roadBottomPx);
    ensureGridTexture(this.scene, key('road'), () => buildRoad(w, roadHeight, 4, 5, p));
    const road = this.makeLayer(key('road'), roadTop * s, 1, false);
    const roadContainer = this.scene.add.container(0, 0, road.images).setDepth(DRIVE_DEPTH.road).setAlpha(0);

    const layers = [clouds, mountains, feature, near, road];
    let front: Phaser.GameObjects.Container | null = null;
    if (this.options.pulledBack) {
      // The verge overlaps the road's bottom edge by a few pixels, so tufts stand in front of it.
      const lip = 3;
      ensureGridTexture(this.scene, key('verge'), () => buildVerge(w, this.vergePx + lip, 31, p));
      const verge = this.makeLayer(key('verge'), (this.roadBottomPx - lip) * s, 1.3, false);
      layers.push(verge);
      front = this.scene.add.container(0, 0, verge.images).setDepth(DRIVE_DEPTH.verge).setAlpha(0);
    }

    const scenery: Scenery = { back, road: roadContainer, front, layers };
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
