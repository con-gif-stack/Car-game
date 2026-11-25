import type { TabId } from '../ui/tabs';
import { shade } from './color';
import { PixelGrid } from './PixelGrid';

/*
 * Pixel icons for the interface: the tab bar and the drive HUD. Same style as the material
 * icons: a few shades of one colour and a dark outline. Built at 16 pixels square.
 */

export const UI_ICON_SIZE = 16;

export type HudIcon = 'fuel' | 'wrench' | 'flag' | 'star' | 'trophy' | 'clock' | 'speed';
export type UiIcon = TabId | HudIcon;

const OUTLINE = 0x07050f;

/** Default colours for the HUD icons. */
export const HUD_ICON_COLORS: Record<HudIcon, number> = {
  fuel: 0xff6b4a,
  wrench: 0x8fd7a0,
  flag: 0xf1eefb,
  star: 0xffd23f,
  trophy: 0xffc43d,
  clock: 0x9fd8ff,
  speed: 0x3de8ff,
};

/** Builds an icon in shades of `color`. */
export function buildUiIcon(icon: UiIcon, color: number): PixelGrid {
  const light = shade(color, 0.4);
  const base = color;
  const dark = shade(color, -0.35);
  const g = new PixelGrid(UI_ICON_SIZE, UI_ICON_SIZE);
  const rect = (x0: number, y0: number, x1: number, y1: number, c: number) => {
    for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) g.set(x, y, c);
  };

  switch (icon) {
    case 'farm': {
      // A little drone seen from above: body, four arms, four rotors.
      for (const [cx, cy] of [
        [3, 3],
        [12, 3],
        [3, 12],
        [12, 12],
      ] as const) {
        g.fillCircle(cx + 0.5, cy + 0.5, 2.6, dark);
        g.set(cx, cy, light);
      }
      for (let i = 4; i <= 11; i++) {
        g.set(i, i, dark);
        g.set(15 - i, i, dark);
      }
      g.fillCircle(8, 8, 3, base);
      g.set(7, 6, light);
      g.set(6, 7, light);
      break;
    }
    case 'garage': {
      // A building with a pitched roof and a roller door.
      g.fillPolygon(
        [
          { x: 1, y: 7 },
          { x: 8, y: 1.5 },
          { x: 15, y: 7 },
        ],
        light,
      );
      rect(2, 7, 13, 14, base);
      rect(4, 9, 11, 14, dark);
      for (let y = 10; y <= 14; y += 2) rect(4, y, 11, y, shade(color, -0.6));
      break;
    }
    case 'drive': {
      // Steering wheel.
      g.fillCircle(8, 8, 7, base);
      g.fillCircle(8, 8, 5, null);
      g.paint(light, (x, y, c) => c === base && x + y < 12);
      rect(3, 7, 12, 8, dark);
      rect(7, 8, 8, 13, dark);
      g.fillCircle(8, 8, 2, base);
      break;
    }
    case 'upgrades': {
      // Two stacked chevrons pointing up.
      for (const top of [2, 8]) {
        for (let i = 0; i < 6; i++) {
          const c = top === 2 ? light : base;
          rect(7 - i, top + i, 8 - i, top + i + 1, c);
          rect(7 + i, top + i, 8 + i, top + i + 1, c);
        }
      }
      break;
    }
    case 'world': {
      // A globe with a meridian and an equator.
      g.fillCircle(8, 8, 7, base);
      g.paint(light, (x, y, c) => c === base && x + y < 10);
      g.paint(dark, (x, y, c) => c !== null && x + y > 20);
      for (let y = 1; y < 15; y++) g.set(8, y, g.get(8, y) === null ? null : dark);
      for (let x = 1; x < 15; x++) g.set(x, 8, g.get(x, 8) === null ? null : dark);
      for (let y = 2; y < 14; y++) {
        const dx = Math.round(Math.sqrt(Math.max(0, 36 - (y - 8) ** 2)) * 0.5);
        g.set(8 - dx, y, dark);
        g.set(8 + dx, y, dark);
      }
      break;
    }
    case 'fuel': {
      // Jerry can with a spout.
      rect(3, 4, 12, 14, base);
      rect(3, 4, 12, 5, light);
      rect(11, 6, 12, 14, dark);
      rect(5, 2, 9, 3, dark);
      g.set(6, 3, null);
      g.set(7, 3, null);
      g.set(8, 3, null);
      rect(12, 2, 13, 3, light);
      for (let i = 0; i < 6; i++) g.set(5 + i, 7 + i, light);
      break;
    }
    case 'wrench': {
      // A wrench on a diagonal.
      for (let i = 0; i < 9; i++) {
        g.set(4 + i, 11 - i, base);
        g.set(5 + i, 11 - i, dark);
        g.set(4 + i, 10 - i, light);
      }
      g.fillCircle(3.5, 12.5, 2.6, base);
      g.fillCircle(12.5, 3.5, 3, base);
      g.fillCircle(13.5, 2.5, 1.3, null);
      g.set(3, 13, dark);
      break;
    }
    case 'flag': {
      // Chequered flag on a pole.
      rect(2, 1, 2, 15, shade(color, -0.2));
      for (let y = 2; y <= 9; y++) {
        for (let x = 3; x <= 13; x++) {
          const dark2 = (Math.floor((x - 3) / 2) + Math.floor((y - 2) / 2)) % 2 === 1;
          g.set(x, y + (x > 8 ? 1 : 0), dark2 ? 0x1b1638 : light);
        }
      }
      break;
    }
    case 'star': {
      const pts = [];
      for (let i = 0; i < 10; i++) {
        const a = -Math.PI / 2 + (i * Math.PI) / 5;
        const r = i % 2 === 0 ? 7.5 : 3.2;
        pts.push({ x: 8 + Math.cos(a) * r, y: 8.5 + Math.sin(a) * r });
      }
      g.fillPolygon(pts, base);
      g.paint(light, (x, y, c) => c === base && x + y < 14);
      g.paint(dark, (x, y, c) => c === base && x + y > 18);
      break;
    }
    case 'trophy': {
      rect(4, 2, 11, 8, base);
      rect(4, 2, 6, 7, light);
      rect(10, 3, 11, 8, dark);
      g.set(2, 3, base);
      g.set(2, 4, base);
      g.set(3, 5, base);
      g.set(13, 3, base);
      g.set(13, 4, base);
      g.set(12, 5, base);
      rect(7, 9, 8, 11, dark);
      rect(5, 12, 10, 13, base);
      rect(4, 14, 11, 14, dark);
      break;
    }
    case 'clock': {
      g.fillCircle(8, 8, 7, base);
      g.fillCircle(8, 8, 5.5, 0x1b1638);
      rect(8, 4, 8, 8, light);
      rect(8, 8, 11, 8, light);
      break;
    }
    case 'speed': {
      // Lightning bolt.
      g.fillPolygon(
        [
          { x: 9, y: 0.5 },
          { x: 3, y: 9 },
          { x: 7.5, y: 9 },
          { x: 6, y: 15.5 },
          { x: 13, y: 6.5 },
          { x: 8.5, y: 6.5 },
        ],
        base,
      );
      g.paint(light, (x, y, c) => c === base && x < 8 && y < 9);
      break;
    }
  }
  g.outline(OUTLINE);
  return g;
}
