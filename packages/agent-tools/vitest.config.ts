import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@colanode/agent-tools': resolve(__dirname, 'src'),
      '@colanode/client': resolve(__dirname, '../../packages/client/src'),
      '@colanode/core': resolve(__dirname, '../../packages/core/src'),
      '@colanode/crdt': resolve(__dirname, '../../packages/crdt/src'),
    },
  },
  test: { environment: 'node' },
});
