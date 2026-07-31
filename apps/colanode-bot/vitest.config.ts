import { resolve } from 'node:path';

import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@colanode/bot': resolve(__dirname, 'src'),
      '@colanode/client-node': resolve(
        __dirname,
        '../../packages/client-node/src/index.ts'
      ),
      '@colanode/client': resolve(__dirname, '../../packages/client/src'),
      '@colanode/core': resolve(__dirname, '../../packages/core/src'),
      '@colanode/crdt': resolve(__dirname, '../../packages/crdt/src'),
    },
  },
  test: { environment: 'node' },
});
