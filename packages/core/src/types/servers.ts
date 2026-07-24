import { z } from 'zod/v4';

export const serverGoogleConfigSchema = z.discriminatedUnion('enabled', [
  z.object({
    enabled: z.literal(true),
    clientId: z.string(),
  }),
  z.object({
    enabled: z.literal(false),
  }),
]);

export const serverOidcConfigSchema = z.discriminatedUnion('enabled', [
  z.object({
    enabled: z.literal(true),
    authorizeUrl: z.string(),
    buttonLabel: z.string(),
  }),
  z.object({
    enabled: z.literal(false),
  }),
]);

export type ServerOidcConfig = z.infer<typeof serverOidcConfigSchema>;

export const serverAccountConfigSchema = z.object({
  google: serverGoogleConfigSchema,
  oidc: serverOidcConfigSchema.optional(),
});

export const serverPushConfigSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(true), publicKey: z.string() }),
  z.object({ enabled: z.literal(false) }),
]);

export type ServerPushConfig = z.infer<typeof serverPushConfigSchema>;

export const serverApnsConfigSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(true), bundleId: z.string() }),
  z.object({ enabled: z.literal(false) }),
]);

export type ServerApnsConfig = z.infer<typeof serverApnsConfigSchema>;

export const serverConfigSchema = z.object({
  name: z.string(),
  avatar: z.string(),
  version: z.string(),
  sha: z.string(),
  ip: z.string().nullable().optional(),
  pathPrefix: z.string().nullable().optional(),
  account: serverAccountConfigSchema.nullable().optional(),
  push: serverPushConfigSchema.nullable().optional(),
  apns: serverApnsConfigSchema.nullable().optional(),
});

export type ServerConfig = z.infer<typeof serverConfigSchema>;
