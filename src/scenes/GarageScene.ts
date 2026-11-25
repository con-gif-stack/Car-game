import Phaser from 'phaser';
import { computeCarStats, getActiveCar, getPart, type SlotDef } from '../core/vehicle';
import { CAR_MODELS, QUALITIES, SLOTS, STATS } from '../data/vehicles';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';
import { CarView } from './CarView';
import type { AppContext } from './context';

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

/**
 * Garage tab: shows the active car, its stats, and the part installed in each slot.
 * Tapping a part opens its details.
 */
export class GarageScene extends Phaser.Scene {
  private readonly statRows = new Map<string, StatRow>();
  private readonly partCards: PartCard[] = [];
  private carName!: Phaser.GameObjects.Text;
  private carDescription!: Phaser.GameObjects.Text;
  private modal: Phaser.GameObjects.Container | null = null;

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

  /** Re-reads the car from the game state and updates every label and bar. */
  refresh(): void {
    const garage = this.ctx.model.state.garage;
    const car = getActiveCar(garage);
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
    // Back wall: corrugated panels with a neon strip.
    this.add.rectangle(0, 0, width, height, 0x10102a).setOrigin(0);
    for (let x = 45; x < width; x += 90) {
      this.add.rectangle(x, 0, 4, height, 0x15153a).setOrigin(0.5, 0);
    }
    this.add.rectangle(width / 2, 36, width - 2 * PAD, 18, COLORS.accent, 0.12).setOrigin(0.5);
    this.add.rectangle(width / 2, 36, width - 2 * PAD, 5, COLORS.accent, 0.9).setOrigin(0.5);

    // Floor.
    const floorY = height - 110;
    this.add.rectangle(0, floorY, width, height - floorY, 0x181830).setOrigin(0);
    this.add.rectangle(0, floorY, width, 3, COLORS.panelBorder).setOrigin(0);

    this.carName = this.add.text(PAD, 70, '', text(56, TEXT_COLORS.primary, true));
    this.carDescription = this.add.text(PAD, 136, '', {
      ...text(28, TEXT_COLORS.secondary),
      wordWrap: { width: width - 2 * PAD },
    });

    // Largest whole-number pixel scale that fits the space.
    const groundY = height - 60;
    const fitScale = Math.min((width - 160) / CarView.widthAt(1), (groundY - 190) / CarView.heightAt(1));
    const scale = Phaser.Math.Clamp(Math.floor(fitScale), 5, 12);
    const car = new CarView(this, width / 2, groundY, scale);
    car.startIdleShudder(scale);
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

      const qualityStrip = this.add.rectangle(x + 14, cardY + 24, 6, CARD_HEIGHT - 48, COLORS.panelBorder).setOrigin(0);
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
    const { width, height } = this.cameras.main;
    const car = getActiveCar(this.ctx.model.state.garage);
    const part = getPart(car.parts[slot.id]);

    const items: Phaser.GameObjects.GameObject[] = [];
    // Dimmed backdrop: tapping it closes the details.
    const dim = this.add.rectangle(0, 0, width, height, 0x000000, 0.65).setOrigin(0).setInteractive();
    dim.on('pointerup', () => this.closeModal());
    items.push(dim);

    const panelWidth = width - 2 * PAD - 40;
    const panelX = (width - panelWidth) / 2;
    const left = panelX + 48;
    const textWidth = panelWidth - 96;

    const lines: Phaser.GameObjects.GameObject[] = [];
    let y = 0;
    const addLine = (obj: Phaser.GameObjects.Text, spacingAfter: number) => {
      obj.setPosition(left, y);
      lines.push(obj);
      y += obj.height + spacingAfter;
    };

    addLine(this.add.text(0, 0, slot.label.toUpperCase(), text(26, TEXT_COLORS.accent, true)), 10);
    addLine(this.add.text(0, 0, part?.name ?? 'Empty slot', text(52, TEXT_COLORS.primary, true)), 12);
    if (part) {
      const quality = QUALITIES[part.quality];
      const tag = this.add.text(0, 0, quality.label, text(28, '#ffffff', true));
      tag.setColor(`#${quality.color.toString(16).padStart(6, '0')}`);
      addLine(tag, 20);
    }
    addLine(
      this.add.text(0, 0, part?.description ?? `No ${slot.label.toLowerCase()} fitted yet.`, {
        ...text(30, TEXT_COLORS.secondary),
        wordWrap: { width: textWidth },
      }),
      32,
    );

    addLine(this.add.text(0, 0, 'ADDS TO YOUR CAR', text(24, TEXT_COLORS.muted, true)), 12);
    const bonuses = STATS.filter((stat) => (part?.stats[stat.id] ?? 0) !== 0);
    if (bonuses.length === 0) {
      addLine(this.add.text(0, 0, 'Nothing yet', text(32, TEXT_COLORS.primary)), 12);
    }
    for (const stat of bonuses) {
      const amount = part?.stats[stat.id] ?? 0;
      const label = `+${amount}${stat.unit ? ` ${stat.unit}` : ''}  ${stat.label}`;
      addLine(this.add.text(0, 0, label, text(32, TEXT_COLORS.primary)), 10);
    }
    y += 24;
    addLine(this.add.text(0, 0, 'Part upgrades are coming soon.', text(26, TEXT_COLORS.muted)), 32);

    const buttonHeight = 96;
    const panelHeight = y + buttonHeight + 48 + 48;
    const panelY = Math.max(PAD, (height - panelHeight) / 2);

    const panel = this.add
      .rectangle(panelX, panelY, panelWidth, panelHeight, COLORS.panel)
      .setOrigin(0)
      .setRounded(28)
      .setStrokeStyle(3, COLORS.panelBorder)
      .setInteractive(); // Swallows taps so they don't reach the backdrop.
    items.push(panel);

    for (const line of lines) {
      const t = line as Phaser.GameObjects.Text;
      t.y += panelY + 48;
      items.push(t);
    }

    const buttonY = panelY + panelHeight - 48 - buttonHeight;
    const button = this.add
      .rectangle(width / 2, buttonY, panelWidth - 96, buttonHeight, COLORS.panelRaised)
      .setOrigin(0.5, 0)
      .setRounded(24)
      .setStrokeStyle(3, COLORS.accent)
      .setInteractive({ useHandCursor: true });
    button.on('pointerup', () => this.closeModal());
    const buttonLabel = this.add
      .text(width / 2, buttonY + buttonHeight / 2, 'Close', text(34, TEXT_COLORS.primary, true))
      .setOrigin(0.5);
    items.push(button, buttonLabel);

    this.modal = this.add.container(0, 0, items).setDepth(1000);
  }

  private closeModal(): void {
    this.modal?.destroy();
    this.modal = null;
  }
}
