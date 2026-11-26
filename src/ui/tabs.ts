export type TabId = 'farm' | 'garage' | 'drive' | 'upgrades' | 'world';

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

/** The main tabs, in tab-bar order (design doc Part 3). The Farm is home. */
export const TABS: readonly TabDef[] = [
  {
    id: 'farm',
    label: 'Farm',
    sceneKey: 'FarmTab',
    description: 'Scavenge the yard and send out your drones.',
  },
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
    description: 'The drone upgrade tree, and later the skill tree.',
  },
  {
    id: 'world',
    label: 'World',
    sceneKey: 'WorldTab',
    description: 'The biome road map and your milestones.',
  },
];
