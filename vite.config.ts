import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';
import { resolve } from 'node:path';

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': resolve(import.meta.dirname, 'ui/src'),
    },
  },
  root: 'ui',
  base: './',
  build: {
    outDir: resolve(import.meta.dirname, 'dist/ui'),
    emptyOutDir: true,
    rollupOptions: {
      output: {
        // Big libraries in their own files, so an app update doesn't re-ship them
        // and no single file has to be parsed in one go.
        manualChunks(id) {
          if (!id.includes('node_modules')) return;
          if (id.includes('/@xterm/')) return 'xterm';
          if (id.includes('/react-dom/') || id.includes('/scheduler/') || /\/node_modules\/react\//.test(id)) return 'react';
          if (id.includes('/@base-ui/') || id.includes('/@floating-ui/') || id.includes('/@radix-ui/')) return 'ui-kit';
        },
      },
    },
  },
  server: {
    port: 5173,
    strictPort: true,
  },
});
