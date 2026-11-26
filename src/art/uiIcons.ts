import type { TabId } from '../ui/tabs';
import { shade } from './color';
import { PixelGrid } from './PixelGrid';

/*
 * Pixel icons for the interface: the tab bar and the drive HUD. Same style as the material
 * icons: a few shades of one colour and a dark outline. Built at 16 pixels square.
 */

export const UI_ICON_SIZE = 16;

export type HudIcon = 'fuel' | 'wrench' | 'flag' | 'star' | 'trophy' | 'clock' | 'speed';
/** Drone-tree branches and garage upgrades. */
export type UpgradeIcon = 'cargo' | 'drill' | 'range' | 'bay' | 'warehouse' | 'refinery' | 'magnet' | 'lock';
export type UiIcon = TabId | HudIcon | UpgradeIcon;

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

/** Default colours for the upgrade icons. */
export const UPGRADE_ICON_COLORS: Record<UpgradeIcon, number> = {
  cargo: 0xd9a45a,
  drill: 0xb9bcc6,
  range: 0x6fe08a,
  bay: 0x3de8ff,
  warehouse: 0xc98a5a,
  refinery: 0xff9a3c,
  magnet: 0xff5d6c,
  lock: 0x8a84b4,
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
    case 'cargo': {
      // A strapped crate.
      rect(2, 4, 13, 14, base);
      rect(2, 4, 13, 5, light);
      rect(12, 6, 13, 14, dark);
      for (let x = 2; x <= 13; x++) g.set(x, 9, dark);
      rect(7, 4, 8, 14, shade(color, -0.55));
      rect(4, 7, 5, 7, light);
      break;
    }
    case 'drill': {
      // A drill bit pointing down, with a spiral.
      rect(5, 1, 10, 4, dark);
      rect(5, 1, 7, 3, light);
      for (let y = 5; y <= 14; y++) {
        const half = Math.max(0, Math.round((14 - y) * 0.35));
        for (let x = 8 - half; x <= 7 + half + 1; x++) g.set(x, y, (x + y) % 3 === 0 ? dark : x < 8 ? light : base);
      }
      g.set(7, 15, base);
      g.set(8, 15, dark);
      break;
    }
    case 'range': {
      // A signal mast with waves.
      rect(7, 6, 8, 15, base);
      rect(5, 14, 10, 15, dark);
      g.fillCircle(8, 5.5, 1.6, light);
      for (const [r, c] of [[4, base], [6.5, dark]] as const) {
        for (let a = -0.9; a <= 0.9; a += 0.08) {
          g.set(Math.round(8 + Math.sin(a) * r), Math.round(5.5 - Math.cos(a) * r * 0.6), c);
        }
      }
      break;
    }
    case 'bay': {
      // A charging pad with a drone on it and a bolt.
      rect(1, 11, 14, 14, dark);
      rect(1, 11, 14, 11, base);
      rect(4, 6, 11, 9, base);
      rect(4, 6, 11, 6, light);
      rect(2, 4, 5, 4, light);
      rect(10, 4, 13, 4, light);
      g.set(7, 12, 0xffd23f);
      g.set(8, 12, 0xffd23f);
      g.set(8, 13, 0xffd23f);
      break;
    }
    case 'warehouse': {
      // Shelving with boxes.
      rect(1, 2, 2, 15, dark);
      rect(13, 2, 14, 15, dark);
      for (const y of [6, 11, 15]) rect(1, y, 14, y, base);
      rect(3, 3, 6, 5, light);
      rect(8, 4, 11, 5, base);
      rect(4, 8, 8, 10, base);
      rect(9, 9, 12, 10, light);
      rect(3, 12, 6, 14, light);
      break;
    }
    case 'refinery': {
      // A furnace with a chimney and a glowing mouth.
      rect(10, 1, 12, 7, dark);
      rect(10, 1, 10, 7, base);
      rect(2, 6, 13, 15, base);
      rect(2, 6, 13, 7, light);
      rect(12, 8, 13, 15, dark);
      rect(5, 10, 9, 13, 0xffd23f);
      rect(6, 11, 8, 12, 0xff5a3c);
      break;
    }
    case 'magnet': {
      // A horseshoe magnet.
      for (let y = 2; y <= 13; y++) {
        for (let x = 2; x <= 13; x++) {
          const d = Math.hypot(x + 0.5 - 8, y + 0.5 - 8);
          if (y >= 8 && d >= 2.5 && d <= 6) g.set(x, y, base);
        }
      }
      rect(2, 2, 5, 8, base);
      rect(10, 2, 13, 8, base);
      rect(2, 2, 5, 3, 0xf1eefb);
      rect(10, 2, 13, 3, 0xf1eefb);
      g.paint(light, (x, y, c) => c === base && x < 4 && y > 3);
      g.paint(dark, (x, y, c) => c === base && x > 11 && y > 3);
      break;
    }
    case 'lock': {
      rect(3, 7, 12, 14, base);
      rect(3, 7, 12, 8, light);
      rect(11, 9, 12, 14, dark);
      for (let a = 0; a <= Math.PI; a += 0.1) {
        g.set(Math.round(7.5 + Math.cos(a) * 3.5), Math.round(7 - Math.sin(a) * 4), dark);
      }
      rect(7, 10, 8, 12, shade(color, -0.6));
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
