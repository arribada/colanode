// OAuth 2.1 (Dynamic Client Registration + PKCE S256) support for the remote
// wiki MCP server. This module holds the pure helpers, DB/Redis glue and the
// minimal server-rendered HTML used by the /oauth/authorize consent screen.
// The HTTP endpoints live in api/client/routes/oauth. PKCE verification reuses
// the MCP SDK's own dependency (pkce-challenge) rather than hand-rolling crypto.
import { randomBytes } from 'node:crypto';

import { FastifyRequest } from 'fastify';
import { verifyChallenge } from 'pkce-challenge';

import { generateId, IdType, UserStatus, WorkspaceStatus } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { redis } from '@colanode/server/data/redis';

export const MCP_RESOURCE_PATH = '/client/mcp';
export const AUTHORIZE_PATH = '/oauth/authorize';
export const TOKEN_PATH = '/oauth/token';
export const REGISTER_PATH = '/oauth/register';
export const PROTECTED_RESOURCE_METADATA_PATH =
  '/.well-known/oauth-protected-resource';
export const AUTHORIZATION_SERVER_METADATA_PATH =
  '/.well-known/oauth-authorization-server';

export const AUTH_CODE_TTL_SECONDS = 300; // 5 minutes
export const ACCESS_TOKEN_TTL_SECONDS = 24 * 60 * 60; // 24 hours
export const REFRESH_TOKEN_TTL_SECONDS = 180 * 24 * 60 * 60; // 180 days
export const LOGIN_TICKET_TTL_SECONDS = 300; // 5 minutes

// Public base URL of this server as seen by the client (e.g.
// https://docs.arribada.org). trustProxy is enabled and the router forwards
// Host + X-Forwarded-Proto, so request.protocol/hostname are the public ones.
export const getBaseUrl = (request: FastifyRequest): string =>
  `${request.protocol}://${request.hostname}`;

export const protectedResourceMetadataUrl = (request: FastifyRequest): string =>
  `${getBaseUrl(request)}${PROTECTED_RESOURCE_METADATA_PATH}`;

export const randomToken = (prefix: string, bytes = 32): string =>
  `${prefix}${randomBytes(bytes).toString('hex')}`;

// PKCE S256 verification via the SDK's own pkce-challenge dependency.
export const verifyPkceS256 = async (
  codeVerifier: string,
  codeChallenge: string
): Promise<boolean> => {
  try {
    return await verifyChallenge(codeVerifier, codeChallenge);
  } catch {
    return false;
  }
};

export interface Membership {
  userId: string;
  workspaceId: string;
  workspaceName: string;
}

// Active workspace memberships for an account. Each maps to a distinct acting
// {userId, workspaceId} the MCP token can be bound to. userId is users.id.
export const resolveActiveMemberships = async (
  accountId: string
): Promise<Membership[]> => {
  const rows = await database
    .selectFrom('users')
    .innerJoin('workspaces', 'workspaces.id', 'users.workspace_id')
    .select([
      'users.id as user_id',
      'workspaces.id as workspace_id',
      'workspaces.name as workspace_name',
    ])
    .where('users.account_id', '=', accountId)
    .where('users.status', '=', UserStatus.Active)
    .where('users.role', '!=', 'none')
    .where('workspaces.status', '=', WorkspaceStatus.Active)
    .execute();

  return rows.map((r) => ({
    userId: r.user_id,
    workspaceId: r.workspace_id,
    workspaceName: r.workspace_name,
  }));
};

export interface IssuedTokens {
  accessToken: string;
  refreshToken: string;
  expiresIn: number;
}

// Mints an OAuth access + refresh token bound to one {userId, workspaceId} and
// stores it in the SAME mcp_access_tokens table the bearer check consults, so
// the existing MCP endpoint accepts it with no special-casing.
export const issueTokensForUser = async (opts: {
  userId: string;
  workspaceId: string;
  clientId: string;
  clientName: string | null;
}): Promise<IssuedTokens> => {
  const accessToken = randomToken('mcp_');
  const refreshToken = randomToken('mcpr_');
  const now = new Date();
  const expiresAt = new Date(now.getTime() + ACCESS_TOKEN_TTL_SECONDS * 1000);
  const refreshExpiresAt = new Date(
    now.getTime() + REFRESH_TOKEN_TTL_SECONDS * 1000
  );

  await database
    .insertInto('mcp_access_tokens')
    .values({
      id: generateId(IdType.McpToken),
      token: accessToken,
      user_id: opts.userId,
      workspace_id: opts.workspaceId,
      name: opts.clientName ? `OAuth: ${opts.clientName}` : 'OAuth client',
      client_id: opts.clientId,
      expires_at: expiresAt,
      refresh_token: refreshToken,
      refresh_token_expires_at: refreshExpiresAt,
      created_at: now,
      last_used_at: null,
      revoked_at: null,
    })
    .execute();

  return {
    accessToken,
    refreshToken,
    expiresIn: ACCESS_TOKEN_TTL_SECONDS,
  };
};

// Ephemeral, single-use login ticket (Redis) used only to carry an already
// password-authenticated accountId across the workspace-selection step, so the
// password is never re-sent nor placed in an HTML field.
const loginTicketKey = (ticket: string): string => `mcp_oauth_login:${ticket}`;

export const createLoginTicket = async (accountId: string): Promise<string> => {
  const ticket = randomToken('lt_', 24);
  await redis.set(loginTicketKey(ticket), JSON.stringify({ accountId }), {
    expiration: { type: 'EX', value: LOGIN_TICKET_TTL_SECONDS },
  });
  return ticket;
};

export const readLoginTicket = async (
  ticket: string
): Promise<{ accountId: string } | null> => {
  const raw = await redis.get(loginTicketKey(ticket));
  if (!raw) {
    return null;
  }
  try {
    return JSON.parse(raw) as { accountId: string };
  } catch {
    return null;
  }
};

export const deleteLoginTicket = async (ticket: string): Promise<void> => {
  await redis.del(loginTicketKey(ticket));
};

export const buildProtectedResourceMetadata = (
  base: string
): Record<string, unknown> => ({
  resource: `${base}${MCP_RESOURCE_PATH}`,
  authorization_servers: [base],
  bearer_methods_supported: ['header'],
  resource_name: 'Arribada Wiki MCP',
  resource_documentation: base,
});

export const buildAuthorizationServerMetadata = (
  base: string
): Record<string, unknown> => ({
  issuer: base,
  authorization_endpoint: `${base}${AUTHORIZE_PATH}`,
  token_endpoint: `${base}${TOKEN_PATH}`,
  registration_endpoint: `${base}${REGISTER_PATH}`,
  response_types_supported: ['code'],
  grant_types_supported: ['authorization_code', 'refresh_token'],
  code_challenge_methods_supported: ['S256'],
  token_endpoint_auth_methods_supported: ['none'],
  scopes_supported: ['wiki'],
  service_documentation: base,
});

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

// The OAuth request parameters carried as hidden fields through the consent UI.
export interface OauthAuthorizeParams {
  response_type: string;
  client_id: string;
  redirect_uri: string;
  code_challenge: string;
  code_challenge_method: string;
  state?: string;
  scope?: string;
  resource?: string;
}

const hiddenFields = (params: OauthAuthorizeParams): string => {
  const entries: Array<[string, string | undefined]> = [
    ['response_type', params.response_type],
    ['client_id', params.client_id],
    ['redirect_uri', params.redirect_uri],
    ['code_challenge', params.code_challenge],
    ['code_challenge_method', params.code_challenge_method],
    ['state', params.state],
    ['scope', params.scope],
    ['resource', params.resource],
  ];
  return entries
    .filter(([, v]) => v !== undefined && v !== null)
    .map(
      ([k, v]) =>
        `<input type="hidden" name="${escapeHtml(k)}" value="${escapeHtml(
          String(v)
        )}" />`
    )
    .join('\n      ');
};

const page = (title: string, body: string): string => `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>${escapeHtml(title)}</title>
    <style>
      :root { color-scheme: light dark; }
      * { box-sizing: border-box; }
      body { font-family: system-ui, -apple-system, Segoe UI, Roboto, sans-serif;
        margin: 0; min-height: 100vh; display: flex; align-items: center;
        justify-content: center; background: #f4f5f7; color: #1f2329; }
      @media (prefers-color-scheme: dark) {
        body { background: #16181d; color: #e6e8eb; }
        .card { background: #21242b !important; box-shadow: none !important;
          border: 1px solid #2f333c; }
        input { background: #16181d !important; color: #e6e8eb !important;
          border-color: #363b45 !important; }
        .muted { color: #9aa1ac !important; }
      }
      .card { width: 100%; max-width: 380px; background: #fff; border-radius: 12px;
        padding: 28px; box-shadow: 0 4px 24px rgba(0,0,0,0.08); }
      h1 { font-size: 18px; margin: 0 0 4px; }
      .muted { color: #6b727c; font-size: 13px; margin: 0 0 20px; }
      label { display: block; font-size: 13px; font-weight: 600; margin: 14px 0 6px; }
      input[type=email], input[type=password] { width: 100%; padding: 10px 12px;
        border: 1px solid #d6dae0; border-radius: 8px; font-size: 14px; }
      button { width: 100%; margin-top: 20px; padding: 11px; border: 0;
        border-radius: 8px; background: #2f6feb; color: #fff; font-size: 14px;
        font-weight: 600; cursor: pointer; }
      button:hover { background: #245cd0; }
      .err { background: #fdecec; color: #b02a2a; border-radius: 8px;
        padding: 10px 12px; font-size: 13px; margin-bottom: 12px; }
      .choice { display: flex; align-items: center; gap: 10px; padding: 10px 12px;
        border: 1px solid #d6dae0; border-radius: 8px; margin-top: 8px; font-size: 14px; }
    </style>
  </head>
  <body>
    <div class="card">${body}</div>
  </body>
</html>`;

export const renderAuthorizePage = (opts: {
  params: OauthAuthorizeParams;
  clientName: string | null;
  error?: string;
  email?: string;
}): string => {
  const app = opts.clientName ? escapeHtml(opts.clientName) : 'An application';
  const errBlock = opts.error
    ? `<div class="err">${escapeHtml(opts.error)}</div>`
    : '';
  return page(
    'Authorize · Arribada Wiki',
    `
      <h1>Connect to the Arribada Wiki</h1>
      <p class="muted">${app} wants to act as your wiki user. Sign in with your
        wiki account to authorize it. It will only be able to do what you can.</p>
      ${errBlock}
      <form method="post" action="${AUTHORIZE_PATH}">
        ${hiddenFields(opts.params)}
        <label for="email">Email</label>
        <input id="email" type="email" name="email" autocomplete="username"
          value="${escapeHtml(opts.email ?? '')}" required autofocus />
        <label for="password">Password</label>
        <input id="password" type="password" name="password"
          autocomplete="current-password" required />
        <button type="submit">Sign in &amp; authorize</button>
      </form>`
  );
};

export const renderWorkspacePage = (opts: {
  params: OauthAuthorizeParams;
  loginTicket: string;
  memberships: Membership[];
  error?: string;
}): string => {
  const errBlock = opts.error
    ? `<div class="err">${escapeHtml(opts.error)}</div>`
    : '';
  const choices = opts.memberships
    .map(
      (m, i) =>
        `<label class="choice"><input type="radio" name="user_id" value="${escapeHtml(
          m.userId
        )}"${i === 0 ? ' checked' : ''} /> ${escapeHtml(m.workspaceName)}</label>`
    )
    .join('\n        ');
  return page(
    'Choose workspace · Arribada Wiki',
    `
      <h1>Choose a workspace</h1>
      <p class="muted">Your account has access to several workspaces. Pick the
        one this connection should act in.</p>
      ${errBlock}
      <form method="post" action="${AUTHORIZE_PATH}">
        ${hiddenFields(opts.params)}
        <input type="hidden" name="login_ticket" value="${escapeHtml(
          opts.loginTicket
        )}" />
        ${choices}
        <button type="submit">Authorize</button>
      </form>`
  );
};

export const renderErrorPage = (message: string): string =>
  page(
    'Error · Arribada Wiki',
    `<h1>Authorization error</h1><p class="muted">${escapeHtml(message)}</p>`
  );
