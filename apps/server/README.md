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

### Zulip notifications

An outgoing-notification hook can mirror Colanode notifications (mentions,
chat messages, task assignments/status changes) to a Zulip stream via a bot,
so a team using Zulip for chat still gets pinged when something happens in
Colanode. It's a feature flag, off by default, wired at the single choke
point where every notification is created
(`apps/server/src/lib/notifications.ts` → `lib/zulip/notifier.ts` →
`lib/zulip/zulip-client.ts`). Disabled, it costs nothing (a single boolean
check, no DB lookups, no network calls); enabled, it fires-and-forgets after
the notification row is committed, so a slow or unreachable Zulip instance
never delays or fails Colanode's own notification pipeline.

Two ways to turn it on:

1. **Env vars only** (recommended for compose/k8s deploys) — don't touch
   `config.json` at all, just set:

   ```bash
   ZULIP_ENABLED=true
   ZULIP_SITE=https://your-zulip-instance.example.com
   ZULIP_BOT_EMAIL=colanode-bot@your-zulip-instance.example.com
   ZULIP_API_KEY=the-bot-s-api-key
   ZULIP_STREAM=colanode-notifications
   ```

   Every field under `zulip` in the config schema already defaults to its
   own `env://ZULIP_*` reference, so as long as these five env vars are set
   on the server process, the integration is live — no config.json edit
   required.

2. **Explicit `config.json`** (account-style, same pattern as `push`/`oidc`
   above) — set `"zulip": { "enabled": true, ... }` in `config.example.json`
   / `config.local.json`, with literal values or `env://VAR`/`file://path`
   references of your choice for `site`/`botEmail`/`apiKey`/`stream`. An
   explicit `"enabled": false` here always wins over `ZULIP_ENABLED=true`.

Getting a bot + API key: in the Zulip web UI, go to
**Settings → Personal settings → Bots** (or **Organization settings → Bots**
for a generic/incoming-webhook bot) and create a "Generic bot". Its profile
page shows the bot's email and API key — that's `ZULIP_BOT_EMAIL` /
`ZULIP_API_KEY`. Make sure the bot is subscribed to whichever stream you put
in `ZULIP_STREAM` (it needs to be a member to post there).

What gets posted: one Zulip message per Colanode notification, e.g.

```
**Alice** mentioned you in [Project Plan](https://colanode.example.com/workspace/<userId>/<rootId>)
> ...first ~160 characters of the mentioning message...
```

The topic is the root node's name (channel/page/space), or "Colanode" if it
can't be resolved.

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
