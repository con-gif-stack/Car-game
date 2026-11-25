import Phaser from 'phaser';
import { buildDeposit, buildDrone, buildFarmGround, buildGarage, buildWreck, depositStage, drawTracks } from '../art/farmArt';
import type { Haul } from '../core/farm';
import { DEPOSITS, farmRates } from '../core/farm';
import { formatNumber, formatPrecise } from '../core/format';
import type { PurchaseKind } from '../core/GameModel';
import { canAfford, droneBuildCost, droneModelCost } from '../core/upgrades';
import { DRONE_MODELS, GARAGE_POSITION, MAP_HEIGHT, MAP_WIDTH } from '../data/farm';
import { MATERIAL_IDS, MATERIALS_BY_ID, RARITIES } from '../data/materials';
import { MILESTONES_BY_ID } from '../data/milestones';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import type { AppContext } from './context';
import { cssColor } from './panel';
import { openDroneBayPanel, panelSignature } from './panels';
import { overlayStyle, textStyle } from './textStyles';
import { ensureGridTexture } from './textures';
import { addButton, addDot, addFrame, PixelBar, type PixelButton } from './ui';

const PAD = 32;
/** Height of the info panel under the map. */
const PANEL_HEIGHT = 250;
/** Space left at the bottom (the dev status line sits here). */
const BOTTOM_PAD = 48;
/** Screen units per art pixel for the ground, buildings and deposits. */
const GROUND_SCALE = 6;
const BUILDING_SCALE = 4;
const DEPOSIT_SCALE = 6;
const DRONE_SCALE = 5;
/** Milliseconds per rotor animation frame. */
const ROTOR_FRAME_MS = 70;

/** Whole amounts as "+1", fractions as "+0.75". */
const amount = (value: number) => (Math.abs(value - Math.round(value)) < 1e-6 ? formatNumber(value) : formatPrecise(value));

/** Decorative wrecks around the yard (map metres). */
const WRECKS = [
  { x: 8, y: 6 },
  { x: 92, y: 58 },
  { x: 28, y: 72 },
  { x: 74, y: 70 },
  { x: 94, y: 4 },
  { x: 6, y: 82 },
];

interface DroneSprite {
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Image;
  crate: Phaser.GameObjects.Rectangle;
}

/**
 * Farm tab (home): a top-down view of the Junkyard. Tap piles to scavenge by hand; once
 * unlocked, drones fly out, mine, and haul back to the garage, even while you're away.
 */
export class FarmScene extends Phaser.Scene {
  private mapTop = 0;
  private k = 1;
  private readonly depositImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly depositStages = new Map<string, number>();
  private readonly droneSprites: DroneSprite[] = [];
  private garagePoint = { x: 0, y: 0 };

  // Info panel.
  private titleText!: Phaser.GameObjects.Text;
  private mainText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private progress!: PixelBar;
  private bayButton!: PixelButton;
  private bayDot!: Phaser.GameObjects.Image;

  private panel: Phaser.GameObjects.Container | null = null;
  private panelSignature = '';
  private refreshTimer = 0;
  private hintTweens: Phaser.Tweens.Tween[] = [];

  constructor(private readonly ctx: AppContext) {
    super({ key: 'FarmTab' });
  }

  create(): void {
    const { content } = this.ctx.layout;
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);
    const width = content.width;
    const mapHeight = content.height - PANEL_HEIGHT - BOTTOM_PAD;
    this.k = width / MAP_WIDTH;
    // The garage sits near the bottom; taller screens show more ground above.
    this.mapTop = mapHeight - MAP_HEIGHT * this.k;

    this.createMap(width, mapHeight);
    this.createInfoPanel(width, mapHeight);
    this.refreshInfo();

    const model = this.ctx.model;
    const offHaul = model.events.on('hauled', (haul) => this.onHaul(haul));
    const offBuy = model.events.on('purchased', (kind) => this.onPurchased(kind));
    const offMilestone = model.events.on('milestoneReached', () => this.refreshInfo());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offHaul();
      offBuy();
      offMilestone();
    });
    this.events.on(Phaser.Scenes.Events.WAKE, () => this.refreshInfo());
    this.input.keyboard?.on('keydown-ESC', () => this.closePanel());
  }

  update(time: number, deltaMs: number): void {
    this.updateDrones(time);
    this.refreshTimer += deltaMs / 1000;
    if (this.refreshTimer >= 0.3) {
      this.refreshTimer = 0;
      this.refreshDeposits();
      this.refreshInfo();
      const signature = panelSignature(this.ctx.model);
      if (this.panel && signature !== this.panelSignature) this.showDroneBay();
    }
  }

  /** Map metres to screen position. */
  private toScreen(p: { x: number; y: number }): { x: number; y: number } {
    return { x: p.x * this.k, y: this.mapTop + p.y * this.k };
  }

  private createMap(width: number, mapHeight: number): void {
    // Ground, with tyre tracks from the garage to each deposit.
    const gw = Math.ceil(width / GROUND_SCALE);
    const gh = Math.ceil(mapHeight / GROUND_SCALE);
    const groundKey = `farm/junkyard/ground/${gw}x${gh}`;
    const toGround = (p: { x: number; y: number }) => {
      const s = this.toScreen(p);
      return { x: s.x / GROUND_SCALE, y: s.y / GROUND_SCALE };
    };
    ensureGridTexture(this, groundKey, () => {
      const g = buildFarmGround(gw, gh, 5);
      for (const deposit of DEPOSITS) drawTracks(g, toGround(GARAGE_POSITION), toGround(deposit));
      return g;
    });
    this.add.image(0, 0, groundKey).setOrigin(0).setScale(GROUND_SCALE).setDepth(-1000);

    WRECKS.forEach((p, i) => {
      const key = `farm/wreck/${i}`;
      ensureGridTexture(this, key, () => buildWreck(i + 1));
      const s = this.toScreen(p);
      this.add.image(s.x, s.y, key).setScale(BUILDING_SCALE).setDepth(s.y);
    });

    // Garage: its landing pad sits on the garage position.
    ensureGridTexture(this, 'farm/garage', buildGarage);
    const g = this.toScreen(GARAGE_POSITION);
    this.garagePoint = g;
    const garageScale = BUILDING_SCALE + 1;
    this.add.image(g.x - 22 * garageScale, g.y - 34 * garageScale, 'farm/garage').setOrigin(0).setScale(garageScale).setDepth(g.y);

    // Deposits: tap to scavenge.
    for (const deposit of DEPOSITS) {
      const s = this.toScreen(deposit);
      const image = this.add.image(s.x, s.y, this.depositKey(deposit.id)).setScale(DEPOSIT_SCALE).setDepth(s.y);
      image.setInteractive({ useHandCursor: true });
      image.on('pointerdown', () => this.scavenge(deposit.id));
      this.depositImages.set(deposit.id, image);
    }
  }

  /** Texture key for a deposit at its current fill stage (created on first use). */
  private depositKey(id: string): string {
    const deposit = DEPOSITS.find((d) => d.id === id);
    if (!deposit) return '__DEFAULT';
    const stage = depositStage(this.ctx.model.state.farm.deposits[id] ?? 0, deposit.max);
    this.depositStages.set(id, stage);
    const seed = DEPOSITS.indexOf(deposit) + 1;
    const key = `farm/deposit/${deposit.kind}/${seed}/${stage}`;
    ensureGridTexture(this, key, () => buildDeposit(deposit.kind, stage, seed));
    return key;
  }

  private refreshDeposits(): void {
    for (const deposit of DEPOSITS) {
      const stage = depositStage(this.ctx.model.state.farm.deposits[deposit.id] ?? 0, deposit.max);
      if (stage !== this.depositStages.get(deposit.id)) {
        this.depositImages.get(deposit.id)?.setTexture(this.depositKey(deposit.id));
      }
    }
  }

  private scavenge(depositId: string): void {
    if (this.panel) return;
    const haul = this.ctx.model.scavenge(depositId);
    const image = this.depositImages.get(depositId);
    if (!image) return;
    // A little squash so the tap feels physical.
    this.tweens.killTweensOf(image);
    image.setScale(DEPOSIT_SCALE);
    this.tweens.add({ targets: image, scaleX: DEPOSIT_SCALE * 1.08, scaleY: DEPOSIT_SCALE * 0.9, duration: 70, yoyo: true });
    if (!haul) {
      this.popup(image.x, image.y - 50, 'Picked clean', 0x9a98b8);
      return;
    }
    for (const id of MATERIAL_IDS) {
      if (haul.materials[id] > 0) {
        const material = MATERIALS_BY_ID[id];
        this.popup(image.x, image.y - 60, `+${amount(haul.materials[id])} ${material.name}`, RARITIES[material.rarity].color);
      }
    }
    this.refreshDeposits();
    this.refreshInfo();
  }

  private onHaul(haul: Haul): void {
    if (!this.scene.isActive()) return;
    const parts: string[] = [];
    for (const id of MATERIAL_IDS) {
      if (haul.materials[id] > 0) parts.push(`+${amount(haul.materials[id])} ${MATERIALS_BY_ID[id].name}`);
    }
    const { x, y } = this.garagePoint;
    if (parts.length) this.popup(x, y - 150, parts.join(' · '), 0xc9ccd6);
    if (haul.money > 0) this.popup(x, y - 110, `+${formatPrecise(haul.money)}`, COLORS.money);
  }

  private onPurchased(kind: PurchaseKind): void {
    if (kind === 'drone' || kind === 'droneModel') {
      this.cameras.main.flash(160, 255, 255, 255, false);
      this.refreshInfo();
    }
  }

  private popup(x: number, y: number, label: string, color: number): void {
    const text = this.add.text(x, y, label, overlayStyle(30, cssColor(color), true)).setOrigin(0.5).setDepth(5000);
    this.tweens.add({ targets: text, y: y - 70, alpha: 0, duration: 1200, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
  }

  /** Keeps one sprite per drone in the simulation, positioned and animated. */
  private updateDrones(time: number): void {
    const model = this.ctx.model;
    const drones = model.farmSim.drones;
    const droneModel = model.state.farm.droneModel;
    const frame = Math.floor(time / ROTOR_FRAME_MS) % 2;
    const key = this.droneKey(droneModel, frame);

    while (this.droneSprites.length < drones.length) {
      const shadow = this.add.ellipse(0, 0, 56, 20, 0x000000, 0.3).setDepth(3000);
      const crate = this.add.rectangle(0, 0, 18, 14, 0xb3652d).setStrokeStyle(2, 0x1a1414).setDepth(3999).setVisible(false);
      const body = this.add.image(0, 0, key).setScale(DRONE_SCALE).setDepth(4000);
      this.droneSprites.push({ shadow, body, crate });
    }
    while (this.droneSprites.length > drones.length) {
      const sprite = this.droneSprites.pop();
      sprite?.shadow.destroy();
      sprite?.body.destroy();
      sprite?.crate.destroy();
    }

    drones.forEach((drone, i) => {
      const sprite = this.droneSprites[i];
      if (!sprite) return;
      const ground = this.toScreen(drone);
      // Flying drones bob above their shadow; parked ones sit lower.
      const parked = drone.phase === 'waiting' || drone.phase === 'unloading';
      const altitude = (parked ? 30 : 70) + Math.sin(time / 300 + i * 1.7) * 6;
      sprite.shadow.setPosition(ground.x, ground.y + 10);
      sprite.body.setPosition(ground.x, ground.y - altitude).setTexture(key);
      const carrying = drone.cargo > 0.01 && drone.material !== null;
      sprite.crate.setVisible(carrying).setPosition(ground.x, ground.y - altitude + 40);
      if (carrying && drone.material) sprite.crate.setFillStyle(RARITIES[MATERIALS_BY_ID[drone.material].rarity].color);
    });
  }

  private droneKey(model: number, frame: number): string {
    const key = `farm/drone/${model}/${frame}`;
    ensureGridTexture(this, key, () => buildDrone(model, frame));
    return key;
  }

  private createInfoPanel(width: number, top: number): void {
    const y = top + 16;
    addFrame(this, PAD, y, width - 2 * PAD, PANEL_HEIGHT - 28).setDepth(6000);
    const left = PAD + 32;
    this.titleText = this.add.text(left, y + 26, '', textStyle(24, TEXT_COLORS.warm, true)).setDepth(6001);
    this.mainText = this.add.text(left, y + 56, '', textStyle(38, TEXT_COLORS.primary, true)).setDepth(6001);
    this.subText = this.add
      .text(left, y + 110, '', { ...textStyle(24, TEXT_COLORS.secondary), wordWrap: { width: width - 2 * PAD - 64 } })
      .setDepth(6001);
    this.progress = new PixelBar(this, left, y + 188, width - 2 * PAD - 64, 24, COLORS.accentWarm, { segment: 8 });
    for (const obj of this.progress.objects) obj.setDepth(6001);

    const buttonWidth = 260;
    const buttonX = width - PAD - 32 - buttonWidth / 2;
    this.bayButton = addButton(this, buttonX, y + 82, buttonWidth, 88, 'Drone Bay', {
      onClick: () => this.showDroneBay(),
      tone: 'secondary',
      fontSize: 30,
    }).setDepth(6001);
    this.bayDot = addDot(this, buttonX + buttonWidth / 2 - 10, y + 44).setDepth(6003).setVisible(false);
  }

  private refreshInfo(): void {
    const state = this.ctx.model.state;
    const farm = state.farm;
    const hasDrones = state.unlockedFeatures.includes('drones') && farm.droneCount > 0;

    if (!hasDrones) {
      const target = MILESTONES_BY_ID['first-drone']?.condition;
      const needed = target && target.kind === 'scavenged' ? target.count : 20;
      const left = Math.max(0, needed - farm.scavenged);
      this.titleText.setText('SCAVENGE BY HAND');
      this.mainText.setText('Tap the junk piles');
      this.subText.setText(`Collect materials by hand. ${left} more ${left === 1 ? 'tap' : 'taps'} and you'll have enough to build your first drone.`);
      this.setProgress(farm.scavenged / needed);
      this.setBayVisible(false);
      this.startHints();
      return;
    }

    this.stopHints();
    const model = DRONE_MODELS[farm.droneModel];
    const rates = farmRates(farm);
    const units = MATERIAL_IDS.reduce((sum, id) => sum + rates.materials[id], 0);
    this.titleText.setText('DRONES');
    this.mainText.setText(`${farm.droneCount} × ${model?.name ?? 'Drone'}`);
    this.subText.setText(`+${formatPrecise(units * 3600)} materials/h · +${formatPrecise(rates.money * 3600)} money/h. Tap piles to help out.`);
    this.progress.setVisible(false);
    this.setBayVisible(true);

    const resources = state.resources;
    const build = droneBuildCost(farm.droneCount);
    const upgrade = droneModelCost(farm.droneModel);
    this.bayDot.setVisible((build !== null && canAfford(resources, build)) || (upgrade !== null && canAfford(resources, upgrade)));
  }

  private setProgress(ratio: number): void {
    this.progress.setVisible(true);
    this.progress.set(ratio);
  }

  private setBayVisible(visible: boolean): void {
    this.bayButton.setVisible(visible);
    if (this.bayButton.background.input) this.bayButton.background.input.enabled = visible;
    if (!visible) this.bayDot.setVisible(false);
  }

  /** Before the first drone: the piles pulse gently to invite tapping. */
  private startHints(): void {
    if (this.hintTweens.length) return;
    let delay = 0;
    for (const image of this.depositImages.values()) {
      this.hintTweens.push(
        this.tweens.add({
          targets: image,
          scale: DEPOSIT_SCALE * 1.06,
          duration: 600,
          yoyo: true,
          repeat: -1,
          delay,
          ease: 'Sine.easeInOut',
        }),
      );
      delay += 150;
    }
  }

  private stopHints(): void {
    if (!this.hintTweens.length) return;
    for (const tween of this.hintTweens) tween.remove();
    this.hintTweens = [];
    for (const image of this.depositImages.values()) image.setScale(DEPOSIT_SCALE);
  }

  private showDroneBay(): void {
    const animate = this.panel === null;
    this.panel?.destroy();
    this.panelSignature = panelSignature(this.ctx.model);
    const { width, height } = this.cameras.main;
    this.panel = openDroneBayPanel(this, this.ctx.model, { x: 0, y: 0, width, height }, () => this.closePanel(), animate);
    this.panel.setDepth(10000);
  }

  private closePanel(): void {
    this.panel?.destroy();
    this.panel = null;
  }
}
