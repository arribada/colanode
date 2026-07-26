import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiUserSettingsOutputSchema,
  AiProviderName,
  apiErrorOutputSchema,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';

// GET /client/v1/workspaces/:workspaceId/ai/settings
//
// Returns the requesting user's own AI settings. The raw API key is never
// returned — only `hasApiKey` reports whether one is stored.
export const aiSettingsGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/settings',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      response: {
        200: aiUserSettingsOutputSchema,
        400: apiErrorOutputSchema,
      },
    },
    handler: async (request) => {
      const userId = request.workspace.user.id;

      const row = await database
        .selectFrom('user_ai_settings')
        .selectAll()
        .where('user_id', '=', userId)
        .executeTakeFirst();

      if (!row) {
        return {
          enabled: false,
          provider: null,
          model: null,
          hasApiKey: false,
        };
      }

      return {
        enabled: row.enabled,
        provider: row.provider as AiProviderName,
        model: row.model,
        hasApiKey: row.api_key.length > 0,
      };
    },
  });

  done();
};
