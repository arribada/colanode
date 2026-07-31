import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiAgentInputSchema,
  aiAgentOutputSchema,
  ApiErrorCode,
  apiErrorOutputSchema,
} from '@colanode/core';
import { runWikiAgent } from '@colanode/server/lib/ai/agent';
import { resolveAiCredentials } from '@colanode/server/lib/ai/completion';

// POST /client/v1/workspaces/:workspaceId/ai/agent
//
// The agentic wiki assistant. Resolves the requesting user's AI credentials
// (own key → workspace shared key → server-global), then runs an Anthropic
// tool-use loop over the wiki tool layer, bound to the acting user. Returns
// the model's summary plus the list of actions the tools performed.
export const aiAgentRoute: FastifyPluginCallbackZod = (instance, _, done) => {
  instance.route({
    method: 'POST',
    url: '/agent',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      body: aiAgentInputSchema,
      response: {
        200: aiAgentOutputSchema,
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

      if (credentials.provider !== 'anthropic') {
        return reply.code(400).send({
          code: ApiErrorCode.AiProviderUnsupported,
          message: `The AI provider '${credentials.provider}' is not supported for the wiki agent yet.`,
        });
      }

      try {
        const { text, actions } = await runWikiAgent(
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
        request.log.error({ err: error }, 'AI agent failed');
        return reply.code(500).send({
          code: ApiErrorCode.AiAgentFailed,
          message:
            'The AI agent failed while processing your request. Please try again.',
        });
      }
    },
  });

  done();
};
