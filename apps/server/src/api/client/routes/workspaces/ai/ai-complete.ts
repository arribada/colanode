import { FastifyPluginCallbackZod } from 'fastify-type-provider-zod';
import { z } from 'zod/v4';

import {
  aiCompleteInputSchema,
  aiCompleteOutputSchema,
  ApiErrorCode,
  apiErrorOutputSchema,
} from '@colanode/core';
import {
  resolveAiCredentials,
  runAiCompletion,
} from '@colanode/server/lib/ai/completion';

// POST /client/v1/workspaces/:workspaceId/ai/complete
//
// Editor AI action. Resolves the requesting user's AI credentials (their own
// key/model, else the workspace shared key, else the server-global Anthropic
// provider), runs the completion and returns the generated text. Works even
// when the server-global config.ai.enabled is false, as long as the user or
// the workspace has a key set.
export const aiCompleteRoute: FastifyPluginCallbackZod = (
  instance,
  _,
  done
) => {
  instance.route({
    method: 'POST',
    url: '/complete',
    schema: {
      params: z.object({
        workspaceId: z.string(),
      }),
      body: aiCompleteInputSchema,
      response: {
        200: aiCompleteOutputSchema,
        400: apiErrorOutputSchema,
        500: apiErrorOutputSchema,
      },
    },
    handler: async (request, reply) => {
      const userId = request.workspace.user.id;

      const credentials = await resolveAiCredentials(
        userId,
        request.workspace.id
      );
      if (!credentials) {
        return reply.code(400).send({
          code: ApiErrorCode.AiNotConfigured,
          message:
            'No AI credentials are configured. Set your AI provider and API key in your settings.',
        });
      }

      if (credentials.provider !== 'anthropic') {
        return reply.code(400).send({
          code: ApiErrorCode.AiProviderUnsupported,
          message: `The AI provider '${credentials.provider}' is not supported for editor completions yet.`,
        });
      }

      try {
        const text = await runAiCompletion(credentials, request.body);

        return {
          text,
          provider: credentials.provider,
          model: credentials.model,
        };
      } catch (error) {
        request.log.error({ err: error }, 'AI completion failed');
        return reply.code(500).send({
          code: ApiErrorCode.AiCompletionFailed,
          message:
            'The AI request failed. Check your API key and model, then try again.',
        });
      }
    },
  });

  done();
};
