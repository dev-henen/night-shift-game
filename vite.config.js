import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game also runs from a sub-folder or file host.
  base: './',
  build: {
    // three.js alone is ~700 kB minified; one chunk is fine for a game.
    chunkSizeWarningLimit: 1000,
  },
});
