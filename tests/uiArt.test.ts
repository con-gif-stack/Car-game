import { describe, expect, it } from 'vitest';
import { bayer, mix, ramp } from '../src/art/color';
import { buildProp, PROP_VARIANTS } from '../src/art/props';
import { buildBarFill, buildDial, buildFrame, buildGlow, buildThemedFrame, frameRing, type FrameKind } from '../src/art/uiArt';
import { buildUiIcon, UI_ICON_SIZE, type UiIcon } from '../src/art/uiIcons';
import { BIOMES, type PropKind } from '../src/data/biomes';
import type { PixelGrid } from '../src/art/PixelGrid';

const filled = (g: PixelGrid) => {
  let n = 0;
  g.forEach((_x, _y, c) => c !== null && n++);
  return n;
};

const same = (a: PixelGrid, b: PixelGrid) => {
  let equal = a.width === b.width && a.height === b.height;
  a.forEach((x, y, c) => {
    if (b.get(x, y) !== c) equal = false;
  });
  return equal;
};

describe('colour helpers', () => {
  it('mixes channels and builds ramps from dark to light', () => {
    expect(mix(0x000000, 0xffffff, 0)).toBe(0x000000);
    expect(mix(0x000000, 0xffffff, 1)).toBe(0xffffff);
    expect(mix(0xff0000, 0x0000ff, 0.5)).toBe(0x800080);
    expect(ramp(0x808080, 0xffffff, 0x000000, 5)).toEqual([0x000000, 0x404040, 0x808080, 0xc0c0c0, 0xffffff]);
  });

  it('dither thresholds cover (0, 1) and repeat every 4 pixels', () => {
    for (let i = 0; i < 16; i++) {
      const t = bayer(i % 4, Math.floor(i / 4));
      expect(t).toBeGreaterThan(0);
      expect(t).toBeLessThan(1);
      expect(bayer((i % 4) + 4, Math.floor(i / 4) - 4)).toBe(t);
    }
  });
});

describe('interface art', () => {
  const kinds: FrameKind[] = ['panel', 'card', 'inset', 'plate', 'button', 'buttonDown', 'buttonOff'];

  it('frames have cut corners, an outline and a solid body', () => {
    for (const kind of kinds) {
      const g = buildFrame(30, 20, kind, 0xff9a3c);
      expect(g.get(0, 0)).toBeNull();
      expect(g.get(29, 19)).toBeNull();
      expect(g.get(15, 0)).toBe(0x07050f);
      expect(g.get(0, 10)).toBe(0x07050f);
      for (let y = 2; y < 18; y++) for (let x = 2; x < 28; x++) expect(g.get(x, y)).not.toBeNull();
    }
    expect(frameRing(0, 0, 30, 20)).toBeLessThan(0);
    expect(frameRing(15, 10, 30, 20)).toBeGreaterThan(2);
  });

  it('raised, pressed and disabled buttons look different', () => {
    const up = buildFrame(30, 16, 'button', 0xff9a3c);
    const down = buildFrame(30, 16, 'buttonDown', 0xff9a3c);
    const off = buildFrame(30, 16, 'buttonOff', 0xff9a3c);
    expect(same(up, down)).toBe(false);
    expect(same(up, off)).toBe(false);
  });

  it('bar fills have gaps between segments', () => {
    const g = buildBarFill(20, 4, 0x6fe08a, 5);
    expect(g.get(4, 2)).not.toBe(g.get(3, 2));
    expect(filled(g)).toBe(80);
  });

  it('glows, the dial and every icon are drawn', () => {
    expect(filled(buildGlow(10, 0xffc070))).toBeGreaterThan(20);
    expect(filled(buildDial(38))).toBeGreaterThan(900);
    const icons: UiIcon[] = ['farm', 'garage', 'drive', 'upgrades', 'world', 'fuel', 'wrench', 'flag', 'star', 'trophy', 'clock', 'speed'];
    for (const icon of icons) {
      const g = buildUiIcon(icon, 0xff9a3c);
      expect(g.width).toBe(UI_ICON_SIZE);
      expect(filled(g)).toBeGreaterThan(20);
    }
  });
});

describe('road props', () => {
  it('every biome can build each of its props, near and far', () => {
    for (const biome of BIOMES) {
      const kinds = new Set<PropKind>([...biome.props.roadside, ...biome.props.foreground]);
      for (const kind of kinds) {
        for (let v = 0; v < PROP_VARIANTS; v++) {
          for (const near of [false, true]) {
            const art = buildProp(kind, v, biome.palette, near);
            expect(filled(art.grid), `${biome.id} ${kind} ${v}`).toBeGreaterThan(10);
          }
        }
      }
    }
  });

  it('lamps cast a glow, and foreground props are darker than roadside ones', () => {
    const palette = BIOMES[0]!.palette;
    expect(buildProp('lamp', 0, palette, false).glows.length).toBeGreaterThan(0);
    const brightness = (g: PixelGrid) => {
      let sum = 0;
      g.forEach((_x, _y, c) => {
        if (c !== null) sum += ((c >> 16) & 0xff) + ((c >> 8) & 0xff) + (c & 0xff);
      });
      return sum / filled(g);
    };
    expect(brightness(buildProp('rock', 1, palette, true).grid)).toBeLessThan(brightness(buildProp('rock', 1, palette, false).grid));
  });

  it('props are generated the same way every time', () => {
    const palette = BIOMES[1]!.palette;
    expect(same(buildProp('pine', 2, palette, false).grid, buildProp('pine', 2, palette, false).grid)).toBe(true);
  });
});

describe('menu themes', () => {
  const themes = ['neon', 'toolbox', 'blueprint', 'terminal', 'crate'] as const;
  const parts = ['panel', 'card', 'plate'] as const;

  it('every theme builds every part at full size, outlined, with cut corners', () => {
    for (const theme of themes) {
      for (const part of parts) {
        const g = buildThemedFrame(60, 30, theme, part, 0x3b2f6a);
        expect(g.width).toBe(60);
        expect(g.height).toBe(30);
        expect(g.get(0, 0), `${theme} ${part} corner`).toBeNull();
        expect(g.get(30, 0), `${theme} ${part} outline`).toBe(0x07050f);
        expect(g.get(30, 15), `${theme} ${part} body`).not.toBeNull();
      }
    }
  });

  it('themes look different from each other', () => {
    const body = (theme: (typeof themes)[number]) => buildThemedFrame(60, 30, theme, 'panel', 0x3b2f6a).get(30, 15);
    expect(new Set(themes.map(body)).size).toBe(themes.length);
  });

  it('a highlight colour tints a themed card edge', () => {
    for (const theme of themes) {
      const plain = buildThemedFrame(40, 20, theme, 'card', 0x3b2f6a).get(20, 1);
      const good = buildThemedFrame(40, 20, theme, 'card', 0x6fe08a).get(20, 1);
      expect(good, theme).not.toBe(plain);
    }
  });
});
