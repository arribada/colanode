// OAuth 2.1 endpoints (Dynamic Client Registration + PKCE S256) that let the
// Claude connector UI authorize per wiki user against the remote MCP server.
// Mounted at the application root so the well-known + /oauth/* paths are
// reachable at the domain root. The wiki user is authenticated on /authorize
// with their email + password (the same credential the web login uses); the
// issued access token is stored in mcp_access_tokens, so the existing MCP
// bearer check accepts it unchanged.
import querystring from 'node:querystring';

import { FastifyPluginCallback, FastifyReply, FastifyRequest } from 'fastify';

import { AccountStatus } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { verifyPassword } from '@colanode/server/lib/accounts';
import { createLogger } from '@colanode/server/lib/logger';
import * as oauth from '@colanode/server/lib/mcp/oauth';
import { isAuthEmailRateLimited } from '@colanode/server/lib/rate-limits';

const logger = createLogger('api:client:oauth');

const str = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const sendHtml = (reply: FastifyReply, status: number, html: string) =>
  reply.code(status).type('text/html; charset=utf-8').send(html);

const sendJson = (
  reply: FastifyReply,
  status: number,
  body: Record<string, unknown>
) =>
  reply
    .code(status)
    .header('Access-Control-Allow-Origin', '*')
    .header('Cache-Control', 'no-store')
    .type('application/json')
    .send(body);

const oauthError = (
  reply: FastifyReply,
  status: number,
  error: string,
  description: string
) => sendJson(reply, status, { error, error_description: description });

const redirectTo = (reply: FastifyReply, url: string) =>
  reply.code(302).header('Location', url).send();

const redirectError = (
  reply: FastifyReply,
  redirectUri: string,
  error: string,
  description: string,
  state?: string
) => {
  const url = new URL(redirectUri);
  url.searchParams.set('error', error);
  url.searchParams.set('error_description', description);
  if (state) {
    url.searchParams.set('state', state);
  }
  return redirectTo(reply, url.toString());
};

const extractParams = (
  src: Record<string, unknown>
): oauth.OauthAuthorizeParams => ({
  response_type: str(src.response_type) ?? '',
  client_id: str(src.client_id) ?? '',
  redirect_uri: str(src.redirect_uri) ?? '',
  code_challenge: str(src.code_challenge) ?? '',
  code_challenge_method: str(src.code_challenge_method) ?? '',
  state: str(src.state),
  scope: str(src.scope),
  resource: str(src.resource),
});

interface ClientRow {
  id: string;
  name: string | null;
  redirect_uris: string[];
}

type ValidationResult =
  | { type: 'ok'; client: ClientRow }
  | { type: 'error_page'; status: number; message: string }
  | { type: 'redirect_error'; error: string; description: string };

// Validates the client + redirect_uri FIRST (never redirect to an unregistered
// URI), then the PKCE/response_type params (safe to report via redirect).
const validateClientAndRedirect = async (
  params: oauth.OauthAuthorizeParams
): Promise<ValidationResult> => {
  if (!params.client_id || !params.redirect_uri) {
    return {
      type: 'error_page',
      status: 400,
      message: 'Missing client_id or redirect_uri.',
    };
  }

  const client = await database
    .selectFrom('mcp_oauth_clients')
    .select(['id', 'name', 'redirect_uris'])
    .where('id', '=', params.client_id)
    .executeTakeFirst();

  if (!client) {
    return {
      type: 'error_page',
      status: 400,
      message: 'Unknown client. Please re-add the connector.',
    };
  }

  const uris = client.redirect_uris;
  if (!Array.isArray(uris) || !uris.includes(params.redirect_uri)) {
    return {
      type: 'error_page',
      status: 400,
      message: 'The redirect URI is not registered for this client.',
    };
  }

  if (params.response_type !== 'code') {
    return {
      type: 'redirect_error',
      error: 'unsupported_response_type',
      description: 'Only the authorization code flow is supported.',
    };
  }

  if (!params.code_challenge) {
    return {
      type: 'redirect_error',
      error: 'invalid_request',
      description: 'PKCE code_challenge is required.',
    };
  }

  if (params.code_challenge_method !== 'S256') {
    return {
      type: 'redirect_error',
      error: 'invalid_request',
      description: 'Only the S256 code_challenge_method is supported.',
    };
  }

  return { type: 'ok', client };
};

const isValidRedirectUri = (uri: string): boolean => {
  try {
    const url = new URL(uri);
    if (url.protocol === 'https:') {
      return true;
    }
    if (url.protocol === 'http:') {
      return (
        url.hostname === 'localhost' ||
        url.hostname === '127.0.0.1' ||
        url.hostname === '[::1]'
      );
    }
    // Custom scheme (native app callback), e.g. "com.example.app:/cb".
    return url.protocol.length > 1;
  } catch {
    return false;
  }
};

// ---- Discovery metadata -----------------------------------------------------

const protectedResourceHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) =>
  sendJson(
    reply,
    200,
    oauth.buildProtectedResourceMetadata(oauth.getBaseUrl(request))
  );

const authorizationServerHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) =>
  sendJson(
    reply,
    200,
    oauth.buildAuthorizationServerMetadata(oauth.getBaseUrl(request))
  );

// ---- Dynamic Client Registration (RFC 7591) ---------------------------------

const registerHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const body = (request.body ?? {}) as Record<string, unknown>;

  const rawUris = body.redirect_uris;
  if (
    !Array.isArray(rawUris) ||
    rawUris.length === 0 ||
    !rawUris.every((u) => typeof u === 'string' && isValidRedirectUri(u))
  ) {
    return oauthError(
      reply,
      400,
      'invalid_redirect_uri',
      'redirect_uris must be a non-empty array of valid https, loopback or custom-scheme URIs.'
    );
  }
  const redirectUris = rawUris as string[];

  const clientName = str(body.client_name) ?? null;
  const grantTypes =
    Array.isArray(body.grant_types) &&
    body.grant_types.every((g) => typeof g === 'string')
      ? (body.grant_types as string[])
      : ['authorization_code', 'refresh_token'];
  const responseTypes =
    Array.isArray(body.response_types) &&
    body.response_types.every((r) => typeof r === 'string')
      ? (body.response_types as string[])
      : ['code'];
  const scope = str(body.scope) ?? null;

  const clientId = oauth.randomToken('mcpc_', 24);
  const now = new Date();

  await database
    .insertInto('mcp_oauth_clients')
    .values({
      id: clientId,
      secret: null,
      name: clientName,
      redirect_uris: JSON.stringify(redirectUris),
      grant_types: JSON.stringify(grantTypes),
      response_types: JSON.stringify(responseTypes),
      scope,
      token_endpoint_auth_method: 'none',
      metadata: JSON.stringify(body),
      created_at: now,
    })
    .execute();

  logger.info({ clientId, clientName }, 'Registered MCP OAuth client');

  return sendJson(reply, 201, {
    client_id: clientId,
    client_id_issued_at: Math.floor(now.getTime() / 1000),
    redirect_uris: redirectUris,
    token_endpoint_auth_method: 'none',
    grant_types: grantTypes,
    response_types: responseTypes,
    ...(clientName ? { client_name: clientName } : {}),
    ...(scope ? { scope } : {}),
  });
};

// ---- Authorization endpoint -------------------------------------------------

const authorizeGetHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const params = extractParams(request.query as Record<string, unknown>);
  const validation = await validateClientAndRedirect(params);

  if (validation.type === 'error_page') {
    return sendHtml(
      reply,
      validation.status,
      oauth.renderErrorPage(validation.message)
    );
  }
  if (validation.type === 'redirect_error') {
    return redirectError(
      reply,
      params.redirect_uri,
      validation.error,
      validation.description,
      params.state
    );
  }

  return sendHtml(
    reply,
    200,
    oauth.renderAuthorizePage({ params, clientName: validation.client.name })
  );
};

const authorizePostHandler = async (
  request: FastifyRequest,
  reply: FastifyReply
) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const params = extractParams(body);

  const validation = await validateClientAndRedirect(params);
  if (validation.type === 'error_page') {
    return sendHtml(
      reply,
      validation.status,
      oauth.renderErrorPage(validation.message)
    );
  }
  if (validation.type === 'redirect_error') {
    return redirectError(
      reply,
      params.redirect_uri,
      validation.error,
      validation.description,
      params.state
    );
  }
  const client = validation.client;

  // Resolve the acting account: either from an already-authenticated login
  // ticket (workspace-selection round trip) or from submitted credentials.
  let accountId: string | null = null;
  const loginTicket = str(body.login_ticket);

  if (loginTicket) {
    const session = await oauth.readLoginTicket(loginTicket);
    if (!session) {
      return sendHtml(
        reply,
        200,
        oauth.renderAuthorizePage({
          params,
          clientName: client.name,
          error: 'Your session expired. Please sign in again.',
        })
      );
    }
    accountId = session.accountId;
  } else {
    const email = (str(body.email) ?? '').toLowerCase().trim();
    const password = str(body.password) ?? '';

    if (!email || !password) {
      return sendHtml(
        reply,
        200,
        oauth.renderAuthorizePage({
          params,
          clientName: client.name,
          error: 'Enter your email and password.',
          email,
        })
      );
    }

    if (await isAuthEmailRateLimited(email)) {
      return sendHtml(
        reply,
        429,
        oauth.renderAuthorizePage({
          params,
          clientName: client.name,
          error: 'Too many attempts. Please try again later.',
          email,
        })
      );
    }

    const account = await database
      .selectFrom('accounts')
      .selectAll()
      .where('email', '=', email)
      .executeTakeFirst();

    if (!account || !account.password) {
      return sendHtml(
        reply,
        200,
        oauth.renderAuthorizePage({
          params,
          clientName: client.name,
          error: 'Invalid email or password.',
          email,
        })
      );
    }

    if (account.status !== AccountStatus.Active) {
      return sendHtml(
        reply,
        200,
        oauth.renderAuthorizePage({
          params,
          clientName: client.name,
          error: 'Your account is not active. Contact your administrator.',
          email,
        })
      );
    }

    const passwordOk = await verifyPassword(password, account.password);
    if (!passwordOk) {
      return sendHtml(
        reply,
        200,
        oauth.renderAuthorizePage({
          params,
          clientName: client.name,
          error: 'Invalid email or password.',
          email,
        })
      );
    }

    accountId = account.id;
  }

  const memberships = await oauth.resolveActiveMemberships(accountId);
  if (memberships.length === 0) {
    return sendHtml(
      reply,
      200,
      oauth.renderErrorPage('Your account has no active workspace.')
    );
  }

  let selected: oauth.Membership | undefined;
  const selectedUserId = str(body.user_id);
  if (selectedUserId) {
    selected = memberships.find((m) => m.userId === selectedUserId);
    if (!selected) {
      return sendHtml(
        reply,
        400,
        oauth.renderErrorPage('Invalid workspace selection.')
      );
    }
  } else if (memberships.length === 1) {
    selected = memberships[0];
  } else {
    const ticket = loginTicket ?? (await oauth.createLoginTicket(accountId));
    return sendHtml(
      reply,
      200,
      oauth.renderWorkspacePage({ params, loginTicket: ticket, memberships })
    );
  }

  if (!selected) {
    return sendHtml(
      reply,
      400,
      oauth.renderErrorPage('Unable to resolve a workspace.')
    );
  }

  const code = oauth.randomToken('', 48);
  const now = new Date();
  const expiresAt = new Date(
    now.getTime() + oauth.AUTH_CODE_TTL_SECONDS * 1000
  );

  await database
    .insertInto('mcp_oauth_codes')
    .values({
      code,
      client_id: client.id,
      user_id: selected.userId,
      workspace_id: selected.workspaceId,
      redirect_uri: params.redirect_uri,
      code_challenge: params.code_challenge,
      code_challenge_method: params.code_challenge_method,
      scope: params.scope ?? null,
      resource: params.resource ?? null,
      created_at: now,
      expires_at: expiresAt,
      consumed_at: null,
    })
    .execute();

  if (loginTicket) {
    await oauth.deleteLoginTicket(loginTicket);
  }

  const redirectUrl = new URL(params.redirect_uri);
  redirectUrl.searchParams.set('code', code);
  if (params.state) {
    redirectUrl.searchParams.set('state', params.state);
  }
  return redirectTo(reply, redirectUrl.toString());
};

// ---- Token endpoint ---------------------------------------------------------

const sendTokenResponse = (
  reply: FastifyReply,
  tokens: oauth.IssuedTokens,
  scope: string | null
) =>
  sendJson(reply, 200, {
    access_token: tokens.accessToken,
    token_type: 'Bearer',
    expires_in: tokens.expiresIn,
    refresh_token: tokens.refreshToken,
    ...(scope ? { scope } : {}),
  });

const tokenHandler = async (request: FastifyRequest, reply: FastifyReply) => {
  const body = (request.body ?? {}) as Record<string, unknown>;
  const grantType = str(body.grant_type);

  if (grantType === 'authorization_code') {
    const code = str(body.code);
    const redirectUri = str(body.redirect_uri);
    const clientId = str(body.client_id);
    const codeVerifier = str(body.code_verifier);

    if (!code || !redirectUri || !clientId || !codeVerifier) {
      return oauthError(
        reply,
        400,
        'invalid_request',
        'Missing code, redirect_uri, client_id or code_verifier.'
      );
    }

    // Atomically consume the one-time code (guards against replay/races).
    const row = await database
      .updateTable('mcp_oauth_codes')
      .set({ consumed_at: new Date() })
      .where('code', '=', code)
      .where('consumed_at', 'is', null)
      .returningAll()
      .executeTakeFirst();

    if (!row) {
      return oauthError(
        reply,
        400,
        'invalid_grant',
        'Authorization code is invalid or already used.'
      );
    }
    if (row.expires_at.getTime() <= Date.now()) {
      return oauthError(
        reply,
        400,
        'invalid_grant',
        'Authorization code has expired.'
      );
    }
    if (row.client_id !== clientId) {
      return oauthError(reply, 400, 'invalid_grant', 'client_id mismatch.');
    }
    if (row.redirect_uri !== redirectUri) {
      return oauthError(reply, 400, 'invalid_grant', 'redirect_uri mismatch.');
    }

    const pkceOk = await oauth.verifyPkceS256(codeVerifier, row.code_challenge);
    if (!pkceOk) {
      return oauthError(
        reply,
        400,
        'invalid_grant',
        'PKCE verification failed.'
      );
    }

    const client = await database
      .selectFrom('mcp_oauth_clients')
      .select(['name'])
      .where('id', '=', clientId)
      .executeTakeFirst();

    const tokens = await oauth.issueTokensForUser({
      userId: row.user_id,
      workspaceId: row.workspace_id,
      clientId,
      clientName: client?.name ?? null,
    });

    return sendTokenResponse(reply, tokens, row.scope);
  }

  if (grantType === 'refresh_token') {
    const refreshToken = str(body.refresh_token);
    const clientId = str(body.client_id);

    if (!refreshToken) {
      return oauthError(
        reply,
        400,
        'invalid_request',
        'Missing refresh_token.'
      );
    }

    const row = await database
      .selectFrom('mcp_access_tokens')
      .selectAll()
      .where('refresh_token', '=', refreshToken)
      .where('revoked_at', 'is', null)
      .executeTakeFirst();

    if (!row) {
      return oauthError(
        reply,
        400,
        'invalid_grant',
        'Refresh token is invalid or revoked.'
      );
    }
    if (
      row.refresh_token_expires_at &&
      row.refresh_token_expires_at.getTime() <= Date.now()
    ) {
      return oauthError(
        reply,
        400,
        'invalid_grant',
        'Refresh token has expired.'
      );
    }
    if (clientId && row.client_id && row.client_id !== clientId) {
      return oauthError(reply, 400, 'invalid_grant', 'client_id mismatch.');
    }

    const effectiveClientId = row.client_id ?? clientId ?? null;
    if (!effectiveClientId) {
      return oauthError(
        reply,
        400,
        'invalid_grant',
        'Refresh token is not bound to a client.'
      );
    }

    const client = await database
      .selectFrom('mcp_oauth_clients')
      .select(['name'])
      .where('id', '=', effectiveClientId)
      .executeTakeFirst();

    // Rotate: mint a fresh access + refresh token (new row), then revoke the
    // old one. Rotating refresh tokens on every use limits replay exposure.
    const tokens = await oauth.issueTokensForUser({
      userId: row.user_id,
      workspaceId: row.workspace_id,
      clientId: effectiveClientId,
      clientName: client?.name ?? null,
    });

    await database
      .updateTable('mcp_access_tokens')
      .set({ revoked_at: new Date() })
      .where('id', '=', row.id)
      .execute();

    return sendTokenResponse(reply, tokens, null);
  }

  return oauthError(
    reply,
    400,
    'unsupported_grant_type',
    'Only authorization_code and refresh_token are supported.'
  );
};

export const oauthRoutes: FastifyPluginCallback = (instance, _, done) => {
  // OAuth token requests (and our own login form) are form-encoded; Fastify
  // does not parse that content type by default.
  instance.addContentTypeParser(
    'application/x-www-form-urlencoded',
    { parseAs: 'string' },
    (_request, payload, contentDone) => {
      try {
        contentDone(null, querystring.parse(payload as string));
      } catch (error) {
        contentDone(error as Error, undefined);
      }
    }
  );

  instance.route({
    method: 'GET',
    url: oauth.PROTECTED_RESOURCE_METADATA_PATH,
    handler: protectedResourceHandler,
  });
  instance.route({
    method: 'GET',
    url: `${oauth.PROTECTED_RESOURCE_METADATA_PATH}/*`,
    handler: protectedResourceHandler,
  });
  instance.route({
    method: 'GET',
    url: oauth.AUTHORIZATION_SERVER_METADATA_PATH,
    handler: authorizationServerHandler,
  });
  instance.route({
    method: 'POST',
    url: oauth.REGISTER_PATH,
    handler: registerHandler,
  });
  instance.route({
    method: 'GET',
    url: oauth.AUTHORIZE_PATH,
    handler: authorizeGetHandler,
  });
  instance.route({
    method: 'POST',
    url: oauth.AUTHORIZE_PATH,
    handler: authorizePostHandler,
  });
  instance.route({
    method: 'POST',
    url: oauth.TOKEN_PATH,
    handler: tokenHandler,
  });

  done();
};
