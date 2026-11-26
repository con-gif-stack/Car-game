import Phaser from 'phaser';
import { formatDistance } from '../core/format';
import type { PurchaseKind } from '../core/GameModel';
import { garageUpgradeCost } from '../core/garage';
import { canAfford, levelUpCost, nextTierPart, salvageMagnetCost, tierCost } from '../core/upgrades';
import { GARAGE_UPGRADES } from '../data/garage';
import { computeCarStats, getInstalledPart, type SlotDef, type SlotId } from '../core/vehicle';
import { PART_LEVELS } from '../data/economy';
import { CAR_MODELS, QUALITIES, SLOTS, STATS } from '../data/vehicles';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { DriveView } from './DriveView';
import { cssColor } from './panel';
import { openPartPanel, openWorkshopPanel, panelSignature, type WorkshopPage } from './panels';
import { fontPx, overlayStyle, textStyle, wrapStyle } from './textStyles';
import { addButton, addDot, addFrame, PixelBar, restyleFrame } from './ui';

const PAD = 32;
const SECTION_GAP = 24;
/** Space left under the parts grid (the dev status line sits here). */
const BOTTOM_PAD = 48;
const STAT_ROW_HEIGHT = 52;
const STATS_PANEL_HEIGHT = 24 + STATS.length * STAT_ROW_HEIGHT + 16;
const CARD_COLUMNS = 4;
const CARD_HEIGHT = 150;
const CARD_GAP = 16;
const PARTS_HEADER = 56;
const PARTS_SECTION_HEIGHT = PARTS_HEADER + 2 * CARD_HEIGHT + CARD_GAP;
/** Seconds between checks for whether an open panel needs redrawing. */
const PANEL_REFRESH_INTERVAL = 0.25;

interface StatRow {
  bar: PixelBar;
  value: Phaser.GameObjects.Text;
}

interface PartCard {
  slot: SlotDef;
  background: Phaser.GameObjects.Image;
  qualityStrip: Phaser.GameObjects.Rectangle;
  name: Phaser.GameObjects.Text;
  level: Phaser.GameObjects.Text;
  badge: Phaser.GameObjects.Image;
}

type OpenPanel = { kind: 'part'; slot: SlotDef } | { kind: 'workshop'; page: WorkshopPage };

const text = textStyle;
const overlayText = overlayStyle;

/**
 * Garage tab: the active car in the showroom at the top, then its stats and the part in each slot.
 * Tapping a part opens its panel, where it can be levelled up or replaced with the next tier.
 */
export class GarageScene extends Phaser.Scene {
  private readonly statRows = new Map<string, StatRow>();
  private readonly partCards: PartCard[] = [];
  private drive!: DriveView;
  private carName!: Phaser.GameObjects.Text;
  private carDescription!: Phaser.GameObjects.Text;
  private bestRunText!: Phaser.GameObjects.Text;

  private panel: Phaser.GameObjects.Container | null = null;
  private workshopDot: Phaser.GameObjects.Image | null = null;
  private openPanel: OpenPanel | null = null;
  private panelSignature = '';
  private panelTimer = 0;


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

    const unsubscribe = this.ctx.model.events.on('purchased', (kind, slot) => this.onPurchased(kind, slot));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.refresh());
    this.input.keyboard?.on('keydown-ESC', () => this.closePanel());
  }

  update(_time: number, deltaMs: number): void {
    const dt = deltaMs / 1000;
    const { model } = this.ctx;
    // The car is parked in the showroom: only the clouds drift. Runs happen in the Drive tab.
    this.drive.update(dt, 0);
    const record = model.state.run;
    this.setText(
      this.bestRunText,
      record.runsCompleted > 0 ? `Best run ${formatDistance(record.bestDistanceKm)}` : 'No runs yet',
    );

    // Redraw an open panel, and the part cards' badges, when anything shown has changed.
    this.panelTimer += dt;
    if (this.panelTimer >= PANEL_REFRESH_INTERVAL) {
      this.panelTimer = 0;
      const signature = panelSignature(model);
      if (signature !== this.panelSignature) {
        this.panelSignature = signature;
        this.refreshCards();
        if (this.openPanel) this.showPanel(this.openPanel);
      }
    }
  }

  /** Re-reads the car from the game state and updates the car, labels, bars and cards. */
  refresh(): void {
    const car = this.ctx.model.activeCar;
    const model = CAR_MODELS[car.modelId];
    this.carName.setText(model?.name ?? 'Unknown car');
    this.carDescription.setText(model?.description ?? '');
    this.drive.car.setCar(car);

    const stats = computeCarStats(car);
    for (const stat of STATS) {
      const row = this.statRows.get(stat.id);
      if (!row) continue;
      const value = stats[stat.id];
      row.bar.set(value / stat.displayMax);
      row.value.setText(stat.unit ? `${Math.round(value)} ${stat.unit}` : `${Math.round(value)}`);
    }
    this.refreshCards();
  }

  private refreshCards(): void {
    const car = this.ctx.model.activeCar;
    const resources = this.ctx.model.state.resources;
    for (const card of this.partCards) {
      const part = getInstalledPart(car, card.slot.id);
      const level = car.parts[card.slot.id]?.level ?? 1;
      card.name.setText(part ? part.name : 'Empty');
      // Long names (e.g. "Race Adjustable Coilovers") shrink to stay within two lines.
      card.name.setFontSize(fontPx(24));
      if (card.name.height > 70) card.name.setFontSize(fontPx(19));
      card.name.setColor(part ? TEXT_COLORS.primary : TEXT_COLORS.muted);
      restyleFrame(card.background, 'card', part ? QUALITIES[part.quality].color : COLORS.panelBorder);
      card.background.setAlpha(part ? 1 : 0.6);
      card.qualityStrip.setVisible(part !== null);
      if (part) {
        const color = QUALITIES[part.quality].color;
        card.qualityStrip.setFillStyle(color);
        card.level.setText(`${QUALITIES[part.quality].label} · Lv ${level}/${PART_LEVELS.maxLevel}`);
        card.level.setColor(cssColor(color));
      } else {
        card.level.setText('');
      }
      // Badge: something for this slot can be bought right now.
      const next = nextTierPart(car, card.slot.id);
      const levelCost = part ? levelUpCost(part, level) : null;
      const affordable =
        (next !== null && canAfford(resources, tierCost(next))) || (levelCost !== null && canAfford(resources, levelCost));
      card.badge.setVisible(affordable);
    }
    // Workshop: a dot when any garage upgrade or the magnet can be bought.
    const { workshop } = this.ctx.model.state;
    const costs = [...GARAGE_UPGRADES.map((u) => garageUpgradeCost(workshop, u.id)), salvageMagnetCost(workshop.salvageMagnetLevel)];
    this.workshopDot?.setVisible(costs.some((c) => c !== null && canAfford(resources, c)));
  }

  private onPurchased(kind: PurchaseKind, slot: SlotId | null): void {
    const lookChanged = this.drive.car.setCar(this.ctx.model.activeCar);
    this.refresh();
    if (kind === 'tier' && slot) {
      const part = getInstalledPart(this.ctx.model.activeCar, slot);
      if (part) this.showPopup(`${part.name} installed!`, QUALITIES[part.quality].color);
    } else if (kind === 'level' && slot) {
      this.showPopup(`Level ${this.ctx.model.activeCar.parts[slot]?.level ?? ''}!`, COLORS.accentAlt);
    } else if (kind === 'garage') {
      this.showPopup('Garage upgraded!', COLORS.accentAlt);
    } else if (kind === 'salvageMagnet') {
      this.showPopup('Magnet upgraded!', COLORS.accentAlt);
    }
    if (lookChanged) this.cameras.main.flash(180, 255, 255, 255, false);
    if (this.openPanel) this.showPanel(this.openPanel);
  }

  private setText(target: Phaser.GameObjects.Text, value: string): void {
    if (target.text !== value) target.setText(value);
  }

  private createStage(width: number, height: number): void {
    this.drive = new DriveView(this, width, height, this.ctx.model.activeCar);
    this.drive.car.startIdleShudder();

    this.carName = this.add.text(PAD, 24, '', overlayText(52, TEXT_COLORS.primary, true));
    this.carDescription = this.add.text(PAD, 88, '', {
      ...overlayText(24, TEXT_COLORS.primary),
      wordWrap: { width: width * 0.64 },
    });
    this.bestRunText = this.add
      .text(width - PAD, 30, '', overlayText(30, cssColor(COLORS.accentAlt), true))
      .setOrigin(1, 0);
  }

  /** Text that floats up from the car and fades out. */
  private showPopup(label: string, color: number, side: 'left' | 'center' | 'right' = 'center'): void {
    const { car, scale } = this.drive;
    const offset = side === 'left' ? -150 : side === 'right' ? 150 : 0;
    const x = car.x + offset + Phaser.Math.Between(-40, 40);
    const y = car.y - 31 * scale - 20;
    const popup = this.add
      .text(x, y, label, overlayText(34, cssColor(color), true))
      .setOrigin(0.5)
      .setDepth(10);
    this.tweens.add({
      targets: popup,
      y: y - 90,
      alpha: 0,
      duration: 1300,
      ease: 'Cubic.easeOut',
      onComplete: () => popup.destroy(),
    });
  }

  private createStatsPanel(width: number, y: number): void {
    addFrame(this, PAD, y, width - 2 * PAD, STATS_PANEL_HEIGHT);

    const labelX = PAD + 32;
    const barX = PAD + 320;
    const barWidth = width - PAD - 170 - barX;
    const barHeight = 24;

    STATS.forEach((stat, i) => {
      const rowY = y + 24 + i * STAT_ROW_HEIGHT + STAT_ROW_HEIGHT / 2;
      this.add.text(labelX, rowY, stat.label, text(28, TEXT_COLORS.secondary)).setOrigin(0, 0.5);
      const bar = new PixelBar(this, barX, rowY, barWidth, barHeight, COLORS.accentAlt, { segment: 6 });
      const value = this.add
        .text(width - PAD - 32, rowY, '', text(28, TEXT_COLORS.primary, true))
        .setOrigin(1, 0.5);
      this.statRows.set(stat.id, { bar, value });
    });
  }

  private createPartsGrid(width: number, y: number): void {
    this.add.text(PAD, y + 4, 'PARTS', overlayText(28, TEXT_COLORS.warm, true)).setOrigin(0, 0);

    // Workshop button: garage-wide upgrades.
    const buttonWidth = 220;
    addButton(this, width - PAD - buttonWidth / 2, y + 22, buttonWidth, 48, 'Workshop', {
      onClick: () => this.showPanel({ kind: 'workshop', page: 'menu' }),
      tone: 'secondary',
      fontSize: 24,
    });
    this.workshopDot = addDot(this, width - PAD - 8, y + 2).setVisible(false);

    const cardWidth = (width - 2 * PAD - (CARD_COLUMNS - 1) * CARD_GAP) / CARD_COLUMNS;
    SLOTS.forEach((slot, i) => {
      const x = PAD + (i % CARD_COLUMNS) * (cardWidth + CARD_GAP);
      const cardY = y + PARTS_HEADER + Math.floor(i / CARD_COLUMNS) * (CARD_HEIGHT + CARD_GAP);

      const background = addFrame(this, x, cardY, cardWidth, CARD_HEIGHT, { kind: 'card' }).setInteractive({
        useHandCursor: true,
      });
      background.on('pointerdown', () => background.setY(cardY + 4));
      background.on('pointerout', () => background.setY(cardY));
      background.on('pointerup', () => {
        background.setY(cardY);
        this.showPanel({ kind: 'part', slot });
      });

      const qualityStrip = this.add
        .rectangle(x + 14, cardY + 20, 6, CARD_HEIGHT - 40, COLORS.panelBorder)
        .setOrigin(0);
      this.add.text(x + 32, cardY + 16, slot.label, text(21, TEXT_COLORS.secondary));
      const name = this.add.text(x + 32, cardY + 44, '', wrapStyle(24, TEXT_COLORS.primary, cardWidth - 48, true));
      const level = this.add.text(x + 32, cardY + CARD_HEIGHT - 16, '', text(20, TEXT_COLORS.secondary, true)).setOrigin(0, 1);
      const badge = addDot(this, x + cardWidth - 20, cardY + 20).setVisible(false);
      this.partCards.push({ slot, background, qualityStrip, name, level, badge });
    });
  }

  /** Opens (or redraws) a panel over the tab. */
  private showPanel(which: OpenPanel): void {
    // Only pop in when newly opened, not when redrawing the panel already on screen.
    const key = (p: OpenPanel | null) => (p ? (p.kind === 'part' ? p.slot.id : `${p.kind}/${p.page}`) : '');
    const animate = key(this.openPanel) !== key(which);
    this.panel?.destroy();
    this.openPanel = which;
    this.panelSignature = panelSignature(this.ctx.model);
    const { width, height } = this.cameras.main;
    const area = { x: 0, y: 0, width, height };
    const close = () => this.closePanel();
    this.panel =
      which.kind === 'part'
        ? openPartPanel(this, this.ctx.model, which.slot, area, close, animate)
        : openWorkshopPanel(this, this.ctx.model, area, close, animate, which.page, (page) =>
            this.showPanel({ kind: 'workshop', page }),
          );
  }

  private closePanel(): void {
    this.panel?.destroy();
    this.panel = null;
    this.openPanel = null;
  }
}
