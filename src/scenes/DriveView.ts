import Phaser from 'phaser';
import { RUSTBUCKET_LAYOUT } from '../art/carArt';
import { buildAurora, buildBackdrop, buildBird, buildPuff, buildShimmer, type Backdrop } from '../art/backdrops';
import { mix } from '../art/color';
import {
  buildClouds,
  buildFeature,
  buildHaze,
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
/** Seeds for each biome's ambient life, so flocks and smoke differ between biomes. */
const BIOME_SEEDS: Record<BiomeId, number> = { junkyard: 3, rustHighway: 5, industrial: 7, desert: 11, beyond: 13 };
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
  /** Objects riding on each copy of the layer (offset from its left edge). */
  attached?: { obj: Phaser.GameObjects.Image; dx: number }[][];
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
  /** Moves the biome's ambient life (birds, smoke, shimmer, aurora) each frame. */
  ambient: ((dt: number, distance: number, time: number) => void) | null;
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
  private time = 0;

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
    this.time += dtSeconds;

    for (const scenery of this.sceneries.values()) {
      if (scenery.back.alpha <= 0) continue;
      for (const layer of scenery.layers) this.positionLayer(layer);
      scenery.ambient?.(dtSeconds, distance, this.time);
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
    layer.attached?.forEach((list, copy) => {
      for (const a of list) a.obj.x = layer.images[copy]!.x + a.dx;
    });
  }

  /** Screen x of a point on a scrolling layer, on whichever copy is nearest the screen. */
  private layerX(layer: ScrollLayer, px: number): number {
    const x = layer.images[0].x + px * this.scale;
    return x < -80 ? x + layer.span : x;
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
    const backdropKey = key(`backdrop-${def.backdrop}`);
    if (!this.scene.textures.exists(backdropKey)) {
      const built = buildBackdrop(def.backdrop, w, roadTop - mountainTop, 11, p);
      ensureGridTexture(this.scene, backdropKey, () => built.grid);
      this.scene.textures.get(backdropKey).customData = { vents: built.vents, beacons: built.beacons };
    }
    const points = this.scene.textures.get(backdropKey).customData as Pick<Backdrop, 'vents' | 'beacons'>;
    ensureGridTexture(this.scene, key('haze'), () => buildHaze(w, hazeBottom - hazeTop, p));
    ensureGridTexture(this.scene, key('feature'), () => buildFeature(def.feature, w, featureHeight, 23, p));
    ensureGridTexture(this.scene, key('near'), () => buildFeature(def.feature, w, nearHeight, 41, nearPalette(p)));

    const sky = this.scene.add.image(0, 0, key('sky')).setOrigin(0).setScale(s);
    const disc = this.scene.add
      .image(this.width * 0.24, roadTop * 0.4 * s, `scenery/${biome}/disc`)
      .setScale(s);
    const haze = this.scene.add.image(0, hazeTop * s, key('haze')).setOrigin(0).setScale(s);
    const clouds = this.makeLayer(key('clouds'), 0, 0.04, true);
    const mountains = this.makeLayer(backdropKey, mountainTop * s, 0.08, false);
    const ambient = this.buildAmbient(biome, roadTop, mountainTop, featureHeight, mountains, points);
    const feature = this.makeLayer(key('feature'), (roadTop - featureHeight) * s, 0.28, false);
    const near = this.makeLayer(key('near'), (roadTop - nearHeight + 1) * s, 0.48, false);
    const back = this.scene.add
      .container(0, 0, [
        sky,
        ...ambient.sky,
        disc,
        ...clouds.images,
        ...ambient.air,
        ...mountains.images,
        ...ambient.far,
        haze,
        ...ambient.horizon,
        ...feature.images,
        ...near.images,
      ])
      .setDepth(DRIVE_DEPTH.scenery)
      .setAlpha(0);

    // Road: from its top edge down to the verge (or the bottom of the stage).
    const roadHeight = this.roadBottomPx - roadTop + (this.options.pulledBack ? 0 : this.pxHeight - this.roadBottomPx);
    ensureGridTexture(this.scene, key('road'), () => buildRoad(w, roadHeight, 4, 5, p));
    const road = this.makeLayer(key('road'), roadTop * s, 1, false);
    const roadContainer = this.scene.add.container(0, 0, road.images).setDepth(DRIVE_DEPTH.road).setAlpha(0);

    const layers = [clouds, mountains, feature, near, road, ...ambient.layers];
    let front: Phaser.GameObjects.Container | null = null;
    if (this.options.pulledBack) {
      // The verge overlaps the road's bottom edge by a few pixels, so tufts stand in front of it.
      const lip = 3;
      ensureGridTexture(this.scene, key('verge'), () => buildVerge(w, this.vergePx + lip, 31, p));
      const verge = this.makeLayer(key('verge'), (this.roadBottomPx - lip) * s, 1.3, false);
      layers.push(verge);
      front = this.scene.add.container(0, 0, verge.images).setDepth(DRIVE_DEPTH.verge).setAlpha(0);
    }

    const scenery: Scenery = { back, road: roadContainer, front, layers, ambient: ambient.update };
    this.sceneries.set(biome, scenery);
    for (const layer of layers) this.positionLayer(layer);
    return scenery;
  }

  /**
   * The biome's ambient life: birds crossing the sky, smoke rising from chimneys, blinking
   * warning lights, heat shimmer over the horizon or an aurora. Objects are returned by the
   * place they go in the scenery's draw order.
   */
  private buildAmbient(
    biome: BiomeId,
    roadTop: number,
    backdropTop: number,
    featureHeight: number,
    backdrop: ScrollLayer,
    points: Pick<Backdrop, 'vents' | 'beacons'>,
  ): {
    sky: Phaser.GameObjects.Image[];
    air: Phaser.GameObjects.Image[];
    far: Phaser.GameObjects.Image[];
    horizon: Phaser.GameObjects.Image[];
    layers: ScrollLayer[];
    update: (dt: number, distance: number, time: number) => void;
  } {
    const def = BIOMES_BY_ID[biome];
    const p = def.palette;
    const s = this.scale;
    const scene = this.scene;
    const w = this.pxWidth;
    const out = {
      sky: [] as Phaser.GameObjects.Image[],
      air: [] as Phaser.GameObjects.Image[],
      far: [] as Phaser.GameObjects.Image[],
      horizon: [] as Phaser.GameObjects.Image[],
      layers: [] as ScrollLayer[],
    };
    const updates: ((dt: number, distance: number, time: number) => void)[] = [];
    const rand = seededRandom(BIOME_SEEDS[biome]);

    // Blinking warning lights on cranes, masts and chimneys, riding on the backdrop layer.
    if (points.beacons.length) {
      const glow = glowKey(scene, 3, 0xff4d4d);
      const phases = points.beacons.map(() => rand() * 2);
      backdrop.attached = backdrop.images.map(() =>
        points.beacons.map((b) => {
          const obj = scene.add
            .image(0, (backdropTop + b.y + 0.5) * s, glow)
            .setScale(s)
            .setBlendMode(Phaser.BlendModes.ADD);
          out.far.push(obj);
          return { obj, dx: (b.x + 0.5) * s };
        }),
      );
      updates.push((_dt, _d, time) => {
        backdrop.attached?.forEach((list) =>
          list.forEach((a, i) => a.obj.setAlpha((time + (phases[i] ?? 0)) % 1.8 < 0.7 ? 0.95 : 0.12)),
        );
      });
    }

    if (def.ambient === 'crows' || def.ambient === 'birds') {
      const color = def.ambient === 'crows' ? mix(p.featureDark, 0x000000, 0.45) : mix(p.mountainShadow, p.featureDark, 0.6);
      const keys = [0, 1].map((frame) => {
        const k = `ambient/bird/${color.toString(16)}/${frame}`;
        ensureGridTexture(scene, k, () => buildBird(frame, color));
        return k;
      });
      const size = def.ambient === 'crows' ? 4 : 6;
      // A loose V: each bird trails the leader and sits a little above or below.
      const birds = Array.from({ length: size }, (_, i) => ({
        trail: Math.ceil(i / 2) * 9 * s + rand() * 3 * s,
        side: (i % 2 === 0 ? 1 : -1) * Math.ceil(i / 2) * 3 * s + rand() * 2 * s,
        phase: rand() * 2,
        img: scene.add.image(0, 0, keys[0] as string).setScale(s).setVisible(false),
      }));
      out.far.push(...birds.map((b) => b.img));
      const flock = { x: 0, y: 0, dir: 1, cooldown: 1 + rand() * 4, active: false };
      updates.push((dt, distance, time) => {
        if (!flock.active) {
          flock.cooldown -= dt;
          if (flock.cooldown > 0) return;
          flock.active = true;
          flock.dir = rand() < 0.5 ? 1 : -1;
          flock.x = flock.dir > 0 ? -120 : this.width + 120;
          flock.y = roadTop * s * (0.12 + rand() * 0.3);
        }
        flock.x += flock.dir * 55 * dt - distance * 0.12;
        for (const b of birds) {
          const frame = Math.floor(time * 5 + b.phase) % 2;
          b.img
            .setVisible(true)
            .setTexture(keys[frame] as string)
            .setFlipX(flock.dir < 0)
            .setPosition(flock.x - flock.dir * b.trail, flock.y + b.side);
        }
        if (flock.x < -260 || flock.x > this.width + 260) {
          flock.active = false;
          flock.cooldown = 5 + rand() * 10;
          for (const b of birds) b.img.setVisible(false);
        }
      });
    }

    if (def.ambient === 'smoke' && points.vents.length) {
      const puffKey = `ambient/puff/${biome}`;
      ensureGridTexture(scene, puffKey, () => buildPuff(5, mix(p.cloudLight, p.haze, 0.25)));
      const pool = Array.from({ length: Math.min(60, points.vents.length * 9) }, () => ({
        img: scene.add.image(0, 0, puffKey).setVisible(false),
        age: 0,
        life: 0,
      }));
      out.far.push(...pool.map((puff) => puff.img));
      const timers = points.vents.map(() => rand());
      let next = 0;
      updates.push((dt, distance) => {
        points.vents.forEach((vent, i) => {
          timers[i] = (timers[i] ?? 0) - dt;
          if ((timers[i] ?? 0) > 0) return;
          timers[i] = 0.5 + rand() * 0.5;
          const x = this.layerX(backdrop, vent.x + 0.5);
          if (x < -40 || x > this.width + 40) return;
          const puff = pool[next++ % pool.length];
          if (!puff) return;
          puff.age = 0;
          puff.life = 4 + rand() * 2;
          puff.img.setVisible(true).setPosition(x, (backdropTop + vent.y) * s);
        });
        for (const puff of pool) {
          if (!puff.img.visible) continue;
          puff.age += dt;
          const t = puff.age / puff.life;
          if (t >= 1) {
            puff.img.setVisible(false);
            continue;
          }
          puff.img.x -= distance * 0.08 + 7 * dt;
          puff.img.y -= 13 * dt;
          puff.img.setScale(s * (0.35 + t * 0.9)).setAlpha(0.75 * (1 - t));
        }
      });
    }

    if (def.ambient === 'heat') {
      const height = 8;
      const k = `ambient/shimmer/${biome}/${w}`;
      ensureGridTexture(scene, k, () => buildShimmer(w, height, 5, p));
      const layer = this.makeLayer(k, (roadTop - featureHeight - height + 2) * s, 0.2, false);
      out.horizon.push(...layer.images);
      out.layers.push(layer);
      updates.push((_dt, _d, time) => {
        for (const img of layer.images) img.setAlpha(0.3 + 0.3 * Math.sin(time * 2.1) * Math.sin(time * 0.7 + 1));
      });
    }

    if (def.ambient === 'aurora') {
      const height = Math.round(roadTop * 0.42);
      const k = `ambient/aurora/${biome}/${w}x${height}`;
      ensureGridTexture(scene, k, () => buildAurora(w, height, 9, p));
      const layer = this.makeLayer(k, roadTop * 0.03 * s, 0.01, true);
      for (const img of layer.images) img.setBlendMode(Phaser.BlendModes.ADD);
      out.sky.push(...layer.images);
      out.layers.push(layer);
      updates.push((_dt, _d, time) => {
        for (const img of layer.images) img.setAlpha(0.45 + 0.25 * Math.sin(time * 0.6));
      });
    }

    return { ...out, update: (dt, distance, time) => updates.forEach((u) => u(dt, distance, time)) };
  }

  private makeLayer(textureKey: string, y: number, parallax: number, drifts: boolean): ScrollLayer {
    const s = this.scale;
    const span = this.pxWidth * s;
    const make = (x: number) => this.scene.add.image(x, y, textureKey).setOrigin(0).setScale(s);
    return { images: [make(0), make(span)], parallax, span, drifts };
  }
}
