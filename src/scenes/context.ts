import type { GameModel } from '../core/GameModel';
import type { Layout } from '../ui/layout';
import type { TabId } from '../ui/tabs';

/** Shared objects every scene needs, passed in when scenes are created. */
export interface AppContext {
  model: GameModel;
  layout: Layout;
  /** Switches to a tab (set up by UIScene, which owns the tab bar). */
  showTab: (id: TabId) => void;
}
