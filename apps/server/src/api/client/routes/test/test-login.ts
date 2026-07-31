import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';

import {
  ApiErrorCode,
  apiErrorOutputSchema,
  loginSuccessOutputSchema,
} from '@colanode/core';
import { buildLoginSuccessOutput } from '@colanode/server/lib/accounts';

import { findTestSeedAccount } from './seed-state';

/**
 * DEV-GATED test seam (testability.md, Group D). Mints a real device +
 * token for the single well-known `/test/seed` fixture account by calling
 * the same `buildLoginSuccessOutput` production function the real
 * `email/login` and `email/register` routes call — no password check, no
 * UI walk, no separate/weaker auth path.
 *
 * This intentionally takes no input: it always logs in as the fixed
 * `TEST_SEED_ACCOUNT_EMAIL` fixture created by `POST /client/v1/test/seed`
 * and never accepts a caller-supplied email. Accepting an arbitrary email
 * here would let this seam mint a valid session for ANY existing account
 * in the `accounts` table (e.g. a real user in a shared/staging database)
 * with zero credential check — exactly the class of incident the
 * production hard-gate in ./guard.ts exists to prevent.
 *
 * The hard production gate lives in ./guard.ts, applied once for the whole
 * `/test` subtree in ./index.ts — this handler assumes it already passed.
 */
export const testLoginRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/login',
    schema: {
      response: {
        200: loginSuccessOutputSchema,
        404: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const account = await findTestSeedAccount();
      if (!account) {
        return reply.code(404).send({
          code: ApiErrorCode.AccountNotFound,
          message:
            'Seeded test account not found. Call POST /client/v1/test/seed first.',
        });
      }

      const output = await buildLoginSuccessOutput(account, request.client);
      return output;
    },
  });

  done();
};
