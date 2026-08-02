// Resolves the LLM credentials to use for a given user's AI request and runs
// an editor completion. Resolution order (see resolveAiCredentials):
//   (a) the user's own user_ai_settings row (enabled + key) — works even when
//       the server-global config.ai is disabled;
//   (b) the workspace-level workspace_ai_settings shared key (enabled + key) —
//       the team pays a single bill;
//   (c) the server-global Anthropic provider (config.ai) when enabled.
import { AiCompleteInput, AiProviderName } from '@colanode/core';

import { database } from '@colanode/server/data/database';
import { generateLlmText, ResolvedLlm } from '@colanode/server/lib/ai/llms';
import { buildCompletionPrompt } from '@colanode/server/lib/ai/prompts';
import { config } from '@colanode/server/lib/config';

export type AiCredentialSource = 'user' | 'workspace' | 'server';

export interface ResolvedAiCredentials extends ResolvedLlm {
  source: AiCredentialSource;
}

// Default Claude model used for the server-global fallback when the configured
// `response` model is not itself an Anthropic model.
const DEFAULT_SERVER_MODEL = 'claude-sonnet-5';

// Providers the wiki AI routes accept. Non-anthropic providers are served
// through the OpenAI-compatible endpoint (AI_OPENAI_COMPAT_BASE_URL), which is
// pointed at Groq — so the team's Groq (gsk_) key works out of the box.
export const SUPPORTED_AI_PROVIDERS = new Set<AiProviderName>([
  'anthropic',
  'openai',
  'google',
]);

export const resolveAiCredentials = async (
  userId: string,
  workspaceId: string
): Promise<ResolvedAiCredentials | null> => {
  // (a) The user's own key wins — this is what makes per-user AI work without
  // any server-wide or workspace-wide AI config.
  const userSettings = await database
    .selectFrom('user_ai_settings')
    .selectAll()
    .where('user_id', '=', userId)
    .executeTakeFirst();

  if (userSettings && userSettings.enabled && userSettings.api_key) {
    return {
      source: 'user',
      provider: userSettings.provider as AiProviderName,
      model: userSettings.model,
      apiKey: userSettings.api_key,
    };
  }

  // (b) The workspace-level shared key — the whole team bills to one key.
  const workspaceSettings = await database
    .selectFrom('workspace_ai_settings')
    .selectAll()
    .where('workspace_id', '=', workspaceId)
    .executeTakeFirst();

  if (
    workspaceSettings &&
    workspaceSettings.enabled &&
    workspaceSettings.api_key
  ) {
    return {
      source: 'workspace',
      provider: workspaceSettings.provider as AiProviderName,
      model: workspaceSettings.model,
      apiKey: workspaceSettings.api_key,
    };
  }

  // (c) The server-global Anthropic provider.
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

  // (d) Server-global default provider (Groq via the OpenAI-compatible base
  // URL) so the wiki AI works out of the box even with no user/workspace key.
  const defaultKey = process.env.AI_DEFAULT_API_KEY;
  if (defaultKey) {
    const envProvider = process.env.AI_DEFAULT_PROVIDER;
    const provider: AiProviderName =
      envProvider && SUPPORTED_AI_PROVIDERS.has(envProvider as AiProviderName)
        ? (envProvider as AiProviderName)
        : 'openai';
    // Non-anthropic defaults are served through the OpenAI-compatible endpoint;
    // require its base URL, else fall through to the clean AiNotConfigured 400.
    if (provider === 'anthropic' || process.env.AI_OPENAI_COMPAT_BASE_URL) {
      return {
        source: 'server',
        provider,
        model: process.env.AI_DEFAULT_MODEL ?? 'llama-3.3-70b-versatile',
        apiKey: defaultKey,
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
