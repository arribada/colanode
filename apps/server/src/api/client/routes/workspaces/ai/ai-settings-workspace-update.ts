import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiWorkspaceSettingsOutputSchema,
  aiWorkspaceSettingsUpdateInputSchema,
  AiProviderName,
  ApiErrorCode,
  apiErrorOutputSchema,
  hasWorkspaceRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';

// PUT /client/v1/workspaces/:workspaceId/ai/settings/workspace
//
// Upserts the workspace-level shared AI settings. Admin-only (owner/admin).
// Sending an empty/omitted `apiKey` keeps the previously stored key, so an
// admin can change the model or toggle `enabled` without re-entering the
// secret. Enabling with no stored key AND no new key is rejected. The stored
// key is never returned.
//
// TODO: encrypt `api_key` at rest once an encryption helper exists in the
// codebase (see workspace_ai_settings migration).
export const aiSettingsWorkspaceUpdateRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'PUT',
    url: '/settings/workspace',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      body: aiWorkspaceSettingsUpdateInputSchema,
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
            'Only workspace admins can change the shared workspace AI settings.',
        });
      }

      const workspaceId = request.workspace.id;
      const input = request.body;

      const existing = await database
        .selectFrom('workspace_ai_settings')
        .select(['api_key'])
        .where('workspace_id', '=', workspaceId)
        .executeTakeFirst();

      const providedKey = input.apiKey?.trim() ?? '';
      const apiKey =
        providedKey.length > 0 ? providedKey : (existing?.api_key ?? '');

      // Enabling shared AI requires a key to be present (either newly provided
      // or previously stored).
      if (input.enabled && apiKey.length === 0) {
        return reply.code(400).send({
          code: ApiErrorCode.AiNotConfigured,
          message: 'An API key is required to enable shared workspace AI.',
        });
      }

      const now = new Date();

      await database
        .insertInto('workspace_ai_settings')
        .values({
          workspace_id: workspaceId,
          provider: input.provider,
          api_key: apiKey,
          model: input.model,
          enabled: input.enabled,
          created_at: now,
          updated_at: now,
        })
        .onConflict((oc) =>
          oc.column('workspace_id').doUpdateSet({
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
