import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiUserSettingsOutputSchema,
  aiUserSettingsUpdateInputSchema,
  AiProviderName,
  ApiErrorCode,
  apiErrorOutputSchema,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';

// PUT /client/v1/workspaces/:workspaceId/ai/settings
//
// Upserts the requesting user's own AI settings (provider + API key + model).
// Sending an empty/omitted `apiKey` keeps the previously stored key, so the
// client can change the model or toggle `enabled` without re-entering the
// secret. The stored key is never returned.
//
// TODO: encrypt `api_key` at rest once an encryption helper exists in the
// codebase (see user_ai_settings migration).
export const aiSettingsUpdateRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'PUT',
    url: '/settings',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      body: aiUserSettingsUpdateInputSchema,
      response: {
        200: aiUserSettingsOutputSchema,
        400: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;
      const workspaceId = request.workspace.id;
      const input = request.body;

      const existing = await database
        .selectFrom('user_ai_settings')
        .select(['api_key'])
        .where('user_id', '=', userId)
        .executeTakeFirst();

      const providedKey = input.apiKey?.trim() ?? '';
      const apiKey = providedKey.length > 0 ? providedKey : (existing?.api_key ?? '');

      // Enabling AI requires a key to be present (either newly provided or
      // previously stored).
      if (input.enabled && apiKey.length === 0) {
        return reply.code(400).send({
          code: ApiErrorCode.AiNotConfigured,
          message: 'An API key is required to enable AI.',
        });
      }

      const now = new Date();

      await database
        .insertInto('user_ai_settings')
        .values({
          user_id: userId,
          workspace_id: workspaceId,
          provider: input.provider,
          api_key: apiKey,
          model: input.model,
          enabled: input.enabled,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('user_id').doUpdateSet({
            provider: input.provider,
            api_key: apiKey,
            model: input.model,
            enabled: input.enabled,
            updated_at: now,
          })
        )
        .execute();

      return {
        enabled: input.enabled,
        provider: input.provider as AiProviderName,
        model: input.model,
        hasApiKey: apiKey.length > 0,
      };
    },
  });

  done();
};
