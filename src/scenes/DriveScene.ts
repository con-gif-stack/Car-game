import Phaser from 'phaser';
import { formatDistance, formatDuration, formatNumber, formatPrecise } from '../core/format';
import type { RunSummary } from '../core/GameModel';
import { milestoneProgress, nextDistanceMilestone } from '../core/milestones';
import { stepRun, type RunState } from '../core/run';
import { BIOMES, BIOMES_BY_ID, type BiomeId } from '../data/biomes';
import { FUEL_TANKS } from '../data/economy';
import { MATERIAL_IDS, MATERIALS, RARITIES, type MaterialId } from '../data/materials';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { DRIVE_DEPTH, DriveView } from './DriveView';
import { cssColor, Panel } from './panel';
import { overlayStyle, textStyle } from './textStyles';
import { materialIconKey, moneyIconKey } from './textures';

const PAD = 32;
/** Height of the panel area under the road. */
const PANEL_HEIGHT = 470;
/** Space left at the bottom (the dev status line sits here). */
const BOTTOM_PAD = 48;

interface Button {
  rect: Phaser.GameObjects.Rectangle;
  label: Phaser.GameObjects.Text;
}

interface Bar {
  fill: Phaser.GameObjects.Rectangle;
  width: number;
}

/**
 * Drive tab: start a run, watch the car drive the biome road until its fuel or health runs
 * out, then see what it achieved. Every run starts at the Junkyard.
 */
export class DriveScene extends Phaser.Scene {
  private drive!: DriveView;
  private run: RunState | null = null;
  private results: Phaser.GameObjects.Container | null = null;
  private stageHeight = 0;

  // Stage overlay.
  private biomeLabel!: Phaser.GameObjects.Text;
  private speedLabel!: Phaser.GameObjects.Text;
  private banner!: Phaser.GameObjects.Text;

  // Before a run.
  private readonly preRun: Phaser.GameObjects.GameObject[] = [];
  private bestText!: Phaser.GameObjects.Text;
  private nextText!: Phaser.GameObjects.Text;
  private nextBar!: Bar;
  private tankIcons: Phaser.GameObjects.Rectangle[] = [];
  private fuelText!: Phaser.GameObjects.Text;
  private startButton!: Button;

  // During a run.
  private readonly duringRun: Phaser.GameObjects.GameObject[] = [];
  private distanceText!: Phaser.GameObjects.Text;
  private recordText!: Phaser.GameObjects.Text;
  private fuelBar!: Bar;
  private healthBar!: Bar;
  private aheadText!: Phaser.GameObjects.Text;
  private lastWholeFinds = {} as Record<MaterialId, number>;
  private readonly popupQueue: { label: string; color: number }[] = [];
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

    this.drive = new DriveView(this, width, this.stageHeight, this.ctx.model.activeCar, 'junkyard');
    this.createOverlay(width);

    const panelY = this.stageHeight + 20;
    this.add
      .rectangle(PAD, panelY, width - 2 * PAD, PANEL_HEIGHT - 32, COLORS.panel)
      .setOrigin(0)
      .setRounded(24)
      .setStrokeStyle(3, COLORS.panelBorder);
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
    }

    this.refreshTimer += dt;
    if (!this.run && this.refreshTimer >= 0.5) {
      this.refreshTimer = 0;
      this.refreshPreRun();
    }
  }

  private createOverlay(width: number): void {
    const d = DRIVE_DEPTH.overlay;
    this.biomeLabel = this.add.text(PAD, 24, '', overlayStyle(44, TEXT_COLORS.primary, true)).setDepth(d);
    this.speedLabel = this.add
      .text(width - PAD, 24, '', overlayStyle(40, cssColor(COLORS.accentAlt), true))
      .setOrigin(1, 0)
      .setDepth(d);
    this.banner = this.add
      .text(width / 2, this.stageHeight * 0.32, '', { ...overlayStyle(64, TEXT_COLORS.primary, true), align: 'center' })
      .setOrigin(0.5)
      .setDepth(d)
      .setAlpha(0);
    this.biomeLabel.setText(BIOMES_BY_ID.junkyard.name);
  }

  private createPreRun(width: number, top: number): void {
    const left = PAD + 32;
    const right = width - PAD - 32;
    const add = <T extends Phaser.GameObjects.GameObject>(obj: T) => {
      this.preRun.push(obj);
      return obj;
    };

    add(this.add.text(left, top + 26, 'BEST RUN', textStyle(24, TEXT_COLORS.muted, true)));
    this.bestText = add(this.add.text(left, top + 54, '', textStyle(52, TEXT_COLORS.primary, true)));

    this.nextText = add(this.add.text(left, top + 132, '', textStyle(26, TEXT_COLORS.secondary)));
    this.nextBar = this.makeBar(left, top + 178, right - left, 16, COLORS.accent, (o) => add(o));

    // Fuel tanks.
    add(this.add.text(left, top + 214, 'FUEL', textStyle(24, TEXT_COLORS.muted, true)));
    this.tankIcons = Array.from({ length: FUEL_TANKS.max }, (_, i) =>
      add(this.add.rectangle(left + 90 + i * 64, top + 226, 48, 30, COLORS.panelRaised).setOrigin(0, 0.5).setRounded(8)),
    );
    this.fuelText = add(
      this.add.text(left + 90 + FUEL_TANKS.max * 64 + 12, top + 226, '', textStyle(26, TEXT_COLORS.secondary)).setOrigin(0, 0.5),
    );

    this.startButton = this.makeButton(width / 2, top + 330, right - left, 112, 'Start run', COLORS.accent, () =>
      this.startRun(),
    );
    add(this.startButton.rect);
    add(this.startButton.label);
  }

  private createRunHud(width: number, top: number): void {
    const left = PAD + 32;
    const right = width - PAD - 32;
    const add = <T extends Phaser.GameObjects.GameObject>(obj: T) => {
      this.duringRun.push(obj);
      return obj;
    };

    add(this.add.text(left, top + 26, 'DISTANCE', textStyle(24, TEXT_COLORS.muted, true)));
    this.distanceText = add(this.add.text(left, top + 54, '', textStyle(64, TEXT_COLORS.primary, true)));
    this.recordText = add(this.add.text(right, top + 70, '', textStyle(28, TEXT_COLORS.secondary, true)).setOrigin(1, 0));

    add(this.add.text(left, top + 150, 'Fuel', textStyle(26, TEXT_COLORS.secondary)));
    this.fuelBar = this.makeBar(left + 130, top + 166, right - left - 130, 18, COLORS.money, (o) => add(o));
    add(this.add.text(left, top + 196, 'Health', textStyle(26, TEXT_COLORS.secondary)));
    this.healthBar = this.makeBar(left + 130, top + 212, right - left - 130, 18, 0x6fe08a, (o) => add(o));

    this.aheadText = add(this.add.text(left, top + 250, '', textStyle(26, TEXT_COLORS.secondary)));

    const skip = this.makeButton(width / 2, top + 340, right - left, 92, 'Skip to the end', COLORS.panelBorder, () =>
      this.skipRun(),
    );
    add(skip.rect);
    add(skip.label);
  }

  private makeBar(
    x: number,
    y: number,
    width: number,
    height: number,
    color: number,
    register: (obj: Phaser.GameObjects.GameObject) => void,
  ): Bar {
    register(this.add.rectangle(x, y, width, height, COLORS.panelRaised).setOrigin(0, 0.5).setRounded(height / 2));
    const fill = this.add.rectangle(x, y, width, height, color).setOrigin(0, 0.5).setRounded(height / 2);
    register(fill);
    return { fill, width };
  }

  private setBar(bar: Bar, ratio: number): void {
    const r = Phaser.Math.Clamp(ratio, 0, 1);
    bar.fill.setVisible(r > 0);
    bar.fill.setSize(Math.max(bar.fill.height, bar.width * r), bar.fill.height);
  }

  private makeButton(x: number, y: number, width: number, height: number, label: string, color: number, onClick: () => void): Button {
    const rect = this.add
      .rectangle(x, y, width, height, COLORS.panelRaised)
      .setRounded(24)
      .setStrokeStyle(3, color)
      .setInteractive({ useHandCursor: true });
    rect.on('pointerup', () => {
      if (rect.input?.enabled) onClick();
    });
    const text = this.add.text(x, y, label, textStyle(36, TEXT_COLORS.primary, true)).setOrigin(0.5);
    return { rect, label: text };
  }

  private showPreRun(): void {
    for (const obj of this.preRun) (obj as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(true);
    for (const obj of this.duringRun) (obj as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(false);
    this.speedLabel.setText('');
    this.refreshPreRun();
  }

  private showRunHud(): void {
    for (const obj of this.preRun) (obj as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(false);
    for (const obj of this.duringRun) (obj as Phaser.GameObjects.Components.Visible & Phaser.GameObjects.GameObject).setVisible(true);
  }

  private refreshPreRun(): void {
    const { model } = this.ctx;
    const record = model.state.run;
    this.bestText.setText(record.runsCompleted > 0 ? formatDistance(record.bestDistanceKm) : 'No runs yet');

    const next = nextDistanceMilestone(model.state);
    if (next) {
      const { current, target } = milestoneProgress(model.state, next.condition);
      this.nextText.setText(`Next: ${next.title} · reach ${formatDistance(target)}`);
      this.setBar(this.nextBar, current / target);
    } else {
      this.nextText.setText('Every milestone on the road reached. More road coming soon.');
      this.setBar(this.nextBar, 1);
    }

    const fuel = model.fuel();
    this.tankIcons.forEach((icon, i) => icon.setFillStyle(i < fuel.tanks ? COLORS.money : COLORS.panelRaised));
    this.fuelText.setText(
      fuel.tanks >= FUEL_TANKS.max ? 'Tanks full' : `Next tank in ${formatDuration(fuel.msUntilNext / 1000)}`,
    );
    const canStart = fuel.tanks >= 1;
    this.startButton.rect.setFillStyle(canStart ? COLORS.panelRaised : COLORS.panel);
    this.startButton.rect.setStrokeStyle(3, canStart ? COLORS.accent : COLORS.panelBorder);
    if (this.startButton.rect.input) this.startButton.rect.input.enabled = canStart;
    this.startButton.label.setText(canStart ? 'Start run' : `Out of fuel · ${formatDuration(fuel.msUntilNext / 1000)}`);
    this.startButton.label.setColor(canStart ? TEXT_COLORS.primary : TEXT_COLORS.muted);
  }

  private startRun(): void {
    if (this.run || this.results) return;
    const run = this.ctx.model.startRun();
    if (!run) return;
    this.run = run;
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
    this.biomeLabel.setText(run.biome.name);
    this.updateRunHud(run);
    this.endRun();
  }

  private enterBiome(biome: BiomeId): void {
    const def = BIOMES_BY_ID[biome];
    this.drive.setBiome(biome);
    this.biomeLabel.setText(def.name);
    this.banner.setText(def.name.toUpperCase());
    this.tweens.killTweensOf(this.banner);
    this.banner.setAlpha(0).setScale(0.9);
    this.tweens.chain({
      targets: this.banner,
      tweens: [
        { alpha: 1, scale: 1, duration: 300, ease: 'Back.easeOut' },
        { alpha: 1, duration: 1200 },
        { alpha: 0, duration: 400 },
      ],
    });
  }

  private updateRunHud(run: RunState): void {
    const best = this.ctx.model.state.run.bestDistanceKm;
    this.distanceText.setText(formatDistance(run.distanceKm));
    const firstRun = this.ctx.model.state.run.runsCompleted === 0;
    const beyondBest = !firstRun && run.distanceKm > best;
    this.recordText.setText(firstRun ? 'First run' : beyondBest ? 'NEW BEST!' : `Best ${formatDistance(best)}`);
    this.recordText.setColor(beyondBest ? TEXT_COLORS.accent : TEXT_COLORS.secondary);
    this.speedLabel.setText(`${formatNumber(run.speedKmh)} km/h`);
    this.setBar(this.fuelBar, run.fuel / run.car.tankSeconds);
    this.setBar(this.healthBar, run.health / run.car.maxHealth);

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
        if (this.popupQueue.length < 3) {
          this.popupQueue.push({ label: `+${gained} ${material.name}`, color: RARITIES[material.rarity].color });
        }
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
    this.showPopup(next.label, next.color);
  }

  private showPopup(label: string, color: number): void {
    const { car, scale } = this.drive;
    // Alternate left, centre and right so pop-ups in quick succession don't overlap.
    this.popupSlot = (this.popupSlot + 1) % 3;
    const x = car.x + (this.popupSlot - 1) * 170;
    const y = car.y - 31 * scale - 10;
    const popup = this.add.text(x, y, label, overlayStyle(32, cssColor(color), true)).setOrigin(0.5).setDepth(DRIVE_DEPTH.overlay);
    this.tweens.add({ targets: popup, y: y - 80, alpha: 0, duration: 1100, onComplete: () => popup.destroy() });
  }

  private endRun(): void {
    const run = this.run;
    if (!run) return;
    this.speedLabel.setText('');
    const summary = this.ctx.model.finishRun(run);
    // Let the car roll to a stop for a moment before the results appear.
    this.time.delayedCall(700, () => this.showResults(summary));
  }

  private showResults(summary: RunSummary): void {
    const { width, height } = this.cameras.main;
    const panel = new Panel(this, { area: { x: 0, y: 0, width, height }, align: 'center' });
    const reason = summary.endReason === 'breakdown' ? 'Your car broke down' : 'Out of fuel';
    panel.text('RUN OVER', 28, TEXT_COLORS.accent, { bold: true, gapAfter: 6 });
    panel.text(reason, 30, TEXT_COLORS.secondary, { gapAfter: 10 });
    panel.text(formatDistance(summary.distanceKm), 88, TEXT_COLORS.primary, { bold: true, gapAfter: 4 });
    panel.text(
      summary.newBest ? 'New best distance!' : `Best: ${formatDistance(Math.max(summary.previousBestKm, summary.distanceKm))}`,
      30,
      summary.newBest ? TEXT_COLORS.accent : TEXT_COLORS.secondary,
      { bold: summary.newBest, gapAfter: 20 },
    );
    panel.divider(12);

    panel.row({
      icon: moneyIconKey(this),
      iconScale: 3,
      title: 'Distance pay',
      value: `+${formatPrecise(summary.money)}`,
      valueColor: cssColor(COLORS.money),
      size: 28,
      gapAfter: 6,
    });
    if (summary.bonusMoney > 0) {
      panel.row({
        icon: moneyIconKey(this),
        iconScale: 3,
        title: 'New ground bonus',
        value: `+${formatPrecise(summary.bonusMoney)}`,
        valueColor: cssColor(COLORS.money),
        size: 28,
        gapAfter: 6,
      });
    }
    for (const material of MATERIALS) {
      const amount = summary.finds[material.id];
      if (amount < 0.01) continue;
      panel.row({
        icon: materialIconKey(this, material.id),
        iconScale: 3,
        title: material.name,
        titleColor: cssColor(RARITIES[material.rarity].color),
        value: `+${formatPrecise(amount)}`,
        size: 28,
        gapAfter: 6,
      });
    }
    for (const milestone of summary.milestones) {
      panel.text(`★ ${milestone.title}`, 30, TEXT_COLORS.accent, { bold: true, gapAfter: 4 });
    }
    panel.gap(18);
    panel.button('Back to the start', { onClick: () => this.closeResults() });
    this.results = panel.finish();
  }

  private closeResults(): void {
    this.results?.destroy();
    this.results = null;
    this.run = null;
    this.drive.setBiome('junkyard', true);
    this.drive.resetScroll();
    this.biomeLabel.setText(BIOMES_BY_ID.junkyard.name);
    this.showPreRun();
  }
}
