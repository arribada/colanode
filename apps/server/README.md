# Colanode Server (apps/server)

Colanode server is the authoritative sync, auth, and realtime layer for the local-first collaboration stack. Clients keep a local SQLite cache and sync mutation batches to this server; the server validates, persists, and broadcasts changes over WebSocket.

## Architecture overview

- **Runtime**: Fastify + Zod validation, WebSocket support, Redis-backed event bus, BullMQ jobs, Kysely/Postgres persistence.
- **Data model**: Nodes, documents, collaborations, reactions, interactions, and tombstones are revisioned streams with merge-safe CRDT updates.
- **Sync**: Clients push mutation batches; server writes to Postgres and emits events. WebSocket synchronizers stream incremental changes per entity type using revision cursors.
- **Storage**: File data is stored via pluggable providers (file system, S3, GCS, Azure). TUS handles resumable uploads.
- **Security**: Token-per-device authentication, rate limiting (IP + device + email), workspace authorization gates.

## Requirements

- Node.js 20+ (tests require this due to Vitest v4).
- Postgres with the pgvector extension.
- Redis (or compatible).
- Docker is recommended for local dev and required for Testcontainers-based tests.

## Quick start (local dev)

From the repo root:

```bash
npm install
docker compose -f hosting/docker/docker-compose.yaml up -d
```

From `apps/server`:

```bash
cp .env.example .env
npm run dev
```

## Configuration

The server reads configuration from a JSON file, or falls back to schema defaults in `apps/server/src/lib/config/`.

- `CONFIG` points to the config JSON file.
- `apps/server/config.example.json` is the recommended template.
- Values can reference `env://VAR_NAME` or `file://path/to/secret` for secrets.
- `postgres.url` is required and defaults to `env://POSTGRES_URL`.

### SSO / generic OIDC login

In addition to Google (`account.google`), the server supports logging in via
any standards-compliant OIDC/OAuth2 provider (e.g. a self-hosted
GitLab-compatible identity provider), configured under `account.oidc` in
`config.example.json`:

```json
"oidc": {
  "enabled": true,
  "issuer": "https://your-oidc-provider.example.com",
  "clientId": "env://ACCOUNT_OIDC_CLIENT_ID",
  "clientSecret": "env://ACCOUNT_OIDC_CLIENT_SECRET",
  "redirectUri": "https://your-colanode-domain.example.com/auth/sso-callback",
  "scopes": "openid profile email",
  "buttonLabel": "Continue with SSO"
}
```

- `issuer` — the provider's base URL; endpoints are discovered from
  `${issuer}/.well-known/openid-configuration` (cached in memory after the
  first successful discovery). Alternatively, set `authorizationUrl` +
  `tokenUrl` + `userinfoUrl` explicitly to skip discovery — these take
  precedence over `issuer` when present.
- `clientId` / `clientSecret` — register Colanode as an OAuth2 application
  on the provider first; `redirectUri` below must match exactly what's
  registered there.
- `redirectUri` — must be `https://<your-colanode-web-domain>/auth/sso-callback`
  (the client route that finishes the login after the provider redirects
  back). This is also the value sent in the authorization request, so it
  must be registered on the provider's side too.
- `scopes` — space-separated; must include `openid` and should include a
  scope that returns an email claim (`email`).
- `buttonLabel` — text shown on the login/register button, e.g.
  `"Se connecter avec Arribada"`.
- The account's email is trusted as verified unless the provider's
  userinfo response explicitly sets `email_verified: false` — most
  self-hosted OIDC providers don't send this claim at all, and an admin
  who configured `issuer`/`clientId`/`clientSecret` is presumed to trust
  that provider's identity assertions.
- Set `ACCOUNT_OIDC_CLIENT_ID` and `ACCOUNT_OIDC_CLIENT_SECRET` (or
  whichever env vars the `env://` references above point to) wherever the
  server's environment is configured (compose file, k8s secret, etc.) —
  never commit real values into `config.local.json`.

## Code map

- `apps/server/src/api`: HTTP + WebSocket routes and plugins.
- `apps/server/src/data`: database + redis clients and migrations.
- `apps/server/src/synchronizers`: WebSocket sync streams by entity type.
- `apps/server/src/jobs`: background jobs and handlers.
- `apps/server/src/services`: email, jobs, and other infrastructure services.
- `apps/server/src/lib`: shared server logic and helpers.

## Tests

From `apps/server`:

```bash
npm run test
```

Notes:

- Tests use Testcontainers for Postgres (pgvector) and Redis. Docker must be running.
- Fastify route tests use `fastify.inject()` (no network ports).
- Shared test helpers live in `apps/server/test/helpers`.
