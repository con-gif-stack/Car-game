import Phaser from 'phaser';
import {
  buildContactShadow,
  buildDeposit,
  buildDrone,
  buildFarmGround,
  buildGarage,
  buildVignette,
  buildWreck,
  depositStage,
  drawGarageRoad,
  drawTracks,
  drawYardEdge,
} from '../art/farmArt';
import type { Haul } from '../core/farm';
import { crewsOf, farmDeposits, farmRates, inReach } from '../core/farm';
import { formatNumber, formatPrecise } from '../core/format';
import type { PurchaseKind } from '../core/GameModel';
import { canAfford, droneBuildCost, localUpgradeCost } from '../core/upgrades';
import { DRONE_MODELS, FARM_IDS, FARMS_BY_ID, GARAGE_POSITION, MAP_HEIGHT, MAP_WIDTH, type DepositDef, type FarmId } from '../data/farm';
import { MATERIAL_IDS, MATERIALS_BY_ID, RARITIES } from '../data/materials';
import { MILESTONES_BY_ID } from '../data/milestones';
import { COLORS, TEXT_COLORS, UI_PIXEL } from '../ui/theme';
import type { AppContext } from './context';
import { cssColor, dismissPanel } from './panel';
import { openDroneBayPanel, openFarmPanel, panelSignature } from './panels';
import { overlayStyle, textStyle } from './textStyles';
import { FARM_DEPTH, FarmFx } from './farmFx';
import { ensureGridTexture, materialIconKey } from './textures';
import { addButton, addDot, addFrame, PixelBar, uiIconKey, type PixelButton } from './ui';

const PAD = 32;
/** Height of the info panel under the map. */
const PANEL_HEIGHT = 250;
/** Space left at the bottom (the dev status line sits here). */
const BOTTOM_PAD = 48;
/** Space above the top of the map, so the furthest piles' lock icons stay on screen. */
const MAP_TOP_MARGIN = 40;
/** Screen units per art pixel for the ground, buildings and deposits. */
const GROUND_SCALE = 6;
const BUILDING_SCALE = 4;
const DEPOSIT_SCALE = 6;
const DRONE_SCALE = 5;
/** Milliseconds per rotor animation frame. */
const ROTOR_FRAME_MS = 70;

/** Whole amounts as "+1", fractions as "+0.75". */
const amount = (value: number) => (Math.abs(value - Math.round(value)) < 1e-6 ? formatNumber(value) : formatPrecise(value));

interface DroneSprite {
  shadow: Phaser.GameObjects.Ellipse;
  body: Phaser.GameObjects.Image;
  crate: Phaser.GameObjects.Rectangle;
  /** Last phase and position seen, for take-off puffs and tilting into the flight. */
  phase: string;
  lastX: number;
  sparkTimer: number;
}

type OpenPanel = 'droneBay' | 'farm';

/**
 * Farm tab (home): a top-down view of a farm. The Junkyard comes first; reaching a biome on a
 * run unlocks its farm, and the arrows at the top switch between them. Tap piles to scavenge
 * by hand; drones fly out from the garage, mine, and haul back, even while you're away. The
 * drones work one farm at a time (Relay Masts let them split up).
 */
export class FarmScene extends Phaser.Scene {
  private mapTop = 0;
  private mapHeight = 0;
  /** Screen units per map metre, across and down (the map stretches to fill tall screens). */
  private kx = 1;
  private ky = 1;
  private viewed: FarmId = 'junkyard';
  /** Everything drawn for the farm on screen, rebuilt when switching farms. */
  private mapObjects: Phaser.GameObjects.GameObject[] = [];
  private readonly depositImages = new Map<string, Phaser.GameObjects.Image>();
  private readonly depositStages = new Map<string, number>();
  private readonly lockIcons = new Map<string, Phaser.GameObjects.Image>();
  private readonly droneSprites: DroneSprite[] = [];
  private garagePoint = { x: 0, y: 0 };
  private fx: FarmFx | null = null;

  // Farm switcher.
  private switcher: Phaser.GameObjects.GameObject[] = [];

  // Info panel.
  private titleText!: Phaser.GameObjects.Text;
  private mainText!: Phaser.GameObjects.Text;
  private subText!: Phaser.GameObjects.Text;
  private progress!: PixelBar;
  private bayButton!: PixelButton;
  private bayDot!: Phaser.GameObjects.Image;
  private farmButton!: PixelButton;
  private farmDot!: Phaser.GameObjects.Image;

  private panel: Phaser.GameObjects.Container | null = null;
  private openPanel: OpenPanel | null = null;
  private panelSignature = '';
  private refreshTimer = 0;
  private hintTweens: Phaser.Tweens.Tween[] = [];
  private unlockedCount = 0;

  constructor(private readonly ctx: AppContext) {
    super({ key: 'FarmTab' });
  }

  create(): void {
    const { content } = this.ctx.layout;
    this.cameras.main.setViewport(content.x, content.y, content.width, content.height);
    const width = content.width;
    this.mapHeight = content.height - PANEL_HEIGHT - BOTTOM_PAD;
    this.kx = width / MAP_WIDTH;
    // The map fills the whole area above the info panel: taller screens spread the piles out
    // further down the screen (distances for the drones stay in metres, so nothing else changes).
    this.mapTop = MAP_TOP_MARGIN;
    this.ky = (this.mapHeight - MAP_TOP_MARGIN) / MAP_HEIGHT;

    // Start on the farm where most drones are.
    const crews = crewsOf(this.ctx.model.state.farm);
    this.viewed = FARM_IDS.reduce((best, id) => (crews[id] > crews[best] ? id : best), 'junkyard' as FarmId);
    this.createMap();
    this.createInfoPanel(width, this.mapHeight);
    this.createSwitcher();
    this.refreshInfo();

    const model = this.ctx.model;
    const offHaul = model.events.on('hauled', (haul) => this.onHaul(haul));
    const offBuy = model.events.on('purchased', (kind) => this.onPurchased(kind));
    const offMilestone = model.events.on('milestoneReached', () => {
      this.createSwitcher();
      this.refreshInfo();
    });
    const offCrews = model.events.on('crewsChanged', () => this.refreshInfo());
    this.events.once(Phaser.Scenes.Events.SHUTDOWN, () => {
      offHaul();
      offBuy();
      offMilestone();
      offCrews();
    });
    this.events.on(Phaser.Scenes.Events.WAKE, () => {
      this.createSwitcher();
      this.refreshInfo();
    });
    this.input.keyboard?.on('keydown-ESC', () => this.closePanel());
  }

  update(time: number, deltaMs: number): void {
    this.updateDrones(time, deltaMs / 1000);
    this.fx?.update(deltaMs / 1000, time);
    this.refreshTimer += deltaMs / 1000;
    if (this.refreshTimer >= 0.3) {
      this.refreshTimer = 0;
      this.refreshDeposits();
      this.refreshLocks();
      this.refreshInfo();
      if (this.unlockedFarms().length !== this.unlockedCount) this.createSwitcher();
      const signature = panelSignature(this.ctx.model);
      if (this.openPanel && signature !== this.panelSignature) this.showPanel(this.openPanel);
    }
  }

  /** Map metres to screen position. */
  private toScreen(p: { x: number; y: number }): { x: number; y: number } {
    return { x: p.x * this.kx, y: this.mapTop + p.y * this.ky };
  }

  private unlockedFarms(): FarmId[] {
    return FARM_IDS.filter((id) => this.ctx.model.isFarmUnlocked(id));
  }

  /** Shows another farm. */
  private viewFarm(id: FarmId): void {
    if (id === this.viewed) return;
    this.viewed = id;
    this.cameras.main.fadeIn(220, 10, 8, 24);
    this.createMap();
    this.createSwitcher();
    this.refreshInfo();
  }

  /** Draws the viewed farm: ground with tyre tracks, wrecks, the garage and the deposits. */
  private createMap(): void {
    for (const obj of this.mapObjects) obj.destroy();
    this.mapObjects = [];
    this.depositImages.clear();
    this.depositStages.clear();
    this.lockIcons.clear();
    this.stopHints();
    const add = <T extends Phaser.GameObjects.GameObject>(obj: T) => {
      this.mapObjects.push(obj);
      return obj;
    };
    const def = FARMS_BY_ID[this.viewed];
    const width = this.cameras.main.width;

    const gw = Math.ceil(width / GROUND_SCALE);
    const gh = Math.ceil(this.mapHeight / GROUND_SCALE);
    const groundKey = `farm/${def.id}/ground/${gw}x${gh}`;
    const toGround = (p: { x: number; y: number }) => {
      const s = this.toScreen(p);
      return { x: s.x / GROUND_SCALE, y: s.y / GROUND_SCALE };
    };
    ensureGridTexture(this, groundKey, () => {
      const g = buildFarmGround(gw, gh, 5 + FARM_IDS.indexOf(def.id), def.ground, def.id);
      drawGarageRoad(g, toGround(GARAGE_POSITION), def.ground);
      for (const deposit of def.deposits) drawTracks(g, toGround(GARAGE_POSITION), toGround(deposit), def.ground.track);
      drawYardEdge(g, def.id, 3 + FARM_IDS.indexOf(def.id));
      return g;
    });
    add(this.add.image(0, 0, groundKey).setOrigin(0).setScale(GROUND_SCALE).setDepth(-1000));
    const vignetteKey = `farm/vignette/${gw}x${gh}`;
    ensureGridTexture(this, vignetteKey, () => buildVignette(gw, gh));
    add(this.add.image(0, 0, vignetteKey).setOrigin(0).setScale(GROUND_SCALE).setAlpha(0.3).setDepth(FARM_DEPTH.vignette));
    /** A soft shadow under something standing on the ground. */
    const shadow = (x: number, y: number, width: number) => {
      const wPx = Math.max(6, Math.round(width / GROUND_SCALE));
      const hPx = Math.max(3, Math.round(wPx * 0.32));
      const key = `farm/shadow/${wPx}x${hPx}`;
      ensureGridTexture(this, key, () => buildContactShadow(wPx, hPx));
      return add(this.add.image(x, y, key).setScale(GROUND_SCALE).setAlpha(0.22).setDepth(-500));
    };

    def.wrecks.forEach((p, i) => {
      const seed = FARM_IDS.indexOf(def.id) * 10 + i + 1;
      const key = `farm/wreck/${seed}`;
      ensureGridTexture(this, key, () => buildWreck(seed));
      const s = this.toScreen(p);
      const wreck = add(this.add.image(s.x, s.y, key).setScale(BUILDING_SCALE).setDepth(s.y));
      shadow(s.x + 3, s.y + wreck.displayHeight * 0.3, wreck.displayWidth);
    });

    // Garage: its landing pad sits on the garage position.
    ensureGridTexture(this, 'farm/garage', buildGarage);
    const g = this.toScreen(GARAGE_POSITION);
    this.garagePoint = g;
    const garageScale = BUILDING_SCALE + 1;
    add(this.add.image(g.x - 22 * garageScale, g.y - 34 * garageScale, 'farm/garage').setOrigin(0).setScale(garageScale).setDepth(g.y));
    shadow(g.x + 10, g.y - 30, 44 * garageScale);

    // Deposits: tap to scavenge.
    for (const deposit of def.deposits) {
      const s = this.toScreen(deposit);
      const image = add(this.add.image(s.x, s.y, this.depositKey(deposit)).setScale(DEPOSIT_SCALE).setDepth(s.y));
      shadow(s.x + 3, s.y + image.displayHeight * 0.25, image.displayWidth * 0.7);
      image.setInteractive({ useHandCursor: true });
      image.on('pointerdown', () => this.scavenge(deposit));
      this.depositImages.set(deposit.id, image);
      if (deposit.range > 0) {
        this.lockIcons.set(deposit.id, add(this.add.image(s.x, s.y - 70, uiIconKey(this, 'lock')).setScale(UI_PIXEL * 0.75).setDepth(s.y + 1)));
      }
      // Rare piles sparkle so they stand out.
      if (deposit.rare) {
        const color = RARITIES[MATERIALS_BY_ID[deposit.material].rarity].color;
        const star = add(this.add.image(s.x + 50, s.y - 40, uiIconKey(this, 'star', color)).setScale(2).setDepth(s.y + 2));
        this.tweens.add({ targets: star, alpha: 0.2, scale: 1.4, duration: 900, yoyo: true, repeat: -1, ease: 'Sine.easeInOut' });
      }
    }
    for (const sprite of this.droneSprites.splice(0)) {
      sprite.shadow.destroy();
      sprite.body.destroy();
      sprite.crate.destroy();
    }
    this.refreshLocks();

    this.fx?.destroy();
    this.fx = new FarmFx(this, {
      farm: def.id,
      width,
      height: this.mapHeight,
      pad: g,
      neon: { x: g.x, y: g.y - 72, width: 80 },
      piles: () =>
        farmDeposits(this.viewed).flatMap((d) => {
          const img = this.depositImages.get(d.id);
          if (!img) return [];
          const stage = this.depositStages.get(d.id) ?? 0;
          return [{ id: d.id, x: img.x, y: img.y, width: img.displayWidth, height: img.displayHeight, visible: stage > 0 && img.alpha >= 1 }];
        }),
    });
  }

  /** The farm's name under the garage, with arrows to the other unlocked farms. */
  private createSwitcher(): void {
    for (const obj of this.switcher) obj.destroy();
    this.switcher = [];
    const farms = this.unlockedFarms();
    this.unlockedCount = farms.length;
    if (farms.length < 2) return;
    // Sits on the open ground just below the garage, which every farm keeps clear.
    const width = this.cameras.main.width;
    const y = this.mapHeight - 46;
    const name = this.add.text(width / 2, y, FARMS_BY_ID[this.viewed].name, overlayStyle(30, TEXT_COLORS.primary, true)).setOrigin(0.5).setDepth(6501);
    const plateWidth = Math.max(300, name.width + 64);
    const plate = addFrame(this, width / 2, y, plateWidth, 64, { kind: 'card', color: COLORS.accentWarm, originX: 0.5, originY: 0.5 }).setDepth(6500);
    const index = farms.indexOf(this.viewed);
    const go = (step: number) => this.viewFarm(farms[(index + step + farms.length) % farms.length] ?? 'junkyard');
    const offset = plateWidth / 2 + 52;
    const left = addButton(this, width / 2 - offset, y, 80, 64, '<', { onClick: () => go(-1), tone: 'neutral', fontSize: 40 }).setDepth(6500);
    const right = addButton(this, width / 2 + offset, y, 80, 64, '>', { onClick: () => go(1), tone: 'neutral', fontSize: 40 }).setDepth(6500);
    // Dots above the name: which of the unlocked farms this is.
    const dots = farms.map((id, i) =>
      this.add
        .rectangle(width / 2 + (i - (farms.length - 1) / 2) * 22, y - 44, 12, 12, id === this.viewed ? COLORS.accentWarm : 0x3b2f6a)
        .setStrokeStyle(2, 0x07050f)
        .setDepth(6501),
    );
    this.switcher.push(plate, name, left, right, ...dots);
  }

  /** Texture key for a deposit at its current fill stage (created on first use). */
  private depositKey(deposit: DepositDef): string {
    const stage = depositStage(this.ctx.model.state.farm.deposits[deposit.id] ?? 0, deposit.max);
    this.depositStages.set(deposit.id, stage);
    const seed = farmDeposits(this.viewed).indexOf(deposit) + 1 + FARM_IDS.indexOf(this.viewed) * 20;
    const key = `farm/deposit/${deposit.kind}/${seed}/${stage}`;
    ensureGridTexture(this, key, () => buildDeposit(deposit.kind, stage, seed));
    return key;
  }

  private refreshDeposits(): void {
    for (const deposit of farmDeposits(this.viewed)) {
      const stage = depositStage(this.ctx.model.state.farm.deposits[deposit.id] ?? 0, deposit.max);
      if (stage !== this.depositStages.get(deposit.id)) {
        this.depositImages.get(deposit.id)?.setTexture(this.depositKey(deposit));
      }
    }
  }

  /** Far piles out of the drones' Range are dimmed and show a lock. */
  private refreshLocks(): void {
    const farm = this.ctx.model.state.farm;
    for (const deposit of farmDeposits(this.viewed)) {
      const reachable = inReach(farm, deposit);
      const image = this.depositImages.get(deposit.id);
      if (image) {
        if (reachable) image.clearTint().setAlpha(1);
        else image.setTint(0x6a6490).setAlpha(0.7);
      }
      this.lockIcons.get(deposit.id)?.setVisible(!reachable);
    }
  }

  private scavenge(deposit: DepositDef): void {
    if (this.panel) return;
    const image = this.depositImages.get(deposit.id);
    if (!image) return;
    if (!inReach(this.ctx.model.state.farm, deposit)) {
      this.popup(image.x, image.y - 50, `Out of reach: needs Range ${deposit.range}`, COLORS.textSecondary);
      return;
    }
    if (this.ctx.model.isFull(deposit.material)) {
      this.popup(image.x, image.y - 50, `${MATERIALS_BY_ID[deposit.material].name} storage is full`, COLORS.accentWarm);
      return;
    }
    const haul = this.ctx.model.scavenge(deposit.id);
    // A little squash so the tap feels physical.
    this.tweens.killTweensOf(image);
    image.setScale(DEPOSIT_SCALE);
    this.tweens.add({ targets: image, scaleX: DEPOSIT_SCALE * 1.08, scaleY: DEPOSIT_SCALE * 0.9, duration: 70, yoyo: true });
    this.fx?.disturbed(deposit.id);
    if (!haul) {
      this.popup(image.x, image.y - 50, 'Picked clean', 0x9a98b8);
      return;
    }
    const material = MATERIALS_BY_ID[deposit.material];
    this.fx?.burst(image.x, image.y - 10, RARITIES[material.rarity].color);
    this.fx?.flyIcon(image.x, image.y - 20, materialIconKey(this, deposit.material), 4);
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
    // Hauls come from every farm with drones; only show them on a farm that has some.
    if (!this.scene.isActive() || crewsOf(this.ctx.model.state.farm)[this.viewed] <= 0) return;
    const parts: string[] = [];
    for (const id of MATERIAL_IDS) {
      if (haul.materials[id] > 0) parts.push(`+${amount(haul.materials[id])} ${MATERIALS_BY_ID[id].name}`);
    }
    const { x, y } = this.garagePoint;
    if (parts.length) this.popup(x, y - 150, parts.join(' · '), 0xc9ccd6);
    if (haul.money > 0) this.popup(x, y - 110, `+${formatPrecise(haul.money)}`, COLORS.money);
  }

  private onPurchased(kind: PurchaseKind): void {
    if (kind === 'drone' || kind === 'droneModel' || kind === 'farmLocal') this.cameras.main.flash(160, 255, 255, 255, false);
    this.refreshLocks();
    this.refreshInfo();
  }

  private popup(x: number, y: number, label: string, color: number): void {
    const text = this.add.text(x, y, label, overlayStyle(30, cssColor(color), true)).setOrigin(0.5).setDepth(5000);
    this.tweens.add({ targets: text, y: y - 70, alpha: 0, duration: 1200, ease: 'Cubic.easeOut', onComplete: () => text.destroy() });
  }

  /** Keeps one sprite per drone working the viewed farm, positioned and animated. */
  private updateDrones(time: number, dt: number): void {
    const model = this.ctx.model;
    const drones = model.farmSim.drones.filter((d) => d.farm === this.viewed);
    const droneModel = model.state.farm.droneModel;
    const frame = Math.floor(time / ROTOR_FRAME_MS) % 2;
    const key = this.droneKey(droneModel, frame);

    while (this.droneSprites.length < drones.length) {
      const shadow = this.add.ellipse(0, 0, 56, 20, 0x000000, 0.3).setDepth(FARM_DEPTH.droneShadow);
      const crate = this.add.rectangle(0, 0, 18, 14, 0xb3652d).setStrokeStyle(2, 0x1a1414).setDepth(FARM_DEPTH.drone - 1).setVisible(false);
      const body = this.add.image(0, 0, key).setScale(DRONE_SCALE).setDepth(FARM_DEPTH.drone);
      this.droneSprites.push({ shadow, body, crate, phase: '', lastX: Number.NaN, sparkTimer: 0 });
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
      // The shadow shrinks and fades the higher the drone flies.
      const lift = (altitude - 24) / 60;
      sprite.shadow.setPosition(ground.x, ground.y + 10).setScale(1 - lift * 0.3).setAlpha(0.95 - lift * 0.35);
      // Lean into the direction of flight.
      const vx = Number.isNaN(sprite.lastX) || dt <= 0 ? 0 : (ground.x - sprite.lastX) / dt;
      sprite.lastX = ground.x;
      const lean = Phaser.Math.Clamp(vx * 0.0025, -0.3, 0.3);
      sprite.body.setRotation(Phaser.Math.Linear(sprite.body.rotation, lean, Math.min(1, dt * 8)));
      sprite.body.setPosition(ground.x, ground.y - altitude).setTexture(key);
      const carrying = drone.cargo > 0.01 && drone.material !== null;
      sprite.crate.setVisible(carrying).setPosition(ground.x, ground.y - altitude + 40);
      if (carrying && drone.material) sprite.crate.setFillStyle(RARITIES[MATERIALS_BY_ID[drone.material].rarity].color);

      // Dust when lifting off from or landing on the pad; sparks while mining.
      if (sprite.phase && sprite.phase !== drone.phase) {
        const leaving = (sprite.phase === 'waiting' || sprite.phase === 'unloading') && drone.phase === 'outbound';
        if (leaving || drone.phase === 'unloading') this.fx?.puff(ground.x, ground.y + 10);
      }
      sprite.phase = drone.phase;
      if (drone.phase === 'mining') {
        sprite.sparkTimer -= dt;
        if (sprite.sparkTimer <= 0) {
          sprite.sparkTimer = 0.18 + Math.random() * 0.2;
          const color = drone.material ? RARITIES[MATERIALS_BY_ID[drone.material].rarity].color : 0xffc070;
          this.fx?.sparks(ground.x + (Math.random() - 0.5) * 30, ground.y, color);
        }
      }
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
    const buttonWidth = 240;
    const textWidth = width - 2 * PAD - 64 - buttonWidth - 24;
    this.titleText = this.add.text(left, y + 26, '', textStyle(24, TEXT_COLORS.warm, true)).setDepth(6001);
    this.mainText = this.add.text(left, y + 56, '', textStyle(38, TEXT_COLORS.primary, true)).setDepth(6001);
    this.subText = this.add
      .text(left, y + 108, '', { ...textStyle(23, TEXT_COLORS.secondary), wordWrap: { width: textWidth } })
      .setDepth(6001);
    this.progress = new PixelBar(this, left, y + 188, width - 2 * PAD - 64, 24, COLORS.accentWarm, { segment: 8 });
    for (const obj of this.progress.objects) obj.setDepth(6001);

    const buttonX = width - PAD - 32 - buttonWidth / 2;
    this.bayButton = addButton(this, buttonX, y + 62, buttonWidth, 80, 'Drone Bay', {
      onClick: () => this.showPanel('droneBay'),
      tone: 'secondary',
      fontSize: 28,
    }).setDepth(6001);
    this.bayDot = addDot(this, buttonX + buttonWidth / 2 - 10, y + 28).setDepth(6003).setVisible(false);
    this.farmButton = addButton(this, buttonX, y + 156, buttonWidth, 80, 'Farm', {
      onClick: () => this.showPanel('farm'),
      tone: 'primary',
      fontSize: 28,
    }).setDepth(6001);
    this.farmDot = addDot(this, buttonX + buttonWidth / 2 - 10, y + 122).setDepth(6003).setVisible(false);
  }

  private refreshInfo(): void {
    const { model } = this.ctx;
    const state = model.state;
    const farm = state.farm;
    const hasDrones = state.unlockedFeatures.includes('drones') && farm.droneCount > 0;
    const def = FARMS_BY_ID[this.viewed];

    if (!hasDrones) {
      const target = MILESTONES_BY_ID['first-drone']?.condition;
      const needed = target && target.kind === 'scavenged' ? target.count : 20;
      const left = Math.max(0, needed - farm.scavenged);
      this.titleText.setText('SCAVENGE BY HAND');
      this.mainText.setText('Tap the junk piles');
      this.subText.setText(`Collect materials by hand. ${left} more ${left === 1 ? 'tap' : 'taps'} and you'll have enough to build your first drone.`);
      this.subText.setWordWrapWidth(this.cameras.main.width - 2 * PAD - 64);
      this.subText.setColor(TEXT_COLORS.secondary);
      this.progress.setVisible(true);
      this.progress.set(farm.scavenged / needed);
      this.setButtonsVisible(false);
      if (this.viewed === 'junkyard') this.startHints();
      return;
    }

    this.stopHints();
    this.subText.setWordWrapWidth(this.cameras.main.width - 2 * PAD - 64 - 240 - 24);
    const crews = crewsOf(farm);
    const here = crews[this.viewed];
    const droneModel = DRONE_MODELS[farm.droneModel];
    this.titleText.setText(def.name.toUpperCase());
    this.mainText.setText(here > 0 ? `${here} × ${droneModel?.name ?? 'Drone'}` : 'No drones here');
    if (here === 0) {
      const where = FARM_IDS.filter((id) => crews[id] > 0).map((id) => FARMS_BY_ID[id].name);
      this.subText.setText(`Your drones are working ${where.join(' and ')}. Tap Farm to bring them here.`);
      this.subText.setColor(TEXT_COLORS.secondary);
    } else {
      const rates = farmRates(farm, model.isFull, this.viewed);
      const units = MATERIAL_IDS.reduce((sum, id) => sum + rates.materials[id], 0);
      // Drones leave full materials alone: say so, since it stops their money too.
      const full = [...new Set(def.deposits.filter((d) => inReach(farm, d) && model.isFull(d.material)).map((d) => d.material))];
      this.subText.setText(
        full.length
          ? `Storage full: ${full.map((id) => MATERIALS_BY_ID[id].name).join(', ')}. Spend it or build a bigger Warehouse.`
          : `+${formatPrecise(units * 3600)} materials/h · +${formatPrecise(rates.money * 3600)} money/h here.`,
      );
      this.subText.setColor(full.length ? TEXT_COLORS.warm : TEXT_COLORS.secondary);
    }
    this.progress.setVisible(false);
    this.setButtonsVisible(true);

    const resources = state.resources;
    const build = droneBuildCost(farm.droneCount, model.maxDrones());
    this.bayDot.setVisible(build !== null && canAfford(resources, build));
    const local = localUpgradeCost(farm, this.viewed);
    this.farmDot.setVisible(here === 0 || (local !== null && canAfford(resources, local)));
  }

  private setButtonsVisible(visible: boolean): void {
    for (const button of [this.bayButton, this.farmButton]) {
      button.setVisible(visible);
      if (button.background.input) button.background.input.enabled = visible;
    }
    if (!visible) {
      this.bayDot.setVisible(false);
      this.farmDot.setVisible(false);
    }
  }

  /** Before the first drone: the piles pulse gently to invite tapping. */
  private startHints(): void {
    if (this.hintTweens.length) return;
    let delay = 0;
    for (const image of this.depositImages.values()) {
      if (image.alpha < 1) continue;
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

  private showPanel(which: OpenPanel): void {
    const animate = this.openPanel !== which;
    this.panel?.destroy();
    this.openPanel = which;
    this.panelSignature = panelSignature(this.ctx.model);
    const { width, height } = this.cameras.main;
    const area = { x: 0, y: 0, width, height };
    const close = () => this.closePanel();
    this.panel =
      which === 'droneBay'
        ? openDroneBayPanel(this, this.ctx.model, area, close, animate, () => {
            this.closePanel();
            this.ctx.showTab('upgrades');
          })
        : openFarmPanel(this, this.ctx.model, this.viewed, area, close, animate);
    this.panel.setDepth(10000);
  }

  private closePanel(): void {
    dismissPanel(this.panel);
    this.panel = null;
    this.openPanel = null;
  }
}
