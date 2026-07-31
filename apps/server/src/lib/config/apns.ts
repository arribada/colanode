import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

export const apnsConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      key: z
        .string({ error: 'APNs auth key is required' })
        .transform(resolveConfigReference),
      keyId: z
        .string({ error: 'APNs key id is required' })
        .transform(resolveConfigReference),
      teamId: z
        .string({ error: 'APNs team id is required' })
        .transform(resolveConfigReference),
      bundleId: z
        .string({ error: 'APNs bundle id is required' })
        .transform(resolveConfigReference),
      production: z.boolean().optional(),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({ enabled: false });

export type ApnsConfig = z.infer<typeof apnsConfigSchema>;
