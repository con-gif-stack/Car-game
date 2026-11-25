export type TabId = 'garage' | 'driving' | 'progression' | 'world';

export interface TabDef {
  id: TabId;
  label: string;
  /** Phaser scene key of the screen shown for this tab. */
  sceneKey: string;
  /** One-line purpose, from the design doc (section 6, Primary Game Tabs). */
  description: string;
  /** The roadmap step that builds this tab, shown on its placeholder until it exists. */
  plannedStep?: string;
}

/** The four main tabs, in tab-bar order. */
export const TABS: readonly TabDef[] = [
  {
    id: 'garage',
    label: 'Garage',
    sceneKey: 'GarageTab',
    description: 'Vehicle upgrades and customization.',
  },
  {
    id: 'driving',
    label: 'Driving',
    sceneKey: 'DrivingTab',
    description: 'Interactive road-based challenges.',
    plannedStep: 'Step 5 · Interactive driving run',
  },
  {
    id: 'progression',
    label: 'Progression',
    sceneKey: 'ProgressionTab',
    description: 'Skill tree and long-term upgrades.',
    plannedStep: 'Step 9 · Skill tree',
  },
  {
    id: 'world',
    label: 'World',
    sceneKey: 'WorldTab',
    description: 'Biome progression and resource discovery.',
    plannedStep: 'Step 6 · First biome and road progression',
  },
];
