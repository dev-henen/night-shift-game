import { defineConfig } from 'vite';

export default defineConfig({
  // Relative base so the built game also runs from a sub-folder or file host.
  base: './',
  // Listen on all network interfaces so phones/tablets on the LAN can connect by IP.
  server: { host: true, port: 5173 },
  preview: { host: true, port: 4173 },
  build: {
    // three.js alone is ~700 kB minified; one chunk is fine for a game.
    chunkSizeWarningLimit: 1000,
  },
});
