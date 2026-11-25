import { describe, expect, it } from 'vitest';
import { computeGameHeight, computeLayout, GAME_WIDTH, HUD_HEIGHT, TAB_BAR_HEIGHT } from '../src/ui/layout';

describe('computeGameHeight', () => {
  it('matches the shape of a portrait phone screen', () => {
    // 390 x 844 (19.5:9 phone)
    expect(computeGameHeight(390, 844)).toBe(Math.round((GAME_WIDTH * 844) / 390 / 2) * 2);
  });

  it('uses a typical phone shape on desktop and landscape windows', () => {
    expect(computeGameHeight(1920, 1080)).toBe(2340);
  });

  it('clamps very wide and very tall screens', () => {
    expect(computeGameHeight(768, 1024)).toBe(1620); // tablet: clamped to 3:2
    expect(computeGameHeight(300, 1000)).toBe(2640); // clamped to 22:9
  });

  it('fills a phone browser with its toolbars showing', () => {
    // 390 x 664: visible area of a 390-wide phone browser with toolbars.
    expect(computeGameHeight(390, 664)).toBe(Math.round((GAME_WIDTH * 664) / 390 / 2) * 2);
  });

  it('always returns an even height', () => {
    for (const [w, h] of [
      [393, 851],
      [412, 915],
      [360, 780],
    ] as const) {
      expect(computeGameHeight(w, h) % 2).toBe(0);
    }
  });
});

describe('computeLayout', () => {
  it('splits the screen into top bar, content and tab bar with no gaps', () => {
    const layout = computeLayout(GAME_WIDTH, 2340);
    expect(layout.hud.height).toBe(HUD_HEIGHT);
    expect(layout.content.y).toBe(HUD_HEIGHT);
    expect(layout.content.y + layout.content.height).toBe(layout.tabBar.y);
    expect(layout.tabBar.y + TAB_BAR_HEIGHT).toBe(2340);
  });
});
