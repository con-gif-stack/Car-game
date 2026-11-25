export interface Point {
  x: number;
  y: number;
}

/**
 * A small grid of coloured pixels (0xRRGGBB, or null for transparent), used to build
 * placeholder pixel art in code. Coordinates are pixel indices; a pixel counts as inside a
 * shape when its centre is inside it.
 */
export class PixelGrid {
  private readonly pixels: (number | null)[];

  constructor(
    readonly width: number,
    readonly height: number,
  ) {
    this.pixels = new Array<number | null>(width * height).fill(null);
  }

  inBounds(x: number, y: number): boolean {
    return x >= 0 && y >= 0 && x < this.width && y < this.height;
  }

  get(x: number, y: number): number | null {
    return this.inBounds(x, y) ? (this.pixels[y * this.width + x] ?? null) : null;
  }

  set(x: number, y: number, color: number | null): void {
    if (this.inBounds(x, y)) this.pixels[y * this.width + x] = color;
  }

  /** Calls fn for every pixel position. */
  forEach(fn: (x: number, y: number, color: number | null) => void): void {
    for (let y = 0; y < this.height; y++) {
      for (let x = 0; x < this.width; x++) fn(x, y, this.get(x, y));
    }
  }

  /** Recolours every pixel for which `test` returns true. */
  paint(color: number | null, test: (x: number, y: number, current: number | null) => boolean): void {
    this.forEach((x, y, current) => {
      if (test(x, y, current)) this.set(x, y, color);
    });
  }

  fillPolygon(points: readonly Point[], color: number | null): void {
    this.paint(color, (x, y) => pointInPolygon(x + 0.5, y + 0.5, points));
  }

  fillCircle(cx: number, cy: number, radius: number, color: number | null): void {
    this.paint(color, (x, y) => (x + 0.5 - cx) ** 2 + (y + 0.5 - cy) ** 2 <= radius * radius);
  }

  /**
   * Puts an outline on every empty pixel that touches a filled one (4-way). `color` can be a
   * function of position, e.g. a softer outline on top and a dark one underneath.
   */
  outline(color: number | ((x: number, y: number) => number)): void {
    const edge: Point[] = [];
    this.forEach((x, y, current) => {
      if (current !== null) return;
      const touches = [
        [1, 0],
        [-1, 0],
        [0, 1],
        [0, -1],
      ].some(([dx, dy]) => this.get(x + (dx ?? 0), y + (dy ?? 0)) !== null);
      if (touches) edge.push({ x, y });
    });
    for (const p of edge) this.set(p.x, p.y, typeof color === 'number' ? color : color(p.x, p.y));
  }

  /** Copies another grid on top of this one at (ox, oy), skipping its transparent pixels. */
  draw(other: PixelGrid, ox: number, oy: number): void {
    other.forEach((x, y, color) => {
      if (color !== null) this.set(x + ox, y + oy, color);
    });
  }

  /** RGBA bytes, ready for a canvas ImageData. */
  toRgba(): Uint8ClampedArray<ArrayBuffer> {
    const data = new Uint8ClampedArray(this.width * this.height * 4);
    this.forEach((x, y, color) => {
      if (color === null) return;
      const i = (y * this.width + x) * 4;
      data[i] = (color >> 16) & 0xff;
      data[i + 1] = (color >> 8) & 0xff;
      data[i + 2] = color & 0xff;
      data[i + 3] = 0xff;
    });
    return data;
  }
}

export function pointInPolygon(px: number, py: number, points: readonly Point[]): boolean {
  let inside = false;
  for (let i = 0, j = points.length - 1; i < points.length; j = i++) {
    const a = points[i] as Point;
    const b = points[j] as Point;
    if (a.y > py !== b.y > py && px < ((b.x - a.x) * (py - a.y)) / (b.y - a.y) + a.x) {
      inside = !inside;
    }
  }
  return inside;
}

/** Small deterministic random generator, so generated art looks the same every time. */
export function seededRandom(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
