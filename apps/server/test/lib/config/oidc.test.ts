import { describe, expect, it } from 'vitest';

import { oidcConfigSchema } from '@colanode/server/lib/config/account';

describe('oidcConfigSchema', () => {
  it('defaults to disabled when omitted', () => {
    const result = oidcConfigSchema.parse(undefined);
    expect(result).toEqual({ enabled: false });
  });

  it('parses an enabled config with an issuer (discovery mode) and resolves env:// references', () => {
    process.env.TEST_OIDC_CLIENT_ID = 'client-id';
    process.env.TEST_OIDC_CLIENT_SECRET = 'client-secret';

    const result = oidcConfigSchema.parse({
      enabled: true,
      issuer: 'https://devices.arribada.org',
      clientId: 'env://TEST_OIDC_CLIENT_ID',
      clientSecret: 'env://TEST_OIDC_CLIENT_SECRET',
      redirectUri: 'https://colanode.example.com/auth/sso-callback',
    });

    expect(result).toEqual({
      enabled: true,
      issuer: 'https://devices.arribada.org',
      authorizationUrl: undefined,
      tokenUrl: undefined,
      userinfoUrl: undefined,
      clientId: 'client-id',
      clientSecret: 'client-secret',
      redirectUri: 'https://colanode.example.com/auth/sso-callback',
      scopes: 'openid profile email',
      buttonLabel: 'Continue with SSO',
    });

    delete process.env.TEST_OIDC_CLIENT_ID;
    delete process.env.TEST_OIDC_CLIENT_SECRET;
  });

  it('parses an enabled config with explicit endpoints and custom scopes/label', () => {
    const result = oidcConfigSchema.parse({
      enabled: true,
      authorizationUrl: 'https://idp.example.com/oauth/authorize',
      tokenUrl: 'https://idp.example.com/oauth/token',
      userinfoUrl: 'https://idp.example.com/oauth/userinfo',
      clientId: 'plain-client-id',
      clientSecret: 'plain-client-secret',
      redirectUri: 'https://colanode.example.com/auth/sso-callback',
      scopes: 'openid email',
      buttonLabel: 'Se connecter avec Arribada',
    });

    expect(result).toMatchObject({
      enabled: true,
      authorizationUrl: 'https://idp.example.com/oauth/authorize',
      tokenUrl: 'https://idp.example.com/oauth/token',
      userinfoUrl: 'https://idp.example.com/oauth/userinfo',
      clientId: 'plain-client-id',
      clientSecret: 'plain-client-secret',
      scopes: 'openid email',
      buttonLabel: 'Se connecter avec Arribada',
    });
  });

  it('rejects an enabled config missing clientId/clientSecret/redirectUri', () => {
    expect(() =>
      oidcConfigSchema.parse({
        enabled: true,
        issuer: 'https://devices.arribada.org',
      })
    ).toThrow();
  });

  it('fails when an env:// reference is not set', () => {
    expect(() =>
      oidcConfigSchema.parse({
        enabled: true,
        issuer: 'https://devices.arribada.org',
        clientId: 'env://TEST_OIDC_CLIENT_ID_MISSING',
        clientSecret: 'plain-secret',
        redirectUri: 'https://colanode.example.com/auth/sso-callback',
      })
    ).toThrow();
  });
});
