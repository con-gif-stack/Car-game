import Phaser from 'phaser';
import type { TabDef } from '../ui/tabs';
import { TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import type { AppContext } from './context';
import { overlayStyle, textStyle, wrapStyle } from './textStyles';
import { addFrame, uiIconKey } from './ui';

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

    this.add.image(cx, cy - 280, uiIconKey(this, this.tab.id, 0x8a84b4)).setScale(UI_PIXEL * 1.5);
    this.add.text(cx, cy - 170, this.tab.label, overlayStyle(84, TEXT_COLORS.primary, true)).setOrigin(0.5);
    this.add.text(cx, cy - 80, this.tab.description, wrapStyle(34, TEXT_COLORS.secondary, content.width - 160, false, 'center')).setOrigin(0.5);

    if (!this.tab.plannedStep) return;
    addFrame(this, cx, cy + 75, content.width - 160, 150, { originX: 0.5, originY: 0.5 });
    this.add.text(cx, cy + 45, 'COMING IN', textStyle(24, TEXT_COLORS.warm, true)).setOrigin(0.5);
    this.add.text(cx, cy + 95, this.tab.plannedStep, textStyle(32, TEXT_COLORS.primary)).setOrigin(0.5);
  }
}
