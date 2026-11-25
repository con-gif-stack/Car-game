import Phaser from 'phaser';
import { formatDistance, formatPrecise } from '../core/format';
import { computeCarStats, getActiveCar, getPart, type SlotDef } from '../core/vehicle';
import { CAR_MODELS, QUALITIES, SLOTS, STATS } from '../data/vehicles';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { cssColor, openDialog, type DialogLine } from './dialog';
import { DriveView } from './DriveView';

const PAD = 32;
const SECTION_GAP = 24;
/** Space left under the parts grid (the dev status line sits here). */
const BOTTOM_PAD = 48;
const STAT_ROW_HEIGHT = 52;
const STATS_PANEL_HEIGHT = 24 + STATS.length * STAT_ROW_HEIGHT + 16;
const CARD_COLUMNS = 4;
const CARD_HEIGHT = 150;
const CARD_GAP = 16;
const PARTS_HEADER = 44;
const PARTS_SECTION_HEIGHT = PARTS_HEADER + 2 * CARD_HEIGHT + CARD_GAP;
/** Seconds between "+money" pop-ups over the car. */
const POPUP_INTERVAL = 1;

interface StatRow {
  fill: Phaser.GameObjects.Rectangle;
  value: Phaser.GameObjects.Text;
  barWidth: number;
}

interface PartCard {
  slot: SlotDef;
  background: Phaser.GameObjects.Rectangle;
  qualityStrip: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
}

const text = (size: number, color: string, bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
  fontFamily: FONT_FAMILY,
  fontSize: `${size}px`,
  color,
  fontStyle: bold ? 'bold' : 'normal',
});

/** Text drawn over the scenery gets a dark outline so it stays readable on a bright sky. */
const overlayText = (size: number, color: string, bold = false): Phaser.Types.GameObjects.Text.TextStyle => ({
  ...text(size, color, bold),
  stroke: '#0b0b14',
  strokeThickness: Math.max(4, Math.round(size / 7)),
});

/**
 * Garage tab: the active car idle-driving at the top, then its stats and the part installed
 * in each slot. Tapping a part opens its details.
 */
export class GarageScene extends Phaser.Scene {
  private readonly statRows = new Map<string, StatRow>();
  private readonly partCards: PartCard[] = [];
  private drive!: DriveView;
  private carName!: Phaser.GameObjects.Text;
  private carDescription!: Phaser.GameObjects.Text;
  private rateText!: Phaser.GameObjects.Text;
  private tripText!: Phaser.GameObjects.Text;
  private modal: Phaser.GameObjects.Container | null = null;
  private popupTimer = 0;

  constructor(private readonly ctx: AppContext) {
    super({ key: 'GarageTab' });
  }

  create(): void {
    const { content } = this.ctx.layout;
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);

    const width = content.width;
    const stageHeight =
      content.height - BOTTOM_PAD - PARTS_SECTION_HEIGHT - STATS_PANEL_HEIGHT - 2 * SECTION_GAP;
    const statsY = stageHeight + SECTION_GAP;
    const partsY = statsY + STATS_PANEL_HEIGHT + SECTION_GAP;

    this.createStage(width, stageHeight);
    this.createStatsPanel(width, statsY);
    this.createPartsGrid(width, partsY);
    this.refresh();

    this.events.on(Phaser.Scenes.Events.WAKE, () => this.refresh());
    this.input.keyboard?.on('keydown-ESC', () => this.closeModal());
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const { model } = this.ctx;
    const rates = model.idleRates();
    this.drive.update(dt, rates.speedKmh);

    const rate = `+${formatPrecise(rates.moneyPerSecond)}/s`;
    if (this.rateText.text !== rate) this.rateText.setText(rate);
    const trip = `${Math.round(rates.speedKmh)} km/h · ${formatDistance(model.state.stats.distanceKm)}`;
    if (this.tripText.text !== trip) this.tripText.setText(trip);

    this.popupTimer += dt;
    if (this.popupTimer >= POPUP_INTERVAL) {
      this.popupTimer = 0;
      this.showMoneyPopup(rates.moneyPerSecond * POPUP_INTERVAL);
    }
  }

  /** Re-reads the car from the game state and updates every label and bar. */
  refresh(): void {
    const car = getActiveCar(this.ctx.model.state.garage);
    const model = CAR_MODELS[car.modelId];
    this.carName.setText(model?.name ?? 'Unknown car');
    this.carDescription.setText(model?.description ?? '');

    const stats = computeCarStats(car);
    for (const stat of STATS) {
      const row = this.statRows.get(stat.id);
      if (!row) continue;
      const value = stats[stat.id];
      const ratio = Phaser.Math.Clamp(value / stat.displayMax, 0, 1);
      row.fill.setSize(Math.max(row.fill.height, row.barWidth * ratio), row.fill.height);
      row.value.setText(stat.unit ? `${Math.round(value)} ${stat.unit}` : `${Math.round(value)}`);
    }

    for (const card of this.partCards) {
      const part = getPart(car.parts[card.slot.id]);
      card.name.setText(part ? part.name : 'Empty');
      card.name.setColor(part ? TEXT_COLORS.primary : TEXT_COLORS.muted);
      card.background.setFillStyle(part ? COLORS.panelRaised : COLORS.panel);
      card.qualityStrip.setVisible(part !== null);
      if (part) card.qualityStrip.setFillStyle(QUALITIES[part.quality].color);
    }
  }

  private createStage(width: number, height: number): void {
    this.drive = new DriveView(this, width, height);

    this.carName = this.add.text(PAD, 24, '', overlayText(52, TEXT_COLORS.primary, true));
    this.carDescription = this.add.text(PAD, 88, '', {
      ...overlayText(26, TEXT_COLORS.primary),
      wordWrap: { width: width * 0.64 },
    });
    this.rateText = this.add
      .text(width - PAD, 24, '', overlayText(48, cssColor(COLORS.money), true))
      .setOrigin(1, 0);
    this.tripText = this.add
      .text(width - PAD, 86, '', overlayText(26, TEXT_COLORS.primary))
      .setOrigin(1, 0);
  }

  /** A "+1.07" floating up from the car and fading out. */
  private showMoneyPopup(amount: number): void {
    if (amount <= 0) return;
    const { car, scale } = this.drive;
    const x = car.x + Phaser.Math.Between(-60, 60);
    const y = car.y - 31 * scale - 20;
    const popup = this.add
      .text(x, y, `+${formatPrecise(amount)}`, overlayText(36, cssColor(COLORS.money), true))
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: popup,
      y: y - 90,
      alpha: 0,
      duration: 1100,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  private createStatsPanel(width: number, y: number): void {
    this.add
      .rectangle(PAD, y, width - 2 * PAD, STATS_PANEL_HEIGHT, COLORS.panel)
      .setOrigin(0)
      .setRounded(24)
      .setStrokeStyle(3, COLORS.panelBorder);

    const labelX = PAD + 32;
    const barX = PAD + 320;
    const barWidth = width - PAD - 170 - barX;
    const barHeight = 18;

    STATS.forEach((stat, i) => {
      const rowY = y + 24 + i * STAT_ROW_HEIGHT + STAT_ROW_HEIGHT / 2;
      this.add.text(labelX, rowY, stat.label, text(30, TEXT_COLORS.secondary)).setOrigin(0, 0.5);
      this.add
        .rectangle(barX, rowY, barWidth, barHeight, COLORS.panelRaised)
        .setOrigin(0, 0.5)
        .setRounded(barHeight / 2);
      const fill = this.add
        .rectangle(barX, rowY, barHeight, barHeight, COLORS.accentAlt)
        .setOrigin(0, 0.5)
        .setRounded(barHeight / 2);
      const value = this.add
        .text(width - PAD - 32, rowY, '', text(30, TEXT_COLORS.primary, true))
        .setOrigin(1, 0.5);
      this.statRows.set(stat.id, { fill, value, barWidth });
    });
  }

  private createPartsGrid(width: number, y: number): void {
    this.add.text(PAD, y, 'PARTS', text(26, TEXT_COLORS.accent, true)).setOrigin(0, 0);
    this.add
      .text(width - PAD, y, 'Tap a part for details', text(24, TEXT_COLORS.muted))
      .setOrigin(1, 0);

    const cardWidth = (width - 2 * PAD - (CARD_COLUMNS - 1) * CARD_GAP) / CARD_COLUMNS;
    SLOTS.forEach((slot, i) => {
      const x = PAD + (i % CARD_COLUMNS) * (cardWidth + CARD_GAP);
      const cardY = y + PARTS_HEADER + Math.floor(i / CARD_COLUMNS) * (CARD_HEIGHT + CARD_GAP);

      const background = this.add
        .rectangle(x, cardY, cardWidth, CARD_HEIGHT, COLORS.panelRaised)
        .setOrigin(0)
        .setRounded(18)
        .setStrokeStyle(3, COLORS.panelBorder)
        .setInteractive({ useHandCursor: true });
      background.on('pointerup', () => this.openPartDetails(slot));

      const qualityStrip = this.add
        .rectangle(x + 14, cardY + 24, 6, CARD_HEIGHT - 48, COLORS.panelBorder)
        .setOrigin(0);
      this.add.text(x + 32, cardY + 20, slot.label, text(22, TEXT_COLORS.secondary));
      const name = this.add.text(x + 32, cardY + 54, '', {
        ...text(26, TEXT_COLORS.primary, true),
        wordWrap: { width: cardWidth - 48 },
      });
      this.partCards.push({ slot, background, qualityStrip, name });
    });
  }

  private openPartDetails(slot: SlotDef): void {
    this.closeModal();
    const car = getActiveCar(this.ctx.model.state.garage);
    const part = getPart(car.parts[slot.id]);

    const lines: DialogLine[] = [
      { text: slot.label.toUpperCase(), size: 26, color: TEXT_COLORS.accent, bold: true, gapAfter: 10 },
      { text: part?.name ?? 'Empty slot', size: 52, color: TEXT_COLORS.primary, bold: true },
    ];
    if (part) {
      const quality = QUALITIES[part.quality];
      lines.push({ text: quality.label, size: 28, color: cssColor(quality.color), bold: true, gapAfter: 20 });
    }
    lines.push(
      {
        text: part?.description ?? `No ${slot.label.toLowerCase()} fitted yet.`,
        size: 30,
        color: TEXT_COLORS.secondary,
        gapAfter: 32,
      },
      { text: 'ADDS TO YOUR CAR', size: 24, color: TEXT_COLORS.muted, bold: true },
    );
    const bonuses = STATS.filter((stat) => (part?.stats[stat.id] ?? 0) !== 0);
    if (bonuses.length === 0) lines.push({ text: 'Nothing yet', size: 32, color: TEXT_COLORS.primary });
    for (const stat of bonuses) {
      const amount = part?.stats[stat.id] ?? 0;
      lines.push({
        text: `+${amount}${stat.unit ? ` ${stat.unit}` : ''}  ${stat.label}`,
        size: 32,
        color: TEXT_COLORS.primary,
        gapAfter: 10,
      });
    }
    lines.push({ text: 'Part upgrades are coming soon.', size: 26, color: TEXT_COLORS.muted, gapAfter: 0 });

    const { width, height } = this.cameras.main;
    this.modal = openDialog(this, {
      area: { x: 0, y: 0, width, height },
      lines,
      buttonLabel: 'Close',
      onButton: () => this.closeModal(),
      onBackdrop: () => this.closeModal(),
    });
  }

  private closeModal(): void {
    this.modal?.destroy();
    this.modal = null;
  }
}
