# Colanode fork — build-out roadmap

> Status: living document. Created 2026-06-27 after evaluating Huly, Нервион (ar-webcetera/nervion) and Colanode as bases for a self-hosted team+client collaboration tool for building apps. Branch: `feat/threads-and-tasks`.

## Decision: evolve Colanode, treat Нервион as reference only

We compared three candidates for "self-hosted/free, rich-yet-simple, talk to colleagues+clients while building apps, with mobile":

- **Huly** — mature/rich but heavy (8–16 GB RAM, ~35 GB disk), complex, PWA-only mobile. Too heavy for our box; not "simple".
- **Нервион** — best-shaped on paper (per-project chat+calls, tasks, time-tracking, capacity planning, mail↔task, git), but **pre-alpha** (2 weeks, 1 dev, 21★, 0 releases), **AGPL-3.0 + CLA + commercial**, no public signup, no seed data. Verdict after a hands-on demo review: **too immature to build on.**
- **Colanode (this fork)** — **the base.** Apache-2.0 (we own it, no copyleft trap), we know it cold (already built MCP + @claude bot + headless substrate + UI features), local-first/CRDT, and it already ships the hard collaborative parts.

**Нервион is a reference for IDEAS/UX only — its code is AGPL and will NOT be copied.** Ideas/architecture/UX are free to learn from; code is not. Anything we want from it we re-implement ourselves on Colanode.

## What Colanode already has (verified in code, 2026-06-27)

- **Data model:** `space`, `channel`, `chat`, `message`, `page` (Notion-style docs), `folder`, `file`, and crucially **`database` + `database-view` + `record` + `field` + `field-value`**.
- **Database views already implemented:** `board` (kanban), `table` (list), `calendar`.
- **Field types already implemented:** `text`, `number`, `boolean`, `select`, `multi_select`, `date`, `email`, `phone`, `url`, `file`, `relation`, `collaborator`, `created_at`, `updated_at`.
- **Roles:** `owner`, `admin`, `collaborator`, `guest` (guest enables client-facing sharing).
- **Stack:** Fastify + Kysely + PostgreSQL + BullMQ (server); React (web/desktop) + **Expo / React Native** (`apps/mobile`, early); **Yjs** CRDT + synchronizers (local-first); `apps/colanode-mcp` (MCP), `apps/colanode-bot` (@claude bot), `packages/agent-tools`, `packages/client-node` (headless substrate).

## Core principles

1. **Markdown vs database boundary.** Anything that needs filtering / grouping / switching between views (tasks, CRM-like records) → `record` in a `database`. Anything read linearly (wiki, docs) → markdown `page`. Markdown cannot do view-switching; do not model tasks as markdown.
2. **Notifications-first, mobile-push from day one.** Notifications are the spine that healthcheck alerts, recap publications, task assignments and mentions all hang off. Build it first, with Expo push (FCM/APNs) + web-push.
3. **Permissive only.** Keep the product Apache/own-able. Do not lift AGPL/GPL code (Нервион, Plane, AppFlowy, etc.). Calls pillar = Jitsi (Apache) when we get there.
4. **Build selectively, not "rebuild Нервион".** Add only what our use case needs; skip whole subsystems (built-in mail IMAP, git hosting) we don't actually need.

## Triage

### 🟢 Near-term
| Item | Builds on | Notes |
|---|---|---|
| **Notifications + mobile push** | new cross-cutting service; Expo push + web-push | foundation; build first |
| **Tasks page** (kanban / list / week) | existing `database` + `record` + views | mostly template + UI; "week" may need a week-mode on `calendar` view |
| **Healthcheck monitors** | new server module (BullMQ cron) → alerts into notifications | per-space monitors, multiple checks, alerting; synergizes with notifications |
| **Client visual-recap / visual-plan** (replaces git section + changelog) | new "recap/plan" node type + AI/MCP + guest share | flagship — see below |
| **Quick links** | pinned links section at top of space sidebar | small win (per-space external URLs w/ favicons) |
| **Menu item toggle** | per-user module visibility | small win |
| **Users / add-user scoped to space(s)** | existing membership + roles (incl. guest) | UI for admin to add a user into one/several spaces |
| **Audit logging (write only)** | server-side audit log | log now; UI later |

### 🟡 Backlog
- Time tracker
- Capacity planning (visualize planned time + assignee + actual + accuracy — a different view over task time data)
- Work schedule
- Time-spent reports
- Audit-log UI
- Full built-in **mail** (IMAP receive = large subsystem; revisit). If built: shared-mailbox access via a button in mail, not a separate page.
- **Bug-repro: sink vs source — decide.** Shared bug-repro (pin + screen-video, `repro.kvotaflow.ru`) is being added to kvota/crmapp. Colanode is designed as the *future sink* (bugs from all apps → records/channels; the bug row is the hook), but could also be a *source* (report bugs in colanode itself, via the reusable launcher module). Decide sink-first vs source before embedding. Design note: `~/workspace/ci/docs/superpowers/specs/2026-07-01-bug-repro-module-extraction-note.md`.

### 🔴 Skip / rethink
- Git as "commits + diff" view — not interesting; if needed, connect GitHub/GitLab trivially. Replaced by visual-recap.
- Changelog as a hand-written page — replaced by AI-generated visual-recap.

## Flagship ideas

### Client visual-recap / visual-plan
Turns the weakest Нервион sections (git, changelog) into our strongest client-facing feature, leveraging our AI/MCP edge.
- Completed task/PR → AI generates a **visual-recap** ("what changed", annotated) for the client.
- Planned task → **visual-plan** ("what we'll do") for client approval.
- Lifecycle: **draft → edit wording → publish** (editing before publish is a hard requirement).
- Published into a space, shared to the client as **guest**.
- Replaces the changelog: AI writes work reports by rules instead of hand-written pages.

### Multi-workspace admin view
A cross-space feed (published recaps, tasks, alerts) tagged with the project/space name, for the admin — "everything in one place." Server-side aggregation over spaces; same notification/recap mechanism. Design later.

## Build order (proposed)
1. **Notifications + mobile push** (spine)
2. **Tasks page** (kanban/list/week on existing database primitive)
3. **Healthcheck monitors** (feeds notifications)
4. **Visual-recap/plan** client view (flagship)
5. Small wins (quick links, menu toggle, scoped user add, audit logging)
6. Backlog items as needed

## Open questions
- "Week" view: extend existing `calendar` view to a week mode, or new view type?
- Multi-workspace admin view vs local-first model — how to aggregate cleanly across spaces.
- Notification delivery matrix: in-app vs web-push vs Expo push — per-event routing + user prefs.
- Guest-sharing for visual-recap: scope a guest to a single published recap vs a whole space.
- Bug-repro: is colanode the **sink** (aggregate bugs from all apps as records) first, or also a **source** (embed the pin+video launcher module here)? See backlog + `~/workspace/ci/docs/superpowers/specs/2026-07-01-bug-repro-module-extraction-note.md`.
