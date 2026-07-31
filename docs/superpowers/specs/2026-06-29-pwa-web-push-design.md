# PWA Web Push — design spec

**Date:** 2026-06-29
**Project:** Colanode fork (`~/workspace/colanode`, branch `feat/threads-and-tasks`)
**Depends on:** the in-app notifications module (Plan 1, already shipped) and the live
self-hosted deploy `https://chat.kvotaflow.ru`.

## Goal

Deliver **push notifications to iOS/Android via the installed PWA** (Add to Home Screen),
so colleagues get notified of new chat activity without a native app. iOS ≥ 16.4 supports
Web Push for installed PWAs; our web app already has a PWA manifest (`display: standalone`),
a service worker, mobile layouts (`layout-mobile.tsx` etc.), and is served over HTTPS with a
valid cert — all prerequisites are met. This spec adds the missing piece: **server-sent web
push**.

Native Expo/APNs push and the `apps/mobile` RN app are **parked** — not part of this work.

## Scope decisions (from brainstorming)

- **Trigger:** push fires on **every new message in a channel or chat the user is a member
  of** (Telegram/WhatsApp model), NOT only mentions/DMs. Push is an **independent delivery
  channel**, separate from the in-app inbox (the inbox stays about mention + direct_message).
- **Noise control:** **per-channel mute** is in the MVP (synced mute state + toggle UI) as the
  single silencer. **No suppress-when-active** — push is sent even if the user has an active
  session/open window (an open tab ≠ user is at the device).
- **Enable UX:** a **global per-device toggle** ("Enable notifications") in settings; requires
  a user gesture (iOS requirement) and an installed PWA.
- **Deferred (NOT in MVP):** quiet hours, per-type granularity, icon badges (Badging API),
  native Expo push, changes to the in-app inbox.

## Architecture — Approach A (independent push-service)

```
node.created(message) ─▶ push-service (eventBus consumer)
   ├─ recipients = collaborations(rootId) − author − muted(rootId)
   ├─ map user_id → account_id → push_subscriptions (device endpoints)
   └─ web-push.sendNotification(VAPID) ─▶ SW 'push' ─▶ showNotification
                                                    └▶ 'notificationclick' → open thread
```

Rejected alternatives:
- **B. Extend the inbox** (a notification row per message per member, push mirrors
  `notification.created`): blows up the bell/inbox with every message and bloats the
  `notifications` table. The inbox must stay mention/DM-focused.
- **C. Client-only SW** (show a notification when background sync pulls new data): iOS does
  **not** wake a closed PWA via background sync → pushes wouldn't arrive. Server push is
  required.

## Components

### 1. Data model

**`push_subscriptions`** (migration `00034`): one row per browser install (device).
| column | purpose |
|---|---|
| `id` | PK |
| `account_id` | owner (push is account-level, spans workspaces) |
| `device_id` | FK to existing `devices` (one install = one device) |
| `endpoint` | push endpoint (UNIQUE) |
| `p256dh`, `auth` | subscription encryption keys |
| `created_at`, `updated_at`, `last_failure_at` | lifecycle; dead-subscription cleanup |

**`notification_mutes`** (migration `00035`): per-user per-channel mute, **synced to the
client** exactly like the notifications module (sequence + trigger `revision`, its own
synchronizer).
| column | purpose |
|---|---|
| `user_id` | workspace-user muting the channel |
| `node_id` | root id of the channel/chat being muted |
| `workspace_id` | tenant |
| `muted` | boolean |
| `revision` | bigint (sequence + trigger, mirrors notifications) |
| `created_at`, `updated_at` | lifecycle |

### 2. Server config

New `push` block in `config.json` + zod schema, `prefault({ enabled: false })` so the server
runs unchanged when absent:
```json
"push": {
  "enabled": true,
  "subject": "mailto:admin@kvotaflow.ru",
  "publicKey": "env://PUSH_VAPID_PUBLIC_KEY",
  "privateKey": "env://PUSH_VAPID_PRIVATE_KEY"
}
```
- VAPID keypair generated once (`web-push generate-vapid-keys`); private key → `~anton/colanode/.env`
  (`PUSH_VAPID_PRIVATE_KEY`), public key also stored there (`PUSH_VAPID_PUBLIC_KEY`).
- The **public** key is exposed to the web client via the existing `/config` response
  (add `push.publicKey` when `push.enabled`).
- Add `web-push` dependency to `apps/server`.

### 3. Server — `push-service.ts`

New `apps/server/src/services/push-service.ts`, modeled on `notification-service.ts`,
subscribed to `eventBus`:
- Handles `node.created` where `node.type === 'message'` and the root is a `channel` or `chat`.
- Recipients: `collaborations` where `node_id = rootId AND deleted_at IS NULL` →
  `collaborator_id`, minus the author (`created_by`), minus users with
  `notification_mutes(node_id = rootId, muted = true)`. (A channel/chat is its own root and
  membership is materialized per-root in `collaborations` — this is exactly the query the
  socket fanout uses in `socket-connection.ts` to resolve a user's accessible `rootIds`, so it
  is the authoritative recipient set, including space-inherited members.)
- Map recipient `user_id` → `account_id` (via `users`) → their `push_subscriptions`.
- Send `web-push.sendNotification(subscription, payload)` per endpoint.
- **Payload** (small, no secrets): `{ title: author/channel name, body: message preview
  (~120 chars, truncated), rootId, nodeId, workspaceId, url: <thread deep-link> }`.
- On `410 Gone` / `404` → delete the dead subscription. Every send in try/catch with logging;
  a push failure never blocks message creation. If `push.enabled` is false or keys are
  missing, the service does not start (no-op).

### 4. Server — mutations

- `pushSubscription.create` — upsert a `push_subscriptions` row for the current device.
- `pushSubscription.delete` — remove it (on toggle-off).
- `mute.set` — set `notification_mutes(rootId, muted)` for the current user (drives sync).

(Wired into the typed MutationMap the same way the notifications mutation was.)

### 5. Client — web (`apps/web`)

**Enable flow** (needs a user gesture — iOS):
1. "Enable notifications" button → `Notification.requestPermission()` →
   `serviceWorker.ready.pushManager.subscribe({ userVisibleOnly: true,
   applicationServerKey: <push.publicKey from /config> })`.
2. Send the resulting `PushSubscription` (endpoint + p256dh + auth) via `pushSubscription.create`.
3. Toggle-off → `subscription.unsubscribe()` + `pushSubscription.delete`.

**Gating:** show the button only if `'Notification' in window && 'serviceWorker' in navigator
&& 'PushManager' in window`. On iOS these are true only inside an installed (Home-Screen) PWA
— otherwise show a "Share → Add to Home Screen" hint, no crash.

**Service worker** (`apps/web/src/workers/service.ts` — add two handlers):
- `push` → `event.waitUntil(self.registration.showNotification(title, { body, data: { url },
  icon, tag: rootId }))`. `tag: rootId` collapses a burst from one channel into one updating
  notification.
- `notificationclick` → focus an existing PWA window or `clients.openWindow(url)` to the thread
  deep-link.

### 6. Client — UI (minimal)

- **Settings → "Notifications"** panel (near `app-appearance-container.tsx`): a single
  per-device switch driving the enable flow; shows state ("enabled on this device" /
  "disabled" / "unavailable — add to Home Screen" on iOS).
- **Per-channel mute:** a "Mute/Unmute notifications" item in the channel/chat header dropdown
  (desktop) and the `…` menu (mobile, `message-menu-mobile` pattern) → calls `mute.set`. Muted
  channels show a crossed-bell icon in the sidebar. Mute state arrives via the synchronizer
  from §1.

## Error handling

- Feature fully disable-able via config (`push.enabled: false` → server unchanged).
- Per-endpoint try/catch; one failure doesn't stop the loop or block message creation.
- `410/404` → prune dead subscription.
- Client: missing permission / not-installed → silent degradation + hint, no exceptions.
- Payloads carry only title + truncated preview + ids for the deep-link — no secrets, no full
  message body beyond the preview.

## Testing

- **Server (Vitest + Testcontainers, like the notifications module):** `push-service` computes
  recipients correctly (members − author − muted); prunes a subscription on `410`; is a no-op
  when disabled. `web-push.send` mocked. Mutations `pushSubscription.create/delete` and
  `mute.set` write the expected rows.
- **Client:** unit tests for gating logic (API availability) and `PushSubscription` → mutation
  payload transform.
- **Manual e2e (acceptance, on the user's iPhone):** install `chat.kvotaflow.ru` to Home
  Screen → enable notifications → from desktop (another account) post in a shared channel →
  push arrives; mute the channel → no push; tap the push → opens the thread.

## Out of scope (parked)

Native Expo/APNs push, quiet hours, per-type notification settings, icon badges, `apps/mobile`
changes, in-app inbox changes.
