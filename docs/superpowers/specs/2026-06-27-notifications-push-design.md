# Notifications + Push — design spec

> Created 2026-06-27. Branch `feat/threads-and-tasks`. First module of the Colanode build-out roadmap (`docs/roadmap.md`). Foundation module: healthcheck alerts and visual-recap publications will later plug in as additional notification producers.

## Goal

A first-class notification system for the Colanode fork that:
- collects an in-app inbox (the bell) per user, offline-resilient and consistent across devices;
- delivers out-of-app push to mobile (Expo) and browsers (web-push/VAPID) from day one;
- is driven by an extensible producer over the existing server `eventBus`, so new event sources attach without rework.

## v1 scope (event triggers)

Exactly four event types in v1:
- `mention` — a user is @mentioned in a message/page/record block.
- `direct_message` — a new message in a DM chat, to the other participant(s).
- `task_assigned` — a record's `collaborator` (assignee) field is set/changed → new assignee.
- `task_status` — a record's `select` (status) field changes → assignee.

Healthcheck alerts, visual-recap publications, thread replies, comments, deadlines: **out of scope for v1**, but the producer interface must let them attach later without schema changes.

## Non-goals / deferred

- Quiet hours / do-not-disturb schedule (later).
- Per-channel settings matrix (web vs mobile separately) — v1 is one push toggle per type (later: per-channel).
- Per-space mute (later).
- Notification coalescing ("3 new messages") (later).
- Hybrid history API (paginate old notifications via REST instead of syncing all) — add only if local storage becomes a problem.

## Architecture overview

Producer (eventBus subscriber) → writes `notifications` row (bumps `revision`) → two consumers:
1. **In-app inbox** via the existing synchronizer framework (revision-cursor sync to local SQLite on all devices).
2. **Push** via a BullMQ job → web-push (VAPID) + Expo Push, gated by user settings and device activity.

Push is an orthogonal "wake the device" layer; authoritative inbox content always arrives via sync.

### Existing code reused (no rebuild)
- `packages/core/src/lib/mentions.ts` `extractBlocksMentions` — mention extractor (pure util), reused as-is.
- `apps/server/src/lib/event-bus.ts` `eventBus` — producer hook point.
- `apps/server/src/services/socket-service.ts` — live socket; used for the device-activity gate and existing real-time transport.
- `packages/core/src/synchronizers/*` (7 existing, e.g. `node-interactions`, `node-tombstones`) — pattern template for the new `notifications` synchronizer; `node-interactions` (read-state) is untouched and stays responsible for node unread counts.

## Data model (Postgres, Kysely)

### `notifications`
| column | type | notes |
|---|---|---|
| `id` | text (id) | PK |
| `user_id` | text | recipient |
| `workspace_id` | text | scope |
| `root_id` | text | root node for permission/scoping |
| `type` | text | `mention` \| `direct_message` \| `task_assigned` \| `task_status` |
| `source_node_id` | text | message/page/record that triggered it |
| `actor_id` | text | who caused it (nullable for system later) |
| `preview` | jsonb | denormalized title/snippet for inbox + push payload |
| `created_at` | timestamptz | |
| `read_at` | timestamptz null | null = unread |
| `revision` | bigint | sync cursor (sequence/bumped on create + on read) |

Indexes: `(user_id, revision)` for sync; `(user_id, read_at)` for unread counts; dedup lookup on `(user_id, type, source_node_id)`.

### `notification_settings`
`(user_id, type, push_enabled bool)` — row per (user, type); default `push_enabled = true`. Global mute: `push_muted bool` on the user record (or a `(user_id, type='*')` row — implementation picks one, documented in plan).

### `push_subscriptions`
| column | type | notes |
|---|---|---|
| `id` | text | PK |
| `user_id` | text | |
| `device_id` | text | one logical device |
| `platform` | text | `web` \| `ios` \| `android` |
| `kind` | text | `web_push` \| `expo` |
| `token` | text | Expo: ExponentPushToken; web-push: endpoint |
| `keys` | jsonb null | web-push p256dh + auth |
| `last_seen_at` | timestamptz | |
| `disabled_at` | timestamptz null | set on permanent send failure |

Unique `(user_id, device_id, kind)`.

## Components (one responsibility each)

1. **`NotificationService` (producer)** — subscribes to `eventBus`; maps domain events → notification rows; runs dedup. Depends on: `eventBus`, `extractBlocksMentions`, db, permission helpers (`extractNodeRole`/`hasNodeRole`). On write, enqueues a push job.
2. **`notifications` synchronizer** (`packages/core/src/synchronizers/notifications.ts`) — typed `SynchronizerMap` entry: `input {type:'notifications'}`, `data {id,type,source_node_id,actor_id,preview,created_at,read_at,revision}`. Server handler streams by `revision`; client consumer persists to local SQLite. Mark-read = mutation bumping `read_at` + `revision`. Deletion/expiry via tombstone pattern.
3. **`PushService` + BullMQ push worker** — consumes push jobs; loads recipient `push_subscriptions` + `notification_settings`; applies type toggle + global mute + device-activity gate; sends via web-push (VAPID) and Expo Push API; disables subscriptions on `410`/`DeviceNotRegistered`.
4. **`NotificationSettingsService`** — CRUD of per-type push toggles + global mute (API + client mutation).
5. **`PushSubscriptionService`** — register/refresh/disable device subscriptions.
6. **Client** — push registration (web: service worker + `PushManager.subscribe(VAPID)`; mobile: `expo-notifications` `getExpoPushTokenAsync`, add `expo-notifications` dep to `apps/mobile`); service worker show+click→deep-link; bell UI (unread count, mark read / mark all read) over synced local data; settings screen (per-type push toggles + global mute).

## Event flow (example: mention)

1. User saves a message with an @mention → node mutation → `eventBus` emits node create/update.
2. `NotificationService` runs `extractBlocksMentions`; for each mentioned user with ≥viewer role on the root: dedup-check, then insert `notifications` row (bump `revision`), enqueue push job.
3. Synchronizer streams the new row to the recipient's devices → local SQLite → bell updates (offline-resilient).
4. Push worker: for each enabled, non-active device → send web-push/Expo with preview + deep-link.
5. Recipient taps push → opens `source_node`. Reads inbox → mark-read mutation → `read_at`+`revision` sync clears badge on all devices.

## Device-activity gate

Do not push to a device that currently holds a live socket (avoid buzzing the device in active use); the in-app inbox is always populated via sync regardless. v1 heuristic: "active" = live socket seen within N seconds (N configurable, default ~60s).

## Dedup (v1)

Skip creating a new notification if an unread notification of the same `(user_id, type, source_node_id)` already exists (edits don't spam). Coalescing across distinct sources is deferred.

## Settings (v1)

Per event type: a single push on/off toggle. Plus one global "mute all push". In-app inbox always collects everything (toggle governs push only). Defaults: all push enabled, not muted.

## CLAUDE.md project rule (to add during implementation)

Add to the Colanode project `CLAUDE.md`: when adding a new feature, ask whether it should emit notifications; if yes, attach a producer for its event(s) to `NotificationService`.

## Testing

- **Unit:** mention→rows mapping; assignee/status change detection; dedup; settings gating (type toggle + global mute); device-activity gate; push payload builder; subscription-error→disable.
- **Integration:** `eventBus` event → row created + synchronizer emits + push job enqueued; mark-read syncs `read_at`; web-push + Expo transports mocked; permission filtering (no notification without role).
- **E2E (light):** @mention a user → bell shows + push sent (mocked transport); toggle off a type → no push, inbox still collects.

## Risks / open questions

- "Week" task view and task field conventions (status select / assignee collaborator) — confirm exact field identity used for `task_*` detection when the Tasks module lands; until then `task_assigned`/`task_status` producers may ship slightly after `mention`/`direct_message`.
- Local storage growth from synced notifications → retention policy (cap recent N + tombstone old); revisit hybrid history API if it bites.
- Global mute storage shape (user column vs settings row) — finalize in plan.
- Expo Push credentials/setup for `apps/mobile` (FCM/APNs via Expo) — provisioning step in the plan.
