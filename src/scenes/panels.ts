import type Phaser from 'phaser';
import { formatDuration, formatNumber, formatPrecise } from '../core/format';
import type { GameModel } from '../core/GameModel';
import { salvageMagnetMultiplier } from '../core/idle';
import type { Resources } from '../core/state';
import { activeFarms, crewsOf, DEPOSITS, farmRates, localLevel, localRegrowth } from '../core/farm';
import {
  batchSeconds,
  capacityAt,
  garageLevel,
  garageUpgradeCost,
  refineryRecipe,
  refineryRecipes,
  refineryStatus,
  storageCap,
} from '../core/garage';
import {
  canAfford,
  costMaterials,
  droneBuildCost,
  droneModelCost,
  levelUpCost,
  localUpgradeCost,
  nextTierPart,
  salvageMagnetCost,
  tierCost,
} from '../core/upgrades';
import { getInstalledPart, partStatsAtLevel, type SlotDef, type StatBlock } from '../core/vehicle';
import { ECONOMY, PART_LEVELS, type Cost } from '../data/economy';
import { DRONE_MODELS, DRONES, FARMS_BY_ID, type FarmId } from '../data/farm';
import { DRONE_BAYS, FUEL_DEPOT_LEVELS, GARAGE_UPGRADES, GARAGE_UPGRADES_BY_ID, REFINERY, type GarageUpgradeId } from '../data/garage';
import { MATERIAL_IDS, MATERIALS, MATERIALS_BY_ID, RARITIES, type MaterialId } from '../data/materials';
import type { UiIcon } from '../art/uiIcons';
import { QUALITIES, STATS } from '../data/vehicles';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import { cssColor, Panel, type Area } from './panel';
import { materialIconKey, moneyIconKey } from './textures';
import { uiIconKey } from './ui';

/*
 * Contents of the game's pop-up panels: part details and upgrades, the Workshop, and the
 * materials Inventory. Each function builds a fresh panel; callers rebuild it when the
 * underlying numbers change (see panelSignature).
 */

const RED = TEXT_COLORS.bad;
const GREEN = TEXT_COLORS.good;

const fmtStat = (value: number) => `${Math.round(value * 10) / 10}`;

/** "+5.2 hp Power · +0.6 Fuel Efficiency" for the stats that change between two blocks. */
function statChanges(from: Partial<StatBlock>, to: Partial<StatBlock>): string {
  const parts: string[] = [];
  for (const stat of STATS) {
    const diff = (to[stat.id] ?? 0) - (from[stat.id] ?? 0);
    if (Math.abs(diff) < 0.05) continue;
    parts.push(`${diff > 0 ? '+' : '−'}${fmtStat(Math.abs(diff))}${stat.unit ? ` ${stat.unit}` : ''} ${stat.label}`);
  }
  return parts.length ? parts.join(' · ') : 'No stat change';
}

/** One row per resource in a cost: icon, name, and "owned / needed" in green or red. */
export function costRows(panel: Panel, scene: Phaser.Scene, resources: Resources, cost: Cost): void {
  const row = (icon: string, name: string, nameColor: string, owned: number, needed: number) =>
    panel.row({
      icon,
      title: name,
      titleColor: nameColor,
      value: `${formatNumber(owned)} / ${formatNumber(needed)}`,
      valueColor: owned >= needed ? GREEN : RED,
      size: 26,
      gapAfter: 6,
      iconScale: 3,
    });
  if (cost.money) row(moneyIconKey(scene), 'Money', TEXT_COLORS.primary, resources.money, cost.money);
  for (const [id, amount] of costMaterials(cost)) {
    const material = MATERIALS_BY_ID[id];
    row(materialIconKey(scene, id), material.name, cssColor(RARITIES[material.rarity].color), resources.materials[id], amount);
  }
}

/**
 * A short string that changes whenever a panel's contents would: owned amounts (as shown,
 * rounded down), parts and levels. Rebuild a panel only when this changes.
 */
export function panelSignature(model: GameModel): string {
  const { resources, workshop } = model.state;
  const owned = MATERIALS.map((m) => formatNumber(resources.materials[m.id])).join(',');
  const { farm } = model.state;
  // The refinery's countdown changes every second; round it so panels don't redraw constantly.
  const { refineryProgress, ...levels } = workshop;
  const refinery = Math.floor(refineryProgress * 20);
  return `${formatNumber(resources.money)}|${owned}|${JSON.stringify(model.activeCar.parts)}|${JSON.stringify(levels)}|${refinery}|${farm.droneCount}|${farm.droneModel}|${JSON.stringify(farm.branches)}|${JSON.stringify(farm.crews)}|${JSON.stringify(farm.local)}|${model.state.unlockedBiomes.length}`;
}

/** Details of the part in a slot, with buttons to level it up or install the next tier. */
export function openPartPanel(
  scene: Phaser.Scene,
  model: GameModel,
  slot: SlotDef,
  area: Area,
  onClose: () => void,
  animate = true,
): Phaser.GameObjects.Container {
  const car = model.activeCar;
  const resources = model.state.resources;
  const part = getInstalledPart(car, slot.id);
  const level = car.parts[slot.id]?.level ?? 1;
  const current = part ? partStatsAtLevel(part, level) : {};
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });

  panel.header(slot.label.toUpperCase());
  panel.text(part?.name ?? 'Empty slot', 48, TEXT_COLORS.primary, { bold: true, gapAfter: 6 });
  if (part) {
    const quality = QUALITIES[part.quality];
    panel.text(`${quality.label} · Level ${level}/${PART_LEVELS.maxLevel}`, 28, cssColor(quality.color), {
      bold: true,
      gapAfter: 10,
    });
  }
  panel.text(part?.description ?? `No ${slot.label.toLowerCase()} fitted yet.`, 28, TEXT_COLORS.secondary, { gapAfter: 20 });

  // Level up.
  if (part) {
    panel.divider();
    const cost = levelUpCost(part, level);
    if (cost) {
      panel.text(`LEVEL UP > ${level + 1}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
      panel.text(statChanges(current, partStatsAtLevel(part, level + 1)), 28, GREEN, { gapAfter: 12 });
      costRows(panel, scene, resources, cost);
      panel.gap(6);
      panel.button(`Level up · ${formatNumber(cost.money ?? 0)}`, {
        enabled: canAfford(resources, cost),
        onClick: () => model.buyLevelUp(slot.id),
        tone: 'secondary',
      });
    } else {
      panel.text('Max level. Install the next tier for more.', 28, TEXT_COLORS.muted, { gapAfter: 16 });
    }
  }

  // Next tier.
  panel.divider();
  const next = nextTierPart(car, slot.id);
  if (next) {
    const quality = QUALITIES[next.quality];
    panel.text(`UPGRADE > ${quality.label.toUpperCase()}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
    panel.text(next.name, 34, cssColor(quality.color), { bold: true, gapAfter: 4 });
    panel.text(statChanges(current, partStatsAtLevel(next, 1)), 28, GREEN, { gapAfter: 12 });
    const cost = tierCost(next);
    costRows(panel, scene, resources, cost);
    panel.gap(6);
    panel.button(`Install ${next.name}`, {
      enabled: canAfford(resources, cost),
      onClick: () => model.buyNextTier(slot.id),
    });
  } else {
    panel.text('Top tier for now. More tiers arrive with new areas.', 28, TEXT_COLORS.muted, { gapAfter: 16 });
  }

  panel.gap(4);
  panel.button('Close', { onClick: onClose, tone: 'neutral', height: 80 });
  return panel.finish();
}

/** Pages of the Workshop: its menu, one per garage upgrade, and the Salvage Magnet. */
export type WorkshopPage = 'menu' | GarageUpgradeId | 'magnet';

const WORKSHOP_ICONS: Record<GarageUpgradeId | 'magnet', UiIcon> = {
  droneBays: 'bay',
  warehouse: 'warehouse',
  fuelDepot: 'fuel',
  refinery: 'refinery',
  relayMasts: 'range',
  magnet: 'magnet',
};

/** What a garage upgrade does at a level, in one line. */
function garageEffect(id: GarageUpgradeId, level: number): string {
  switch (id) {
    case 'droneBays':
      return `Runs up to ${DRONES.maxCount + DRONE_BAYS.dronesPerLevel * level} drones`;
    case 'warehouse':
      return `Holds ${formatNumber(capacityAt(level, 'scrapMetal'))} of each Common and ${formatNumber(capacityAt(level, 'copperWire'))} of each Uncommon material`;
    case 'fuelDepot': {
      const depot = FUEL_DEPOT_LEVELS[level] ?? FUEL_DEPOT_LEVELS[0];
      return `${depot?.maxTanks ?? 3} fuel tanks, one refill every ${depot?.refillMinutes ?? 40} min`;
    }
    case 'relayMasts': {
      const farms = 1 + level;
      return farms === 1 ? 'All drones work one farm at a time' : `Drones can work ${farms} farms at once`;
    }
    case 'refinery': {
      if (level === 0) return 'Not built yet';
      const recipes = refineryRecipes(level).length;
      return `Works at ×${fmtStat(1 + REFINERY.speedPerLevel * (level - 1))} speed · ${recipes} recipe${recipes === 1 ? '' : 's'}`;
    }
  }
}

/** A material list as text: "40 Scrap Metal + 10 Rubber". */
function amounts(list: Partial<Record<MaterialId, number>>): string {
  return Object.entries(list)
    .map(([id, n]) => `${formatNumber(n ?? 0)} ${MATERIALS_BY_ID[id as MaterialId].name}`)
    .join(' + ');
}

/**
 * Workshop: the garage's own upgrades (Drone Bays, Warehouse, Fuel Depot, Refinery) and the
 * Salvage Magnet. The menu lists them; tapping one opens its page via `navigate`.
 */
export function openWorkshopPanel(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
  animate = true,
  page: WorkshopPage = 'menu',
  navigate: (page: WorkshopPage) => void = () => undefined,
): Phaser.GameObjects.Container {
  if (page === 'magnet') return magnetPage(scene, model, area, onClose, animate, navigate);
  if (page !== 'menu') return garageUpgradePage(scene, model, area, onClose, animate, page, navigate);

  const { resources, workshop } = model.state;
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });
  panel.header('WORKSHOP');
  panel.text('Upgrade the garage itself. Tap one to see more.', 26, TEXT_COLORS.secondary, { gapAfter: 18 });
  for (const def of GARAGE_UPGRADES) {
    const level = garageLevel(workshop, def.id);
    const cost = garageUpgradeCost(workshop, def.id);
    const ready = cost !== null && canAfford(resources, cost);
    panel.row({
      icon: uiIconKey(scene, WORKSHOP_ICONS[def.id]),
      iconScale: 3,
      title: def.name,
      sub: garageEffect(def.id, level),
      value: level >= def.maxLevel ? 'MAX' : `Lv ${level}/${def.maxLevel}`,
      valueColor: ready ? GREEN : TEXT_COLORS.secondary,
      cardColor: ready ? COLORS.good : undefined,
      size: 28,
      gapAfter: 10,
      onClick: () => navigate(def.id),
    });
  }
  const magnetLevel = workshop.salvageMagnetLevel;
  const magnetCost = salvageMagnetCost(magnetLevel);
  const magnetReady = magnetCost !== null && canAfford(resources, magnetCost);
  panel.row({
    icon: uiIconKey(scene, 'magnet'),
    iconScale: 3,
    title: 'Salvage Magnet',
    sub: `Rare and Epic trickle ×${fmtStat(salvageMagnetMultiplier(magnetLevel))}`,
    value: magnetCost ? `Lv ${magnetLevel}/${ECONOMY.salvageMagnet.maxLevel}` : 'MAX',
    valueColor: magnetReady ? GREEN : TEXT_COLORS.secondary,
    cardColor: magnetReady ? COLORS.good : undefined,
    size: 28,
    gapAfter: 10,
    onClick: () => navigate('magnet'),
  });
  panel.gap(8);
  panel.button('Close', { onClick: onClose, tone: 'neutral', height: 80 });
  return panel.finish();
}

/** One garage upgrade: what it does now and next, its price, and (for the Refinery) the recipes. */
function garageUpgradePage(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
  animate: boolean,
  id: GarageUpgradeId,
  navigate: (page: WorkshopPage) => void,
): Phaser.GameObjects.Container {
  const { resources, workshop } = model.state;
  const def = GARAGE_UPGRADES_BY_ID[id];
  const level = garageLevel(workshop, id);
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });
  panel.header(def.name.toUpperCase());
  panel.row({ icon: uiIconKey(scene, WORKSHOP_ICONS[id]), iconScale: 4, title: `Level ${level}/${def.maxLevel}`, sub: def.description, size: 34, gapAfter: 14 });
  panel.text(garageEffect(id, level), 28, TEXT_COLORS.primary, { gapAfter: 16 });

  if (id === 'refinery' && level > 0) refinerySection(panel, scene, model, navigate);

  panel.divider();
  const cost = garageUpgradeCost(workshop, id);
  if (cost) {
    panel.text(`${level === 0 ? 'BUILD' : 'UPGRADE'} > LEVEL ${level + 1}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
    panel.text(garageEffect(id, level + 1), 28, GREEN, { gapAfter: 12 });
    if (id === 'refinery') {
      const unlocks = REFINERY.recipes.filter((r) => r.level === level + 1);
      if (unlocks.length) panel.text(`Unlocks: ${unlocks.map((r) => r.name).join(', ')}`, 26, GREEN, { gapAfter: 12 });
    }
    costRows(panel, scene, resources, cost);
    panel.gap(6);
    panel.button(level === 0 ? `Build ${def.name}` : `Upgrade ${def.name}`, {
      enabled: canAfford(resources, cost),
      onClick: () => model.buyGarageUpgrade(id),
    });
  } else {
    panel.text('Fully upgraded.', 28, GREEN, { gapAfter: 16 });
  }
  panel.gap(4);
  panel.button('Back', { onClick: () => navigate('menu'), tone: 'neutral', height: 80 });
  return panel.finish();
}

/** The refinery's status and recipe list (tap a recipe to run it). */
function refinerySection(panel: Panel, scene: Phaser.Scene, model: GameModel, navigate: (page: WorkshopPage) => void): void {
  const { resources, workshop } = model.state;
  const level = garageLevel(workshop, 'refinery');
  const current = refineryRecipe(workshop.refineryRecipe);
  const status = refineryStatus(resources, workshop);
  const statusText =
    status === 'running' && current
      ? `Working: next batch in ${formatDuration((1 - workshop.refineryProgress) * batchSeconds(current, level))}`
      : status === 'noInputs'
        ? 'Waiting: not enough materials for the recipe'
        : status === 'storageFull'
          ? 'Waiting: no room in storage for what it makes'
          : 'Idle: pick a recipe below';
  panel.text(statusText, 26, status === 'running' ? GREEN : TEXT_COLORS.warm, { gapAfter: 12 });
  for (const recipe of REFINERY.recipes) {
    const unlocked = recipe.level <= level;
    const on = current?.id === recipe.id;
    panel.row({
      icon: materialIconKey(scene, Object.keys(recipe.outputs)[0] as MaterialId),
      iconScale: 3,
      title: recipe.name,
      titleColor: unlocked ? TEXT_COLORS.primary : TEXT_COLORS.muted,
      sub: unlocked
        ? `${amounts(recipe.inputs)} > ${amounts(recipe.outputs)} · ${formatDuration(batchSeconds(recipe, level))}`
        : `Needs Refinery level ${recipe.level}`,
      value: on ? 'ON' : unlocked ? 'Use' : '',
      valueColor: on ? GREEN : TEXT_COLORS.secondary,
      cardColor: on ? COLORS.good : undefined,
      size: 26,
      gapAfter: 8,
      onClick: unlocked
        ? () => {
            model.setRefineryRecipe(on ? '' : recipe.id);
            navigate('refinery');
          }
        : undefined,
    });
  }
  panel.gap(8);
}

/** The Salvage Magnet's page. */
function magnetPage(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
  animate: boolean,
  navigate: (page: WorkshopPage) => void,
): Phaser.GameObjects.Container {
  const resources = model.state.resources;
  const level = model.state.workshop.salvageMagnetLevel;
  const { maxLevel } = ECONOMY.salvageMagnet;
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });

  panel.header('SALVAGE MAGNET');
  panel.row({ icon: uiIconKey(scene, 'magnet'), iconScale: 4, title: `Level ${level}/${maxLevel}`, size: 34, gapAfter: 10 });
  panel.text(
    'Pulls the odd rare part out of the scrap. Boosts how often Rare and Epic materials turn up while you are idle. Drive runs stay their main source.',
    28,
    TEXT_COLORS.secondary,
    { gapAfter: 20 },
  );
  panel.divider();

  const cost = salvageMagnetCost(level);
  const now = salvageMagnetMultiplier(level);
  if (cost) {
    panel.text(`LEVEL UP > ${level + 1}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
    panel.text(`Rare finds ×${fmtStat(now)} > ×${fmtStat(salvageMagnetMultiplier(level + 1))}`, 30, GREEN, {
      gapAfter: 12,
    });
    costRows(panel, scene, resources, cost);
    panel.gap(6);
    panel.button('Upgrade magnet', {
      enabled: canAfford(resources, cost),
      onClick: () => model.buySalvageMagnet(),
      tone: 'secondary',
    });
  } else {
    panel.text(`Fully upgraded: rare finds ×${fmtStat(now)}.`, 30, GREEN, { gapAfter: 16 });
  }
  panel.gap(4);
  panel.button('Back', { onClick: () => navigate('menu'), tone: 'neutral', height: 80 });
  return panel.finish();
}

/** Every material: amount held (and the storage limit), rarity, and where it comes from. */
export function openInventoryPanel(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
  animate = true,
): Phaser.GameObjects.Container {
  const { resources, workshop } = model.state;
  const { materials } = resources;
  const rates = model.incomeRates().materialsPerSecond;
  const farmed = new Set(DEPOSITS.map((d) => d.material));
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });

  panel.header('MATERIALS');
  panel.text(
    `Everything your drones, runs and scavenging have brought in. Warehouse level ${garageLevel(workshop, 'warehouse')}: when a material is full, drones leave it alone.`,
    26,
    TEXT_COLORS.secondary,
    { gapAfter: 20 },
  );
  for (const material of MATERIALS) {
    const rarity = RARITIES[material.rarity];
    const perHour = rates[material.id] * 3600;
    const cap = storageCap(workshop, material.id);
    const full = model.isFull(material.id);
    const source = full
      ? `${rarity.label} · storage full`
      : farmed.has(material.id)
        ? perHour > 0
          ? `${rarity.label} · +${formatPrecise(perHour)}/h from drones`
          : `${rarity.label} · scavenge it on the farm`
        : perHour > 0
          ? `${rarity.label} · mostly from drive runs (+${formatPrecise(perHour)}/h)`
          : `${rarity.label} · from drive runs`;
    panel.row({
      icon: materialIconKey(scene, material.id),
      title: material.name,
      titleColor: cssColor(rarity.color),
      sub: source,
      subColor: full ? TEXT_COLORS.warm : undefined,
      value: Number.isFinite(cap) ? `${formatNumber(materials[material.id])} / ${formatNumber(cap)}` : formatPrecise(materials[material.id]),
      valueColor: full ? TEXT_COLORS.warm : undefined,
      size: 28,
      gapAfter: 14,
    });
  }
  panel.gap(4);
  panel.button('Close', { onClick: onClose, tone: 'neutral', height: 80 });
  return panel.finish();
}

/** Drone Bay: build more drones, with a way into the drone upgrade tree. */
export function openDroneBayPanel(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
  animate = true,
  openTree: () => void = () => undefined,
): Phaser.GameObjects.Container {
  const resources = model.state.resources;
  const farm = model.state.farm;
  const current = DRONE_MODELS[farm.droneModel] ?? DRONE_MODELS[0];
  const rates = farmRates(farm, model.isFull);
  const perHour = MATERIAL_IDS.reduce((sum, id) => sum + rates.materials[id], 0) * 3600;
  const limit = model.maxDrones();
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });

  panel.header('DRONE BAY');
  panel.text(`${farm.droneCount} × ${current?.name ?? ''}`, 48, TEXT_COLORS.primary, { bold: true, gapAfter: 6 });
  panel.text(current?.description ?? '', 28, TEXT_COLORS.secondary, { gapAfter: 8 });
  panel.text(
    `Together: +${formatPrecise(perHour)} materials/h · +${formatPrecise(rates.money * 3600)} money/h`,
    28,
    GREEN,
    { gapAfter: 20 },
  );

  panel.divider();
  const buildCost = droneBuildCost(farm.droneCount, limit);
  if (buildCost) {
    panel.text(`BUILD DRONE #${farm.droneCount + 1} (OF ${limit})`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 10 });
    costRows(panel, scene, resources, buildCost);
    panel.gap(6);
    panel.button('Build drone', {
      enabled: canAfford(resources, buildCost),
      onClick: () => model.buyDrone(),
      tone: 'secondary',
    });
  } else {
    panel.text(`All ${limit} bays are in use. Build more Drone Bays in the Garage's Workshop.`, 28, TEXT_COLORS.muted, { gapAfter: 16 });
  }
  panel.gap(4);
  panel.button('Drone upgrades >', { onClick: openTree, tone: 'primary', icon: uiIconKey(scene, 'upgrades', 0x3a2410) });
  panel.button('Close', { onClick: onClose, tone: 'neutral', height: 80 });
  return panel.finish();
}

/** The next drone model: what it does better and its price. */
export function openDroneModelPanel(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
  animate = true,
): Phaser.GameObjects.Container {
  const resources = model.state.resources;
  const farm = model.state.farm;
  const current = DRONE_MODELS[farm.droneModel] ?? DRONE_MODELS[0];
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });
  panel.header('DRONE MODEL');
  panel.text(`Now: ${current?.name ?? ''}`, 30, TEXT_COLORS.secondary, { gapAfter: 12 });
  const next = DRONE_MODELS[farm.droneModel + 1];
  const modelCost = droneModelCost(farm.droneModel);
  if (next && modelCost) {
    panel.text(next.name, 46, TEXT_COLORS.primary, { bold: true, gapAfter: 6 });
    panel.text(next.description, 28, TEXT_COLORS.secondary, { gapAfter: 8 });
    panel.text(
      `Base speed ×${fmtStat(next.speed / (current?.speed ?? 1))} · carries ${next.capacity} · digs ×${fmtStat(next.heapYield)}`,
      28,
      GREEN,
      { gapAfter: 6 },
    );
    panel.text('Opens more levels on every branch of the tree.', 26, GREEN, { gapAfter: 12 });
    costRows(panel, scene, resources, modelCost);
    panel.gap(6);
    panel.button('Upgrade all drones', {
      enabled: farm.droneCount > 0 && canAfford(resources, modelCost),
      onClick: () => model.buyDroneModel(),
    });
  } else {
    panel.text('Your drones are the best there are, for now.', 28, TEXT_COLORS.muted, { gapAfter: 16 });
  }
  panel.gap(4);
  panel.button('Close', { onClick: onClose, tone: 'neutral', height: 80 });
  return panel.finish();
}

/** A farm: where the drones are, the farm's rare pile, and its own upgrade. */
export function openFarmPanel(
  scene: Phaser.Scene,
  model: GameModel,
  id: FarmId,
  area: Area,
  onClose: () => void,
  animate = true,
): Phaser.GameObjects.Container {
  const { farm, resources } = model.state;
  const def = FARMS_BY_ID[id];
  const crews = crewsOf(farm);
  const here = crews[id];
  const total = farm.droneCount;
  const maxFarms = model.maxFarmsAtOnce();
  const active = activeFarms(farm);
  const panel = new Panel(scene, { area, onBackdrop: onClose, animate });

  panel.header(def.name.toUpperCase(), COLORS.accentWarm);
  panel.text(def.description, 26, TEXT_COLORS.secondary, { gapAfter: 12 });
  for (const deposit of def.deposits.filter((d) => d.rare && d.range === 0)) {
    const material = MATERIALS_BY_ID[deposit.material];
    panel.row({
      icon: materialIconKey(scene, material.id),
      iconScale: 3,
      title: `Rare pile: ${material.name}`,
      titleColor: cssColor(RARITIES[material.rarity].color),
      sub: 'Regrows slowly. Better drones can\'t dig it deeper; this farm\'s upgrade can.',
      size: 26,
      gapAfter: 12,
    });
  }

  panel.divider();
  panel.text(`DRONES HERE: ${here} OF ${total}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
  panel.text(
    maxFarms === 1
      ? 'Your drones work one farm at a time. Relay Masts in the Workshop let them split up.'
      : `Your drones can work ${maxFarms} farms at once. Now working: ${active.map((f) => FARMS_BY_ID[f].name).join(', ') || 'none'}.`,
    25,
    TEXT_COLORS.secondary,
    { gapAfter: 12 },
  );
  if (total > 0 && here < total) {
    panel.button('Bring all drones here', { onClick: () => model.moveAllDrones(id), tone: 'primary', height: 84 });
  }
  if (maxFarms > 1 && total > 0) {
    const canAdd = here < total && (here > 0 || active.length < maxFarms);
    const canRemove = here > 0 && active.some((f) => f !== id);
    panel.button('+1 drone here', { onClick: () => model.moveDroneTo(id), tone: 'secondary', enabled: canAdd, height: 80 });
    panel.button('-1 drone (to another farm)', { onClick: () => model.moveDroneFrom(id), tone: 'neutral', enabled: canRemove, height: 80 });
  }

  const local = def.local;
  if (local) {
    panel.divider();
    const level = localLevel(farm, id);
    panel.text(`${local.name.toUpperCase()} · LEVEL ${level}/${local.maxLevel}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
    panel.text(local.description, 25, TEXT_COLORS.secondary, { gapAfter: 6 });
    const now = Math.round((localRegrowth(farm, id) - 1) * 100);
    const cost = localUpgradeCost(farm, id);
    if (cost) {
      const next = Math.round(local.regrowBonusPerLevel * (level + 1) * 100);
      panel.text(`Piles here regrow +${now}% > +${next}%`, 27, GREEN, { gapAfter: 10 });
      costRows(panel, scene, resources, cost);
      panel.gap(6);
      panel.button(level === 0 ? `Get the ${local.name}` : `Upgrade the ${local.name}`, {
        enabled: canAfford(resources, cost),
        onClick: () => model.buyLocalUpgrade(id),
        tone: 'secondary',
      });
    } else {
      panel.text(`Fully upgraded: piles here regrow +${now}%.`, 27, GREEN, { gapAfter: 12 });
    }
  }
  panel.gap(4);
  panel.button('Close', { onClick: onClose, tone: 'neutral', height: 80 });
  return panel.finish();
}
