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
// These are exactly the chunks the route/feature-level code-splitting in
// packages/ui produces (the TipTap document editor and the 5 database view
// renderers -- table/board/calendar/gallery/list), plus the pre-existing
// lazy KaTeX and whiteboard-canvas chunks. All of them are read/authoring
// surfaces a viewer who only skims a page shouldn't pay for on install --
// exclude them from the precache regardless of size (they're still small
// today, but the point of lazy-loading them is that the SW shouldn't
// blanket-fetch them either). The same-origin StaleWhileRevalidate route
// below still runtime-caches each one the first time it's actually used.
const RUNTIME_ONLY_PREFIXES = [
  'assets/document-editor-',
  'assets/table-view-',
  'assets/board-view-',
  'assets/calendar-view-',
  'assets/gallery-view-',
  'assets/list-view-',
  'assets/katex-render-',
  'assets/whiteboard-canvas-',
];
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
    if (RUNTIME_ONLY_PREFIXES.some((prefix) => entry.url.startsWith(prefix))) {
      return false;
    }
    if (LOCALE_CHUNK_RE.test(entry.url)) {
      return false;
    }
    // Dynamic import()s that don't have an obvious name to derive a chunk
    // name from (e.g. tus-js-client, dynamic-imported from inside the
    // dedicated worker only when a file upload actually starts -- see
    // packages/client/src/jobs/file-upload.ts) fall back to Rollup's
    // generic "index-<hash>.js" naming, same prefix as the real entry. The
    // real entry is already matched above via entryScriptUrl, so anything
    // else matching that prefix is one of these on-demand chunks, not the
    // app shell -- exclude it too.
    if (/^assets\/index-[^/]+\.js$/.test(entry.url) && entry.url !== entryScriptUrl) {
      return false;
    }
    return (entry.size ?? 0) <= PRECACHE_SIZE_LIMIT_BYTES;
  });

  return { manifest };
};

// The dedicated worker (the client engine: sqlite/kysely/CRDT/sync services)
// and sqlite3-worker1 (the OPFS-backed sqlite worker it talks to) are both
// on the critical boot path -- app.init() can't do anything until both are
// up -- but neither is reachable through Vite's static ESM import graph
// (they're spawned via `new Worker(...)` at runtime), so Vite never emits a
// modulepreload hint for them on its own. Inject one manually so the browser
// starts fetching them in parallel with the entry script instead of only
// discovering them after main.tsx has run and called `new Worker()`. KaTeX,
// whiteboard-canvas and the editor/database-view chunks are deliberately
// left alone here -- they're behind lazy()/dynamic import() and should stay
// that way.
const CRITICAL_WORKER_PRELOAD_PREFIXES = ['assets/dedicated-', 'assets/sqlite3-worker1-'];

const preloadCriticalWorkers = () => ({
  name: 'preload-critical-workers',
  transformIndexHtml: {
    order: 'post',
    handler(html, ctx) {
      const bundle = ctx.bundle;
      if (!bundle) {
        return html;
      }

      const hints = Object.keys(bundle)
        .filter((fileName) =>
          CRITICAL_WORKER_PRELOAD_PREFIXES.some((prefix) =>
            fileName.startsWith(prefix)
          )
        )
        .map(
          (fileName) =>
            `<link rel="modulepreload" crossorigin href="/${fileName}">`
        )
        .join('\n    ');

      if (!hints) {
        return html;
      }

      return html.replace('</head>', `    ${hints}\n  </head>`);
    },
  },
});

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
    preloadCriticalWorkers(),
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
