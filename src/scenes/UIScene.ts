import Phaser from 'phaser';
import { formatDuration, formatNumber, formatPrecise } from '../core/format';
import type { PendingOffline } from '../core/state';
import { BIOMES_BY_ID } from '../data/biomes';
import { canAfford, droneBranchCost, droneModelCost } from '../core/upgrades';
import { ECONOMY, type Cost } from '../data/economy';
import { DRONE_BRANCHES } from '../data/farm';
import { MATERIALS_BY_ID } from '../data/materials';
import type { MilestoneDef } from '../data/milestones';
import { MATERIALS, RARITIES } from '../data/materials';
import { TABS, type TabDef } from '../ui/tabs';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import type { AppContext } from './context';
import { cssColor, Panel } from './panel';
import { openInventoryPanel } from './panels';
import { overlayStyle, textStyle, wrapStyle } from './textStyles';
import { materialIconKey, moneyIconKey } from './textures';
import { addDot, addFrame, glowKey, restyleFrame, uiIconKey } from './ui';

/** Most material icons shown in the top bar's Materials button. */
const HUD_MATERIAL_ICONS = 5;

/** How long a milestone banner stays up (ms). */
const BANNER_HOLD_MS = 3500;

interface TabButton {
  tab: TabDef;
  plate: Phaser.GameObjects.Image;
  glow: Phaser.GameObjects.Image;
  icon: Phaser.GameObjects.Image;
  label: Phaser.GameObjects.Text;
  /** Dot shown when the tab needs attention (e.g. Drive with full fuel tanks). */
  dot: Phaser.GameObjects.Image;
}

/** Tab icon colours. */
const TAB_ICON_IDLE = 0x8a84b4;
const TAB_ICON_ACTIVE = COLORS.accentWarm;

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
    this.ctx.showTab = (id) => {
      const tab = TABS.find((t) => t.id === id);
      if (tab) this.showTab(tab);
    };
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
    const farm = this.ctx.model.state.farm;
    const who = farm.droneCount > 1 ? `Your ${farm.droneCount} drones` : farm.droneCount === 1 ? 'Your drone' : 'Your garage';
    const capHours = ECONOMY.offline.capHours;
    const away = pending.capped ? `over ${capHours}h` : formatDuration(pending.seconds);

    const panel = new Panel(this, { area: { x: 0, y: 0, width, height }, align: 'center', edgeColor: COLORS.accentAlt });
    panel.header('WELCOME BACK', COLORS.accentAlt);
    panel.text(`You were away for ${away}`, 42, TEXT_COLORS.primary, { bold: true, gapAfter: 24 });
    panel.text(`${who} brought in`, 30, TEXT_COLORS.secondary, {
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
    panel.button('Collect', { onClick: () => this.collectOffline(), icon: moneyIconKey(this) });
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

  /**
   * Tab dots: Drive when every fuel tank is full (refills are being wasted); Upgrades when a
   * drone-tree level or the next drone model can be bought.
   */
  private updateTabDots(): void {
    const { model } = this.ctx;
    const fuel = model.fuel();
    const full = fuel.tanks >= fuel.maxTanks;
    const { farm, resources } = model.state;
    const affordable = (cost: Cost | null) => cost !== null && canAfford(resources, cost);
    const upgrade =
      farm.droneCount > 0 &&
      (affordable(droneModelCost(farm.droneModel)) || DRONE_BRANCHES.some((b) => affordable(droneBranchCost(farm, b.id))));
    for (const button of this.tabButtons) {
      const wants = (button.tab.id === 'drive' && full) || (button.tab.id === 'upgrades' && upgrade);
      button.dot.setVisible(wants && this.activeTab?.id !== button.tab.id);
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

    const glow = this.add
      .image(24 + bannerWidth / 2, height / 2, glowKey(this, 48, COLORS.money))
      .setScale((bannerWidth / 96) * 1.1, (height / 96) * 1.6)
      .setBlendMode(Phaser.BlendModes.ADD)
      .setAlpha(0);
    const background = addFrame(this, 24, 0, bannerWidth, height, { kind: 'panel', color: COLORS.money }).setInteractive({
      useHandCursor: true,
    });
    const textX = 168;
    const star = this.add.image(96, height / 2, uiIconKey(this, 'star')).setScale(UI_PIXEL * 1.5);
    const kicker = this.add.text(textX, 24, 'MILESTONE', textStyle(24, TEXT_COLORS.warm, true));
    const title = this.add.text(textX, 54, milestone.title, wrapStyle(42, TEXT_COLORS.primary, bannerWidth - textX, true));
    const reward = this.add.text(
      textX,
      118,
      this.rewardLine(milestone) || milestone.description,
      wrapStyle(25, cssColor(COLORS.money), bannerWidth - textX - 16, true),
    );
    const banner = this.add.container(0, -height - 20, [glow, background, star, kicker, title, reward]).setDepth(900);
    this.banner = banner;
    // The star pops in and the frame glows once as the banner lands.
    star.setScale(0);
    this.tweens.add({ targets: star, scale: UI_PIXEL * 1.5, angle: { from: -90, to: 0 }, delay: 260, duration: 420, ease: 'Back.easeOut' });
    this.tweens.add({ targets: glow, alpha: { from: 0.9, to: 0 }, delay: 300, duration: 900, ease: 'Quad.easeOut' });

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
    // A full-width strip; only its bottom edge shows.
    addFrame(this, hud.x - 12, hud.y - 12, hud.width + 24, hud.height + 12, { kind: 'panel', color: COLORS.panelBorder });

    const margin = 24;
    const gap = 16;
    const chipHeight = 104;
    const chipY = hud.y + (hud.height - chipHeight) / 2 - 2;
    const midY = chipY + chipHeight / 2;
    const moneyWidth = Math.round((hud.width - 2 * margin - gap) * 0.5);
    const materialsX = hud.x + margin + moneyWidth + gap;
    const materialsWidth = hud.width - margin - (materialsX - hud.x);

    // Money.
    const moneyX = hud.x + margin;
    addFrame(this, moneyX, chipY, moneyWidth, chipHeight, { kind: 'inset', color: COLORS.money });
    this.add.image(moneyX + 22, midY, moneyIconKey(this)).setOrigin(0, 0.5).setScale(5);
    this.moneyText = this.add.text(moneyX + 100, midY + 8, '0', overlayStyle(46, TEXT_COLORS.primary, true)).setOrigin(0, 1);
    this.add.text(moneyX + 100, midY + 8, 'Money', textStyle(22, TEXT_COLORS.secondary)).setOrigin(0, 0);

    // Materials button: icons of what's held; tap for the full inventory.
    const button = addFrame(this, materialsX, chipY, materialsWidth, chipHeight, { kind: 'card', color: COLORS.panelBorder });
    button.setInteractive({ useHandCursor: true });
    button.on('pointerdown', () => restyleFrame(button, 'card', COLORS.accentAlt));
    button.on('pointerout', () => restyleFrame(button, 'card', COLORS.panelBorder));
    button.on('pointerup', () => {
      restyleFrame(button, 'card', COLORS.panelBorder);
      this.openInventory();
    });
    this.materialIconsX = materialsX + 22;
    this.materialIconsY = chipY + 34;
    this.add
      .text(materialsX + 22, chipY + chipHeight - 12, 'Materials  >', textStyle(22, TEXT_COLORS.secondary, true))
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
    // A full-width strip; only its top edge shows.
    addFrame(this, tabBar.x - 12, tabBar.y, tabBar.width + 24, tabBar.height + 12, { kind: 'panel', color: COLORS.panelBorder });

    const inset = 10;
    const buttonWidth = (tabBar.width - 2 * inset) / TABS.length;
    TABS.forEach((tab, i) => {
      const x = tabBar.x + inset + i * buttonWidth;
      const centerX = x + buttonWidth / 2;
      const plate = addFrame(this, x + 4, tabBar.y + 14, buttonWidth - 8, tabBar.height - 30, {
        kind: 'card',
        color: COLORS.panelBorder,
      }).setInteractive({ useHandCursor: true });
      plate.on('pointerup', () => this.showTab(tab));

      const glow = this.add
        .image(centerX, tabBar.y + 76, glowKey(this, 24, COLORS.accentWarm))
        .setScale(4.5, 3)
        .setBlendMode(Phaser.BlendModes.ADD)
        .setAlpha(0.35);
      const icon = this.add.image(centerX, tabBar.y + 74, uiIconKey(this, tab.id, TAB_ICON_IDLE)).setScale(UI_PIXEL);
      const label = this.add.text(centerX, tabBar.y + 138, tab.label, textStyle(26, TEXT_COLORS.secondary, true)).setOrigin(0.5);
      const dot = addDot(this, x + buttonWidth - 30, tabBar.y + 38).setVisible(false);
      this.tweens.add({ targets: dot, scale: UI_PIXEL * 1.25, duration: 500, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      this.tabButtons.push({ tab, plate, glow, icon, label, dot });
    });
  }

  private refreshTabButtons(): void {
    for (const button of this.tabButtons) {
      const active = button.tab.id === this.activeTab?.id;
      restyleFrame(button.plate, 'card', active ? COLORS.accentWarm : COLORS.panelBorder);
      button.plate.setAlpha(active ? 1 : 0.55);
      button.glow.setVisible(active);
      button.label.setColor(active ? TEXT_COLORS.primary : TEXT_COLORS.secondary);
      button.icon.setTexture(uiIconKey(this, button.tab.id, active ? TAB_ICON_ACTIVE : TAB_ICON_IDLE));
      if (active) {
        this.tweens.killTweensOf(button.icon);
        button.icon.setScale(UI_PIXEL * 0.8);
        this.tweens.add({ targets: button.icon, scale: UI_PIXEL, duration: 220, ease: 'Back.easeOut' });
      }
    }
  }

  /** Development-only status line: play time, last save, time away. Not shown in release builds. */
  private createDebugOverlay(): void {
    const { tabBar } = this.ctx.layout;
    this.debugText = this.add
      .text(24, tabBar.y - 12, '', textStyle(20, TEXT_COLORS.muted))
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
