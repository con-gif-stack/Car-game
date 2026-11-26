import Phaser from 'phaser';
import { buildDrone } from '../art/farmArt';
import type { UiIcon } from '../art/uiIcons';
import { branchLevel, branchMaxLevel, branchMultiplier, branchTotalLevels, DEPOSITS, farmOf, farmRates } from '../core/farm';
import { formatNumber, formatPrecise } from '../core/format';
import type { PurchaseKind } from '../core/GameModel';
import { canAfford, costMaterials, droneBranchCost, droneModelCost } from '../core/upgrades';
import type { Cost } from '../data/economy';
import { DRONE_BRANCHES, DRONE_MODELS, type DroneBranch, type DroneBranchId } from '../data/farm';
import { MATERIAL_IDS } from '../data/materials';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import type { AppContext } from './context';
import { openDroneModelPanel, panelSignature } from './panels';
import { dismissPanel } from './panel';
import { overlayStyle, textStyle, wrapStyle } from './textStyles';
import { ensureGridTexture, materialIconKey, moneyIconKey } from './textures';
import { addButton, addThemedFrame, glowKey, uiIconKey } from './ui';

const PAD = 32;
const BOTTOM_PAD = 48;
const HEADER_HEIGHT = 196;
const TRUNK_HEIGHT = 214;
const GAP = 20;
/** Seconds between checks for whether the screen needs redrawing. */
const REFRESH_INTERVAL = 0.25;

const BRANCH_ICONS: Record<DroneBranchId, UiIcon> = { speed: 'speed', cargo: 'cargo', drills: 'drill', range: 'range' };
const BRANCH_COLORS: Record<DroneBranchId, number> = {
  speed: COLORS.accentAlt,
  cargo: 0xd9a45a,
  drills: 0xc9ccd6,
  range: COLORS.good,
};

/**
 * Upgrades tab: the drone upgrade tree. The drone models are the trunk (each opens more levels
 * on every branch); the branches are Rotors (speed), Cargo Pods (storage), Drills (mining)
 * and Range (farther piles). Tap a branch's button to buy its next level.
 */
export class UpgradesScene extends Phaser.Scene {
  private root: Phaser.GameObjects.Container | null = null;
  private panel: Phaser.GameObjects.Container | null = null;
  private signature = '';
  private timer = 0;
  private headerDrone: Phaser.GameObjects.Image | null = null;

  constructor(private readonly ctx: AppContext) {
    super({ key: 'UpgradesTab' });
  }

  create(): void {
    const { content } = this.ctx.layout;
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);
    this.rebuild();
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.rebuild());
    const unsubscribe = this.ctx.model.events.on('purchased', (kind) => this.onPurchased(kind));
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, unsubscribe);
    this.input.keyboard?.on('keydown-ESC', () => this.closePanel());
  }

  update(time: number, deltaMs: number): void {
    // Rotors spin on the header drone.
    const model = this.ctx.model.state.farm.droneModel;
    this.headerDrone?.setTexture(this.droneKey(model, Math.floor(time / 70) % 2));

    this.timer += deltaMs / 1000;
    if (this.timer < REFRESH_INTERVAL) return;
    this.timer = 0;
    const signature = panelSignature(this.ctx.model);
    if (signature === this.signature) return;
    this.rebuild();
    if (this.panel) this.showModelPanel(false);
  }

  private onPurchased(kind: PurchaseKind): void {
    if (kind !== 'droneBranch' && kind !== 'droneModel') return;
    this.rebuild();
    if (this.panel) this.showModelPanel(false);
    this.cameras.main.flash(140, 255, 220, 160, false);
  }

  private droneKey(model: number, frame: number): string {
    const key = `farm/drone/${model}/${frame}`;
    ensureGridTexture(this, key, () => buildDrone(model, frame));
    return key;
  }

  /** Redraws the whole tree from the current state. */
  private rebuild(): void {
    this.signature = panelSignature(this.ctx.model);
    this.root?.destroy();
    const { width, height } = this.cameras.main;
    const objects: Phaser.GameObjects.GameObject[] = [];
    const add = <T extends Phaser.GameObjects.GameObject>(obj: T) => {
      objects.push(obj);
      return obj;
    };

    const { farm } = this.ctx.model.state;
    if (farm.droneCount < 1) {
      this.headerDrone = null;
      add(addThemedFrame(this, 'terminal', 'panel', PAD, 16, width - 2 * PAD, 260));
      add(this.add.image(width / 2, 90, uiIconKey(this, 'lock')).setScale(UI_PIXEL));
      add(this.add.text(width / 2, 160, 'No drones yet', textStyle(40, TEXT_COLORS.primary)).setOrigin(0.5));
      add(
        this.add
          .text(width / 2, 214, 'Scavenge on the Farm to build your first drone. Its upgrades appear here.', wrapStyle(26, TEXT_COLORS.secondary, width - 160, false, 'center'))
          .setOrigin(0.5),
      );
      this.root = this.add.container(0, 0, objects);
      return;
    }

    this.buildHeader(width, add);
    const trunkY = 16 + HEADER_HEIGHT + GAP;
    this.buildTrunk(width, trunkY, add);

    // Branches: a 2 × 2 grid hanging off the trunk.
    const gridY = trunkY + TRUNK_HEIGHT + GAP + 16;
    const cardWidth = (width - 2 * PAD - GAP) / 2;
    const cardHeight = Math.min(540, (height - gridY - BOTTOM_PAD - GAP) / 2);
    // Connectors from the trunk down to each column.
    for (const col of [0, 1]) {
      const x = PAD + col * (cardWidth + GAP) + cardWidth / 2;
      add(this.add.rectangle(x - 3, trunkY + TRUNK_HEIGHT, 6, gridY - trunkY - TRUNK_HEIGHT, COLORS.panelBorder).setOrigin(0));
    }
    DRONE_BRANCHES.forEach((branch, i) => {
      const x = PAD + (i % 2) * (cardWidth + GAP);
      const y = gridY + Math.floor(i / 2) * (cardHeight + GAP);
      this.buildBranch(branch, x, y, cardWidth, cardHeight, add);
    });
    this.root = this.add.container(0, 0, objects);
  }

  private buildHeader(width: number, add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T): void {
    const { model } = this.ctx;
    const farm = model.state.farm;
    const current = DRONE_MODELS[farm.droneModel];
    const rates = farmRates(farm, model.isFull);
    const perHour = MATERIAL_IDS.reduce((sum, id) => sum + rates.materials[id], 0) * 3600;

    add(addThemedFrame(this, 'terminal', 'panel', PAD, 16, width - 2 * PAD, HEADER_HEIGHT));
    add(this.add.image(PAD + 110, 16 + HEADER_HEIGHT / 2, glowKey(this, 24, COLORS.accentAlt)).setScale(4).setBlendMode(Phaser.BlendModes.ADD).setAlpha(0.4));
    this.headerDrone = add(this.add.image(PAD + 110, 16 + HEADER_HEIGHT / 2, this.droneKey(farm.droneModel, 0)).setScale(8));
    const left = PAD + 220;
    add(this.add.text(left, 40, 'DRONE TREE', textStyle(22, TEXT_COLORS.warm)));
    add(this.add.text(left, 66, `${farm.droneCount} × ${current?.name ?? 'Drone'}`, textStyle(40, TEXT_COLORS.primary)));
    add(
      this.add.text(
        left,
        122,
        `+${formatPrecise(perHour)} materials/h · +${formatPrecise(rates.money * 3600)} money/h`,
        textStyle(24, TEXT_COLORS.good),
      ),
    );
    add(this.add.text(left, 154, `Bays in use: ${farm.droneCount}/${model.maxDrones()}`, textStyle(22, TEXT_COLORS.secondary)));
  }

  /** The drone models as a chain of nodes; the next one opens its upgrade panel. */
  private buildTrunk(width: number, y: number, add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T): void {
    const farm = this.ctx.model.state.farm;
    const resources = this.ctx.model.state.resources;
    add(this.add.text(PAD, y, 'MODELS', overlayStyle(24, TEXT_COLORS.warm)));
    const count = DRONE_MODELS.length;
    const nodeWidth = 200;
    const nodeHeight = 168;
    const top = y + 38;
    const step = (width - 2 * PAD - nodeWidth) / (count - 1);
    // The trunk line behind the nodes.
    add(this.add.rectangle(PAD + nodeWidth / 2, top + nodeHeight / 2 - 3, width - 2 * PAD - nodeWidth, 6, COLORS.panelBorder).setOrigin(0));
    const owned = Math.floor(farm.droneModel);
    if (owned > 0) {
      add(this.add.rectangle(PAD + nodeWidth / 2, top + nodeHeight / 2 - 3, step * owned, 6, COLORS.accentWarm).setOrigin(0));
    }
    const nextCost = droneModelCost(owned);
    DRONE_MODELS.forEach((def, i) => {
      const x = PAD + i * step;
      const isCurrent = i === owned;
      const isNext = i === owned + 1;
      const affordable = isNext && nextCost !== null && canAfford(resources, nextCost);
      const edge = isCurrent ? COLORS.accentWarm : i < owned ? COLORS.panelBorder : isNext ? (affordable ? COLORS.good : COLORS.accent) : 0x2a2448;
      const card = add(addThemedFrame(this, 'terminal', 'card', x, top, nodeWidth, nodeHeight, { color: edge }).setAlpha(i > owned + 1 ? 0.5 : 1));
      add(this.add.image(x + nodeWidth / 2, top + 64, this.droneKey(i, 0)).setScale(5).setAlpha(i > owned ? 0.45 : 1));
      add(
        this.add
          .text(x + nodeWidth / 2, top + 124, def.name.replace(' Drone', ''), textStyle(24, i <= owned ? TEXT_COLORS.primary : TEXT_COLORS.muted))
          .setOrigin(0.5),
      );
      const tag = isCurrent ? 'NOW' : isNext ? (affordable ? 'READY' : 'NEXT') : '';
      if (tag) {
        add(
          this.add
            .text(x + nodeWidth / 2, top + 150, tag, textStyle(18, isCurrent ? TEXT_COLORS.warm : affordable ? TEXT_COLORS.good : TEXT_COLORS.accent))
            .setOrigin(0.5),
        );
      }
      if (isNext) {
        card.setInteractive({ useHandCursor: true });
        card.on('pointerup', () => this.showModelPanel(true));
        if (affordable) {
          const pulse = this.tweens.add({ targets: card, alpha: 0.7, duration: 600, yoyo: true, repeat: -1 });
          card.once(Phaser.GameObjects.Events.DESTROY, () => pulse.remove());
        }
      }
    });
  }

  private buildBranch(
    branch: DroneBranch,
    x: number,
    y: number,
    w: number,
    h: number,
    add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T,
  ): void {
    const { model } = this.ctx;
    const farm = model.state.farm;
    const resources = model.state.resources;
    const level = branchLevel(farm, branch.id);
    const max = branchMaxLevel(farm, branch.id);
    const total = branchTotalLevels(branch.id);
    const cost = droneBranchCost(farm, branch.id);
    const affordable = cost !== null && canAfford(resources, cost);
    const color = BRANCH_COLORS[branch.id];

    add(addThemedFrame(this, 'terminal', 'card', x, y, w, h, { color: affordable ? COLORS.good : color }));
    add(this.add.image(x + 24, y + 26, uiIconKey(this, BRANCH_ICONS[branch.id])).setOrigin(0).setScale(3));
    add(this.add.text(x + 86, y + 26, branch.name, textStyle(32, TEXT_COLORS.primary)));
    add(this.add.text(x + w - 24, y + 32, `${level}/${max}`, textStyle(26, TEXT_COLORS.secondary)).setOrigin(1, 0));

    // Level pips: bought, open with this model, locked until a better model.
    const pipGap = 4;
    const pipWidth = Math.min(26, (w - 48 - (total - 1) * pipGap) / total);
    for (let i = 0; i < total; i++) {
      const px = x + 24 + i * (pipWidth + pipGap);
      const state = i < level ? 'owned' : i < max ? 'open' : 'locked';
      add(
        this.add
          .rectangle(px, y + 86, pipWidth, 14, state === 'owned' ? color : state === 'open' ? 0x3b2f6a : 0x1d1838)
          .setOrigin(0)
          .setStrokeStyle(2, state === 'locked' ? 0x2a2448 : 0x07050f),
      );
    }

    add(this.add.text(x + 24, y + 118, this.branchEffect(branch.id, level), wrapStyle(24, TEXT_COLORS.primary, w - 48)));
    if (level < max) {
      add(this.add.text(x + 24, y + 150, `Next: ${this.branchEffect(branch.id, level + 1)}`, wrapStyle(22, TEXT_COLORS.good, w - 48)));
    }

    if (cost) this.costChips(cost, x + 24, y + h - 158, w - 48, add);

    const label =
      level >= total ? 'Maxed' : level >= max ? `Needs ${DRONE_MODELS[farm.droneModel + 1]?.name ?? 'a better drone'}` : 'Upgrade';
    add(
      addButton(this, x + w / 2, y + h - 56, w - 48, 72, label, {
        onClick: () => model.buyDroneBranch(branch.id),
        tone: 'secondary',
        enabled: affordable,
        fontSize: level >= max && level < total ? 22 : 30,
      }),
    );
  }

  /** What a branch level does, in a few words. */
  private branchEffect(id: DroneBranchId, level: number): string {
    const farm = { ...this.ctx.model.state.farm, branches: { ...this.ctx.model.state.farm.branches, [id]: level } };
    const pct = Math.round((branchMultiplier(farm, id) - 1) * 100);
    switch (id) {
      case 'speed':
        return `Flying speed +${pct}%`;
      case 'cargo':
        return `Carries +${pct}% per trip`;
      case 'drills':
        return `Mining +${pct}% · piles regrow +${Math.round(pct * (2 / 3))}%`;
      case 'range': {
        // Counted on the farms unlocked so far.
        const far = DEPOSITS.filter((d) => d.range > 0 && d.range <= level && this.ctx.model.isFarmUnlocked(farmOf(d))).length;
        return far === 0 ? 'Only the piles near the garage' : `Reaches ${far} far pile${far === 1 ? '' : 's'}`;
      }
    }
  }

  /** A cost as icon + amount chips, green when owned, red when short; wraps onto a second line. */
  private costChips(cost: Cost, x: number, y: number, w: number, add: <T extends Phaser.GameObjects.GameObject>(obj: T) => T): void {
    const resources = this.ctx.model.state.resources;
    const items: { icon: string; have: number; need: number }[] = [];
    if (cost.money) items.push({ icon: moneyIconKey(this), have: resources.money, need: cost.money });
    for (const [id, need] of costMaterials(cost)) items.push({ icon: materialIconKey(this, id), have: resources.materials[id], need });
    let cx = x;
    let cy = y;
    for (const item of items) {
      const text = this.add.text(0, 0, formatNumber(item.need), textStyle(24, item.have >= item.need ? TEXT_COLORS.good : TEXT_COLORS.bad));
      const chipWidth = 42 + text.width + 18;
      if (cx + chipWidth > x + w) {
        cx = x;
        cy += 44;
      }
      add(this.add.image(cx, cy + 18, item.icon).setOrigin(0, 0.5).setScale(3));
      add(text.setPosition(cx + 42, cy + 18).setOrigin(0, 0.5));
      cx += chipWidth;
    }
  }

  private showModelPanel(animate: boolean): void {
    this.panel?.destroy();
    const { width, height } = this.cameras.main;
    this.panel = openDroneModelPanel(this, this.ctx.model, { x: 0, y: 0, width, height }, () => this.closePanel(), animate);
  }

  private closePanel(): void {
    dismissPanel(this.panel);
    this.panel = null;
  }
}
