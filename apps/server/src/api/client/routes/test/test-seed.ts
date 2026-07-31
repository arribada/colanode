import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import { resetAndSeedTestState } from './seed-state';

const testSeedOutputSchema = z.object({
  accountId: z.string(),
  email: z.string(),
  workspaceId: z.string(),
});

/**
 * DEV-GATED test seam (testability.md, Group D). Resets and reseeds one
 * deterministic account + workspace so browser/e2e tests get a known
 * starting state instead of depending on whatever a previous run left
 * behind — the server-side equivalent of Cypress's `cy.task('db:seed')`.
 *
 * The hard production gate lives in ./guard.ts, applied once for the whole
 * `/test` subtree in ./index.ts — this handler assumes it already passed.
 */
export const testSeedRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/seed',
    schema: {
      response: {
        200: testSeedOutputSchema,
      },
    },
    handler: async () => {
      const { account, workspace } = await resetAndSeedTestState();

      return {
        accountId: account.id,
        email: account.email,
        workspaceId: workspace.id,
      };
    },
  });

  done();
};
