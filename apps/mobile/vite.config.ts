import { dirname, resolve } from 'path';
import { fileURLToPath } from 'url';

import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { viteSingleFile } from 'vite-plugin-singlefile';

const __dirname = dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  root: resolve(__dirname), // the 'ui/' folder
  // The shared mobile tsconfig sets jsx: "react-native" (for the RN shell), which
  // makes esbuild emit classic React.createElement for the web UI bundle and crashes
  // the WebView with "Can't find variable: React". Force the automatic JSX runtime
  // for this DOM build so no global React is required.
  esbuild: { jsx: 'automatic', jsxImportSource: 'react' },
  plugins: [react(), viteSingleFile()],
  resolve: {
    extensions: ['.ts', '.tsx', '.js', '.jsx', '.json'],
    // Force a single React copy — the monorepo has react 19.1.0 (mobile) and 19.2.4
    // (web/desktop); without dedupe @colanode/ui and react-dom resolve different
    // instances, so the hooks dispatcher is null → "Cannot read properties of null
    // (reading 'useRef')" and the WebView stays blank.
    dedupe: ['react', 'react-dom'],
    alias: {
      '@assets': resolve(__dirname, './assets'),
      '@colanode/mobile': resolve(__dirname, './src'),
      '@colanode/core': resolve(__dirname, '../../packages/core/src'),
      '@colanode/crdt': resolve(__dirname, '../../packages/crdt/src'),
      '@colanode/client': resolve(__dirname, '../../packages/client/src'),
      '@colanode/ui': resolve(__dirname, '../../packages/ui/src'),
    },
  },
  build: {
    outDir: resolve(__dirname, 'assets/ui'),
    emptyOutDir: true,
    assetsInlineLimit: 100000000, // inline assets
    sourcemap: false,
  },
});
