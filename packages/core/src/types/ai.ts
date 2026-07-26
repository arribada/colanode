// Shared AI types for the editor completion endpoint and per-user AI
// credentials (provider + API key + model). Kept provider-agnostic on the
// wire even though the only completion provider wired today is Anthropic.
import { z } from 'zod/v4';

// Providers a user may pick for their personal AI credentials. Mirrors the
// server-side aiProviderSchema in apps/server/src/lib/config/ai.ts.
export const aiProviderNameSchema = z.enum(['anthropic', 'openai', 'google']);
export type AiProviderName = z.infer<typeof aiProviderNameSchema>;

// Editor completion actions. 'custom' uses the free-form `prompt` verbatim as
// the instruction; 'translate' uses `prompt` as the target language.
export const aiCompletionActionSchema = z.enum([
  'improve',
  'summarize',
  'translate',
  'fix',
  'shorter',
  'longer',
  'continue',
  'custom',
]);
export type AiCompletionAction = z.infer<typeof aiCompletionActionSchema>;

// POST /client/v1/workspaces/:workspaceId/ai/complete
export const aiCompleteInputSchema = z.object({
  action: aiCompletionActionSchema,
  // Free-form instruction. Required for 'custom'; for 'translate' this is the
  // target language; ignored by the other actions.
  prompt: z.string().default(''),
  // The text the action operates on (the editor selection). Optional for
  // 'continue', where `context` alone drives the generation.
  selection: z.string().optional(),
  // Surrounding document text, to give the model more grounding.
  context: z.string().optional(),
});
export type AiCompleteInput = z.infer<typeof aiCompleteInputSchema>;

export const aiCompleteOutputSchema = z.object({
  text: z.string(),
  provider: aiProviderNameSchema,
  model: z.string(),
});
export type AiCompleteOutput = z.infer<typeof aiCompleteOutputSchema>;

// GET /client/v1/workspaces/:workspaceId/ai/settings
// The raw API key is NEVER returned; `hasApiKey` reports whether one is set.
export const aiUserSettingsOutputSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderNameSchema.nullable(),
  model: z.string().nullable(),
  hasApiKey: z.boolean(),
});
export type AiUserSettingsOutput = z.infer<typeof aiUserSettingsOutputSchema>;

// PUT /client/v1/workspaces/:workspaceId/ai/settings
export const aiUserSettingsUpdateInputSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderNameSchema,
  model: z.string().min(1),
  // Omit or send an empty string to keep the previously stored key
  // (so the client can save non-key changes without re-entering the secret).
  apiKey: z.string().optional(),
});
export type AiUserSettingsUpdateInput = z.infer<
  typeof aiUserSettingsUpdateInputSchema
>;

// Convenience: the Claude models this deployment offers in the editor UI.
export const anthropicChatModels = [
  'claude-opus-4-8',
  'claude-sonnet-5',
  'claude-haiku-4-5-20251001',
] as const;

// GET /client/v1/workspaces/:workspaceId/ai/settings/workspace
// The workspace-level shared AI settings (admin-managed). The raw API key is
// NEVER returned; `hasApiKey` reports whether one is set.
export const aiWorkspaceSettingsOutputSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderNameSchema.nullable(),
  model: z.string().nullable(),
  hasApiKey: z.boolean(),
});
export type AiWorkspaceSettingsOutput = z.infer<
  typeof aiWorkspaceSettingsOutputSchema
>;

// PUT /client/v1/workspaces/:workspaceId/ai/settings/workspace
export const aiWorkspaceSettingsUpdateInputSchema = z.object({
  enabled: z.boolean(),
  provider: aiProviderNameSchema,
  model: z.string().min(1),
  // Omit or send an empty string to keep the previously stored key.
  apiKey: z.string().optional(),
});
export type AiWorkspaceSettingsUpdateInput = z.infer<
  typeof aiWorkspaceSettingsUpdateInputSchema
>;

// POST /client/v1/workspaces/:workspaceId/ai/agent — the agentic wiki AI.
export const aiAgentInputSchema = z.object({
  message: z.string(),
  // The editor selection the agent should operate on, if any.
  selection: z.string().optional(),
  // The node id of the page the user is currently on, if any.
  pageId: z.string().optional(),
  // Extra grounding context (e.g. surrounding document text).
  context: z.string().optional(),
});
export type AiAgentInput = z.infer<typeof aiAgentInputSchema>;

// A single action a wiki tool performed during an agent run.
export const aiAgentActionSchema = z.object({
  type: z.string(),
  nodeId: z.string().nullable(),
  summary: z.string(),
});
export type AiAgentAction = z.infer<typeof aiAgentActionSchema>;

export const aiAgentOutputSchema = z.object({
  text: z.string(),
  actions: z.array(aiAgentActionSchema),
  provider: aiProviderNameSchema,
  model: z.string(),
});
export type AiAgentOutput = z.infer<typeof aiAgentOutputSchema>;
