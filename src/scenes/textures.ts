import type Phaser from 'phaser';
import { buildIcon } from '../art/materialIcons';
import type { PixelGrid } from '../art/PixelGrid';
import { MATERIALS_BY_ID, type MaterialId } from '../data/materials';

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

/** Texture key for a material's icon (created on first use). */
export function materialIconKey(scene: Phaser.Scene, id: MaterialId): string {
  const icon = MATERIALS_BY_ID[id].icon;
  const key = `icon/${icon}`;
  ensureGridTexture(scene, key, () => buildIcon(icon));
  return key;
}

/** Texture key for the money (coin) icon. */
export function moneyIconKey(scene: Phaser.Scene): string {
  ensureGridTexture(scene, 'icon/coin', () => buildIcon('coin'));
  return 'icon/coin';
}
