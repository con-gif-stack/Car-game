/**
 * Screen layout. The game is always 1080 units wide; its height follows the phone's shape
 * so it fills the screen. Positions in the game use these units, not real pixels.
 */
export const GAME_WIDTH = 1080;

/** Aspect ratio (height / width) used on desktop and landscape windows: a typical modern phone. */
const DESKTOP_ASPECT = 19.5 / 9;
/**
 * Shortest supported screen shape. This is low enough that phone browsers with their toolbars
 * showing (about 1.7) still fill the width. Wider screens (tablets) get side bars.
 * Every screen must fit in the content height this gives: 1620 - 150 - 190 = 1280 units.
 */
const MIN_ASPECT = 3 / 2;
/** Tallest supported screen shape. Taller screens get bars top and bottom. */
const MAX_ASPECT = 22 / 9;

export const HUD_HEIGHT = 150;
export const TAB_BAR_HEIGHT = 190;

export interface Rect {
  x: number;
  y: number;
  width: number;
  height: number;
}

export interface Layout {
  width: number;
  height: number;
  /** Top bar showing currencies. */
  hud: Rect;
  /** Area between the top bar and the tab bar, where each tab's screen is drawn. */
  content: Rect;
  /** Bottom navigation bar. */
  tabBar: Rect;
}

/** Picks the game height for a browser window of the given size (always an even number). */
export function computeGameHeight(viewWidth: number, viewHeight: number): number {
  const isPortrait = viewWidth > 0 && viewHeight > viewWidth;
  const aspect = isPortrait
    ? Math.min(MAX_ASPECT, Math.max(MIN_ASPECT, viewHeight / viewWidth))
    : DESKTOP_ASPECT;
  return Math.round((GAME_WIDTH * aspect) / 2) * 2;
}

export function computeLayout(width: number, height: number): Layout {
  return {
    width,
    height,
    hud: { x: 0, y: 0, width, height: HUD_HEIGHT },
    content: { x: 0, y: HUD_HEIGHT, width, height: height - HUD_HEIGHT - TAB_BAR_HEIGHT },
    tabBar: { x: 0, y: height - TAB_BAR_HEIGHT, width, height: TAB_BAR_HEIGHT },
  };
}
