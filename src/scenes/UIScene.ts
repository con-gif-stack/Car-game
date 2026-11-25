import Phaser from 'phaser';
import { formatDistance, formatDuration, formatNumber, formatPrecise } from '../core/format';
import type { PendingOffline, Resources } from '../core/state';
import { getActiveCar } from '../core/vehicle';
import { ECONOMY } from '../data/economy';
import { CAR_MODELS } from '../data/vehicles';
import { drawResourceIcon, drawTabIcon } from '../ui/icons';
import { TABS, type TabDef } from '../ui/tabs';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { cssColor, openDialog } from './dialog';

const RESOURCE_DISPLAY: readonly { id: keyof Resources; label: string }[] = [
  { id: 'money', label: 'Money' },
  { id: 'materials', label: 'Materials' },
  { id: 'rareMaterials', label: 'Rare' },
];

const RESOURCE_COLORS: Record<keyof Resources, number> = {
  money: COLORS.money,
  materials: COLORS.materials,
  rareMaterials: COLORS.rareMaterials,
};

interface TabButton {
  tab: TabDef;
  background: Phaser.GameObjects.Rectangle;
  indicator: Phaser.GameObjects.Rectangle;
  icon: Phaser.GameObjects.Graphics;
  label: Phaser.GameObjects.Text;
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
  private readonly resourceTexts: { id: keyof Resources; text: Phaser.GameObjects.Text }[] = [];
  private debugText: Phaser.GameObjects.Text | null = null;
  private welcomeDialog: Phaser.GameObjects.Container | null = null;

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
      const tab = TABS[Number(event.key) - 1];
      if (tab) this.showTab(tab);
    });

    const firstTab = TABS[0];
    if (firstTab) this.showTab(firstTab);

    // Offline earnings: waiting from before this session, or arriving after the game resumes.
    const { model } = this.ctx;
    if (model.state.pendingOffline.money > 0) this.showWelcomeBack(model.state.pendingOffline);
    model.events.on('offlineEarnings', (pending) => this.showWelcomeBack(pending));
  }

  /** "Welcome back" summary of what the car earned while the player was away. */
  private showWelcomeBack(pending: PendingOffline): void {
    this.welcomeDialog?.destroy();
    const { width, height } = this.ctx.layout;
    const car = getActiveCar(this.ctx.model.state.garage);
    const carName = CAR_MODELS[car.modelId]?.name ?? 'car';
    const capHours = ECONOMY.offline.capHours;
    const away = pending.capped ? `over ${capHours}h` : formatDuration(pending.seconds);

    this.welcomeDialog = openDialog(this, {
      area: { x: 0, y: 0, width, height },
      align: 'center',
      lines: [
        { text: 'WELCOME BACK', size: 28, color: TEXT_COLORS.accent, bold: true, gapAfter: 16 },
        { text: `You were away for ${away}`, size: 44, color: TEXT_COLORS.primary, bold: true, gapAfter: 24 },
        {
          text: `Your ${carName} drove ${formatDistance(pending.distanceKm)} and earned`,
          size: 30,
          color: TEXT_COLORS.secondary,
          gapAfter: 8,
        },
        { text: `+${formatPrecise(pending.money)}`, size: 88, color: cssColor(COLORS.money), bold: true, gapAfter: 4 },
        {
          text: `+${formatPrecise(pending.materials)} materials`,
          size: 36,
          color: cssColor(COLORS.materials),
          bold: true,
          gapAfter: 4,
        },
        {
          text: `+${formatPrecise(pending.rareMaterials)} rare`,
          size: 36,
          color: cssColor(COLORS.rareMaterials),
          bold: true,
          gapAfter: 20,
        },
        {
          text: `Earnings build up for up to ${capHours} hours while you're away.`,
          size: 26,
          // Highlighted when the cap was reached, so the player knows they missed some.
          color: pending.capped ? TEXT_COLORS.accent : TEXT_COLORS.muted,
          gapAfter: 8,
        },
      ],
      buttonLabel: 'Collect',
      onButton: () => this.collectOffline(),
    });
  }

  private collectOffline(): void {
    this.ctx.model.collectOffline();
    this.welcomeDialog?.destroy();
    this.welcomeDialog = null;
    const money = this.resourceTexts.find((r) => r.id === 'money')?.text;
    if (money) this.tweens.add({ targets: money, scale: 1.3, duration: 140, yoyo: true, ease: 'Quad.easeOut' });
  }

  update(): void {
    const { resources } = this.ctx.model.state;
    for (const { id, text } of this.resourceTexts) {
      // Money grows fast, so whole numbers; materials come in slowly, so keep decimals early on.
      const value = id === 'money' ? formatNumber(resources[id]) : formatPrecise(resources[id]);
      if (text.text !== value) text.setText(value);
    }
    this.updateDebugOverlay();
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
    const count = RESOURCE_DISPLAY.length;
    const chipWidth = (hud.width - margin * 2 - gap * (count - 1)) / count;
    const chipHeight = 104;
    const chipY = hud.y + (hud.height - chipHeight) / 2;
    const midY = chipY + chipHeight / 2;

    RESOURCE_DISPLAY.forEach((resource, i) => {
      const x = hud.x + margin + i * (chipWidth + gap);
      this.add.rectangle(x, chipY, chipWidth, chipHeight, COLORS.panelRaised).setOrigin(0).setRounded(20);
      drawResourceIcon(this.add.graphics(), resource.id, x + 50, midY, 28, RESOURCE_COLORS, COLORS.panelRaised);

      const text = this.add
        .text(x + 94, midY + 6, '0', {
          fontFamily: FONT_FAMILY,
          fontSize: '42px',
          fontStyle: 'bold',
          color: TEXT_COLORS.primary,
        })
        .setOrigin(0, 1);
      this.add
        .text(x + 94, midY + 8, resource.label, {
          fontFamily: FONT_FAMILY,
          fontSize: '24px',
          color: TEXT_COLORS.secondary,
        })
        .setOrigin(0, 0);
      this.resourceTexts.push({ id: resource.id, text });
    });
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

      this.tabButtons.push({ tab, background, indicator, icon, label, centerX, iconY: tabBar.y + 78 });
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
