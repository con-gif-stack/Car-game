import type { GameModel } from '../core/GameModel';
import type { Layout } from '../ui/layout';

/** Shared objects every scene needs, passed in when scenes are created. */
export interface AppContext {
  model: GameModel;
  layout: Layout;
}
