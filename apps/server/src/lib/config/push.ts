import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

export const pushConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      subject: z.string().transform(resolveConfigReference),
      publicKey: z
        .string({ error: 'Push VAPID public key is required' })
        .transform(resolveConfigReference),
      privateKey: z
        .string({ error: 'Push VAPID private key is required' })
        .transform(resolveConfigReference),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({ enabled: false });

export type PushConfig = z.infer<typeof pushConfigSchema>;
