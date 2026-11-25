import Phaser from 'phaser';
import { formatDistance, formatDuration, formatNumber, formatPrecise } from '../core/format';
import type { PendingOffline } from '../core/state';
import { getActiveCar } from '../core/vehicle';
import { BIOMES_BY_ID } from '../data/biomes';
import { ECONOMY, FUEL_TANKS } from '../data/economy';
import { MATERIALS_BY_ID } from '../data/materials';
import type { MilestoneDef } from '../data/milestones';
import { MATERIALS, RARITIES } from '../data/materials';
import { CAR_MODELS } from '../data/vehicles';
import { drawTabIcon } from '../ui/icons';
import { TABS, type TabDef } from '../ui/tabs';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { cssColor, Panel } from './panel';
import { openInventoryPanel } from './panels';
import { materialIconKey, moneyIconKey } from './textures';

/** Most material icons shown in the top bar's Materials button. */
const HUD_MATERIAL_ICONS = 5;

/** How long a milestone banner stays up (ms). */
const BANNER_HOLD_MS = 3500;

interface TabButton {
  tab: TabDef;
  background: Phaser.GameObjects.Rectangle;
  indicator: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
  /** Dot shown when the tab needs attention (e.g. Drive with full fuel tanks). */
  dot: Phaser.GameObjects.Arc;
  centerX: number;
  iconY: number;
}

/**
 * Always-on screen layer: the currency bar at the top and the tab bar at the bottom.
 * It also switches which tab screen is shown in the space between them.
 */
export class UIScene extends Phaser.Scene {
  private activeTab: TabDef | null = null;
  private readonly tabButtons: TabButton[] = [];
  private moneyText!: Phaser.GameObjects.Text;
  /** Icons of the materials held, in the Materials button. */
  private materialIcons: Phaser.GameObjects.Image[] = [];
  private materialIconsSignature = '';
  private materialIconsX = 0;
  private materialIconsY = 0;
  private debugText: Phaser.GameObjects.Text | null = null;
  private welcomeDialog: Phaser.GameObjects.Container | null = null;
  private readonly bannerQueue: MilestoneDef[] = [];
  private banner: Phaser.GameObjects.Container | null = null;
  private dotTimer = 0;
  private inventory: Phaser.GameObjects.Container | null = null;

  constructor(private readonly ctx: AppContext) {
    super({ key: 'UI', active: true });
  }

  create(): void {
    this.createHud();
    this.createTabBar();
    if (import.meta.env.DEV) this.createDebugOverlay();

    // Desktop shortcut: number keys 1–4 switch tabs.
    this.input.keyboard?.on('keydown', (event: KeyboardEvent) => {
      if (this.welcomeDialog) {
        if (event.key === 'Enter') this.collectOffline();
        return;
      }
      if (this.inventory) {
        if (event.key === 'Escape') this.closeInventory();
        return;
      }
      const tab = TABS[Number(event.key) - 1];
      if (tab) this.showTab(tab);
    });

    const firstTab = TABS[0];
    if (firstTab) this.showTab(firstTab);

    // Offline earnings: waiting from before this session, or arriving after the game resumes.
    const { model } = this.ctx;
    if (model.state.pendingOffline.money > 0) this.showWelcomeBack(model.state.pendingOffline);
    model.events.on('offlineEarnings', (pending) => this.showWelcomeBack(pending));
    model.events.on('milestoneReached', (milestone) => {
      this.bannerQueue.push(milestone);
      if (!this.banner) this.showNextBanner();
    });
  }

  /** "Welcome back" summary of what the car earned while the player was away. */
  private showWelcomeBack(pending: PendingOffline): void {
    this.welcomeDialog?.destroy();
    this.closeInventory();
    const { width, height } = this.ctx.layout;
    const car = getActiveCar(this.ctx.model.state.garage);
    const carName = CAR_MODELS[car.modelId]?.name ?? 'car';
    const capHours = ECONOMY.offline.capHours;
    const away = pending.capped ? `over ${capHours}h` : formatDuration(pending.seconds);

    const panel = new Panel(this, { area: { x: 0, y: 0, width, height }, align: 'center' });
    panel.text('WELCOME BACK', 28, TEXT_COLORS.accent, { bold: true, gapAfter: 16 });
    panel.text(`You were away for ${away}`, 44, TEXT_COLORS.primary, { bold: true, gapAfter: 24 });
    panel.text(`Your ${carName} drove ${formatDistance(pending.distanceKm)} and earned`, 30, TEXT_COLORS.secondary, {
      gapAfter: 8,
    });
    panel.text(`+${formatPrecise(pending.money)}`, 88, cssColor(COLORS.money), { bold: true, gapAfter: 16 });
    for (const material of MATERIALS) {
      const amount = pending.materials[material.id];
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
    panel.gap(12);
    // Highlighted when the cap was reached, so the player knows they missed some.
    panel.text(`Earnings build up for up to ${capHours} hours while you're away.`, 26,
      pending.capped ? TEXT_COLORS.accent : TEXT_COLORS.muted, { gapAfter: 20 });
    panel.button('Collect', { onClick: () => this.collectOffline() });
    this.welcomeDialog = panel.finish();
  }

  private collectOffline(): void {
    this.ctx.model.collectOffline();
    this.welcomeDialog?.destroy();
    this.welcomeDialog = null;
    this.tweens.add({ targets: this.moneyText, scale: 1.3, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
  }

  private openInventory(): void {
    if (this.welcomeDialog) return;
    this.closeInventory();
    const { width, height } = this.ctx.layout;
    this.inventory = openInventoryPanel(this, this.ctx.model, { x: 0, y: 0, width, height }, () => this.closeInventory());
  }

  private closeInventory(): void {
    this.inventory?.destroy();
    this.inventory = null;
  }

  update(): void {
    const { resources } = this.ctx.model.state;
    const money = formatNumber(resources.money);
    if (this.moneyText.text !== money) this.moneyText.setText(money);
    this.updateMaterialIcons();
    this.updateDebugOverlay();
    this.dotTimer += this.game.loop.delta / 1000;
    if (this.dotTimer >= 0.5) {
      this.dotTimer = 0;
      this.updateTabDots();
    }
  }

  /** Drive tab gets a dot when every fuel tank is full (refills are being wasted). */
  private updateTabDots(): void {
    const full = this.ctx.model.fuel().tanks >= FUEL_TANKS.max;
    for (const button of this.tabButtons) {
      button.dot.setVisible(button.tab.id === 'drive' && full && this.activeTab?.id !== 'drive');
    }
  }

  /** What a milestone gives, as one line. */
  private rewardLine(milestone: MilestoneDef): string {
    const { reward } = milestone;
    const parts: string[] = [];
    if (reward.unlockBiome) parts.push(`${BIOMES_BY_ID[reward.unlockBiome].name} unlocked`);
    if (reward.unlockFeature) parts.push(`${reward.unlockFeature} unlocked`);
    if (reward.money) parts.push(`+${formatNumber(reward.money)} money`);
    for (const [id, amount] of Object.entries(reward.materials ?? {})) {
      parts.push(`+${formatNumber(amount ?? 0)} ${MATERIALS_BY_ID[id as keyof typeof MATERIALS_BY_ID].name}`);
    }
    return parts.join(' · ');
  }

  /** Slides the next milestone banner down from under the top bar. Tap it to dismiss early. */
  private showNextBanner(): void {
    const milestone = this.bannerQueue.shift();
    if (!milestone) return;
    const { hud, width } = this.ctx.layout;
    const bannerWidth = width - 48;
    const height = 190;
    const targetY = hud.height + 16;

    const background = this.add
      .rectangle(24, 0, bannerWidth, height, COLORS.panelRaised)
      .setOrigin(0)
      .setRounded(24)
      .setStrokeStyle(4, COLORS.accent)
      .setInteractive({ useHandCursor: true });
    const style = (size: number, color: string, bold = false) => ({
      fontFamily: FONT_FAMILY,
      fontSize: `${size}px`,
      fontStyle: bold ? 'bold' : 'normal',
      color,
      wordWrap: { width: bannerWidth - 64 },
    });
    const kicker = this.add.text(56, 22, '★ MILESTONE', style(24, TEXT_COLORS.accent, true));
    const title = this.add.text(56, 56, milestone.title, style(44, TEXT_COLORS.primary, true));
    const reward = this.add.text(56, 116, this.rewardLine(milestone) || milestone.description, style(26, cssColor(COLORS.money), true));
    const banner = this.add.container(0, -height - 20, [background, kicker, title, reward]).setDepth(900);
    this.banner = banner;

    const leave = () => {
      if (this.banner !== banner) return;
      this.tweens.killTweensOf(banner);
      this.tweens.add({
        targets: banner,
        y: -height - 20,
        alpha: 0,
        duration: 280,
        ease: 'Cubic.easeIn',
        onComplete: () => {
          banner.destroy();
          this.banner = null;
          this.showNextBanner();
        },
      });
    };
    background.on('pointerup', leave);
    this.tweens.add({ targets: banner, y: targetY, duration: 380, ease: 'Back.easeOut' });
    // When several milestones arrive together, show each more briefly.
    this.time.delayedCall(this.bannerQueue.length > 0 ? BANNER_HOLD_MS / 2 : BANNER_HOLD_MS, leave);
  }

  showTab(tab: TabDef): void {
    if (this.activeTab?.id === tab.id) return;
    if (this.activeTab) this.scene.sleep(this.activeTab.sceneKey);
    if (this.scene.isSleeping(tab.sceneKey)) {
      this.scene.wake(tab.sceneKey);
    } else {
      this.scene.launch(tab.sceneKey);
    }
    // Keep this layer drawn above the tab screens.
    this.scene.bringToTop();
    this.activeTab = tab;
    this.refreshTabButtons();
  }

  private createHud(): void {
    const { hud } = this.ctx.layout;
    this.add.rectangle(hud.x, hud.y, hud.width, hud.height, COLORS.panel).setOrigin(0);
    this.add.rectangle(hud.x, hud.y + hud.height - 3, hud.width, 3, COLORS.panelBorder).setOrigin(0);

    const margin = 24;
    const gap = 16;
    const chipHeight = 104;
    const chipY = hud.y + (hud.height - chipHeight) / 2;
    const midY = chipY + chipHeight / 2;
    const moneyWidth = Math.round((hud.width - 2 * margin - gap) * 0.5);
    const materialsX = hud.x + margin + moneyWidth + gap;
    const materialsWidth = hud.width - margin - (materialsX - hud.x);

    // Money.
    const moneyX = hud.x + margin;
    this.add.rectangle(moneyX, chipY, moneyWidth, chipHeight, COLORS.panelRaised).setOrigin(0).setRounded(20);
    this.add.image(moneyX + 22, midY, moneyIconKey(this)).setOrigin(0, 0.5).setScale(5);
    this.moneyText = this.add
      .text(moneyX + 100, midY + 6, '0', { fontFamily: FONT_FAMILY, fontSize: '46px', fontStyle: 'bold', color: TEXT_COLORS.primary })
      .setOrigin(0, 1);
    this.add
      .text(moneyX + 100, midY + 8, 'Money', { fontFamily: FONT_FAMILY, fontSize: '24px', color: TEXT_COLORS.secondary })
      .setOrigin(0, 0);

    // Materials button: icons of what's held; tap for the full inventory.
    const button = this.add
      .rectangle(materialsX, chipY, materialsWidth, chipHeight, COLORS.panelRaised)
      .setOrigin(0)
      .setRounded(20)
      .setStrokeStyle(2, COLORS.panelBorder)
      .setInteractive({ useHandCursor: true });
    button.on('pointerup', () => this.openInventory());
    this.materialIconsX = materialsX + 22;
    this.materialIconsY = chipY + 30;
    this.add
      .text(materialsX + 22, chipY + chipHeight - 14, 'Materials  ›', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        fontStyle: 'bold',
        color: TEXT_COLORS.secondary,
      })
      .setOrigin(0, 1);
  }

  /** Shows icons of the rarest materials held (at least one whole unit), rarest first. */
  private updateMaterialIcons(): void {
    const { materials } = this.ctx.model.state.resources;
    const held = MATERIALS.filter((m) => materials[m.id] >= 1)
      .sort((a, b) => RARITIES[b.rarity].rank - RARITIES[a.rarity].rank)
      .slice(0, HUD_MATERIAL_ICONS);
    const signature = held.map((m) => m.id).join(',');
    if (signature === this.materialIconsSignature) return;
    this.materialIconsSignature = signature;
    for (const icon of this.materialIcons) icon.destroy();
    this.materialIcons = held.map((m, i) =>
      this.add.image(this.materialIconsX + i * 46, this.materialIconsY, materialIconKey(this, m.id)).setOrigin(0, 0.5).setScale(3),
    );
  }

  private createTabBar(): void {
    const { tabBar } = this.ctx.layout;
    this.add.rectangle(tabBar.x, tabBar.y, tabBar.width, tabBar.height, COLORS.panel).setOrigin(0);
    this.add.rectangle(tabBar.x, tabBar.y, tabBar.width, 3, COLORS.panelBorder).setOrigin(0);

    const buttonWidth = tabBar.width / TABS.length;
    TABS.forEach((tab, i) => {
      const x = tabBar.x + i * buttonWidth;
      const centerX = x + buttonWidth / 2;
      const background = this.add
        .rectangle(x, tabBar.y + 3, buttonWidth, tabBar.height - 3, COLORS.panel)
        .setOrigin(0)
        .setInteractive({ useHandCursor: true });
      background.on('pointerup', () => this.showTab(tab));

      const indicator = this.add
        .rectangle(centerX, tabBar.y + 3, buttonWidth * 0.5, 6, COLORS.accent)
        .setOrigin(0.5, 0);
      const icon = this.add.graphics();
      const label = this.add
        .text(centerX, tabBar.y + 140, tab.label, {
          fontFamily: FONT_FAMILY,
          fontSize: '28px',
          fontStyle: 'bold',
          color: TEXT_COLORS.secondary,
        })
        .setOrigin(0.5);

      const dot = this.add.circle(centerX + 46, tabBar.y + 44, 10, COLORS.accent).setVisible(false);
      this.tabButtons.push({ tab, background, indicator, icon, label, dot, centerX, iconY: tabBar.y + 78 });
    });
  }

  private refreshTabButtons(): void {
    for (const button of this.tabButtons) {
      const active = button.tab.id === this.activeTab?.id;
      button.background.setFillStyle(active ? COLORS.panelRaised : COLORS.panel);
      button.indicator.setVisible(active);
      button.label.setColor(active ? TEXT_COLORS.primary : TEXT_COLORS.secondary);
      button.icon.clear();
      drawTabIcon(
        button.icon,
        button.tab.id,
        button.centerX,
        button.iconY,
        64,
        active ? COLORS.accent : COLORS.textSecondary,
      );
    }
  }

  /** Development-only status line: play time, last save, time away. Not shown in release builds. */
  private createDebugOverlay(): void {
    const { tabBar } = this.ctx.layout;
    this.debugText = this.add
      .text(24, tabBar.y - 16, '', {
        fontFamily: 'ui-monospace, Menlo, Consolas, monospace',
        fontSize: '22px',
        color: TEXT_COLORS.muted,
      })
      .setOrigin(0, 1);
  }

  private updateDebugOverlay(): void {
    if (!this.debugText) return;
    const { model } = this.ctx;
    const { stats, lastSavedAt } = model.state;
    const sinceSave = (Date.now() - lastSavedAt) / 1000;
    const line =
      `DEV · played ${formatDuration(stats.playTimeSeconds)}` +
      ` · saved ${formatDuration(sinceSave)} ago` +
      ` · away ${formatDuration(model.lastAwaySeconds)}` +
      ` · session ${stats.sessions}` +
      ` · ${Math.round(this.game.loop.actualFps)} fps`;
    if (this.debugText.text !== line) this.debugText.setText(line);
  }
}
