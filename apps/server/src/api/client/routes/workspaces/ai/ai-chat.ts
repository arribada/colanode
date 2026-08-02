import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiChatInputSchema,
  aiChatOutputSchema,
  ApiErrorCode,
  apiErrorOutputSchema,
} from '@colanode/core';
import { runWikiChat } from '@colanode/server/lib/ai/agent';
import {
  resolveAiCredentials,
  SUPPORTED_AI_PROVIDERS,
} from '@colanode/server/lib/ai/completion';

// POST /client/v1/workspaces/:workspaceId/ai/chat
//
// The docked, multi-turn conversational wiki assistant. Resolves the requesting
// user's AI credentials (own key → workspace shared key → server-global), then
// runs an Anthropic tool-use loop over the wiki tool layer, bound to the acting
// user, across the running conversation transcript. Only the latest user turn
// triggers fresh tool calls; prior turns are replayed as plain text. Returns
// the model's reply plus the list of actions the tools performed.
export const aiChatRoute: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'POST',
    url: '/chat',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      body: aiChatInputSchema,
      response: {
        200: aiChatOutputSchema,
        400: apiErrorOutputSchema,
        500: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;
      const workspaceId = request.workspace.id;

      const credentials = await resolveAiCredentials(userId, workspaceId);
      if (!credentials) {
        return reply.code(400).send({
          code: ApiErrorCode.AiNotConfigured,
          message:
            'No AI credentials are configured. Set your AI provider and API key in your settings, or ask an admin to configure the shared workspace key.',
        });
      }

      if (!SUPPORTED_AI_PROVIDERS.has(credentials.provider)) {
        return reply.code(400).send({
          code: ApiErrorCode.AiProviderUnsupported,
          message: `The AI provider '${credentials.provider}' is not supported yet.`,
        });
      }

      try {
        const { text, actions } = await runWikiChat(
          credentials,
          { userId, workspaceId },
          request.body
        );

        return {
          text,
          actions,
          provider: credentials.provider,
          model: credentials.model,
        };
      } catch (error) {
        request.log.error({ err: error }, 'AI chat failed');
        return reply.code(500).send({
          code: ApiErrorCode.AiAgentFailed,
          message:
            'The AI assistant failed while processing your message. Please try again.',
        });
      }
    },
  });

  done();
};
