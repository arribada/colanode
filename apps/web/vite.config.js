import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';

import viteReact from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { VitePWA } from 'vite-plugin-pwa';

// The build produces a long tail of large chunks that are only reachable
// through rarely-used, already-lazy-loaded features, plus locale packs. None
// of that should be blanket-downloaded by the service worker on install -- it
// should only be fetched (and then runtime-cached by the StaleWhileRevalidate
// route below) the first time a document actually needs it. We keep the real
// app-shell entry (whatever <script> dist/index.html points at) and the worker
// chunks spawned unconditionally on boot precached regardless of size;
// everything else is capped so oversized rare chunks fall back to on-demand
// fetch+cache.
const PRECACHE_SIZE_LIMIT_BYTES = 250 * 1024; // 250KB
const ALWAYS_PRECACHE_PREFIXES = ['assets/dedicated-', 'assets/sqlite3-worker1-'];
const LOCALE_CHUNK_RE = /^assets\/[a-z]{2}-[A-Z]{2}-.*\.js$/;

const trimPrecacheManifest = (entries) => {
  let entryScriptUrl = '';
  try {
    const html = readFileSync(resolve(__dirname, 'dist/index.html'), 'utf8');
    const match = html.match(/src="\/?(assets\/index-[^"]+\.js)"/);
    entryScriptUrl = match?.[1] ?? '';
  } catch {
    // dist/index.html not written yet (e.g. dev server) -- nothing to keep.
  }

  const manifest = entries.filter((entry) => {
    if (entry.url === 'index.html' || entry.url === entryScriptUrl) {
      return true;
    }
    if (ALWAYS_PRECACHE_PREFIXES.some((prefix) => entry.url.startsWith(prefix))) {
      return true;
    }
    if (LOCALE_CHUNK_RE.test(entry.url)) {
      return false;
    }
    return (entry.size ?? 0) <= PRECACHE_SIZE_LIMIT_BYTES;
  });

  return { manifest };
};
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
  worker: {
    // 'es' (module workers) instead of the default 'iife' so dynamic
    // import() inside the dedicated worker (e.g. tus-js-client, only needed
    // once a file upload actually starts) can be code-split into its own
    // chunk instead of erroring/being forced inline.
    format: 'es',
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
        manifestTransforms: [(entries) => trimPrecacheManifest(entries)],
      },
    }),
  ],
});
