import { BIOME_IDS, type BiomeId } from '../data/biomes';
import { MATERIAL_IDS } from '../data/materials';
import { MILESTONES, MILESTONES_BY_ID, type MilestoneCondition, type MilestoneDef } from '../data/milestones';
import { QUALITIES, SLOTS } from '../data/vehicles';
import type { GameState } from './state';
import { getActiveCar, getInstalledPart } from './vehicle';

/** How far along a milestone is: `current` out of `target` (in the condition's units). */
export interface MilestoneProgress {
  current: number;
  target: number;
}

export function milestoneProgress(state: GameState, condition: MilestoneCondition): MilestoneProgress {
  switch (condition.kind) {
    case 'distance':
      return { current: state.run.bestDistanceKm, target: condition.km };
    case 'runs':
      return { current: state.run.runsCompleted, target: condition.count };
    case 'allPartsTier': {
      const car = getActiveCar(state.garage);
      const needed = QUALITIES[condition.tier].rank;
      const done = SLOTS.filter((slot) => {
        const part = getInstalledPart(car, slot.id);
        return part !== null && QUALITIES[part.quality].rank >= needed;
      }).length;
      return { current: done, target: SLOTS.length };
    }
  }
}

export function isMet(state: GameState, condition: MilestoneCondition): boolean {
  const { current, target } = milestoneProgress(state, condition);
  return current >= target;
}

/**
 * Grants every milestone whose condition is now met and that wasn't reached before: records
 * it and applies its reward. Returns the newly reached milestones, in order.
 */
export function checkMilestones(state: GameState): MilestoneDef[] {
  const reached = new Set(state.milestones);
  const granted: MilestoneDef[] = [];
  for (const milestone of MILESTONES) {
    if (reached.has(milestone.id) || !isMet(state, milestone.condition)) continue;
    state.milestones.push(milestone.id);
    const { reward } = milestone;
    if (reward.money) state.resources.money += reward.money;
    for (const id of MATERIAL_IDS) state.resources.materials[id] += reward.materials?.[id] ?? 0;
    if (reward.unlockBiome && !state.unlockedBiomes.includes(reward.unlockBiome)) {
      state.unlockedBiomes.push(reward.unlockBiome);
    }
    if (reward.unlockFeature && !state.unlockedFeatures.includes(reward.unlockFeature)) {
      state.unlockedFeatures.push(reward.unlockFeature);
    }
    granted.push(milestone);
  }
  return granted;
}

/** The next milestones not yet reached, in order. */
export function upcomingMilestones(state: GameState, count = 1): MilestoneDef[] {
  const reached = new Set(state.milestones);
  return MILESTONES.filter((m) => !reached.has(m.id)).slice(0, count);
}

/** The next not-yet-reached distance milestone (what the next runs are aiming for). */
export function nextDistanceMilestone(state: GameState): MilestoneDef | null {
  const reached = new Set(state.milestones);
  return MILESTONES.find((m) => m.condition.kind === 'distance' && !reached.has(m.id)) ?? null;
}

/** Keeps only known milestone ids, once each. */
export function repairMilestones(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string' && id in MILESTONES_BY_ID))];
}

/** Keeps only known biome ids, once each, and always includes the starting biome. */
export function repairBiomes(raw: unknown): BiomeId[] {
  const known = Array.isArray(raw) ? raw.filter((id): id is BiomeId => BIOME_IDS.includes(id as BiomeId)) : [];
  return [...new Set<BiomeId>(['junkyard', ...known])];
}

/** Keeps only string feature ids, once each. */
export function repairFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return [];
  return [...new Set(raw.filter((id): id is string => typeof id === 'string'))];
}
