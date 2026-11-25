import Phaser from 'phaser';
import { GameModel } from './core/GameModel';
import { MemoryStorage, SaveManager, type KeyValueStorage } from './core/save';
import type { AppContext } from './scenes/context';
import { PlaceholderTabScene } from './scenes/PlaceholderTabScene';
import { UIScene } from './scenes/UIScene';
import { computeGameHeight, computeLayout, GAME_WIDTH } from './ui/layout';
import { TABS } from './ui/tabs';
import { COLORS } from './ui/theme';

function getStorage(): KeyValueStorage {
  try {
    const storage = window.localStorage;
    storage.getItem(''); // Throws if the browser blocks storage.
    return storage;
  } catch {
    console.warn('Browser storage is unavailable; progress will not be kept between visits.');
    return new MemoryStorage();
  }
}

const now = () => Date.now();
const saves = new SaveManager(getStorage(), now);
const loaded = saves.load();
const model = new GameModel(loaded.state, saves, now, loaded.awaySeconds);

const width = GAME_WIDTH;
const height = computeGameHeight(window.innerWidth, window.innerHeight);
const ctx: AppContext = { model, layout: computeLayout(width, height) };

const game = new Phaser.Game({
  type: Phaser.AUTO,
  parent: 'game',
  backgroundColor: COLORS.background,
  scale: {
    mode: Phaser.Scale.FIT,
    autoCenter: Phaser.Scale.CENTER_BOTH,
    width,
    height,
  },
  scene: [new UIScene(ctx), ...TABS.map((tab) => new PlaceholderTabScene(ctx, tab))],
});

// Drive the game logic from Phaser's frame loop, and save whenever the page is hidden or closed.
game.events.on(Phaser.Core.Events.STEP, (_time: number, delta: number) => model.update(delta / 1000));
game.events.on(Phaser.Core.Events.HIDDEN, () => model.pause());
game.events.on(Phaser.Core.Events.VISIBLE, () => model.resume());
window.addEventListener('pagehide', () => model.save());

if (import.meta.env.DEV) {
  // Debug handle for the browser console, e.g. __carGame.resetProgress().
  Object.assign(window, {
    __carGame: {
      model,
      phaser: game,
      resetProgress: () => {
        model.wipeSave();
        location.reload();
      },
    },
  });
}
