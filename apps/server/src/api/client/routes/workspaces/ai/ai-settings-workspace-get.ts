import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiWorkspaceSettingsOutputSchema,
  AiProviderName,
  ApiErrorCode,
  apiErrorOutputSchema,
  hasWorkspaceRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';

// GET /client/v1/workspaces/:workspaceId/ai/settings/workspace
//
// Returns the workspace-level shared AI settings. Admin-only (owner/admin).
// The raw API key is never returned — only `hasApiKey` reports whether one is
// stored.
export const aiSettingsWorkspaceGetRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'GET',
    url: '/settings/workspace',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      response: {
        200: aiWorkspaceSettingsOutputSchema,
        400: apiErrorOutputSchema,
        403: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      if (!hasWorkspaceRole(request.workspace.user.role, 'admin')) {
        return reply.code(403).send({
          code: ApiErrorCode.Forbidden,
          message:
            'Only workspace admins can view the shared workspace AI settings.',
        });
      }

      const row = await database
        .selectFrom('workspace_ai_settings')
        .selectAll()
        .where('workspace_id', '=', request.workspace.id)
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
