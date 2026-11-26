import Phaser from 'phaser';
import { formatDistance, formatPrecise } from '../core/format';
import type { RunSummary } from '../core/GameModel';
import { MATERIALS, RARITIES } from '../data/materials';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import { cssColor, Panel, type Area } from './panel';
import { materialIconKey, moneyIconKey } from './textures';
import { glowKey, uiIconKey } from './ui';

/** Milliseconds between reward rows appearing. */
const ROW_STAGGER_MS = 140;
/** How long the distance takes to count up. */
const DISTANCE_COUNT_MS = 1000;

export interface RunResults {
  container: Phaser.GameObjects.Container;
  /** Jumps every animation to its end. */
  skip(): void;
}

/**
 * The end-of-run screen: the distance counts up, a new best bursts with stars, and the
 * rewards appear one by one, each counting up. Tap the dimmed area to skip the animation.
 */
export function openRunResults(scene: Phaser.Scene, summary: RunSummary, area: Area, onClose: () => void): RunResults {
  const counters: Phaser.Tweens.Tween[] = [];
  let skipped = false;
  const skip = () => {
    if (skipped) return;
    skipped = true;
    panel.skipReveal();
    for (const counter of counters) if (counter.isPlaying() || counter.isPending()) counter.complete();
  };

  const panel = new Panel(scene, {
    area,
    align: 'center',
    onBackdrop: skip,
    edgeColor: summary.newBest ? COLORS.money : COLORS.panelBorder,
  });
  panel.header('RUN OVER', summary.newBest ? COLORS.accentWarm : COLORS.accent);

  const broke = summary.endReason === 'breakdown';
  panel.row({
    icon: uiIconKey(scene, broke ? 'wrench' : 'fuel'),
    iconScale: 2.25,
    title: broke ? 'Your car broke down' : 'Out of fuel',
    titleColor: TEXT_COLORS.secondary,
    size: 28,
    gapAfter: 10,
  });
  const distance = panel.text(formatDistance(0), 92, TEXT_COLORS.primary, { bold: true, gapAfter: 4 });
  const best = Math.max(summary.previousBestKm, summary.distanceKm);
  const bestLine = panel.text(
    summary.newBest ? 'NEW BEST DISTANCE!' : `Best: ${formatDistance(best)}`,
    30,
    summary.newBest ? TEXT_COLORS.warm : TEXT_COLORS.secondary,
    { bold: true, gapAfter: 20 },
  );
  panel.divider(12);
  const firstReward = panel.lineCount + 1;

  const countUp = (text: Phaser.GameObjects.Text | null, value: number, delay: number, format: (v: number) => string) => {
    if (!text) return;
    text.setText(format(0));
    counters.push(
      scene.tweens.addCounter({
        from: 0,
        to: value,
        delay,
        duration: 600,
        ease: 'Cubic.easeOut',
        onUpdate: (tween) => text.setText(format(tween.getValue() ?? value)),
        onComplete: () => text.setText(format(value)),
      }),
    );
  };

  const rows: { text: Phaser.GameObjects.Text | null; value: number }[] = [];
  const moneyRow = (title: string, value: number) =>
    rows.push({
      text: panel.row({
        icon: moneyIconKey(scene),
        iconScale: 3,
        title,
        value: `+${formatPrecise(value)}`,
        valueColor: cssColor(COLORS.money),
        size: 28,
        gapAfter: 8,
        card: true,
      }),
      value,
    });
  moneyRow('Distance pay', summary.money);
  if (summary.bonusMoney > 0) moneyRow('New ground bonus', summary.bonusMoney);
  for (const material of MATERIALS) {
    const amount = summary.finds[material.id];
    if (amount < 0.01) continue;
    const rarity = RARITIES[material.rarity];
    rows.push({
      text: panel.row({
        icon: materialIconKey(scene, material.id),
        iconScale: 3,
        title: material.name,
        titleColor: cssColor(rarity.color),
        value: `+${formatPrecise(amount)}`,
        size: 28,
        gapAfter: 8,
        card: true,
      }),
      value: amount,
    });
  }
  for (const milestone of summary.milestones) {
    panel.row({
      icon: uiIconKey(scene, 'star'),
      iconScale: 2.25,
      title: milestone.title,
      titleColor: TEXT_COLORS.warm,
      sub: 'Milestone reached',
      size: 28,
      gapAfter: 8,
      card: true,
    });
  }
  panel.gap(14);
  panel.button('Back to the start', { onClick: onClose, tone: 'primary' });
  const container = panel.finish();

  // Distance first, then each reward row.
  const lastAt = panel.reveal(ROW_STAGGER_MS, firstReward, DISTANCE_COUNT_MS + 300);
  rows.forEach((row, i) =>
    countUp(row.text, row.value, DISTANCE_COUNT_MS + 300 + i * ROW_STAGGER_MS, (v) => `+${formatPrecise(v)}`),
  );
  bestLine.setAlpha(0);
  counters.push(
    scene.tweens.addCounter({
      from: 0,
      to: summary.distanceKm,
      delay: 250,
      duration: DISTANCE_COUNT_MS,
      ease: 'Cubic.easeOut',
      onUpdate: (tween) => distance.setText(formatDistance(tween.getValue() ?? 0)),
      onComplete: () => {
        distance.setText(formatDistance(summary.distanceKm));
        bestLine.setAlpha(1);
        if (summary.newBest) celebrate(scene, distance, bestLine, skipped);
      },
    }),
  );
  // Nothing left to skip once everything has appeared.
  scene.time.delayedCall(lastAt + 700, () => {
    skipped = true;
  });

  // Closing early stops the counters, so they don't write to destroyed text.
  container.once(Phaser.GameObjects.Events.DESTROY, () => {
    for (const counter of counters) counter.remove();
  });
  return { container, skip };
}

/** A new best: the distance pops and gold stars burst out of it. */
function celebrate(scene: Phaser.Scene, distance: Phaser.GameObjects.Text, line: Phaser.GameObjects.Text, quick: boolean): void {
  if (!distance.active) return;
  const matrix = distance.getWorldTransformMatrix();
  const x = matrix.tx;
  const y = matrix.ty + distance.height / 2;
  scene.tweens.add({ targets: distance, scale: { from: 1.25, to: 1 }, duration: 380, ease: 'Back.easeOut' });
  scene.tweens.add({ targets: line, alpha: { from: 1, to: 0.3 }, duration: 180, yoyo: true, repeat: 3 });
  if (quick) return;
  const glow = scene.add
    .image(x, y, glowKey(scene, 32, COLORS.money))
    .setScale(UI_PIXEL * 2.5, UI_PIXEL * 1.2)
    .setBlendMode(Phaser.BlendModes.ADD)
    .setDepth(1001);
  scene.tweens.add({ targets: glow, alpha: { from: 0.9, to: 0 }, duration: 900, onComplete: () => glow.destroy() });
  const stars = scene.add
    .particles(x, y, uiIconKey(scene, 'star'), {
      speed: { min: 260, max: 620 },
      angle: { min: 200, max: 340 },
      scale: { start: UI_PIXEL * 0.6, end: 0 },
      rotate: { min: -180, max: 180 },
      gravityY: 900,
      lifespan: 1100,
      emitting: false,
    })
    .setDepth(1002);
  stars.explode(26);
  scene.time.delayedCall(1300, () => stars.destroy());
}
