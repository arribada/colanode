export type BotConfig = {
  serverUrl: string;
  botEmail: string;
  botPassword: string;
  dataDir: string;
  llmBaseUrl: string;
  llmApiKey: string;
  llmModel: string;
  systemPrompt: string;
};

const DEFAULT_SYSTEM_PROMPT =
  'You are Claude, a helpful assistant participating in a Colanode workspace ' +
  'chat. Reply concisely and helpfully to the latest message.';

const required = (name: string): string => {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Missing required env var ${name}`);
  }
  return value;
};

export const loadConfig = (): BotConfig => ({
  serverUrl: required('COLANODE_SERVER_URL'),
  botEmail: required('COLANODE_BOT_EMAIL'),
  botPassword: required('COLANODE_BOT_PASSWORD'),
  dataDir: required('COLANODE_DATA_DIR'),
  llmBaseUrl: required('LLM_BASE_URL'),
  llmApiKey: required('LLM_API_KEY'),
  llmModel: required('LLM_MODEL'),
  systemPrompt: process.env.LLM_SYSTEM_PROMPT ?? DEFAULT_SYSTEM_PROMPT,
});
