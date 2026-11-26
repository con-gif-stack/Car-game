import Phaser from 'phaser';
import { buildCloudShadow, buildCrow, buildTumbleweed } from '../art/farmArt';
import type { FarmId } from '../data/farm';
import { seededRandom } from '../core/random';
import { ensureGridTexture } from './textures';
import { glowKey, uiIconKey } from './ui';

/** Draw depths on the farm (deposits and buildings use their screen y, up to about 2000). */
export const FARM_DEPTH = {
  cloudShadow: 2500,
  vignette: 2600,
  ambient: 2700,
  droneShadow: 3000,
  drone: 4000,
  fx: 4500,
  popup: 5000,
} as const;

/** One art pixel of the small effects, in screen units. */
const PX = 6;

interface Particle {
  obj: Phaser.GameObjects.Rectangle | Phaser.GameObjects.Image;
  vx: number;
  vy: number;
  /** Downward pull (units/s²). */
  gravity: number;
  age: number;
  life: number;
  /** Fade in over the first part of its life as well as out at the end. */
  fadeIn?: boolean;
  spin?: number;
  grow?: number;
}

export interface FarmFxOptions {
  farm: FarmId;
  width: number;
  height: number;
  /** Where drones take off and land (screen). */
  pad: { x: number; y: number };
  /** The neon strip over the garage door (screen). */
  neon: { x: number; y: number; width: number };
  /** Screen positions of the piles (for the crow and glints). */
  piles: () => { id: string; x: number; y: number; width: number; height: number; visible: boolean }[];
}

/**
 * The farm's ambient life and juice: drifting cloud shadows, each farm's particles (dust and a
 * crow in the Junkyard, blowing litter at the truck stop, steam and welding sparks in the
 * factory yard, sand and tumbleweeds in the desert), a flickering garage neon, glints on the
 * piles, debris bursts on taps and dust puffs under the drones. Destroy it with the map.
 */
export class FarmFx {
  private readonly objects: Phaser.GameObjects.GameObject[] = [];
  private readonly particles: Particle[] = [];
  private readonly clouds: Phaser.GameObjects.Image[] = [];
  private readonly rand: () => number;
  private readonly neon: Phaser.GameObjects.Image;
  private timers: Record<string, number> = {};
  private crow: {
    img: Phaser.GameObjects.Image;
    perch: string | null;
    from: { x: number; y: number };
    to: { x: number; y: number };
    t: number;
    flying: boolean;
    wait: number;
  } | null = null;
  private tumbleweed: { img: Phaser.GameObjects.Image; x: number; y: number; dir: number; active: boolean } | null = null;

  constructor(
    private readonly scene: Phaser.Scene,
    private readonly opts: FarmFxOptions,
  ) {
    this.rand = seededRandom(97 + opts.farm.length * 13);
    const { width, height } = opts;

    // Cloud shadows drifting across.
    const cw = Math.ceil(width / PX / 1.6);
    const ch = Math.ceil(cw * 0.6);
    for (let i = 0; i < 3; i++) {
      const key = `farm/cloudShadow/${cw}x${ch}/${i}`;
      ensureGridTexture(scene, key, () => buildCloudShadow(cw, ch, 11 + i));
      const img = this.keep(
        scene.add
          .image(this.rand() * width, (i + 0.3) * (height / 3), key)
          .setScale(PX)
          .setAlpha(0.13)
          .setDepth(FARM_DEPTH.cloudShadow),
      );
      this.clouds.push(img);
    }

    // The garage neon: a glow over the strip that flickers now and then.
    this.neon = this.keep(
      scene.add
        .image(opts.neon.x, opts.neon.y, glowKey(scene, 10, 0xff2e88))
        .setScale(PX * 0.9, PX * 0.45)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.5)
        .setDepth(FARM_DEPTH.ambient),
    );

    if (opts.farm === 'junkyard') {
      [0, 1].forEach((f) => ensureGridTexture(scene, `farm/crow/${f}`, () => buildCrow(f)));
      const img = this.keep(scene.add.image(-100, -100, 'farm/crow/0').setScale(PX - 1).setDepth(FARM_DEPTH.ambient + 1));
      this.crow = { img, perch: null, from: { x: -60, y: 0 }, to: { x: -60, y: 0 }, t: 1, flying: false, wait: 1 };
    }
    if (opts.farm === 'desert') {
      [0, 1].forEach((f) => ensureGridTexture(scene, `farm/tumbleweed/${f}`, () => buildTumbleweed(f)));
      const img = this.keep(scene.add.image(-100, -100, 'farm/tumbleweed/0').setScale(PX).setDepth(FARM_DEPTH.ambient));
      this.tumbleweed = { img, x: -100, y: 0, dir: 1, active: false };
      this.timers.tumbleweed = 4;
    }
  }

  update(dt: number, time: number): void {
    const { width, height, farm } = this.opts;

    for (const cloud of this.clouds) {
      cloud.x += 14 * dt;
      if (cloud.x - cloud.displayWidth / 2 > width) {
        cloud.x = -cloud.displayWidth / 2;
        cloud.y = this.rand() * height;
      }
    }

    // Neon: steady most of the time, with quick flickers.
    const flicker = Math.sin(time / 90) > 0.97 || (time % 7000 < 260 && Math.floor(time / 60) % 2 === 0);
    this.neon.setAlpha(flicker ? 0.12 : 0.45 + 0.08 * Math.sin(time / 400));

    if (this.every('glint', 0.7 + this.rand() * 0.6, dt)) this.glint();

    switch (farm) {
      case 'junkyard':
        if (this.every('dust', 0.35, dt)) this.mote(0xc9b090, 4, 7);
        this.updateCrow(dt);
        break;
      case 'rustHighway':
        if (this.every('litter', 1.6, dt)) this.litter();
        if (this.every('dust', 0.6, dt)) this.mote(0xb8bcc6, 3, 6);
        break;
      case 'industrial':
        if (this.every('steam', 0.22, dt)) this.steam();
        if (this.every('weld', 2.4, dt)) this.weld();
        break;
      case 'desert':
        if (this.every('sand', 0.12, dt)) this.sand();
        this.updateTumbleweed(dt, time);
        break;
    }

    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i] as Particle;
      p.age += dt;
      const t = p.age / p.life;
      if (t >= 1) {
        p.obj.destroy();
        this.particles.splice(i, 1);
        continue;
      }
      p.vy += p.gravity * dt;
      p.obj.x += p.vx * dt;
      p.obj.y += p.vy * dt;
      if (p.spin) p.obj.rotation += p.spin * dt;
      if (p.grow) p.obj.setScale(p.obj.scaleX + p.grow * dt);
      const fade = p.fadeIn ? Math.min(1, t * 5, (1 - t) * 3) : Math.min(1, (1 - t) * 2.5);
      p.obj.setAlpha(fade * ((p.obj.getData('alpha') as number | undefined) ?? 1));
    }
  }

  /** Debris pixels flying up from a tapped pile, in the material's colour. */
  burst(x: number, y: number, color: number): void {
    for (let i = 0; i < 9; i++) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * 2.2;
      const speed = 220 + this.rand() * 260;
      const size = PX * (this.rand() < 0.4 ? 2 : 1);
      this.particle(
        this.scene.add.rectangle(x, y, size, size, i % 3 === 0 ? 0xffffff : color).setStrokeStyle(2, 0x1a1414),
        { vx: Math.cos(a) * speed, vy: Math.sin(a) * speed, gravity: 1100, life: 0.6 + this.rand() * 0.3, spin: (this.rand() - 0.5) * 12 },
      );
    }
  }

  /** An icon that flies from a point up towards the top bar and fades. */
  flyIcon(x: number, y: number, key: string, scale: number): void {
    const icon = this.scene.add.image(x, y, key).setScale(scale).setDepth(FARM_DEPTH.popup + 1);
    this.objects.push(icon);
    this.scene.tweens.add({
      targets: icon,
      x: { value: 140, ease: 'Quad.easeIn' },
      y: { value: -40, ease: 'Back.easeIn' },
      scale: scale * 0.6,
      duration: 650,
      onComplete: () => icon.destroy(),
    });
  }

  /** A dust puff on the ground (drone take-off and landing). */
  puff(x: number, y: number): void {
    for (let i = 0; i < 7; i++) {
      const a = (i / 7) * Math.PI * 2;
      const r = this.scene.add.rectangle(x, y, PX * 2, PX * 2, 0xd8c8b0).setData('alpha', 0.7);
      this.particle(r, { vx: Math.cos(a) * 90, vy: Math.sin(a) * 40 - 10, gravity: 0, life: 0.7, grow: 0.8 });
    }
  }

  /** Sparks under a drone that is mining. */
  sparks(x: number, y: number, color: number): void {
    for (let i = 0; i < 3; i++) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * 2.6;
      this.particle(this.scene.add.rectangle(x, y, PX, PX, i === 0 ? 0xfff0a0 : color), {
        vx: Math.cos(a) * 160,
        vy: Math.sin(a) * 160,
        gravity: 700,
        life: 0.35,
      });
    }
  }

  /** A pile was tapped: a crow sitting on it flies off. */
  disturbed(id: string): void {
    if (this.crow && this.crow.perch === id && !this.crow.flying) this.flyCrow(null);
  }

  destroy(): void {
    for (const p of this.particles) p.obj.destroy();
    this.particles.length = 0;
    for (const obj of this.objects) obj.destroy();
    this.objects.length = 0;
  }

  private keep<T extends Phaser.GameObjects.GameObject>(obj: T): T {
    this.objects.push(obj);
    return obj;
  }

  /** True once every `interval` seconds for the named timer. */
  private every(name: string, interval: number, dt: number): boolean {
    const left = (this.timers[name] ?? this.rand() * interval) - dt;
    if (left > 0) {
      this.timers[name] = left;
      return false;
    }
    this.timers[name] = interval;
    return true;
  }

  private particle(obj: Particle['obj'], p: Omit<Particle, 'obj' | 'age'>): void {
    obj.setDepth(obj.depth || FARM_DEPTH.fx);
    this.particles.push({ obj, age: 0, ...p });
  }

  private glint(): void {
    const piles = this.opts.piles().filter((p) => p.visible);
    const pile = piles[Math.floor(this.rand() * piles.length)];
    if (!pile) return;
    const x = pile.x + (this.rand() - 0.5) * pile.width * 0.6;
    const y = pile.y + (this.rand() - 0.6) * pile.height * 0.5;
    const star = this.scene.add.image(x, y, uiIconKey(this.scene, 'star', 0xffffff)).setScale(0.5).setAlpha(0).setDepth(FARM_DEPTH.ambient);
    this.objects.push(star);
    this.scene.tweens.add({
      targets: star,
      alpha: { from: 0, to: 0.9 },
      scale: { from: 0.4, to: 1.4 },
      angle: 45,
      duration: 260,
      yoyo: true,
      onComplete: () => star.destroy(),
    });
  }

  /** A speck drifting on the breeze. */
  private mote(color: number, minLife: number, maxLife: number): void {
    const { width, height } = this.opts;
    const r = this.scene.add.rectangle(this.rand() * width, this.rand() * height, PX, PX, color).setData('alpha', 0.55);
    this.particle(r, {
      vx: 18 + this.rand() * 30,
      vy: -6 - this.rand() * 10,
      gravity: 0,
      life: minLife + this.rand() * (maxLife - minLife),
      fadeIn: true,
    });
  }

  /** Paper litter tumbling across the truck stop. */
  private litter(): void {
    const { width, height } = this.opts;
    const r = this.scene.add.rectangle(-20, this.rand() * height, PX * 2, PX * 1.4, this.rand() < 0.5 ? 0xe8e2d0 : 0xc8d8e8).setStrokeStyle(2, 0x3a3a44);
    this.particle(r, { vx: 140 + this.rand() * 80, vy: (this.rand() - 0.5) * 30, gravity: 0, life: (width + 40) / 160, spin: 4 + this.rand() * 4 });
  }

  /** Steam rising from vents in the factory yard. */
  private steam(): void {
    const { width, height } = this.opts;
    const vents = [
      { x: width * 0.18, y: height * 0.36 },
      { x: width * 0.83, y: height * 0.7 },
    ];
    const vent = vents[Math.floor(this.rand() * vents.length)] ?? vents[0]!;
    const r = this.scene.add
      .rectangle(vent.x + (this.rand() - 0.5) * 20, vent.y, PX * 3, PX * 3, 0xe8e8f0)
      .setData('alpha', 0.4);
    this.particle(r, { vx: 10 + this.rand() * 10, vy: -50 - this.rand() * 30, gravity: 0, life: 1.6, grow: 0.9, fadeIn: true });
  }

  /** A shower of welding sparks from the far end of the factory yard. */
  private weld(): void {
    const { width, height } = this.opts;
    const x = width * 0.62;
    const y = height * 0.08;
    const flash = this.scene.add.image(x, y, glowKey(this.scene, 8, 0x9fd8ff)).setScale(PX).setBlendMode(Phaser.BlendModes.ADD);
    this.particle(flash, { vx: 0, vy: 0, gravity: 0, life: 0.35 });
    for (let i = 0; i < 10; i++) {
      const a = -Math.PI / 2 + (this.rand() - 0.5) * 2.8;
      const speed = 120 + this.rand() * 200;
      this.particle(this.scene.add.rectangle(x, y, PX * 0.8, PX * 0.8, this.rand() < 0.5 ? 0xffd27a : 0xffffff), {
        vx: Math.cos(a) * speed,
        vy: Math.sin(a) * speed,
        gravity: 900,
        life: 0.5 + this.rand() * 0.3,
      });
    }
  }

  /** Streaks of sand blown across the desert. */
  private sand(): void {
    const { width, height } = this.opts;
    const r = this.scene.add.rectangle(-40, this.rand() * height, PX * (3 + this.rand() * 4), PX * 0.6, 0xf2dcae).setData('alpha', 0.5);
    this.particle(r, { vx: 380 + this.rand() * 200, vy: 0, gravity: 0, life: (width + 80) / 450, fadeIn: true });
  }

  private updateTumbleweed(dt: number, time: number): void {
    const tw = this.tumbleweed;
    if (!tw) return;
    if (!tw.active) {
      if (!this.every('tumbleweed', 9 + this.rand() * 8, dt)) return;
      tw.active = true;
      tw.dir = this.rand() < 0.7 ? 1 : -1;
      tw.x = tw.dir > 0 ? -60 : this.opts.width + 60;
      tw.y = this.opts.height * (0.15 + this.rand() * 0.6);
    }
    tw.x += tw.dir * 170 * dt;
    const hop = Math.abs(Math.sin(time / 180)) * 28;
    tw.img.setPosition(tw.x, tw.y - hop).setTexture(`farm/tumbleweed/${Math.floor(time / 120) % 2}`);
    tw.img.rotation += tw.dir * 6 * dt;
    tw.img.setDepth(tw.y);
    if (tw.x < -80 || tw.x > this.opts.width + 80) tw.active = false;
  }

  private updateCrow(dt: number): void {
    const crow = this.crow;
    if (!crow) return;
    if (crow.flying) {
      crow.t = Math.min(1, crow.t + dt / 1.1);
      const arc = Math.sin(crow.t * Math.PI) * 120;
      const x = crow.from.x + (crow.to.x - crow.from.x) * crow.t;
      const y = crow.from.y + (crow.to.y - crow.from.y) * crow.t - arc;
      crow.img.setPosition(x, y).setTexture(`farm/crow/${Math.floor(crow.t * 14) % 2}`);
      crow.img.setRotation(Math.atan2(crow.to.y - crow.from.y, crow.to.x - crow.from.x) + Math.PI / 2);
      if (crow.t >= 1) {
        crow.flying = false;
        crow.img.setTexture('farm/crow/0').setRotation(0);
        crow.wait = crow.perch ? 4 + this.rand() * 6 : 6 + this.rand() * 6;
        if (!crow.perch) crow.img.setPosition(-100, -100);
      }
      return;
    }
    crow.wait -= dt;
    // Pecking: a little hop now and then.
    if (crow.perch && this.rand() < dt * 1.5) crow.img.y -= PX;
    else if (crow.perch) {
      const pile = this.opts.piles().find((p) => p.id === crow.perch);
      if (pile) crow.img.y = pile.y - pile.height * 0.3;
    }
    if (crow.wait <= 0) {
      const piles = this.opts.piles().filter((p) => p.visible && p.id !== crow.perch);
      const next = piles[Math.floor(this.rand() * piles.length)];
      this.flyCrow(next ?? null);
    }
  }

  private flyCrow(to: { id: string; x: number; y: number; height: number } | null): void {
    const crow = this.crow;
    if (!crow) return;
    const { width } = this.opts;
    const start = crow.perch ? { x: crow.img.x, y: crow.img.y } : { x: this.rand() < 0.5 ? -60 : width + 60, y: this.rand() * this.opts.height * 0.5 };
    crow.from = start;
    crow.to = to ? { x: to.x + (this.rand() - 0.5) * 30, y: to.y - to.height * 0.3 } : { x: start.x < width / 2 ? width + 80 : -80, y: start.y - 200 };
    crow.perch = to ? to.id : null;
    crow.t = 0;
    crow.flying = true;
  }
}
