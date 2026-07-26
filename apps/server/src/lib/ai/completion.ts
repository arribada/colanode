// Resolves the LLM credentials to use for a given user's AI request and runs
// an editor completion. Per-user settings (user_ai_settings) take precedence
// and work even when the server-global config.ai is disabled; otherwise we
// fall back to the server-global Anthropic provider when it is enabled.
import { AiCompleteInput, AiProviderName } from '@colanode/core';

import { database } from '@colanode/server/data/database';
import { generateLlmText, ResolvedLlm } from '@colanode/server/lib/ai/llms';
import { buildCompletionPrompt } from '@colanode/server/lib/ai/prompts';
import { config } from '@colanode/server/lib/config';

export type AiCredentialSource = 'user' | 'server';

export interface ResolvedAiCredentials extends ResolvedLlm {
  source: AiCredentialSource;
}

// Default Claude model used for the server-global fallback when the configured
// `response` model is not itself an Anthropic model.
const DEFAULT_SERVER_MODEL = 'claude-sonnet-5';

export const resolveAiCredentials = async (
  userId: string
): Promise<ResolvedAiCredentials | null> => {
  const userSettings = await database
    .selectFrom('user_ai_settings')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  // The user's own key wins — this is what makes per-user AI work without any
  // server-wide AI config.
  if (userSettings && userSettings.enabled && userSettings.api_key) {
    return {
      source: 'user',
      provider: userSettings.provider as AiProviderName,
      model: userSettings.model,
      apiKey: userSettings.api_key,
    };
  }

  if (config.ai.enabled) {
    const anthropic = config.ai.providers.anthropic;
    if (anthropic.enabled && anthropic.apiKey) {
      const responseModel = config.ai.models.response;
      const model =
        responseModel.provider === 'anthropic'
          ? responseModel.modelName
          : DEFAULT_SERVER_MODEL;

      return {
        source: 'server',
        provider: 'anthropic',
        model,
        apiKey: anthropic.apiKey,
      };
    }
  }

  return null;
};

export const runAiCompletion = async (
  credentials: ResolvedLlm,
  input: AiCompleteInput
): Promise<string> => {
  const { system, prompt } = buildCompletionPrompt(input);
  return generateLlmText(credentials, { system, prompt });
};
