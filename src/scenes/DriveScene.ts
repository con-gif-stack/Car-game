import Phaser from 'phaser';
import { formatDistance, formatDuration, formatNumber } from '../core/format';
import type { RunSummary } from '../core/GameModel';
import { milestoneProgress, nextDistanceMilestone } from '../core/milestones';
import { runCarFromStats, stepRun, type RunState } from '../core/run';
import { computeCarStats } from '../core/vehicle';
import { BIOMES, BIOMES_BY_ID, type BiomeId } from '../data/biomes';
import { FUEL_TANKS } from '../data/economy';
import { MATERIAL_IDS, MATERIALS, RARITIES, type MaterialId } from '../data/materials';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import type { AppContext } from './context';
import { dialMax, FuelCans, Odometer, RouteStrip, Speedometer } from './driveHud';
import { DRIVE_DEPTH, DriveView } from './DriveView';
import { cssColor } from './panel';
import { openRunResults, type RunResults } from './runResults';
import { overlayStyle, textStyle } from './textStyles';
import { materialIconKey } from './textures';
import { addButton, addFrame, glowKey, PixelBar, type PixelButton, uiIconKey } from './ui';

const PAD = 32;
/** Height of the panel area under the road. */
const PANEL_HEIGHT = 470;
/** Space left at the bottom (the dev status line sits here). */
const BOTTOM_PAD = 48;
/** Speedometer size in UI pixels. */
const DIAL_PX = 38;

type Toggle = Phaser.GameObjects.GameObject & Phaser.GameObjects.Components.Visible;

/**
 * Drive tab: start a run, watch the car drive the biome road until its fuel or health runs
 * out, then see what it achieved. Every run starts at the Junkyard.
 */
export class DriveScene extends Phaser.Scene {
  private drive!: DriveView;
  private run: RunState | null = null;
  private results: RunResults | null = null;
  private stageHeight = 0;

  // Stage overlay.
  private biomePlate!: Phaser.GameObjects.Image;
  private biomeLabel!: Phaser.GameObjects.Text;
  private speedometer!: Speedometer;
  private route!: RouteStrip;
  private banner!: Phaser.GameObjects.Container;
  private bannerText!: Phaser.GameObjects.Text;

  // Before a run.
  private readonly preRun: Toggle[] = [];
  private bestText!: Phaser.GameObjects.Text;
  private nextText!: Phaser.GameObjects.Text;
  private nextBar!: PixelBar;
  private cans!: FuelCans;
  private fuelText!: Phaser.GameObjects.Text;
  private startButton!: PixelButton;

  // During a run.
  private readonly duringRun: Toggle[] = [];
  private odometer!: Odometer;
  private recordText!: Phaser.GameObjects.Text;
  private fuelBar!: PixelBar;
  private healthBar!: PixelBar;
  private aheadText!: Phaser.GameObjects.Text;
  private passedBest = false;
  private lastWholeFinds = {} as Record<MaterialId, number>;
  private readonly popupQueue: { material: MaterialId; amount: number }[] = [];
  private popupTimer = 0;
  private popupSlot = 0;

  private refreshTimer = 0;

  constructor(private readonly ctx: AppContext) {
    super({ key: 'DriveTab' });
  }

  create(): void {
    const { content } = this.ctx.layout;
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);
    const width = content.width;
    this.stageHeight = content.height - PANEL_HEIGHT - BOTTOM_PAD;

    this.drive = new DriveView(this, width, this.stageHeight, this.ctx.model.activeCar, 'junkyard', { pulledBack: true });
    this.createOverlay(width);

    const panelY = this.stageHeight + 20;
    addFrame(this, PAD, panelY, width - 2 * PAD, PANEL_HEIGHT - 32);
    this.createPreRun(width, panelY);
    this.createRunHud(width, panelY);
    this.showPreRun();

    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      if (!this.run) this.drive.car.setCar(this.ctx.model.activeCar);
      this.refreshPreRun();
    });
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const run = this.run;
    if (run && !run.finished) {
      const before = run.biome.id;
      stepRun(run, dt);
      this.drive.update(dt, run.speedKmh);
      if (run.biome.id !== before) this.enterBiome(run.biome.id);
      this.updateRunHud(run);
      this.showQueuedPopup(dt);
      if (run.finished) this.endRun();
    } else {
      this.drive.update(dt, 0);
      this.speedometer.set(0);
    }
    this.speedometer.update(dt);

    this.refreshTimer += dt;
    if (!this.run && this.refreshTimer >= 0.5) {
      this.refreshTimer = 0;
      this.refreshPreRun();
    }
  }

  private createOverlay(width: number): void {
    const d = DRIVE_DEPTH.overlay;
    this.route = new RouteStrip(this, PAD, 34, width - 2 * PAD, d);

    this.biomePlate = addFrame(this, PAD, 92, 200, 64, { kind: 'card' }).setDepth(d - 0.01);
    this.biomeLabel = this.add.text(PAD + 24, 124, '', overlayStyle(36, TEXT_COLORS.primary, true)).setOrigin(0, 0.5).setDepth(d);

    const dialRadius = (DIAL_PX * UI_PIXEL) / 2;
    this.speedometer = new Speedometer(this, width - PAD - dialRadius, 92 + dialRadius, DIAL_PX, d);

    // Biome banner: a plate that springs open when the road enters a new biome.
    const plate = addFrame(this, 0, 0, width - 200, 110, { kind: 'plate', color: COLORS.accentWarm, originX: 0.5, originY: 0.5 });
    this.bannerText = this.add.text(0, -4, '', overlayStyle(56, TEXT_COLORS.primary, true)).setOrigin(0.5);
    const glow = this.add
      .image(0, 0, glowKey(this, 32, COLORS.accentWarm))
      .setScale((width / 64) * 1.1, 3)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0.5);
    this.banner = this.add
      .container(width / 2, this.stageHeight * 0.36, [glow, plate, this.bannerText])
      .setDepth(d)
      .setAlpha(0);
    this.setBiomeLabel('junkyard');
  }

  /** Biome name in a plate edged with the biome's glow colour. */
  private setBiomeLabel(biome: BiomeId): void {
    const def = BIOMES_BY_ID[biome];
    this.biomeLabel.setText(def.name);
    const depth = this.biomePlate.depth;
    this.biomePlate.destroy();
    this.biomePlate = addFrame(this, PAD, 92, this.biomeLabel.width + 48, 64, { kind: 'card', color: def.palette.glow }).setDepth(depth);
  }

  private createPreRun(width: number, top: number): void {
    const left = PAD + 36;
    const right = width - PAD - 36;
    const add = <T extends Toggle>(obj: T) => {
      this.preRun.push(obj);
      return obj;
    };

    add(this.add.image(left, top + 66, uiIconKey(this, 'trophy')).setOrigin(0, 0.5).setScale(UI_PIXEL));
    add(this.add.text(left + 84, top + 26, 'BEST RUN', textStyle(22, TEXT_COLORS.muted)));
    this.bestText = add(this.add.text(left + 84, top + 50, '', textStyle(50, TEXT_COLORS.primary)));

    add(this.add.image(left, top + 152, uiIconKey(this, 'flag')).setOrigin(0, 0.5).setScale(UI_PIXEL * 0.75));
    this.nextText = add(this.add.text(left + 64, top + 152, '', textStyle(25, TEXT_COLORS.secondary)).setOrigin(0, 0.5));
    this.nextBar = new PixelBar(this, left, top + 196, right - left, 24, COLORS.accentWarm, { segment: 8 });
    for (const obj of this.nextBar.objects) add(obj);

    // Fuel tanks.
    add(this.add.text(left, top + 256, 'FUEL', textStyle(22, TEXT_COLORS.muted)).setOrigin(0, 0.5));
    this.cans = new FuelCans(this, left + 90, top + 256, FUEL_TANKS.max);
    for (const obj of this.cans.objects) add(obj as Toggle);
    this.fuelText = add(this.add.text(this.cans.right + 12, top + 256, '', textStyle(24, TEXT_COLORS.secondary)).setOrigin(0, 0.5));

    this.startButton = add(
      addButton(this, width / 2, top + 372, right - left, 108, 'START RUN', {
        onClick: () => this.startRun(),
        tone: 'primary',
        fontSize: 42,
        icon: uiIconKey(this, 'flag', 0x3a2410),
      }),
    );
  }

  private createRunHud(width: number, top: number): void {
    const left = PAD + 36;
    const right = width - PAD - 36;
    const add = <T extends Toggle>(obj: T) => {
      this.duringRun.push(obj);
      return obj;
    };

    add(this.add.text(left, top + 22, 'DISTANCE', textStyle(22, TEXT_COLORS.muted)));
    this.odometer = new Odometer(this, left, top + 50);
    for (const obj of this.odometer.objects) add(obj as Toggle);
    this.recordText = add(this.add.text(right, top + 90, '', overlayStyle(30, TEXT_COLORS.secondary, true)).setOrigin(1, 0.5));

    const barLeft = left + 70;
    add(this.add.image(left, top + 186, uiIconKey(this, 'fuel')).setOrigin(0, 0.5).setScale(UI_PIXEL * 0.75));
    this.fuelBar = new PixelBar(this, barLeft, top + 186, right - barLeft, 32, COLORS.money, { segment: 10, lowAt: 0.2 });
    add(this.add.image(left, top + 240, uiIconKey(this, 'wrench')).setOrigin(0, 0.5).setScale(UI_PIXEL * 0.75));
    this.healthBar = new PixelBar(this, barLeft, top + 240, right - barLeft, 32, COLORS.good, { segment: 10, lowAt: 0.2 });
    for (const obj of [...this.fuelBar.objects, ...this.healthBar.objects]) add(obj);

    add(this.add.image(left, top + 292, uiIconKey(this, 'flag')).setOrigin(0, 0.5).setScale(UI_PIXEL * 0.6));
    this.aheadText = add(this.add.text(left + 56, top + 292, '', textStyle(24, TEXT_COLORS.secondary)).setOrigin(0, 0.5));

    add(
      addButton(this, width / 2, top + 382, right - left, 80, 'Skip to the end', {
        onClick: () => this.skipRun(),
        tone: 'neutral',
        fontSize: 30,
      }),
    );
  }

  private showPreRun(): void {
    for (const obj of this.preRun) obj.setVisible(true);
    for (const obj of this.duringRun) obj.setVisible(false);
    this.refreshPreRun();
  }

  private showRunHud(): void {
    for (const obj of this.preRun) obj.setVisible(false);
    for (const obj of this.duringRun) obj.setVisible(true);
  }

  private refreshPreRun(): void {
    const { model } = this.ctx;
    const record = model.state.run;
    this.bestText.setText(record.runsCompleted > 0 ? formatDistance(record.bestDistanceKm) : 'No runs yet');
    this.route.update(0, record.bestDistanceKm, record.bestDistanceKm);
    this.speedometer.maxKmh = dialMax(runCarFromStats(computeCarStats(model.activeCar)).topSpeedKmh);

    const next = nextDistanceMilestone(model.state);
    if (next) {
      const { current, target } = milestoneProgress(model.state, next.condition);
      this.nextText.setText(`Next: ${next.title} · reach ${formatDistance(target)}`);
      this.nextBar.set(current / target);
    } else {
      this.nextText.setText('Every milestone on the road reached. More road coming soon.');
      this.nextBar.set(1);
    }

    const fuel = model.fuel();
    const full = fuel.tanks >= FUEL_TANKS.max;
    this.cans.set(fuel.tanks, full ? 1 : 1 - fuel.msUntilNext / (FUEL_TANKS.refillMinutes * 60_000));
    this.fuelText.setText(full ? 'Tanks full' : `Next in ${formatDuration(fuel.msUntilNext / 1000)}`);
    const canStart = fuel.tanks >= 1;
    this.startButton.setEnabled(canStart);
    this.startButton.pulse(canStart && !this.run);
    this.startButton.setLabel(canStart ? 'START RUN' : `Out of fuel · ${formatDuration(fuel.msUntilNext / 1000)}`);
  }

  private startRun(): void {
    if (this.run || this.results) return;
    const run = this.ctx.model.startRun();
    if (!run) return;
    this.run = run;
    this.passedBest = false;
    this.startButton.pulse(false);
    this.speedometer.maxKmh = dialMax(run.car.topSpeedKmh);
    this.drive.car.setCar(this.ctx.model.activeCar);
    this.drive.setBiome('junkyard', true);
    this.drive.resetScroll();
    for (const id of MATERIAL_IDS) this.lastWholeFinds[id] = 0;
    this.popupQueue.length = 0;
    this.showRunHud();
    this.enterBiome('junkyard');
    this.updateRunHud(run);
  }

  private skipRun(): void {
    const run = this.run;
    if (!run || run.finished) return;
    while (!run.finished) stepRun(run, 1);
    this.drive.setBiome(run.biome.id, true);
    this.setBiomeLabel(run.biome.id);
    this.updateRunHud(run);
    this.endRun();
  }

  private enterBiome(biome: BiomeId): void {
    const def = BIOMES_BY_ID[biome];
    this.drive.setBiome(biome);
    this.setBiomeLabel(biome);
    this.bannerText.setText(def.name.toUpperCase());
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0).setScale(0.6, 0.2);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, scaleX: 1, scaleY: 1, duration: 320, ease: 'Back.easeOut' },
        { alpha: 1, duration: 1200 },
        { alpha: 0, scaleY: 0.2, duration: 300, ease: 'Cubic.easeIn' },
      ],
    });
  }

  private updateRunHud(run: RunState): void {
    const record = this.ctx.model.state.run;
    const best = record.bestDistanceKm;
    this.odometer.set(run.distanceKm);
    const firstRun = record.runsCompleted === 0;
    const beyondBest = !firstRun && run.distanceKm > best;
    this.recordText.setText(firstRun ? 'First run' : beyondBest ? 'NEW BEST!' : `Best ${formatDistance(best)}`);
    this.recordText.setColor(beyondBest ? TEXT_COLORS.warm : TEXT_COLORS.secondary);
    if (beyondBest && !this.passedBest) {
      this.passedBest = true;
      this.tweens.add({ targets: this.recordText, scale: { from: 1.6, to: 1 }, duration: 420, ease: 'Back.easeOut' });
    }
    this.speedometer.set(run.speedKmh);
    this.route.update(run.distanceKm, best, Math.max(best, run.distanceKm));
    this.fuelBar.set(run.fuel / run.car.tankSeconds);
    this.healthBar.set(run.health / run.car.maxHealth);

    const nextBiome = BIOMES.find((b) => b.startKm > run.distanceKm);
    this.aheadText.setText(
      nextBiome ? `${nextBiome.name} in ${formatDistance(nextBiome.startKm - run.distanceKm)}` : 'Unknown road ahead',
    );

    // A pop-up whenever another whole unit of a material is picked up.
    for (const material of MATERIALS) {
      const whole = Math.floor(run.finds[material.id]);
      const gained = whole - (this.lastWholeFinds[material.id] ?? 0);
      if (gained > 0) {
        // Fast cars find a lot at once: keep the queue short so pop-ups stay readable.
        if (this.popupQueue.length < 3) this.popupQueue.push({ material: material.id, amount: gained });
        this.lastWholeFinds[material.id] = whole;
      }
    }
  }

  private showQueuedPopup(dt: number): void {
    this.popupTimer += dt;
    const next = this.popupQueue[0];
    if (!next || this.popupTimer < 0.25) return;
    this.popupQueue.shift();
    this.popupTimer = 0;
    this.showPopup(next.material, next.amount);
  }

  /** "+2" with the material's icon, rising from the car; Rare and better finds glow. */
  private showPopup(material: MaterialId, amount: number): void {
    const { car, scale } = this.drive;
    const def = MATERIALS.find((m) => m.id === material);
    if (!def) return;
    const rarity = RARITIES[def.rarity];
    // Alternate left, centre and right so pop-ups in quick succession don't overlap.
    this.popupSlot = (this.popupSlot + 1) % 3;
    const x = car.x + (this.popupSlot - 1) * 150;
    const y = car.y - 31 * scale - 10;
    const parts: Phaser.GameObjects.GameObject[] = [];
    if (rarity.rank >= 2) {
      parts.push(this.add.image(0, 0, glowKey(this, 16, rarity.color)).setScale(5).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.7));
    }
    parts.push(
      this.add.image(-24, 0, materialIconKey(this, material)).setScale(4),
      this.add.text(4, 0, `+${formatNumber(amount)}`, overlayStyle(34, cssColor(rarity.color), true)).setOrigin(0, 0.5),
    );
    const popup = this.add.container(x, y, parts).setDepth(DRIVE_DEPTH.overlay);
    popup.setScale(0.6);
    this.tweens.add({ targets: popup, scale: 1, duration: 160, ease: 'Back.easeOut' });
    this.tweens.add({ targets: popup, y: y - 90, alpha: 0, delay: 250, duration: 950, onComplete: () => popup.destroy() });
  }

  private endRun(): void {
    const run = this.run;
    if (!run) return;
    const summary = this.ctx.model.finishRun(run);
    // Let the car roll to a stop for a moment before the results appear.
    this.time.delayedCall(700, () => this.showResults(summary));
  }

  private showResults(summary: RunSummary): void {
    const { width, height } = this.cameras.main;
    this.results = openRunResults(this, summary, { x: 0, y: 0, width, height }, () => this.closeResults());
  }

  private closeResults(): void {
    this.results?.container.destroy();
    this.results = null;
    this.run = null;
    this.drive.setBiome('junkyard', true);
    this.drive.resetScroll();
    this.setBiomeLabel('junkyard');
    this.showPreRun();
  }
}
