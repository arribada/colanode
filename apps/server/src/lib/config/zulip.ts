import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

// Zulip outgoing-notification integration: relays Colanode notifications
// (mentions, chat messages) to a Zulip stream via the bot REST API
// (see lib/zulip/zulip-client.ts + lib/zulip/notifier.ts). Disabled by
// default (feature flag) and config-driven like the other integrations in
// this file — either set literal values / `env://VAR` references under
// config.json's "zulip" key (account-style), or, for pure env-var deploys,
// just set ZULIP_ENABLED=true plus the four ZULIP_* vars below and skip
// touching config.json's "zulip" key entirely (each field falls back to its
// own `env://` reference when config.json doesn't override it).
export const zulipConfigSchema = z.preprocess((val) => {
  const input = (val && typeof val === 'object' ? val : {}) as Record<
    string,
    unknown
  >;

  if (input.enabled === undefined) {
    return { ...input, enabled: process.env.ZULIP_ENABLED === 'true' };
  }

  return input;
}, z.discriminatedUnion('enabled', [
  z.object({
    enabled: z.literal(true),
    site: z
      .string()
      .default('env://ZULIP_SITE')
      .transform(resolveConfigReference),
    botEmail: z
      .string()
      .default('env://ZULIP_BOT_EMAIL')
      .transform(resolveConfigReference),
    apiKey: z
      .string()
      .default('env://ZULIP_API_KEY')
      .transform(resolveConfigReference),
    stream: z
      .string()
      .default('env://ZULIP_STREAM')
      .transform(resolveConfigReference),
  }),
  z.object({
    enabled: z.literal(false),
  }),
]));

export type ZulipConfig = z.infer<typeof zulipConfigSchema>;
