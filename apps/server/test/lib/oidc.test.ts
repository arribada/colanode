import ky from 'ky';
import { beforeEach, describe, expect, it, vi, type Mock } from 'vitest';

import {
  buildOidcAuthorizeUrl,
  fetchOidcToken,
  fetchOidcUserInfo,
  resolveOidcEndpoints,
  type EnabledOidcConfig,
} from '@colanode/server/lib/oidc';

vi.mock('ky', () => ({
  default: {
    get: vi.fn(),
    post: vi.fn(),
  },
}));

const mockedKy = ky as unknown as { get: Mock; post: Mock };

const explicitConfig: EnabledOidcConfig = {
  enabled: true,
  issuer: undefined,
  authorizationUrl: 'https://idp.example.com/oauth/authorize',
  tokenUrl: 'https://idp.example.com/oauth/token',
  userinfoUrl: 'https://idp.example.com/oauth/userinfo',
  clientId: 'client-id',
  clientSecret: 'client-secret',
  redirectUri: 'https://colanode.example.com/auth/sso-callback',
  scopes: 'openid profile email',
  buttonLabel: 'Continue with SSO',
};

beforeEach(() => {
  mockedKy.get.mockReset();
  mockedKy.post.mockReset();
});

describe('resolveOidcEndpoints', () => {
  it('returns explicit endpoints without any network call', async () => {
    const endpoints = await resolveOidcEndpoints(explicitConfig);

    expect(endpoints).toEqual({
      authorizationUrl: 'https://idp.example.com/oauth/authorize',
      tokenUrl: 'https://idp.example.com/oauth/token',
      userinfoUrl: 'https://idp.example.com/oauth/userinfo',
    });
    expect(mockedKy.get).not.toHaveBeenCalled();
  });

  it('discovers endpoints from the issuer and caches them across calls', async () => {
    mockedKy.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          authorization_endpoint: 'https://issuer-1.example.com/oauth/authorize',
          token_endpoint: 'https://issuer-1.example.com/oauth/token',
          userinfo_endpoint: 'https://issuer-1.example.com/oauth/userinfo',
        }),
    });

    const discoveryConfig: EnabledOidcConfig = {
      ...explicitConfig,
      issuer: 'https://issuer-1.example.com',
      authorizationUrl: undefined,
      tokenUrl: undefined,
      userinfoUrl: undefined,
    };

    const first = await resolveOidcEndpoints(discoveryConfig);
    const second = await resolveOidcEndpoints(discoveryConfig);

    expect(first).toEqual({
      authorizationUrl: 'https://issuer-1.example.com/oauth/authorize',
      tokenUrl: 'https://issuer-1.example.com/oauth/token',
      userinfoUrl: 'https://issuer-1.example.com/oauth/userinfo',
    });
    expect(second).toEqual(first);
    expect(mockedKy.get).toHaveBeenCalledTimes(1);
    expect(mockedKy.get).toHaveBeenCalledWith(
      'https://issuer-1.example.com/.well-known/openid-configuration',
      expect.anything()
    );
  });

  it('throws when neither issuer nor explicit endpoints are configured', async () => {
    const incompleteConfig: EnabledOidcConfig = {
      ...explicitConfig,
      issuer: undefined,
      authorizationUrl: undefined,
      tokenUrl: undefined,
      userinfoUrl: undefined,
    };

    await expect(resolveOidcEndpoints(incompleteConfig)).rejects.toThrow();
    expect(mockedKy.get).not.toHaveBeenCalled();
  });

  it('throws a descriptive error when discovery fails', async () => {
    mockedKy.get.mockReturnValue({
      json: () => Promise.reject(new Error('network error')),
    });

    const discoveryConfig: EnabledOidcConfig = {
      ...explicitConfig,
      issuer: 'https://issuer-2.example.com',
      authorizationUrl: undefined,
      tokenUrl: undefined,
      userinfoUrl: undefined,
    };

    await expect(resolveOidcEndpoints(discoveryConfig)).rejects.toThrow(
      /Failed to discover OIDC endpoints/
    );
  });
});

describe('buildOidcAuthorizeUrl', () => {
  it('builds an authorize URL with client_id/redirect_uri/response_type/scope', () => {
    const url = buildOidcAuthorizeUrl(
      explicitConfig,
      'https://idp.example.com/oauth/authorize'
    );

    const parsed = new URL(url);
    expect(parsed.origin + parsed.pathname).toBe(
      'https://idp.example.com/oauth/authorize'
    );
    expect(parsed.searchParams.get('client_id')).toBe('client-id');
    expect(parsed.searchParams.get('redirect_uri')).toBe(
      'https://colanode.example.com/auth/sso-callback'
    );
    expect(parsed.searchParams.get('response_type')).toBe('code');
    expect(parsed.searchParams.get('scope')).toBe('openid profile email');
  });
});

describe('fetchOidcToken', () => {
  it('exchanges an authorization code for a token via a stubbed POST', async () => {
    mockedKy.post.mockReturnValue({
      json: () => Promise.resolve({ access_token: 'access-token-123' }),
    });

    const token = await fetchOidcToken(
      explicitConfig.tokenUrl!,
      explicitConfig,
      'auth-code-123'
    );

    expect(token).toEqual({ access_token: 'access-token-123' });
    expect(mockedKy.post).toHaveBeenCalledWith(
      'https://idp.example.com/oauth/token',
      expect.objectContaining({
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      })
    );

    const [, options] = mockedKy.post.mock.calls[0] as [string, { body: URLSearchParams }];
    expect(options.body.get('code')).toBe('auth-code-123');
    expect(options.body.get('client_id')).toBe('client-id');
    expect(options.body.get('client_secret')).toBe('client-secret');
    expect(options.body.get('redirect_uri')).toBe(
      'https://colanode.example.com/auth/sso-callback'
    );
    expect(options.body.get('grant_type')).toBe('authorization_code');
  });

  it('returns null when the token exchange request fails', async () => {
    mockedKy.post.mockReturnValue({
      json: () => Promise.reject(new Error('bad request')),
    });

    const token = await fetchOidcToken(
      explicitConfig.tokenUrl!,
      explicitConfig,
      'auth-code-123'
    );

    expect(token).toBeNull();
  });
});

describe('fetchOidcUserInfo', () => {
  it('fetches user info with a bearer token', async () => {
    mockedKy.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          sub: 'user-123',
          email: 'person@example.com',
          name: 'Person',
        }),
    });

    const userInfo = await fetchOidcUserInfo(
      explicitConfig.userinfoUrl!,
      'access-token-123'
    );

    expect(userInfo).toEqual({
      sub: 'user-123',
      email: 'person@example.com',
      name: 'Person',
    });
    expect(mockedKy.get).toHaveBeenCalledWith(
      'https://idp.example.com/oauth/userinfo',
      expect.objectContaining({
        headers: { Authorization: 'Bearer access-token-123' },
      })
    );
  });

  it('returns null when the response is missing "sub"', async () => {
    mockedKy.get.mockReturnValue({
      json: () => Promise.resolve({ email: 'person@example.com' }),
    });

    const userInfo = await fetchOidcUserInfo(
      explicitConfig.userinfoUrl!,
      'access-token-123'
    );

    expect(userInfo).toBeNull();
  });

  it('falls back to "id"/"username"/"avatar_url" for a GitLab-style REST userinfo response', async () => {
    mockedKy.get.mockReturnValue({
      json: () =>
        Promise.resolve({
          id: 4242,
          username: 'jdoe',
          email: 'person@example.com',
          name: 'Person',
          avatar_url: 'https://idp.example.com/avatars/jdoe.png',
        }),
    });

    const userInfo = await fetchOidcUserInfo(
      explicitConfig.userinfoUrl!,
      'access-token-123'
    );

    expect(userInfo).toEqual({
      sub: '4242',
      email: 'person@example.com',
      name: 'Person',
      preferred_username: 'jdoe',
      picture: 'https://idp.example.com/avatars/jdoe.png',
    });
  });

  it('returns null when the userinfo request fails', async () => {
    mockedKy.get.mockReturnValue({
      json: () => Promise.reject(new Error('unauthorized')),
    });

    const userInfo = await fetchOidcUserInfo(
      explicitConfig.userinfoUrl!,
      'access-token-123'
    );

    expect(userInfo).toBeNull();
  });
});
