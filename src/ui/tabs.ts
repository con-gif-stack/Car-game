export type TabId = 'garage' | 'drive' | 'upgrades' | 'world';

export interface TabDef {
  id: TabId;
  label: string;
  /** Phaser scene key of the screen shown for this tab. */
  sceneKey: string;
  /** One-line purpose (design doc Part 3, Screens). */
  description: string;
  /** The roadmap step that builds this tab, shown on its placeholder until it exists. */
  plannedStep?: string;
}

/**
 * The main tabs, in tab-bar order. The Farm tab joins as the first tab in Step 6
 * (design doc Part 3: Farm | Garage | Drive | Upgrades | World).
 */
export const TABS: readonly TabDef[] = [
  {
    id: 'garage',
    label: 'Garage',
    sceneKey: 'GarageTab',
    description: 'Your car, its stats and its parts.',
  },
  {
    id: 'drive',
    label: 'Drive',
    sceneKey: 'DriveTab',
    description: 'Drive the endless road and see how far your car gets.',
  },
  {
    id: 'upgrades',
    label: 'Upgrades',
    sceneKey: 'UpgradesTab',
    description: 'Drone upgrades, and later the skill tree.',
    plannedStep: 'Step 7 · Drone upgrade tree',
  },
  {
    id: 'world',
    label: 'World',
    sceneKey: 'WorldTab',
    description: 'The biome road map and your milestones.',
  },
];
