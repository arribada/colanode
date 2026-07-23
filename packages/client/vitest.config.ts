import path from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@colanode/client': path.resolve(__dirname, 'src'),
      '@colanode/core': path.resolve(__dirname, '../core/src'),
      '@colanode/crdt': path.resolve(__dirname, '../crdt/src'),
    },
  },
  test: {
    include: ['src/**/*.test.ts'],
  },
});
