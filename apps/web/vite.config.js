import { resolve } from 'node:path';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// https://vitejs.dev/config/
export default defineConfig({
  server: {
    host: true,
    allowedHosts: ['.ts.net'],
  },
  test: {
    globals: true,
    environment: 'jsdom',
    setupFiles: ['./test/setup-dom.ts'],
  },
  resolve: {
    // packages/ui declares react ^19.2.4 while the workspace hoists react-dom
    // 19.1.0 at the root, so npm installs a second react (packages/ui/node_modules).
    // Without dedupe the bundle ends up with two React instances and the shared
    // dispatcher is null on render → "Cannot read properties of null (reading
    // 'useRef')" crashes the whole app. Force a single react/react-dom copy.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@colanode/web': resolve(__dirname, './src'),
      '@colanode/core': resolve(__dirname, '../../packages/core/src'),
      '@colanode/crdt': resolve(__dirname, '../../packages/crdt/src'),
      '@colanode/client': resolve(__dirname, '../../packages/client/src'),
      '@colanode/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  optimizeDeps: {
    exclude: ['@sqlite.org/sqlite-wasm'],
  },
  plugins: [
    viteReact(),
    VitePWA({
      mode: 'development',
      base: '/',
      includeAssets: ['favicon.ico'],
      devOptions: {
        enabled: true,
        type: 'module',
      },
      srcDir: 'src/workers',
      filename: 'service.ts',
      strategies: 'injectManifest',
      registerType: 'autoUpdate',
      injectManifest: {
        minify: false,
        enableWorkboxModulesLogs: true,
        maximumFileSizeToCacheInBytes: 10 * 1024 * 1024, // 10MB
      },
    }),
  ],
});
