import Phaser from 'phaser';
import type { Resources } from '../core/state';
import type { TabId } from './tabs';

/*
 * Simple vector placeholder icons. They will be replaced with pixel art once the art style is set.
 */

type Graphics = Phaser.GameObjects.Graphics;

const vec = (x: number, y: number) => new Phaser.Math.Vector2(x, y);

/** Draws a tab icon centred on (cx, cy), fitting in a square of the given size. */
export function drawTabIcon(g: Graphics, id: TabId, cx: number, cy: number, size: number, color: number): void {
  const s = size / 2;
  g.lineStyle(6, color, 1);
  g.fillStyle(color, 1);

  switch (id) {
    case 'garage': {
      // Roof and a roll-up garage door.
      g.beginPath();
      g.moveTo(cx - s, cy - s * 0.15);
      g.lineTo(cx, cy - s);
      g.lineTo(cx + s, cy - s * 0.15);
      g.strokePath();
      g.strokeRect(cx - s * 0.72, cy - s * 0.15, s * 1.44, s * 1.1);
      for (const t of [0.25, 0.55, 0.85]) {
        g.lineBetween(cx - s * 0.45, cy + s * t, cx + s * 0.45, cy + s * t);
      }
      break;
    }
    case 'driving': {
      // Steering wheel.
      g.strokeCircle(cx, cy, s * 0.88);
      g.fillCircle(cx, cy, s * 0.22);
      g.lineBetween(cx - s * 0.88, cy, cx + s * 0.88, cy);
      g.lineBetween(cx, cy, cx, cy + s * 0.88);
      break;
    }
    case 'progression': {
      // A small skill tree: one root node branching into two.
      const root = { x: cx, y: cy + s * 0.65 };
      const left = { x: cx - s * 0.6, y: cy - s * 0.6 };
      const right = { x: cx + s * 0.6, y: cy - s * 0.6 };
      g.lineBetween(root.x, root.y, left.x, left.y);
      g.lineBetween(root.x, root.y, right.x, right.y);
      for (const node of [root, left, right]) g.fillCircle(node.x, node.y, s * 0.26);
      break;
    }
    case 'world': {
      // Globe.
      g.strokeCircle(cx, cy, s * 0.88);
      g.strokeEllipse(cx, cy, s * 0.85, s * 1.76);
      g.lineBetween(cx - s * 0.88, cy, cx + s * 0.88, cy);
      break;
    }
  }
}

/** Draws a resource icon centred on (cx, cy) with radius r. */
export function drawResourceIcon(
  g: Graphics,
  id: keyof Resources,
  cx: number,
  cy: number,
  r: number,
  colors: Record<keyof Resources, number>,
  holeColor: number,
): void {
  const color = colors[id];
  switch (id) {
    case 'money': {
      // Coin with an inner ring.
      g.fillStyle(color, 1);
      g.fillCircle(cx, cy, r);
      g.lineStyle(4, holeColor, 0.35);
      g.strokeCircle(cx, cy, r * 0.65);
      break;
    }
    case 'materials': {
      // Hex nut.
      const points = Array.from({ length: 6 }, (_, i) => {
        const angle = (Math.PI / 3) * i + Math.PI / 6;
        return vec(cx + Math.cos(angle) * r, cy + Math.sin(angle) * r);
      });
      g.fillStyle(color, 1);
      g.fillPoints(points, true);
      g.fillStyle(holeColor, 1);
      g.fillCircle(cx, cy, r * 0.38);
      break;
    }
    case 'rareMaterials': {
      // Gem.
      g.fillStyle(color, 1);
      g.fillPoints(
        [vec(cx, cy - r), vec(cx + r * 0.8, cy), vec(cx, cy + r), vec(cx - r * 0.8, cy)],
        true,
      );
      g.fillStyle(0xffffff, 0.35);
      g.fillTriangle(cx, cy - r, cx + r * 0.8, cy, cx, cy);
      break;
    }
  }
}
