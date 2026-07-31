# Arribada customizations to Colanode

This is Arribada's fork of [Colanode](https://github.com/colanode/colanode) — the
self-hosted **Arribada Wiki** (docs.arribada.org). Branch **`arribada/features`**.

> **No secrets in this repo.** The live `config.json` (OIDC, Plane token, AI keys) lives
> only on the deploy host and is gitignored. The tracked `hosting/staging/config.json` is a
> secret-free `env://`-referencing template.

## See our changes at a glance
- `git log --oneline` — our commits are tagged `feat(...)` / `fix(...)` on `arribada/features`.
- Server changes: `apps/server/src/…` · Web/editor: `apps/web/` + `apps/ui/` · shared: `packages/…`.

## Feature areas (what our fork adds over upstream Colanode)

### AI inside the wiki
- **Claude provider** + per-user AI keys, and a **shared team key** so everyone gets AI without
  their own key; editor **Ask-AI** on selection + **`/ai`** command; **agentic `/ai/agent`**
  endpoint (the AI can act on the wiki via a tool layer).
- **In-wiki AI chat cockpit** (multi-turn panel that edits the wiki).
- **Provider-flexible LLM**: an OpenAI-compatible path so the wiki AI can run on a free
  **Groq / Cerebras** key (via `AI_OPENAI_COMPAT_BASE_URL`), not only Anthropic.

### MCP (Model Context Protocol) server
- **Remote MCP server** + per-user access tokens, so Claude Desktop's connector can drive the
  wiki as the logged-in user.
- **OAuth 2.1** (Dynamic Client Registration + PKCE) so Claude's connector UI can authorize.

### Databases (Notion-parity)
- **Chart view** (pie / bar / line with grouped aggregation).
- **Automations** (trigger → set_field / ai_fill / notify).
- Card fields + **property visibility**, **conditional color**, **AI autofill**, copy-link,
  new-from-template, a Notion-like view toolbar/settings, and a **richer formula library**
  with a searchable function palette.

### Whiteboards (Miro-parity)
- **Multi-user**: hard shape lock, follow-mode / viewport share, live reactions + laser pointer,
  presence avatars.
- **Board comments** anchored to elements; **smart alignment guides** (snap to edges/centers);
  Miro-style UX (text auto/manual sizing, quick-connect, mindmap, insert-template);
  **export SVG / PDF**.

### Editor
- **Inline text comments** (Notion-style anchored threads) + fine-grained **version history**.
- **Embed block** (Google Drive / Docs / YouTube / Figma inline) + richer bookmark cards.
- **Mermaid** diagram block; **page export** (Markdown / PDF).
- Stability: error-boundary each inline mention, and `renderHTML`/`toDOM` on mention +
  plane-issue-link nodes so `immediatelyRender` no longer crashes pages ("Node error").

### Plane integration (read-only)
- Native **Plane project embed block** (`/plane`) + a server proxy for projects/board — the
  wiki links to Plane execution without duplicating it.

### Sync / correctness fixes
- Prioritize the opened root so the current page syncs first.
- **Node-path closure-table trigger fix** (migration `00044`): moves now update the closure
  table correctly (statement-level trigger + descendant handling).

## Build & deploy
Server + web images are built from this tree (`docker build -f apps/{server,web}/Dockerfile
-t colanode-{server,web}:arribada-vN .`) and served from the deploy host's compose; the live
`config.json` (storage / OIDC / Plane / AI env) is host-only and never committed.
