import ky from 'ky';

import { toSafeLogFields } from '@colanode/server/api/client/lib/log-error';
import { OidcConfig } from '@colanode/server/lib/config/account';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('lib:oidc');

// While Google's OAuth endpoints are hardcoded (there is only one Google),
// a generic OIDC provider config only gives us a `clientId`/`clientSecret`
// plus either explicit endpoints or an issuer to discover them from. This
// module resolves the three endpoints we need (authorize/token/userinfo)
// and builds the authorize URL the client redirects the browser to.
export type EnabledOidcConfig = Extract<OidcConfig, { enabled: true }>;

export interface OidcEndpoints {
  authorizationUrl: string;
  tokenUrl: string;
  userinfoUrl: string;
}

interface OidcDiscoveryDocument {
  authorization_endpoint: string;
  token_endpoint: string;
  userinfo_endpoint: string;
}

const OidcRequestTimeout = 1000 * 10;

// Discovery documents don't change at runtime, so a successful discovery is
// cached in memory for the life of the process (keyed by issuer, in case a
// future version supports more than one provider).
const discoveryCache = new Map<string, OidcEndpoints>();

const discoverOidcEndpoints = async (
  issuer: string
): Promise<OidcEndpoints> => {
  const cached = discoveryCache.get(issuer);
  if (cached) {
    return cached;
  }

  const wellKnownUrl = `${issuer.replace(/\/+$/, '')}/.well-known/openid-configuration`;
  const document = await ky
    .get(wellKnownUrl, { timeout: OidcRequestTimeout })
    .json<OidcDiscoveryDocument>();

  if (
    !document.authorization_endpoint ||
    !document.token_endpoint ||
    !document.userinfo_endpoint
  ) {
    throw new Error(
      `OIDC discovery document at "${wellKnownUrl}" is missing one of authorization_endpoint/token_endpoint/userinfo_endpoint.`
    );
  }

  const endpoints: OidcEndpoints = {
    authorizationUrl: document.authorization_endpoint,
    tokenUrl: document.token_endpoint,
    userinfoUrl: document.userinfo_endpoint,
  };

  discoveryCache.set(issuer, endpoints);
  return endpoints;
};

/**
 * Resolves the authorize/token/userinfo endpoints for an enabled OIDC
 * config. Explicit `authorizationUrl`/`tokenUrl`/`userinfoUrl` always win;
 * otherwise falls back to discovery via `issuer`. Throws a descriptive
 * error if neither is enough to determine all three endpoints, or if
 * discovery fails.
 */
export const resolveOidcEndpoints = async (
  oidcConfig: EnabledOidcConfig
): Promise<OidcEndpoints> => {
  if (
    oidcConfig.authorizationUrl &&
    oidcConfig.tokenUrl &&
    oidcConfig.userinfoUrl
  ) {
    return {
      authorizationUrl: oidcConfig.authorizationUrl,
      tokenUrl: oidcConfig.tokenUrl,
      userinfoUrl: oidcConfig.userinfoUrl,
    };
  }

  if (!oidcConfig.issuer) {
    throw new Error(
      'OIDC config must set either "issuer" (for discovery) or ' +
        'authorizationUrl + tokenUrl + userinfoUrl explicitly.'
    );
  }

  try {
    return await discoverOidcEndpoints(oidcConfig.issuer);
  } catch (error) {
    logger.error(
      toSafeLogFields(error),
      `Failed to discover OIDC endpoints from issuer "${oidcConfig.issuer}"`
    );
    throw new Error(
      `Failed to discover OIDC endpoints from issuer "${oidcConfig.issuer}".`
    );
  }
};

/** Builds the `/authorize` redirect URL the client sends the browser to. */
export const buildOidcAuthorizeUrl = (
  oidcConfig: EnabledOidcConfig,
  authorizationUrl: string
): string => {
  const params = new URLSearchParams({
    client_id: oidcConfig.clientId,
    redirect_uri: oidcConfig.redirectUri,
    response_type: 'code',
    scope: oidcConfig.scopes,
  });

  return `${authorizationUrl}?${params.toString()}`;
};

export interface OidcTokenResponse {
  access_token: string;
  token_type?: string;
  expires_in?: number;
  scope?: string;
  id_token?: string;
  refresh_token?: string;
}

export interface OidcUserInfo {
  sub: string;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  picture?: string;
}

/** Exchanges an authorization code for tokens (`grant_type=authorization_code`). */
export const fetchOidcToken = async (
  tokenUrl: string,
  oidcConfig: EnabledOidcConfig,
  code: string
): Promise<OidcTokenResponse | null> => {
  try {
    const params = new URLSearchParams({
      code,
      client_id: oidcConfig.clientId,
      client_secret: oidcConfig.clientSecret,
      redirect_uri: oidcConfig.redirectUri,
      grant_type: 'authorization_code',
    });

    return await ky
      .post(tokenUrl, {
        headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
        body: params,
        timeout: OidcRequestTimeout,
      })
      .json<OidcTokenResponse>();
  } catch (error) {
    logger.error(
      toSafeLogFields(error),
      'Failed to exchange OIDC authorization code for a token'
    );
    return null;
  }
};

// Shape of a userinfo response before normalization: either standards-compliant
// OIDC claims, or a GitLab-style REST user object (`id`/`username`/`avatar_url`)
// returned by providers — like a self-hosted GitLab-compatible identity
// provider — whose "userinfo" endpoint is really their REST user API rather
// than a true `/oauth/userinfo` OIDC endpoint.
interface RawOidcUserInfo {
  sub?: string;
  id?: string | number;
  email?: string;
  email_verified?: boolean;
  name?: string;
  preferred_username?: string;
  username?: string;
  picture?: string;
  avatar_url?: string;
}

/** Fetches the userinfo claims for the account behind an access token. */
export const fetchOidcUserInfo = async (
  userinfoUrl: string,
  accessToken: string
): Promise<OidcUserInfo | null> => {
  try {
    const user = await ky
      .get(userinfoUrl, {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: OidcRequestTimeout,
      })
      .json<RawOidcUserInfo>();

    // Prefer the real "sub" claim; fall back to "id" for providers whose
    // userinfo endpoint is a GitLab-style REST user object rather than a
    // standards-compliant OIDC userinfo response.
    const sub = user.sub ?? (user.id !== undefined ? String(user.id) : undefined);
    if (!sub) {
      logger.error('OIDC userinfo response is missing "sub"');
      return null;
    }

    return {
      sub,
      email: user.email,
      email_verified: user.email_verified,
      name: user.name,
      preferred_username: user.preferred_username ?? user.username,
      picture: user.picture ?? user.avatar_url,
    };
  } catch (error) {
    logger.error(
      toSafeLogFields(error),
      'Failed to fetch OIDC user info with access token'
    );
    return null;
  }
};
