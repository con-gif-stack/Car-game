import type Phaser from 'phaser';
import type { PixelGrid } from '../art/PixelGrid';

/** Creates a texture from generated pixel art, once per key. */
export function ensureGridTexture(scene: Phaser.Scene, key: string, build: () => PixelGrid): void {
  if (scene.textures.exists(key)) return;
  const grid = build();
  const canvas = document.createElement('canvas');
  canvas.width = grid.width;
  canvas.height = grid.height;
  const context = canvas.getContext('2d');
  if (!context) throw new Error('Canvas 2D context unavailable');
  context.putImageData(new ImageData(grid.toRgba(), grid.width, grid.height), 0, 0);
  scene.textures.addCanvas(key, canvas);
}
