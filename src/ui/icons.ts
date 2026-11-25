import type Phaser from 'phaser';
import type { TabId } from './tabs';

/*
 * Simple vector placeholder icons. They will be replaced with pixel art once the art style is set.
 */

type Graphics = Phaser.GameObjects.Graphics;


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
    case 'drive': {
      // Steering wheel.
      g.strokeCircle(cx, cy, s * 0.88);
      g.fillCircle(cx, cy, s * 0.22);
      g.lineBetween(cx - s * 0.88, cy, cx + s * 0.88, cy);
      g.lineBetween(cx, cy, cx, cy + s * 0.88);
      break;
    }
    case 'upgrades': {
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
