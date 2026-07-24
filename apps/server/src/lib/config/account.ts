import { z } from 'zod/v4';

import { resolveConfigReference, resolveOptionalConfigReference } from './utils';

export const accountVerificationTypeSchema = z.enum([
  'automatic',
  'manual',
  'email',
]);

export type AccountVerificationType = z.infer<
  typeof accountVerificationTypeSchema
>;

export const googleConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      clientId: z
        .string({
          error: 'Google client ID is required when Google login is enabled.',
        })
        .transform(resolveConfigReference),
      clientSecret: z
        .string({
          error:
            'Google client secret is required when Google login is enabled.',
        })
        .transform(resolveConfigReference),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({
    enabled: false,
  });

// Generic OIDC/OAuth2 provider config, for logging in with a self-hosted
// identity provider (e.g. Arribada's devices.arribada.org GitLab-compatible
// OAuth2/OIDC provider, also used by Plane and Mattermost).
//
// Endpoints can be supplied either as an `issuer` (the server discovers
// `authorizationUrl`/`tokenUrl`/`userinfoUrl` from
// `${issuer}/.well-known/openid-configuration`, cached in memory after the
// first successful discovery) or explicitly via `authorizationUrl` +
// `tokenUrl` + `userinfoUrl`, which take precedence when present. At least
// one of the two must be enough to resolve all three endpoints — this is
// validated lazily by `resolveOidcEndpoints` (see `lib/oidc.ts`), not at
// config-parse time, so that a missing/unreachable issuer only breaks OIDC
// login rather than server startup.
export const oidcConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      issuer: z.string().optional().transform(resolveOptionalConfigReference),
      authorizationUrl: z
        .string()
        .optional()
        .transform(resolveOptionalConfigReference),
      tokenUrl: z.string().optional().transform(resolveOptionalConfigReference),
      userinfoUrl: z
        .string()
        .optional()
        .transform(resolveOptionalConfigReference),
      clientId: z
        .string({
          error: 'OIDC client ID is required when OIDC login is enabled.',
        })
        .transform(resolveConfigReference),
      clientSecret: z
        .string({
          error: 'OIDC client secret is required when OIDC login is enabled.',
        })
        .transform(resolveConfigReference),
      redirectUri: z
        .string({
          error: 'OIDC redirect URI is required when OIDC login is enabled.',
        })
        .transform(resolveConfigReference),
      scopes: z
        .string()
        .default('openid profile email')
        .transform(resolveConfigReference),
      buttonLabel: z
        .string()
        .default('Continue with SSO')
        .transform(resolveConfigReference),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({
    enabled: false,
  });

export type OidcConfig = z.infer<typeof oidcConfigSchema>;

export const accountConfigSchema = z
  .object({
    verificationType: accountVerificationTypeSchema
      .transform(resolveConfigReference)
      .default('automatic'),
    otpTimeout: z.coerce.number().default(600),
    google: googleConfigSchema,
    oidc: oidcConfigSchema,
  })
  .prefault({});

export type AccountConfig = z.infer<typeof accountConfigSchema>;
