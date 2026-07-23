import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

// Resolve workspace packages to their source so deep subpath imports
// (e.g. @colanode/client/lib/mappers) resolve via directory aliasing
// rather than the package `exports` map, matching apps/web/vite.config.js.
export default defineConfig({
  test: {
    // Only run source tests; a stray tsc build would otherwise duplicate
    // every test under dist/ where the path-based vi.mock specifiers no
    // longer match and module-scope singletons execute unmocked.
    include: ['src/**/*.test.{ts,tsx}'],
  },
  resolve: {
    alias: {
      '@colanode/core': resolve(__dirname, '../core/src'),
      '@colanode/crdt': resolve(__dirname, '../crdt/src'),
      '@colanode/client': resolve(__dirname, '../client/src'),
      '@colanode/ui': resolve(__dirname, './src'),
    },
  },
});
