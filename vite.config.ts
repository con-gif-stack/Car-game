import { defineConfig } from 'vitest/config';

export default defineConfig({
  // Relative asset paths, so the build works from any folder and inside the mobile app wrapper later.
  base: './',
  server: {
    // Listen on the local network too, so the dev build can be opened on a phone.
    host: true,
  },
  build: {
    target: 'es2022',
    // Phaser alone is over 1 MB; don't warn about it.
    chunkSizeWarningLimit: 2000,
  },
  test: {
    include: ['tests/**/*.test.ts'],
    environment: 'node',
  },
});
