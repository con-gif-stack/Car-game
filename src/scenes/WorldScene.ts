import Phaser from 'phaser';
import { formatDistance } from '../core/format';
import { milestoneProgress } from '../core/milestones';
import { BIOMES, type BiomeDef } from '../data/biomes';
import { MATERIAL_IDS, type MaterialId } from '../data/materials';
import { MILESTONES } from '../data/milestones';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { textStyle } from './textStyles';
import { materialIconKey } from './textures';
import { addFrame, PixelBar, uiIconKey } from './ui';

const PAD = 32;
const CARD_HEIGHT = 196;
const CARD_GAP = 18;
const MILESTONE_ROW = 84;
const GREEN = TEXT_COLORS.good;

/**
 * World tab: the biome road map (which biomes are unlocked, how far the best run got) and the
 * milestone list. Drag to scroll.
 */
export class WorldScene extends Phaser.Scene {
  private content: Phaser.GameObjects.Container | null = null;
  private contentHeight = 0;
  private dragStartY: number | null = null;
  private dragStartScroll = 0;

  constructor(private readonly ctx: AppContext) {
    super({ key: 'WorldTab' });
  }

  create(): void {
    const { content } = this.ctx.layout;
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);
    this.build();

    this.events.on(Phaser.Scenes.Events.WAKE, () => this.build());
    this.ctx.model.events.on('milestoneReached', () => {
      if (this.scene.isActive()) this.build();
    });

    // Drag to scroll.
    this.input.on('pointerdown', (p: Phaser.Input.Pointer) => {
      this.dragStartY = p.y;
      this.dragStartScroll = this.cameras.main.scrollY;
    });
    this.input.on('pointermove', (p: Phaser.Input.Pointer) => {
      if (this.dragStartY === null || !p.isDown) return;
      this.setScroll(this.dragStartScroll - (p.y - this.dragStartY));
    });
    this.input.on('pointerup', () => (this.dragStartY = null));
    this.input.on('wheel', (_p: unknown, _o: unknown, _dx: number, dy: number) => this.setScroll(this.cameras.main.scrollY + dy));
  }

  private setScroll(y: number): void {
    const max = Math.max(0, this.contentHeight - this.cameras.main.height + 48);
    this.cameras.main.scrollY = Phaser.Math.Clamp(y, 0, max);
  }

  /** (Re)draws everything from the current game state. */
  private build(): void {
    this.content?.destroy();
    const state = this.ctx.model.state;
    const width = this.ctx.layout.content.width;
    const items: Phaser.GameObjects.GameObject[] = [];
    let y = 28;

    items.push(this.add.text(PAD, y, 'THE ROAD', textStyle(26, TEXT_COLORS.accent, true)));
    items.push(
      this.add
        .text(width - PAD, y, state.run.runsCompleted > 0 ? `Best run: ${formatDistance(state.run.bestDistanceKm)}` : 'No runs yet', textStyle(26, TEXT_COLORS.secondary, true))
        .setOrigin(1, 0),
    );
    y += 52;
    items.push(
      this.add.text(PAD, y, 'Every run starts at the Junkyard. Reach a biome to unlock it.', {
        ...textStyle(26, TEXT_COLORS.secondary),
        wordWrap: { width: width - 2 * PAD },
      }),
    );
    y += 56;

    for (const biome of BIOMES) {
      items.push(...this.biomeCard(biome, PAD, y, width - 2 * PAD));
      y += CARD_HEIGHT + CARD_GAP;
    }

    y += 20;
    items.push(this.add.text(PAD, y, 'MILESTONES', textStyle(26, TEXT_COLORS.accent, true)));
    y += 52;
    const reached = new Set(state.milestones);
    for (const milestone of MILESTONES) {
      const done = reached.has(milestone.id);
      const { current, target } = milestoneProgress(state, milestone.condition);
      const progress =
        milestone.condition.kind === 'distance'
          ? `${formatDistance(Math.min(current, target))} / ${formatDistance(target)}`
          : milestone.condition.kind === 'runs'
            ? `${Math.min(current, target)} / ${target} runs`
            : `${Math.min(current, target)} / ${target} parts`;
      items.push(
        addFrame(this, PAD, y, width - 2 * PAD, MILESTONE_ROW - 12, { kind: 'card', color: done ? COLORS.money : COLORS.panelBorder }).setAlpha(
          done ? 1 : 0.75,
        ),
        this.add
          .image(PAD + 44, y + (MILESTONE_ROW - 12) / 2, uiIconKey(this, done ? 'star' : 'flag', done ? undefined : 0x6a6490))
          .setScale(3),
        this.add.text(PAD + 84, y + 10, milestone.title, textStyle(27, done ? TEXT_COLORS.warm : TEXT_COLORS.primary, true)),
        this.add.text(PAD + 84, y + 42, milestone.description, textStyle(20, TEXT_COLORS.secondary)),
        this.add
          .text(width - PAD - 24, y + 14, done ? 'Done' : progress, textStyle(24, done ? GREEN : TEXT_COLORS.secondary, true))
          .setOrigin(1, 0),
      );
      y += MILESTONE_ROW;
    }

    this.contentHeight = y;
    this.content = this.add.container(0, 0, items);
    this.setScroll(this.cameras.main.scrollY);
  }

  private biomeCard(biome: BiomeDef, x: number, y: number, width: number): Phaser.GameObjects.GameObject[] {
    const state = this.ctx.model.state;
    const best = state.run.bestDistanceKm;
    // Reached on a run; biomes with an unlock milestone also become farmable ("unlocked").
    const reached = state.run.runsCompleted > 0 && best >= biome.startKm;
    const unlocked = state.unlockedBiomes.includes(biome.id) || reached;
    const here = best >= biome.startKm && best < biome.endKm && state.run.runsCompleted > 0;
    const objs: Phaser.GameObjects.GameObject[] = [];

    objs.push(
      addFrame(this, x, y, width, CARD_HEIGHT, { kind: 'panel', color: here ? COLORS.accentWarm : unlocked ? COLORS.panelBorder : 0x2a2448 }),
    );
    // A strip of the biome's sky colours, dimmed while locked.
    const stripWidth = 26;
    const sky = biome.palette.sky;
    const bandHeight = (CARD_HEIGHT - 24) / sky.length;
    sky.forEach((color, i) => {
      objs.push(
        this.add
          .rectangle(x + 16, y + 12 + i * bandHeight, stripWidth, Math.ceil(bandHeight), color, unlocked ? 1 : 0.3)
          .setOrigin(0),
      );
    });

    const left = x + 14 + stripWidth + 22;
    const range = Number.isFinite(biome.endKm)
      ? `${formatDistance(biome.startKm)} – ${formatDistance(biome.endKm)}`
      : `from ${formatDistance(biome.startKm)}`;
    objs.push(
      this.add.text(left, y + 16, biome.name, textStyle(32, unlocked ? TEXT_COLORS.primary : TEXT_COLORS.muted, true)),
      this.add.text(x + width - 20, y + 20, range, textStyle(24, TEXT_COLORS.secondary, true)).setOrigin(1, 0),
      this.add.text(left, y + 56, biome.description, {
        ...textStyle(22, unlocked ? TEXT_COLORS.secondary : TEXT_COLORS.muted),
        wordWrap: { width: width - (left - x) - 20 },
      }),
    );

    const status = here
      ? '> Your best run got this far'
      : unlocked
        ? 'Unlocked'
        : reached
          ? 'Reached · more to discover soon'
          : `Locked · reach ${formatDistance(biome.startKm)}`;
    objs.push(
      this.add.text(left, y + CARD_HEIGHT - 52, status, textStyle(22, here ? TEXT_COLORS.warm : unlocked ? GREEN : TEXT_COLORS.muted, true)),
    );

    // Materials found here (on runs now; on its farm from Step 8).
    const found = MATERIAL_IDS.filter((id: MaterialId) => (biome.findsPerKm[id] ?? 0) > 0);
    found.forEach((id, i) => {
      objs.push(
        this.add
          .image(x + width - 20 - (found.length - i) * 42, y + CARD_HEIGHT - 40, materialIconKey(this, id))
          .setOrigin(0, 0.5)
          .setScale(3)
          .setAlpha(unlocked ? 1 : 0.35),
      );
    });

    // How far through this biome the best run got.
    if (Number.isFinite(biome.endKm)) {
      const ratio = Phaser.Math.Clamp((best - biome.startKm) / (biome.endKm - biome.startKm), 0, 1);
      const bar = new PixelBar(this, left, y + CARD_HEIGHT - 18, width - (left - x) - 24, 16, here ? COLORS.accentWarm : COLORS.good);
      bar.set(ratio);
      objs.push(...bar.objects);
    }
    return objs;
  }
}
