import type Phaser from 'phaser';
import { formatNumber, formatPrecise } from '../core/format';
import type { GameModel } from '../core/GameModel';
import { salvageMagnetMultiplier } from '../core/idle';
import type { Resources } from '../core/state';
import { canAfford, costMaterials, levelUpCost, nextTierPart, salvageMagnetCost, tierCost } from '../core/upgrades';
import { getInstalledPart, partStatsAtLevel, type SlotDef, type StatBlock } from '../core/vehicle';
import { ECONOMY, PART_LEVELS, type Cost } from '../data/economy';
import { MATERIALS, MATERIALS_BY_ID, RARITIES } from '../data/materials';
import { QUALITIES, STATS } from '../data/vehicles';
import { COLORS, TEXT_COLORS } from '../ui/theme';
import { cssColor, Panel, type Area } from './panel';
import { materialIconKey, moneyIconKey } from './textures';

/*
 * Contents of the game's pop-up panels: part details and upgrades, the Workshop, and the
 * materials Inventory. Each function builds a fresh panel; callers rebuild it when the
 * underlying numbers change (see panelSignature).
 */

const RED = '#ff5d6c';
const GREEN = '#6fe08a';

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
function costRows(panel: Panel, scene: Phaser.Scene, resources: Resources, cost: Cost): void {
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
  return `${formatNumber(resources.money)}|${owned}|${JSON.stringify(model.activeCar.parts)}|${workshop.salvageMagnetLevel}`;
}

/** Details of the part in a slot, with buttons to level it up or install the next tier. */
export function openPartPanel(
  scene: Phaser.Scene,
  model: GameModel,
  slot: SlotDef,
  area: Area,
  onClose: () => void,
): Phaser.GameObjects.Container {
  const car = model.activeCar;
  const resources = model.state.resources;
  const part = getInstalledPart(car, slot.id);
  const level = car.parts[slot.id]?.level ?? 1;
  const current = part ? partStatsAtLevel(part, level) : {};
  const panel = new Panel(scene, { area, onBackdrop: onClose });

  panel.text(slot.label.toUpperCase(), 26, TEXT_COLORS.accent, { bold: true, gapAfter: 8 });
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
      panel.text(`LEVEL UP → ${level + 1}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
      panel.text(statChanges(current, partStatsAtLevel(part, level + 1)), 28, GREEN, { gapAfter: 12 });
      costRows(panel, scene, resources, cost);
      panel.gap(6);
      panel.button(`Level up · ${formatNumber(cost.money ?? 0)}`, {
        enabled: canAfford(resources, cost),
        onClick: () => model.buyLevelUp(slot.id),
        color: COLORS.accentAlt,
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
    panel.text(`UPGRADE → ${quality.label.toUpperCase()}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
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
  panel.button('Close', { onClick: onClose, color: COLORS.panelBorder, height: 80 });
  return panel.finish();
}

/** Workshop: garage-wide upgrades (for now, the Salvage Magnet). */
export function openWorkshopPanel(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
): Phaser.GameObjects.Container {
  const resources = model.state.resources;
  const level = model.state.workshop.salvageMagnetLevel;
  const { maxLevel } = ECONOMY.salvageMagnet;
  const panel = new Panel(scene, { area, onBackdrop: onClose });

  panel.text('WORKSHOP', 26, TEXT_COLORS.accent, { bold: true, gapAfter: 8 });
  panel.text('Salvage Magnet', 48, TEXT_COLORS.primary, { bold: true, gapAfter: 6 });
  panel.text(`Level ${level}/${maxLevel}`, 28, cssColor(COLORS.accentAlt), { bold: true, gapAfter: 10 });
  panel.text(
    'Pulls the odd rare part out of roadside scrap. Boosts how often Rare and Epic materials turn up while idle-driving. Driving runs stay their main source.',
    28,
    TEXT_COLORS.secondary,
    { gapAfter: 20 },
  );
  panel.divider();

  const cost = salvageMagnetCost(level);
  const now = salvageMagnetMultiplier(level);
  if (cost) {
    panel.text(`LEVEL UP → ${level + 1}`, 24, TEXT_COLORS.muted, { bold: true, gapAfter: 6 });
    panel.text(`Rare finds ×${fmtStat(now)} → ×${fmtStat(salvageMagnetMultiplier(level + 1))}`, 30, GREEN, {
      gapAfter: 12,
    });
    costRows(panel, scene, resources, cost);
    panel.gap(6);
    panel.button('Upgrade magnet', {
      enabled: canAfford(resources, cost),
      onClick: () => model.buySalvageMagnet(),
      color: COLORS.accentAlt,
    });
  } else {
    panel.text(`Fully upgraded: rare finds ×${fmtStat(now)}.`, 30, GREEN, { gapAfter: 16 });
  }
  panel.gap(4);
  panel.button('Close', { onClick: onClose, color: COLORS.panelBorder, height: 80 });
  return panel.finish();
}

/** Every material: amount held, rarity, and where it comes from. */
export function openInventoryPanel(
  scene: Phaser.Scene,
  model: GameModel,
  area: Area,
  onClose: () => void,
): Phaser.GameObjects.Container {
  const { materials } = model.state.resources;
  const rates = model.idleRates().materialsPerSecond;
  const panel = new Panel(scene, { area, onBackdrop: onClose });

  panel.text('MATERIALS', 26, TEXT_COLORS.accent, { bold: true, gapAfter: 8 });
  panel.text('What your car has salvaged so far.', 28, TEXT_COLORS.secondary, { gapAfter: 20 });
  for (const material of MATERIALS) {
    const rarity = RARITIES[material.rarity];
    const perHour = rates[material.id] * 3600;
    const source =
      material.idle.kind === 'distance'
        ? `${rarity.label} · +${formatPrecise(perHour)}/h while driving`
        : perHour > 0
          ? `${rarity.label} · mostly from driving runs (+${formatPrecise(perHour)}/h idle)`
          : `${rarity.label} · from driving runs`;
    panel.row({
      icon: materialIconKey(scene, material.id),
      title: material.name,
      titleColor: cssColor(rarity.color),
      sub: source,
      value: formatPrecise(materials[material.id]),
      gapAfter: 16,
    });
  }
  panel.gap(4);
  panel.button('Close', { onClick: onClose, color: COLORS.panelBorder, height: 80 });
  return panel.finish();
}
