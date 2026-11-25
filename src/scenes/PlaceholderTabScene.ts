import Phaser from 'phaser';
import type { TabDef } from '../ui/tabs';
import { COLORS, FONT_FAMILY, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';

/**
 * Stand-in screen for a tab that hasn't been built yet. Each roadmap step replaces one of
 * these with the real screen.
 */
export class PlaceholderTabScene extends Phaser.Scene {
  constructor(
    private readonly ctx: AppContext,
    private readonly tab: TabDef,
  ) {
    super({ key: tab.sceneKey });
  }

  create(): void {
    const { content } = this.ctx.layout;
    // Draw only in the area between the top bar and the tab bar, using local coordinates.
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);

    const cx = content.width / 2;
    const cy = content.height / 2;

    this.add
      .text(cx, cy - 170, this.tab.label, {
        fontFamily: FONT_FAMILY,
        fontSize: '88px',
        fontStyle: 'bold',
        color: TEXT_COLORS.primary,
      })
      .setOrigin(0.5);

    this.add
      .text(cx, cy - 80, this.tab.description, {
        fontFamily: FONT_FAMILY,
        fontSize: '36px',
        color: TEXT_COLORS.secondary,
        align: 'center',
        wordWrap: { width: content.width - 160 },
      })
      .setOrigin(0.5);

    if (!this.tab.plannedStep) return;
    this.add
      .rectangle(cx, cy + 75, content.width - 160, 150, COLORS.panel)
      .setRounded(24)
      .setStrokeStyle(3, COLORS.panelBorder);
    this.add
      .text(cx, cy + 45, 'COMING IN', {
        fontFamily: FONT_FAMILY,
        fontSize: '24px',
        fontStyle: 'bold',
        color: TEXT_COLORS.accent,
      })
      .setOrigin(0.5);
    this.add
      .text(cx, cy + 95, this.tab.plannedStep, {
        fontFamily: FONT_FAMILY,
        fontSize: '32px',
        color: TEXT_COLORS.primary,
      })
      .setOrigin(0.5);
  }
}
