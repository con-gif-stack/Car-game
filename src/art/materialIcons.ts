import type { MaterialIcon } from '../data/materials';
import { PixelGrid } from './PixelGrid';

/*
 * Small pixel icons for materials and money, generated in code. Each material has its own
 * look (rubber is a black ring, copper an orange coil…); rarity is shown by the UI around it.
 */

export const ICON_SIZE = 12;

interface IconPalette {
  light: number;
  base: number;
  dark: number;
}

export const ICON_PALETTES: Record<MaterialIcon | 'coin', IconPalette> = {
  scrap: { light: 0xb9bcc6, base: 0x8a8d97, dark: 0x5b5e68 },
  ring: { light: 0x4a4a55, base: 0x26262e, dark: 0x111116 },
  coil: { light: 0xf2a66a, base: 0xd0743a, dark: 0x8f4620 },
  ingot: { light: 0xe6e9ef, base: 0xb8bdc8, dark: 0x7f8594 },
  plate: { light: 0xa9c4e0, base: 0x6f8fb3, dark: 0x445f80 },
  weave: { light: 0x5a5f6e, base: 0x2c2f38, dark: 0x16181e },
  disc: { light: 0xffffff, base: 0xe7e1d6, dark: 0xb5ad9e },
  coin: { light: 0xffe680, base: 0xffd23f, dark: 0xc29a1d },
};

const OUTLINE = 0x0b0b10;

export function buildIcon(icon: MaterialIcon | 'coin'): PixelGrid {
  const p = ICON_PALETTES[icon];
  const g = new PixelGrid(ICON_SIZE, ICON_SIZE);
  const c = ICON_SIZE / 2;
  const dist = (x: number, y: number) => Math.hypot(x + 0.5 - c, y + 0.5 - c);

  switch (icon) {
    case 'scrap': {
      // A bent, jagged steel offcut with a bolt hole.
      g.fillPolygon(
        [
          { x: 1.5, y: 4 },
          { x: 6, y: 1.5 },
          { x: 10.5, y: 3 },
          { x: 9.5, y: 7 },
          { x: 10.5, y: 10.5 },
          { x: 4, y: 10.5 },
          { x: 2.5, y: 8 },
        ],
        p.base,
      );
      g.paint(p.light, (x, y, col) => col === p.base && x + y < 8);
      g.paint(p.dark, (x, y, col) => col !== null && x + y > 15);
      g.set(6, 6, p.dark);
      break;
    }
    case 'ring': {
      // Rubber tyre ring.
      g.fillCircle(c, c, 5, p.base);
      g.paint(p.light, (x, y, col) => col === p.base && dist(x, y) > 3.8 && x + y < 10);
      g.fillCircle(c, c, 2.2, null);
      break;
    }
    case 'coil': {
      // Coil of copper wire: diagonal turns inside an oval.
      g.paint(p.base, (x, y) => ((x + 0.5 - c) / 5) ** 2 + ((y + 0.5 - c) / 4) ** 2 <= 1);
      g.paint(p.dark, (x, y, col) => col === p.base && (x + y) % 3 === 0);
      g.paint(p.light, (x, y, col) => col === p.base && (x + y) % 3 === 1 && y < c);
      break;
    }
    case 'ingot': {
      // Cast aluminium bar: a trapezoid with a bright top face.
      g.fillPolygon(
        [
          { x: 1, y: 9.5 },
          { x: 3, y: 3.5 },
          { x: 9, y: 3.5 },
          { x: 11, y: 9.5 },
        ],
        p.base,
      );
      g.paint(p.light, (_x, y, col) => col === p.base && y <= 4);
      g.paint(p.dark, (_x, y, col) => col === p.base && y >= 8);
      break;
    }
    case 'plate': {
      // Titanium plate with a sheen.
      g.paint(p.base, (x, y) => x >= 2 && x <= 9 && y >= 2 && y <= 9 && !((x === 2 || x === 9) && (y === 2 || y === 9)));
      g.paint(p.light, (x, y, col) => col === p.base && x - y >= -1 && x - y <= 0);
      g.paint(p.dark, (x, y, col) => col === p.base && (x === 9 || y === 9));
      break;
    }
    case 'weave': {
      // Carbon fibre: a woven checker of dark and light strands.
      g.paint(p.base, (x, y) => x >= 2 && x <= 9 && y >= 2 && y <= 9);
      g.paint(p.light, (x, y, col) => col === p.base && (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 0 && (x + y) % 2 === 0);
      g.paint(p.dark, (x, y, col) => col === p.base && (Math.floor(x / 2) + Math.floor(y / 2)) % 2 === 1 && (x + y) % 2 === 1);
      break;
    }
    case 'disc': {
      // Ceramic brake disc with vent holes.
      g.fillCircle(c, c, 5, p.base);
      g.paint(p.light, (x, y, col) => col === p.base && x + y < 8);
      g.paint(p.dark, (x, y, col) => col === p.base && x + y > 14);
      for (const [x, y] of [
        [3, 6],
        [8, 5],
        [6, 3],
        [5, 8],
      ] as const) {
        g.set(x, y, p.dark);
      }
      g.fillCircle(c, c, 1.6, null);
      break;
    }
    case 'coin': {
      g.fillCircle(c, c, 5, p.base);
      g.paint(p.light, (x, y, col) => col === p.base && dist(x, y) > 3.6 && x + y < 10);
      g.paint(p.dark, (x, y, col) => col === p.base && dist(x, y) > 3.6 && x + y > 13);
      for (let y = 4; y <= 7; y++) g.set(6, y, p.dark);
      break;
    }
  }

  g.outline(OUTLINE);
  return g;
}
