# PWA Web Push Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Deliver push notifications to installed PWAs (iOS ≥16.4 / Android) for every new message in a channel or chat the user belongs to, with per-channel mute, sent server-side via Web Push (VAPID).

**Architecture:** A new server `push-service` subscribes to the existing `eventBus`, and on `node.created` for a `message` whose root is a `channel` or `chat`, computes recipients from `collaborations` (minus author, minus muted), maps each recipient user → account → `push_subscriptions`, and sends via the `web-push` library. The web client subscribes through the service worker and stores its subscription server-side; the SW shows the notification and opens the thread on click. Mute state lives in a synced `notification_mutes` table mirroring the existing notifications module.

**Tech Stack:** TypeScript, Fastify, Kysely + PostgreSQL (server), Zod v4 config, BullMQ/eventBus, `web-push` (new dep), Vite + VitePWA `injectManifest` service worker (web), Kysely + SQLite (client), React + TanStack Query (ui), Vitest + Testcontainers (server tests).

## Global Constraints

- Runtime: Node **24.15.0**, npm **10.9.0** workspaces (turbo monorepo). Server dep install: `npm install <pkg> -w @colanode/server`.
- Branch: **feat/threads-and-tasks**. All work commits here.
- Commit messages for the colanode repo carry **no AI co-author / Claude-Session trailer** (project rule).
- **Feature flag:** when `config.push.enabled` is false or VAPID keys are absent, `push-service` must not start and the server must run exactly as today.
- Push payloads carry only `title` + a ~120-char `body` preview + ids (`rootId`, `nodeId`, `workspaceId`) + `url` — never secrets or full message bodies.
- Mirror the existing **notifications module** patterns exactly (migration sequence+trigger, synchronizer, mutation handler, client sync consumer). Reuse names/shapes shown below.
- Node type literals: channel root = `'channel'`, DM root = `'chat'`, message node = `'message'`.
- Recipient source of truth: `collaborations WHERE node_id = rootId AND deleted_at IS NULL` (this is the exact set the socket fanout uses in `socket-connection.ts`).
- **Scope — edits pushed, deletes not:** message EDITS are pushed (`push-service` consumes `node.updated` as well as `node.created`); message DELETES are intentionally NOT handled — a stale push is left on the lock screen, matching Telegram/WhatsApp behavior. Tracking push-to-message identity for retraction is out of scope.
- TDD: every server lib/service change lands with a Vitest + Testcontainers test. Commit after each green task.

## File Structure

**Server (`apps/server/src`)**
- `lib/config/push.ts` — new zod config block (VAPID).
- `lib/config/index.ts` — compose `push` block (modify).
- `api/config.ts` — expose `push.publicKey` when enabled (modify).
- `data/migrations/00034-create-push-subscriptions-table.ts` — new table.
- `data/migrations/00035-create-notification-mutes-table.ts` — new table (sequence+trigger).
- `data/migrations/index.ts` — register both (modify).
- `data/schema.ts` — `PushSubscriptionTable`, `NotificationMuteTable` types (modify).
- `lib/push-subscriptions.ts` — create/delete subscription handlers.
- `lib/notification-mutes.ts` — `setMute` handler (+ emits mute event).
- `lib/push/web-push-sender.ts` — `sendWebPush` wrapper (send + prune on 404/410).
- `services/push-service.ts` — eventBus consumer, recipient computation, dispatch.
- `synchronizers/notification-mutes.ts` — server synchronizer for mute state.
- `services/socket-connection.ts` — register mute synchronizer (modify).
- `types/events.ts` — `NotificationMuteUpdatedEvent` (modify).
- `api/client/routes/workspaces/mutations/mutations-sync.ts` — route 3 new mutations (modify).
- `index.ts` — `pushService.init()` (modify).

**Core (`packages/core/src/types`)**
- `mutations.ts` — 3 new mutation schemas + union (modify).
- `servers.ts` — `push` on `ServerConfig` (modify).
- `synchronizers.ts` (or wherever `SyncNotificationsInput` lives) — `SyncNotificationMutesInput` + `SyncNotificationMuteData` (modify).
- `events.ts` (client event map, if separate) — mute event (modify if needed).

**Client (`packages/client/src`)**
- `databases/workspace/migrations/00022-create-notification-mutes-table.ts` — local table.
- `databases/workspace/migrations/index.ts` — register (modify).
- `databases/workspace/schema.ts` — `NotificationMuteTable` (modify).
- `types/servers.ts` — `ServerPushAttributes` on `ServerAttributes` (modify).
- `services/server-service.ts` — surface `push` from `/config` (modify).
- `services/workspaces/notification-mute-service.ts` — `syncServerNotificationMute` + `setMute`.
- `services/workspaces/sync-service.ts` — register mute synchronizer (modify).
- `mutations/push-subscriptions/{create,delete}.ts`, `mutations/notifications/mute-set.ts` — 3 mutation types.
- `handlers/mutations/...` — 3 handlers + registry (modify).
- `queries/notifications/notification-mute-get.ts` + handler + registry.
- `mutations/index.ts`, `handlers/mutations/index.ts`, `queries` registries (modify).

**Web (`apps/web/src`)**
- `services/push-service.ts` — subscribe/unsubscribe orchestration + VAPID base64→Uint8Array.
- `workers/service.ts` — `push` + `notificationclick` listeners (modify).

**UI (`packages/ui/src`)**
- `components/app/app-notification-settings.tsx` — enable toggle.
- `components/app/app-appearance-container.tsx` — mount it (modify).
- `components/channels/channel-settings.tsx` — mute item (modify).
- `hooks/use-channel-mute.tsx` — thin query hook.

---

## Task 1: Server config `push` block + expose public key

**Files:**
- Create: `apps/server/src/lib/config/push.ts`
- Modify: `apps/server/src/lib/config/index.ts`
- Modify: `packages/core/src/types/servers.ts`
- Modify: `apps/server/src/api/config.ts`
- Modify: `apps/server/config.example.json`
- Modify: `packages/client/src/types/servers.ts`, `packages/client/src/services/server-service.ts`

**Interfaces:**
- Produces: `config.push` = `{ enabled: false }` or `{ enabled: true, subject, publicKey, privateKey }`. `/config` returns `push: { enabled, publicKey }` when enabled. Client `server.attributes.push?.publicKey`.

- [ ] **Step 1: Write the config block** — `apps/server/src/lib/config/push.ts`:

```typescript
import { z } from 'zod/v4';

import { resolveConfigReference } from './utils';

export const pushConfigSchema = z
  .discriminatedUnion('enabled', [
    z.object({
      enabled: z.literal(true),
      subject: z.string().transform(resolveConfigReference),
      publicKey: z
        .string({ error: 'Push VAPID public key is required' })
        .transform(resolveConfigReference),
      privateKey: z
        .string({ error: 'Push VAPID private key is required' })
        .transform(resolveConfigReference),
    }),
    z.object({
      enabled: z.literal(false),
    }),
  ])
  .prefault({ enabled: false });

export type PushConfig = z.infer<typeof pushConfigSchema>;
```

- [ ] **Step 2: Compose it** — in `apps/server/src/lib/config/index.ts` add `import { pushConfigSchema } from './push';` and add `push: pushConfigSchema,` to the `configSchema` object (place after `workspace`).

- [ ] **Step 3: Extend `ServerConfig`** — in `packages/core/src/types/servers.ts`, add before `serverConfigSchema`:

```typescript
export const serverPushConfigSchema = z.discriminatedUnion('enabled', [
  z.object({ enabled: z.literal(true), publicKey: z.string() }),
  z.object({ enabled: z.literal(false) }),
]);

export type ServerPushConfig = z.infer<typeof serverPushConfigSchema>;
```

and add `push: serverPushConfigSchema.nullable().optional(),` to `serverConfigSchema`.

- [ ] **Step 4: Return it from `/config`** — in `apps/server/src/api/config.ts` add to the `output` object:

```typescript
        push: config.push.enabled
          ? { enabled: true, publicKey: config.push.publicKey }
          : { enabled: false },
```

- [ ] **Step 5: Surface on client** — in `packages/client/src/types/servers.ts` add to `ServerAttributes`: `push?: { enabled: boolean; publicKey?: string };`. In `packages/client/src/services/server-service.ts` `sync()`, add to the `attributes` object:

```typescript
        push:
          config.push && config.push.enabled
            ? { enabled: true, publicKey: config.push.publicKey }
            : { enabled: false },
```

- [ ] **Step 6: Add config example** — in `apps/server/config.example.json` insert after the `email` block:

```json
  "push": {
    "enabled": false,
    "subject": "mailto:admin@example.com",
    "publicKey": "env://PUSH_VAPID_PUBLIC_KEY",
    "privateKey": "env://PUSH_VAPID_PRIVATE_KEY"
  },
```

- [ ] **Step 7: Typecheck + commit**

Run: `npm run build -w @colanode/core && npm run build -w @colanode/server`
Expected: no type errors.

```bash
git add apps/server/src/lib/config/push.ts apps/server/src/lib/config/index.ts packages/core/src/types/servers.ts apps/server/src/api/config.ts apps/server/config.example.json packages/client/src/types/servers.ts packages/client/src/services/server-service.ts
git commit -m "feat(push): add push config block and expose VAPID public key via /config"
```

---

## Task 2: `web-push` dependency + VAPID keys + sender wrapper

**Files:**
- Modify: `apps/server/package.json` (via npm)
- Create: `apps/server/src/lib/push/web-push-sender.ts`
- Create: `apps/server/test/lib/web-push-sender.test.ts`

**Interfaces:**
- Produces: `sendWebPush(subscription: SelectPushSubscription, payload: WebPushPayload): Promise<void>` — sends one push; on 404/410 deletes the subscription row. `WebPushPayload = { title: string; body: string; rootId: string; nodeId: string; workspaceId: string; url: string }`.

*(Depends on Task 3's `push_subscriptions` table for the DB delete; if executing strictly in order, do Task 3 first — the two are adjacent. This plan lists config→sender→tables; when implementing, create the migration from Task 3 before running this task's test.)*

- [ ] **Step 1: Install deps**

Run: `npm install web-push -w @colanode/server && npm install --save-dev @types/web-push -w @colanode/server`
Expected: `web-push` + `@types/web-push` appear in `apps/server/package.json`; root `package-lock.json` updated.

- [ ] **Step 2: Write the failing test** — `apps/server/test/lib/web-push-sender.test.ts`:

```typescript
import { beforeAll, describe, expect, it, vi } from 'vitest';

import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { sendWebPush } from '@colanode/server/lib/push/web-push-sender';

vi.mock('web-push', () => ({
  default: {
    setVapidDetails: vi.fn(),
    sendNotification: vi.fn(),
  },
}));

import webpush from 'web-push';

beforeAll(() => {
  // config.push prefaults to { enabled: false } in the test env — without this
  // patch sendWebPush returns before reaching the pruning logic under test.
  // web-push itself is mocked above, so the fake VAPID keys are never used.
  config.push = {
    enabled: true,
    subject: 'mailto:test@example.com',
    publicKey: 'pk',
    privateKey: 'sk',
  };
});

describe('sendWebPush', () => {
  it('deletes the subscription row on a 410 Gone', async () => {
    // seed a subscription row
    await database
      .insertInto('push_subscriptions')
      .values({
        id: 'sub_test_410',
        account_id: 'acc_1',
        device_id: 'dev_1',
        endpoint: 'https://push.example/410',
        p256dh: 'k',
        auth: 'a',
        created_at: new Date(),
      })
      .execute();

    (webpush.sendNotification as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(
      Object.assign(new Error('gone'), { statusCode: 410 })
    );

    await sendWebPush(
      {
        id: 'sub_test_410',
        endpoint: 'https://push.example/410',
        p256dh: 'k',
        auth: 'a',
      } as never,
      { title: 't', body: 'b', rootId: 'r', nodeId: 'n', workspaceId: 'w', url: '/' }
    );

    const row = await database
      .selectFrom('push_subscriptions')
      .select(['id'])
      .where('id', '=', 'sub_test_410')
      .executeTakeFirst();
    expect(row).toBeUndefined();
  });
});
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npm run test -w @colanode/server -- web-push-sender`
Expected: FAIL (module `web-push-sender` not found).

- [ ] **Step 4: Implement the sender** — `apps/server/src/lib/push/web-push-sender.ts`:

```typescript
import webpush from 'web-push';

import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { createLogger } from '@colanode/server/lib/logger';
import { SelectPushSubscription } from '@colanode/server/data/schema';

const logger = createLogger('web-push-sender');

let configured = false;

export type WebPushPayload = {
  title: string;
  body: string;
  rootId: string;
  nodeId: string;
  workspaceId: string;
  url: string;
};

const ensureConfigured = (): boolean => {
  if (!config.push.enabled) return false;
  if (!configured) {
    webpush.setVapidDetails(
      config.push.subject,
      config.push.publicKey,
      config.push.privateKey
    );
    configured = true;
  }
  return true;
};

export const sendWebPush = async (
  subscription: Pick<
    SelectPushSubscription,
    'id' | 'endpoint' | 'p256dh' | 'auth'
  >,
  payload: WebPushPayload
): Promise<void> => {
  if (!ensureConfigured()) return;

  try {
    await webpush.sendNotification(
      {
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      },
      JSON.stringify(payload)
    );
  } catch (error: unknown) {
    const statusCode = (error as { statusCode?: number }).statusCode;
    if (statusCode === 404 || statusCode === 410) {
      await database
        .deleteFrom('push_subscriptions')
        .where('id', '=', subscription.id)
        .execute();
      logger.info(`Pruned dead push subscription ${subscription.id}`);
      return;
    }
    logger.error(error, `Failed to send web push to ${subscription.id}`);
  }
};
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w @colanode/server -- web-push-sender`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/package.json ../../package-lock.json apps/server/src/lib/push/web-push-sender.ts apps/server/test/lib/web-push-sender.test.ts
git commit -m "feat(push): web-push sender wrapper with dead-subscription pruning"
```

---

## Task 3: `push_subscriptions` migration + schema

**Files:**
- Create: `apps/server/src/data/migrations/00034-create-push-subscriptions-table.ts`
- Modify: `apps/server/src/data/migrations/index.ts`
- Modify: `apps/server/src/data/schema.ts`

**Interfaces:**
- Produces: table `push_subscriptions(id, account_id, device_id, endpoint UNIQUE, p256dh, auth, created_at, updated_at, last_failure_at)`; types `SelectPushSubscription`, `CreatePushSubscription`.

- [ ] **Step 1: Write the migration** — `apps/server/src/data/migrations/00034-create-push-subscriptions-table.ts`:

```typescript
import { Migration } from 'kysely';

export const createPushSubscriptionsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('push_subscriptions')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('account_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('device_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('endpoint', 'text', (col) => col.notNull().unique())
      .addColumn('p256dh', 'text', (col) => col.notNull())
      .addColumn('auth', 'text', (col) => col.notNull())
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('last_failure_at', 'timestamptz')
      .execute();

    await db.schema
      .createIndex('push_subscriptions_account_id_idx')
      .on('push_subscriptions')
      .column('account_id')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('push_subscriptions').execute();
  },
};
```

- [ ] **Step 2: Register** — in `apps/server/src/data/migrations/index.ts` add the import and `'00034_create_push_subscriptions_table': createPushSubscriptionsTable,` to `databaseMigrations`.

- [ ] **Step 3: Add schema types** — in `apps/server/src/data/schema.ts`:

```typescript
interface PushSubscriptionTable {
  id: ColumnType<string, string, never>;
  account_id: ColumnType<string, string, never>;
  device_id: ColumnType<string, string, never>;
  endpoint: ColumnType<string, string, string>;
  p256dh: ColumnType<string, string, string>;
  auth: ColumnType<string, string, string>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  last_failure_at: ColumnType<Date | null, Date | null, Date | null>;
}

export type SelectPushSubscription = Selectable<PushSubscriptionTable>;
export type CreatePushSubscription = Insertable<PushSubscriptionTable>;
export type UpdatePushSubscription = Updateable<PushSubscriptionTable>;
```

and add `push_subscriptions: PushSubscriptionTable;` to `DatabaseSchema`.

- [ ] **Step 4: Verify migration applies** (Testcontainers runs migrations in global-setup)

Run: `npm run test -w @colanode/server -- web-push-sender`
Expected: PASS (the Task 2 test now finds the `push_subscriptions` table).

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/data/migrations/00034-create-push-subscriptions-table.ts apps/server/src/data/migrations/index.ts apps/server/src/data/schema.ts
git commit -m "feat(push): push_subscriptions table + schema types"
```

---

## Task 4: `notification_mutes` migration + schema (synced, sequence+trigger)

**Files:**
- Create: `apps/server/src/data/migrations/00035-create-notification-mutes-table.ts`
- Modify: `apps/server/src/data/migrations/index.ts`, `apps/server/src/data/schema.ts`

**Interfaces:**
- Produces: table `notification_mutes(id, user_id, node_id, workspace_id, muted, created_at, updated_at, revision)` with `revision` sequence + BEFORE UPDATE trigger; unique on `(user_id, node_id)`. Types `SelectNotificationMute`, `CreateNotificationMute`.

- [ ] **Step 1: Write the migration** — `apps/server/src/data/migrations/00035-create-notification-mutes-table.ts`:

```typescript
import { sql, Migration } from 'kysely';

export const createNotificationMutesTable: Migration = {
  up: async (db) => {
    await sql`
      CREATE SEQUENCE IF NOT EXISTS notification_mutes_revision_sequence
      START WITH 1000000000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    `.execute(db);

    await db.schema
      .createTable('notification_mutes')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('muted', 'boolean', (col) => col.notNull().defaultTo(false))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('updated_at', 'timestamptz')
      .addColumn('revision', 'bigint', (col) =>
        col
          .notNull()
          .defaultTo(sql`nextval('notification_mutes_revision_sequence')`)
      )
      .addUniqueConstraint('notification_mutes_user_node_uq', [
        'user_id',
        'node_id',
      ])
      .execute();

    await db.schema
      .createIndex('notification_mutes_user_id_revision_idx')
      .on('notification_mutes')
      .columns(['user_id', 'revision'])
      .execute();

    await sql`
      CREATE OR REPLACE FUNCTION update_notification_mute_revision() RETURNS TRIGGER AS $$
      BEGIN
        NEW.revision = nextval('notification_mutes_revision_sequence');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_update_notification_mute_revision
      BEFORE UPDATE ON notification_mutes
      FOR EACH ROW EXECUTE FUNCTION update_notification_mute_revision();
    `.execute(db);
  },
  down: async (db) => {
    await sql`
      DROP TRIGGER IF EXISTS trg_update_notification_mute_revision ON notification_mutes;
      DROP FUNCTION IF EXISTS update_notification_mute_revision();
    `.execute(db);
    await db.schema.dropTable('notification_mutes').execute();
    await sql`DROP SEQUENCE IF EXISTS notification_mutes_revision_sequence`.execute(
      db
    );
  },
};
```

- [ ] **Step 2: Register** — add import + `'00035_create_notification_mutes_table': createNotificationMutesTable,` to `apps/server/src/data/migrations/index.ts`.

- [ ] **Step 3: Schema types** — in `apps/server/src/data/schema.ts`:

```typescript
interface NotificationMuteTable {
  id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  node_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  muted: ColumnType<boolean, boolean, boolean>;
  created_at: ColumnType<Date, Date, never>;
  updated_at: ColumnType<Date | null, Date | null, Date | null>;
  revision: ColumnType<string, never, never>;
}

export type SelectNotificationMute = Selectable<NotificationMuteTable>;
export type CreateNotificationMute = Insertable<NotificationMuteTable>;
export type UpdateNotificationMute = Updateable<NotificationMuteTable>;
```

and add `notification_mutes: NotificationMuteTable;` to `DatabaseSchema`.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run build -w @colanode/server`
Expected: no type errors.

```bash
git add apps/server/src/data/migrations/00035-create-notification-mutes-table.ts apps/server/src/data/migrations/index.ts apps/server/src/data/schema.ts
git commit -m "feat(push): notification_mutes table (synced, sequence+trigger)"
```

---

## Task 5: Core mutation schemas (3) + sync data types

**Files:**
- Modify: `packages/core/src/types/mutations.ts`
- Modify: the core synchronizers types file (where `SyncNotificationsInput` / `SyncNotificationData` live — likely `packages/core/src/types/synchronizers.ts`)
- Modify: `apps/server/src/types/events.ts`

**Interfaces:**
- Produces: mutation types `PushSubscriptionCreateMutation` (`type: 'pushSubscription.create'`, data `{ subscription: { endpoint, p256dh, auth }, deviceId, createdAt }`), `PushSubscriptionDeleteMutation` (`type: 'pushSubscription.delete'`, data `{ endpoint }`), `MuteSetMutation` (`type: 'mute.set'`, data `{ nodeId, muted, updatedAt }`). Sync input `SyncNotificationMutesInput` (`type: 'notification-mutes'`) + `SyncNotificationMuteData`. Server event `NotificationMuteUpdatedEvent`.

- [ ] **Step 1: Add mutation schemas** — in `packages/core/src/types/mutations.ts`, before `mutationSchema`:

```typescript
export const pushSubscriptionCreateMutationDataSchema = z.object({
  endpoint: z.string(),
  p256dh: z.string(),
  auth: z.string(),
  deviceId: z.string(),
  createdAt: z.string(),
});
export type PushSubscriptionCreateMutationData = z.infer<
  typeof pushSubscriptionCreateMutationDataSchema
>;
export const pushSubscriptionCreateMutationSchema = mutationBaseSchema.extend({
  type: z.literal('pushSubscription.create'),
  data: pushSubscriptionCreateMutationDataSchema,
});
export type PushSubscriptionCreateMutation = z.infer<
  typeof pushSubscriptionCreateMutationSchema
>;

export const pushSubscriptionDeleteMutationDataSchema = z.object({
  endpoint: z.string(),
});
export type PushSubscriptionDeleteMutationData = z.infer<
  typeof pushSubscriptionDeleteMutationDataSchema
>;
export const pushSubscriptionDeleteMutationSchema = mutationBaseSchema.extend({
  type: z.literal('pushSubscription.delete'),
  data: pushSubscriptionDeleteMutationDataSchema,
});
export type PushSubscriptionDeleteMutation = z.infer<
  typeof pushSubscriptionDeleteMutationSchema
>;

export const muteSetMutationDataSchema = z.object({
  nodeId: z.string(),
  muted: z.boolean(),
  updatedAt: z.string(),
});
export type MuteSetMutationData = z.infer<typeof muteSetMutationDataSchema>;
export const muteSetMutationSchema = mutationBaseSchema.extend({
  type: z.literal('mute.set'),
  data: muteSetMutationDataSchema,
});
export type MuteSetMutation = z.infer<typeof muteSetMutationSchema>;
```

Then add the three schemas to the `z.discriminatedUnion('type', [ ... ])` array.

- [ ] **Step 2: Add sync data types** — mirror `SyncNotificationsInput`/`SyncNotificationData` in the same core synchronizers file:

```typescript
export type SyncNotificationMuteData = {
  id: string;
  userId: string;
  nodeId: string;
  workspaceId: string;
  muted: boolean;
  createdAt: string;
  updatedAt: string | null;
  revision: string;
};

export type SyncNotificationMutesInput = {
  type: 'notification-mutes';
};
```

and register `'notification-mutes'` in the `SynchronizerMap` interface next to `notifications` with `{ input: SyncNotificationMutesInput; data: SyncNotificationMuteData }`. (Grep for how `notifications` is added to `SynchronizerMap` and mirror exactly.)

- [ ] **Step 3: Add server event** — in `apps/server/src/types/events.ts`, add:

```typescript
export type NotificationMuteUpdatedEvent = {
  type: 'notification.mute.updated';
  userId: string;
  nodeId: string;
  workspaceId: string;
};
```

and add `NotificationMuteUpdatedEvent` to the exported `Event` union.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run build -w @colanode/core && npm run build -w @colanode/server`
Expected: no type errors.

```bash
git add packages/core/src/types/mutations.ts packages/core/src/types/synchronizers.ts apps/server/src/types/events.ts
git commit -m "feat(push): core mutation + sync types for subscriptions and mute"
```

---

## Task 6: Server mutation handlers (create/delete subscription, set mute)

**Files:**
- Create: `apps/server/src/lib/push-subscriptions.ts`
- Create: `apps/server/src/lib/notification-mutes.ts`
- Modify: `apps/server/src/api/client/routes/workspaces/mutations/mutations-sync.ts`
- Create: `apps/server/test/lib/notification-mutes.test.ts`

**Interfaces:**
- Consumes: `WorkspaceContext`, `MutationStatus`, `generateId`, `IdType`, the mutation types from Task 5, `eventBus`.
- Produces: `createPushSubscription(workspace, mutation)`, `deletePushSubscription(workspace, mutation)`, `setNotificationMute(workspace, mutation)` — all `Promise<MutationStatus>`. `setNotificationMute` upserts and publishes `notification.mute.updated`.

- [ ] **Step 1: Push subscription handlers** — `apps/server/src/lib/push-subscriptions.ts`:

```typescript
import {
  MutationStatus,
  PushSubscriptionCreateMutation,
  PushSubscriptionDeleteMutation,
  generateId,
  IdType,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { WorkspaceContext } from '@colanode/server/types/api';

export const createPushSubscription = async (
  workspace: WorkspaceContext,
  mutation: PushSubscriptionCreateMutation
): Promise<MutationStatus> => {
  await database
    .insertInto('push_subscriptions')
    .values({
      id: generateId(IdType.Device),
      account_id: workspace.user.accountId,
      device_id: mutation.data.deviceId,
      endpoint: mutation.data.endpoint,
      p256dh: mutation.data.p256dh,
      auth: mutation.data.auth,
      created_at: new Date(mutation.data.createdAt),
    })
    .onConflict((oc) =>
      oc.column('endpoint').doUpdateSet({
        account_id: workspace.user.accountId,
        device_id: mutation.data.deviceId,
        p256dh: mutation.data.p256dh,
        auth: mutation.data.auth,
        updated_at: new Date(),
        last_failure_at: null,
      })
    )
    .execute();

  return MutationStatus.OK;
};

export const deletePushSubscription = async (
  workspace: WorkspaceContext,
  mutation: PushSubscriptionDeleteMutation
): Promise<MutationStatus> => {
  await database
    .deleteFrom('push_subscriptions')
    .where('account_id', '=', workspace.user.accountId)
    .where('endpoint', '=', mutation.data.endpoint)
    .execute();

  return MutationStatus.OK;
};
```

*(If `IdType.Device` does not exist, grep `packages/core/src` for the `IdType` enum and use an existing generic id type, or add `IdType.PushSubscription`. Verify before implementing.)*

- [ ] **Step 2: Mute handler** — `apps/server/src/lib/notification-mutes.ts`:

```typescript
import {
  MutationStatus,
  MuteSetMutation,
  generateId,
  IdType,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { WorkspaceContext } from '@colanode/server/types/api';

export const setNotificationMute = async (
  workspace: WorkspaceContext,
  mutation: MuteSetMutation
): Promise<MutationStatus> => {
  const updated = await database
    .insertInto('notification_mutes')
    .returningAll()
    .values({
      id: generateId(IdType.Node),
      user_id: workspace.user.id,
      node_id: mutation.data.nodeId,
      workspace_id: workspace.id,
      muted: mutation.data.muted,
      created_at: new Date(mutation.data.updatedAt),
    })
    .onConflict((oc) =>
      oc.columns(['user_id', 'node_id']).doUpdateSet({
        muted: mutation.data.muted,
        updated_at: new Date(mutation.data.updatedAt),
      })
    )
    .executeTakeFirst();

  if (updated) {
    eventBus.publish({
      type: 'notification.mute.updated',
      userId: workspace.user.id,
      nodeId: mutation.data.nodeId,
      workspaceId: workspace.id,
    });
  }

  return MutationStatus.OK;
};
```

*(Use an appropriate `IdType` for the mute row id — grep the enum; any opaque id type works since it's an internal PK.)*

- [ ] **Step 3: Route the mutations** — in `apps/server/src/api/client/routes/workspaces/mutations/mutations-sync.ts`, import the three handlers and add branches to `handleMutation`:

```typescript
  } else if (mutation.type === 'pushSubscription.create') {
    return await createPushSubscription(workspace, mutation);
  } else if (mutation.type === 'pushSubscription.delete') {
    return await deletePushSubscription(workspace, mutation);
  } else if (mutation.type === 'mute.set') {
    return await setNotificationMute(workspace, mutation);
```

- [ ] **Step 4: Write the mute test** — `apps/server/test/lib/notification-mutes.test.ts`:

```typescript
import { describe, expect, it } from 'vitest';

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { setNotificationMute } from '@colanode/server/lib/notification-mutes';
import { createAccount, createWorkspace, createUser } from '../helpers/seed';

describe('notification mutes', () => {
  it('upserts a mute row and toggles muted', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'collaborator',
    });
    const nodeId = generateId(IdType.Channel);
    const ctx = {
      id: workspace.id,
      status: workspace.status,
      user: { id: user.id, accountId: account.id, role: user.role as never },
    };

    await setNotificationMute(ctx as never, {
      id: 'm1',
      createdAt: new Date().toISOString(),
      type: 'mute.set',
      data: { nodeId, muted: true, updatedAt: new Date().toISOString() },
    });
    let row = await database
      .selectFrom('notification_mutes')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('node_id', '=', nodeId)
      .executeTakeFirstOrThrow();
    expect(row.muted).toBe(true);

    await setNotificationMute(ctx as never, {
      id: 'm2',
      createdAt: new Date().toISOString(),
      type: 'mute.set',
      data: { nodeId, muted: false, updatedAt: new Date().toISOString() },
    });
    row = await database
      .selectFrom('notification_mutes')
      .selectAll()
      .where('user_id', '=', user.id)
      .where('node_id', '=', nodeId)
      .executeTakeFirstOrThrow();
    expect(row.muted).toBe(false);
  });
});
```

*(Confirm the `helpers/seed` module + `createAccount/createWorkspace/createUser` exist — the notifications tests use them. If names differ, mirror whatever the existing notifications test imports.)*

- [ ] **Step 5: Run test**

Run: `npm run test -w @colanode/server -- notification-mutes`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/lib/push-subscriptions.ts apps/server/src/lib/notification-mutes.ts apps/server/src/api/client/routes/workspaces/mutations/mutations-sync.ts apps/server/test/lib/notification-mutes.test.ts
git commit -m "feat(push): server handlers for push subscription + mute mutations"
```

---

## Task 7: Server mute synchronizer + registration

**Files:**
- Create: `apps/server/src/synchronizers/notification-mutes.ts`
- Modify: `apps/server/src/services/socket-connection.ts`

**Interfaces:**
- Consumes: `BaseSynchronizer`, `SyncNotificationMutesInput`, `SyncNotificationMuteData`, `SelectNotificationMute`, the `notification.mute.updated` event.
- Produces: `NotificationMuteSynchronizer` streaming mute rows by `revision > cursor` for the connected user.

- [ ] **Step 1: Write the synchronizer** — `apps/server/src/synchronizers/notification-mutes.ts` (mirror `synchronizers/notifications.ts`):

```typescript
import {
  SyncNotificationMuteData,
  SyncNotificationMutesInput,
  SynchronizerOutputMessage,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNotificationMute } from '@colanode/server/data/schema';
import { createLogger } from '@colanode/server/lib/logger';
import { BaseSynchronizer } from '@colanode/server/synchronizers/base';
import { Event } from '@colanode/server/types/events';

const logger = createLogger('notification-mutes-synchronizer');

export class NotificationMuteSynchronizer extends BaseSynchronizer<SyncNotificationMutesInput> {
  public async fetchData(): Promise<SynchronizerOutputMessage<SyncNotificationMutesInput> | null> {
    const rows = await this.fetchMutes();
    if (rows.length === 0) return null;
    return this.buildMessage(rows);
  }

  public async fetchDataFromEvent(
    event: Event
  ): Promise<SynchronizerOutputMessage<SyncNotificationMutesInput> | null> {
    if (!this.shouldFetch(event)) return null;
    const rows = await this.fetchMutes();
    if (rows.length === 0) return null;
    return this.buildMessage(rows);
  }

  private async fetchMutes(): Promise<SelectNotificationMute[]> {
    if (this.status === 'fetching') return [];
    this.status = 'fetching';
    try {
      return await database
        .selectFrom('notification_mutes')
        .selectAll()
        .where('user_id', '=', this.user.userId)
        .where('revision', '>', this.cursor)
        .orderBy('revision', 'asc')
        .limit(100)
        .execute();
    } catch (error) {
      logger.error(error, 'Error fetching notification mutes for sync');
    } finally {
      this.status = 'pending';
    }
    return [];
  }

  private buildMessage(
    rows: SelectNotificationMute[]
  ): SynchronizerOutputMessage<SyncNotificationMutesInput> {
    const items: SyncNotificationMuteData[] = rows.map((row) => ({
      id: row.id,
      userId: row.user_id,
      nodeId: row.node_id,
      workspaceId: row.workspace_id,
      muted: row.muted,
      createdAt: row.created_at.toISOString(),
      updatedAt: row.updated_at ? row.updated_at.toISOString() : null,
      revision: row.revision.toString(),
    }));

    return {
      type: 'synchronizer.output',
      userId: this.user.userId,
      id: this.id,
      items: items.map((item) => ({ cursor: item.revision, data: item })),
    };
  }

  private shouldFetch(event: Event): boolean {
    return (
      event.type === 'notification.mute.updated' &&
      event.userId === this.user.userId
    );
  }
}
```

- [ ] **Step 2: Register** — in `apps/server/src/services/socket-connection.ts`, import `NotificationMuteSynchronizer` and add to the `buildSynchronizer` branch:

```typescript
} else if (message.input.type === 'notification-mutes') {
  return new NotificationMuteSynchronizer(
    message.id,
    user.user,
    message.input,
    cursor
  );
}
```

- [ ] **Step 3: Typecheck + commit**

Run: `npm run build -w @colanode/server`
Expected: no type errors.

```bash
git add apps/server/src/synchronizers/notification-mutes.ts apps/server/src/services/socket-connection.ts
git commit -m "feat(push): server synchronizer for notification mutes"
```

---

## Task 8: `push-service` (recipient computation + dispatch) + boot wiring

**Files:**
- Create: `apps/server/src/services/push-service.ts`
- Modify: `apps/server/src/index.ts`
- Create: `apps/server/test/services/push-service.test.ts`

**Interfaces:**
- Consumes: `eventBus`, `database`, `mapNode`, `sendWebPush`, `config.push`.
- Produces: `pushService` singleton with idempotent `init()`; on `node.created` message in a `channel`/`chat` root, sends web push to `collaborations − author − muted → account → push_subscriptions`.

- [ ] **Step 1: Write the failing test** — `apps/server/test/services/push-service.test.ts`:

```typescript
import { beforeAll, describe, expect, it, vi } from 'vitest';

vi.mock('@colanode/server/lib/push/web-push-sender', () => ({
  sendWebPush: vi.fn().mockResolvedValue(undefined),
}));

import { generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { config } from '@colanode/server/lib/config';
import { sendWebPush } from '@colanode/server/lib/push/web-push-sender';
import { pushService } from '@colanode/server/services/push-service';
import {
  createAccount,
  createWorkspace,
  createUser,
  createChannelNode,
  createMessageNode,
} from '../helpers/seed';

const waitFor = async (fn: () => Promise<boolean>, ms = 2000) => {
  const start = Date.now();
  while (Date.now() - start < ms) {
    if (await fn()) return true;
    await new Promise((r) => setTimeout(r, 50));
  }
  return false;
};

beforeAll(async () => {
  // config.push prefaults to { enabled: false } in the test env — without this
  // patch pushService.init() no-ops and no push is ever dispatched. sendWebPush
  // is mocked above, so the fake VAPID keys are never used.
  config.push = {
    enabled: true,
    subject: 'mailto:test@example.com',
    publicKey: 'pk',
    privateKey: 'sk',
  };
  await pushService.init();
});

describe('pushService', () => {
  it('sends a push to a channel member (not the author) who has a subscription and is not muted', async () => {
    const authorAccount = await createAccount();
    const memberAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: authorAccount.id });
    const author = await createUser({ workspaceId: workspace.id, account: authorAccount, role: 'collaborator' });
    const member = await createUser({ workspaceId: workspace.id, account: memberAccount, role: 'collaborator' });

    const channelId = await createChannelNode({
      workspaceId: workspace.id,
      userId: author.id,
      collaborators: { [author.id]: 'collaborator', [member.id]: 'collaborator' },
    });

    await database.insertInto('push_subscriptions').values({
      id: generateId(IdType.Device),
      account_id: memberAccount.id,
      device_id: generateId(IdType.Device),
      endpoint: 'https://push.example/ok',
      p256dh: 'k',
      auth: 'a',
      created_at: new Date(),
    }).execute();

    const messageId = await createMessageNode({
      workspaceId: workspace.id,
      userId: author.id,
      rootId: channelId,
      parentId: channelId,
    });

    eventBus.publish({ type: 'node.created', nodeId: messageId, rootId: channelId, workspaceId: workspace.id });

    const ok = await waitFor(async () =>
      (sendWebPush as unknown as ReturnType<typeof vi.fn>).mock.calls.length > 0
    );
    expect(ok).toBe(true);
  });
});
```

*(If `createChannelNode` does not exist in `helpers/seed`, add it mirroring `createSpaceNode`/`createMessageNode` — a channel root node with the given collaborators map. This is part of this task.)*

- [ ] **Step 2: Run test to verify it fails**

Run: `npm run test -w @colanode/server -- push-service`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the service** — `apps/server/src/services/push-service.ts`:

```typescript
import { extractBlockTexts, NodeAttributes } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { config } from '@colanode/server/lib/config';
import { eventBus } from '@colanode/server/lib/event-bus';
import { createLogger } from '@colanode/server/lib/logger';
import { mapNode } from '@colanode/server/lib/nodes';
import { sendWebPush } from '@colanode/server/lib/push/web-push-sender';
import { Event } from '@colanode/server/types/events';

const logger = createLogger('push-service');

const PREVIEW_MAX = 120;

class PushService {
  private subscriptionId: string | null = null;

  public async init(): Promise<void> {
    if (!config.push.enabled) return;
    if (this.subscriptionId !== null) return;
    this.subscriptionId = eventBus.subscribe((event) => {
      void this.handleEvent(event).catch((e) =>
        logger.error(e, 'push handler failed')
      );
    });
  }

  private async handleEvent(event: Event): Promise<void> {
    // Push on new messages AND edits (node.updated). Reactions live in a separate table, so a node.updated on a message node is a genuine content edit. Deletes are intentionally NOT handled (stale push left in place, Telegram-style).
    if (event.type !== 'node.created' && event.type !== 'node.updated') return;

    const nodeRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', event.nodeId)
      .executeTakeFirst();
    if (!nodeRow) return;

    const rootRow = await database
      .selectFrom('nodes')
      .selectAll()
      .where('id', '=', event.rootId)
      .executeTakeFirst();
    if (!rootRow) return;

    const node = mapNode(nodeRow);
    const rootNode = mapNode(rootRow);
    if (node.type !== 'message') return;
    if (rootNode.type !== 'channel' && rootNode.type !== 'chat') return;

    const actorId = nodeRow.created_by;

    // Recipients: collaborators of the root, minus author, minus muted.
    const collaborations = await database
      .selectFrom('collaborations')
      .select(['collaborator_id'])
      .where('node_id', '=', event.rootId)
      .where('deleted_at', 'is', null)
      .execute();

    const recipientUserIds = collaborations
      .map((c) => c.collaborator_id)
      .filter((id) => id !== actorId);
    if (recipientUserIds.length === 0) return;

    const muted = await database
      .selectFrom('notification_mutes')
      .select(['user_id'])
      .where('node_id', '=', event.rootId)
      .where('muted', '=', true)
      .where('user_id', 'in', recipientUserIds)
      .execute();
    const mutedSet = new Set(muted.map((m) => m.user_id));

    const finalUserIds = recipientUserIds.filter((id) => !mutedSet.has(id));
    if (finalUserIds.length === 0) return;

    // Map users -> accounts.
    const users = await database
      .selectFrom('users')
      .select(['id', 'account_id'])
      .where('id', 'in', finalUserIds)
      .execute();
    const accountIds = [...new Set(users.map((u) => u.account_id))];
    if (accountIds.length === 0) return;

    const subscriptions = await database
      .selectFrom('push_subscriptions')
      .selectAll()
      .where('account_id', 'in', accountIds)
      .execute();
    if (subscriptions.length === 0) return;

    // Chat roots have no name — the push title falls back to the author's
    // display name (channels keep using the channel name).
    const authorRow = await database
      .selectFrom('users')
      .select(['name', 'custom_name'])
      .where('id', '=', actorId)
      .executeTakeFirst();
    const authorName = authorRow
      ? (authorRow.custom_name ?? authorRow.name)
      : null;

    const attributes = nodeRow.attributes as NodeAttributes;
    const payload = {
      title: this.rootTitle(rootNode, authorName),
      body: this.preview(node.id, attributes),
      rootId: event.rootId,
      nodeId: node.id,
      workspaceId: event.workspaceId,
      url: `/${event.workspaceId}/${event.rootId}`,
    };

    const startedAt = Date.now();
    // shortcut: inline fan-out, fine for team-scale deploys — the warn above names the ceiling; move to a BullMQ job if a channel grows to hundreds of members.
    await Promise.all(
      subscriptions.map((sub) =>
        sendWebPush(sub, payload).catch((e) =>
          logger.error(e, `push send failed for ${sub.id}`)
        )
      )
    );
    const durationMs = Date.now() - startedAt;

    logger.info(
      {
        rootId: event.rootId,
        recipientCount: finalUserIds.length,
        subscriptionCount: subscriptions.length,
        durationMs,
      },
      'push fan-out'
    );

    if (subscriptions.length > 200 || durationMs > 2000) {
      logger.warn(
        {
          rootId: event.rootId,
          subscriptionCount: subscriptions.length,
          durationMs,
        },
        'push fan-out large — consider moving to a BullMQ job'
      );
    }
  }

  private rootTitle(
    rootNode: { type: string; name?: string },
    authorName: string | null
  ): string {
    if (rootNode.type === 'chat') {
      return authorName && authorName.length > 0 ? authorName : 'New message';
    }

    const name = rootNode.name;
    return name && name.length > 0 ? name : 'New message';
  }

  private preview(nodeId: string, attributes: NodeAttributes): string {
    const text =
      attributes.type === 'message'
        ? extractBlockTexts(nodeId, attributes.content)
        : null;
    const body = text && text.length > 0 ? text : 'New message';
    return body.length > PREVIEW_MAX ? body.slice(0, PREVIEW_MAX) + '…' : body;
  }
}

export const pushService = new PushService();
```

*(The `preview()` method uses `extractBlockTexts` from `@colanode/core` — the same helper `messageModel.extractText` uses internally (see `packages/core/src/registry/nodes/message.ts` / `packages/core/src/lib/texts.ts`) — to produce a real plain-text preview from the message's content blocks, truncated to `PREVIEW_MAX` chars.)*

- [ ] **Step 4: Wire boot** — in `apps/server/src/index.ts` add `import { pushService } from '@colanode/server/services/push-service';` and after `await notificationService.init();` add `await pushService.init();`.

- [ ] **Step 5: Run test to verify it passes**

Run: `npm run test -w @colanode/server -- push-service`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/push-service.ts apps/server/src/index.ts apps/server/test/services/push-service.test.ts apps/server/test/helpers/seed.ts
git commit -m "feat(push): push-service dispatches web push for channel/chat messages"
```

---

## Task 9: Client local `notification_mutes` table + sync consumer

**Files:**
- Create: `packages/client/src/databases/workspace/migrations/00022-create-notification-mutes-table.ts`
- Modify: `packages/client/src/databases/workspace/migrations/index.ts`, `packages/client/src/databases/workspace/schema.ts`
- Create: `packages/client/src/services/workspaces/notification-mute-service.ts`
- Modify: `packages/client/src/services/workspaces/sync-service.ts` (register synchronizer + handler)

**Interfaces:**
- Consumes: `SyncNotificationMuteData`, workspace DB.
- Produces: local table `notification_mutes(id, user_id, node_id, workspace_id, muted, created_at, updated_at, revision)`; `NotificationMuteService.syncServerNotificationMute(data)`; `NotificationMuteService.setMute(nodeId, muted)`.

- [ ] **Step 1: Local migration** — `packages/client/src/databases/workspace/migrations/00022-create-notification-mutes-table.ts`:

```typescript
import { Migration } from 'kysely';

export const createNotificationMutesTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('notification_mutes')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('node_id', 'text', (col) => col.notNull())
      .addColumn('workspace_id', 'text', (col) => col.notNull())
      .addColumn('muted', 'integer', (col) => col.notNull().defaultTo(0))
      .addColumn('created_at', 'text', (col) => col.notNull())
      .addColumn('updated_at', 'text')
      .addColumn('revision', 'text', (col) => col.notNull())
      .execute();
    await db.schema
      .createIndex('notification_mutes_node_id_idx')
      .on('notification_mutes')
      .column('node_id')
      .execute();
  },
  down: async (db) => {
    await db.schema.dropTable('notification_mutes').execute();
  },
};
```

- [ ] **Step 2: Register migration + schema** — add to `.../migrations/index.ts` (`'00022-create-notification-mutes-table': createNotificationMutesTable`). In `.../workspace/schema.ts`:

```typescript
interface NotificationMuteTable {
  id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  node_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  muted: ColumnType<number, number, number>;
  created_at: ColumnType<string, string, never>;
  updated_at: ColumnType<string | null, string | null, string | null>;
  revision: ColumnType<string, string, string>;
}
export type SelectNotificationMute = Selectable<NotificationMuteTable>;
export type CreateNotificationMute = Insertable<NotificationMuteTable>;
export type UpdateNotificationMute = Updateable<NotificationMuteTable>;
```

and add `notification_mutes: NotificationMuteTable;` to the workspace `DatabaseSchema`.

- [ ] **Step 3: Sync consumer + setter** — `packages/client/src/services/workspaces/notification-mute-service.ts` (mirror `notification-service.ts` sync + the client mutation-write pattern):

```typescript
import { SyncNotificationMuteData, generateId, IdType, MuteSetMutation } from '@colanode/core';

import { eventBus } from '@colanode/client/lib/event-bus';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';

export class NotificationMuteService {
  private readonly workspace: WorkspaceService;

  constructor(workspaceService: WorkspaceService) {
    this.workspace = workspaceService;
  }

  public async syncServerNotificationMute(data: SyncNotificationMuteData) {
    await this.workspace.database
      .insertInto('notification_mutes')
      .values({
        id: data.id,
        user_id: data.userId,
        node_id: data.nodeId,
        workspace_id: data.workspaceId,
        muted: data.muted ? 1 : 0,
        created_at: data.createdAt,
        updated_at: data.updatedAt,
        revision: data.revision,
      })
      .onConflict((b) =>
        b.column('id').doUpdateSet({
          muted: data.muted ? 1 : 0,
          updated_at: data.updatedAt,
          revision: data.revision,
        })
      )
      .execute();

    eventBus.publish({
      type: 'notification.mute.updated',
      workspace: {
        workspaceId: this.workspace.workspaceId,
        userId: this.workspace.userId,
        accountId: this.workspace.accountId,
      },
      nodeId: data.nodeId,
    });
  }

  public async setMute(nodeId: string, muted: boolean) {
    const now = new Date().toISOString();
    await this.workspace.database.transaction().execute(async (trx) => {
      const mutation: MuteSetMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'mute.set',
        data: { nodeId, muted, updatedAt: now },
      };
      await trx
        .insertInto('mutations')
        .values({
          id: mutation.id,
          type: mutation.type,
          data: JSON.stringify(mutation.data),
          created_at: mutation.createdAt,
          retries: 0,
        })
        .execute();
    });
    this.workspace.mutations.scheduleSync();
  }
}
```

*(Register a `notifications` mute event type in the client event map if it isn't already present — grep the client `eventBus` event union for `notification.mute.updated` and add it if missing. Also instantiate `NotificationMuteService` on `WorkspaceService` next to `notifications` — grep where `this.notifications = new NotificationService(this)` is set and mirror.)*

- [ ] **Step 4: Register synchronizer** — in `packages/client/src/services/workspaces/sync-service.ts`, add to `syncHandlers`:

```typescript
'notification-mutes': this.workspace.notificationMutes.syncServerNotificationMute.bind(
  this.workspace.notificationMutes
),
```

and initialize a `notificationMuteSynchronizer` mirroring `notificationSynchronizer`:

```typescript
if (!this.notificationMuteSynchronizer) {
  this.notificationMuteSynchronizer = new Synchronizer(
    this.workspace,
    { type: 'notification-mutes' },
    'notification-mutes',
    this.syncHandlers['notification-mutes']
  );
  await this.notificationMuteSynchronizer.init();
}
```

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build -w @colanode/client`
Expected: no type errors.

```bash
git add packages/client/src/databases/workspace/migrations/00022-create-notification-mutes-table.ts packages/client/src/databases/workspace/migrations/index.ts packages/client/src/databases/workspace/schema.ts packages/client/src/services/workspaces/notification-mute-service.ts packages/client/src/services/workspaces/sync-service.ts packages/client/src/services/workspaces/workspace-service.ts
git commit -m "feat(push): client-side notification_mutes table + sync consumer"
```

---

## Task 10: Client mutations (3) + handlers + registration

**Files:**
- Create: `packages/client/src/mutations/push-subscriptions/push-subscription-create.ts`, `.../push-subscription-delete.ts`, `packages/client/src/mutations/notifications/mute-set.ts`
- Create: matching handlers under `packages/client/src/handlers/mutations/...`
- Modify: `packages/client/src/mutations/index.ts`, `packages/client/src/handlers/mutations/index.ts`
- Create: `packages/client/src/services/workspaces/push-subscription-service.ts` (or fold create/delete into an account-level service)

**Interfaces:**
- Produces: client mutations `pushSubscription.create` (`{ endpoint, p256dh, auth, deviceId }`), `pushSubscription.delete` (`{ endpoint }`), `mute.set` (`{ nodeId, muted }`) invoked via `window.colanode.executeMutation({...})`.

- [ ] **Step 1: Mutation type defs** — `push-subscription-create.ts`:

```typescript
export type PushSubscriptionCreateMutationInput = {
  type: 'pushSubscription.create';
  userId: string;
  endpoint: string;
  p256dh: string;
  auth: string;
};

export type PushSubscriptionCreateMutationOutput = { success: boolean };

declare module '@colanode/client/mutations' {
  interface MutationMap {
    'pushSubscription.create': {
      input: PushSubscriptionCreateMutationInput;
      output: PushSubscriptionCreateMutationOutput;
    };
  }
}
```

`push-subscription-delete.ts` (input `{ type: 'pushSubscription.delete'; userId: string; endpoint: string }`) and `mute-set.ts` (input `{ type: 'mute.set'; userId: string; nodeId: string; muted: boolean }`) follow the identical shape.

- [ ] **Step 2: Handlers** — e.g. `handlers/mutations/push-subscriptions/push-subscription-create.ts`:

```typescript
import { generateId, IdType, PushSubscriptionCreateMutation } from '@colanode/core';
import { WorkspaceMutationHandlerBase } from '@colanode/client/handlers/mutations/workspace-mutation-handler-base';
import { MutationHandler } from '@colanode/client/lib/types';
import {
  PushSubscriptionCreateMutationInput,
  PushSubscriptionCreateMutationOutput,
} from '@colanode/client/mutations/push-subscriptions/push-subscription-create';

export class PushSubscriptionCreateMutationHandler
  extends WorkspaceMutationHandlerBase
  implements MutationHandler<PushSubscriptionCreateMutationInput>
{
  async handleMutation(
    input: PushSubscriptionCreateMutationInput
  ): Promise<PushSubscriptionCreateMutationOutput> {
    const workspace = this.getWorkspace(input.userId);
    const now = new Date().toISOString();
    await workspace.database.transaction().execute(async (trx) => {
      const mutation: PushSubscriptionCreateMutation = {
        id: generateId(IdType.Mutation),
        createdAt: now,
        type: 'pushSubscription.create',
        data: {
          endpoint: input.endpoint,
          p256dh: input.p256dh,
          auth: input.auth,
          deviceId: workspace.deviceId,
          createdAt: now,
        },
      };
      await trx
        .insertInto('mutations')
        .values({
          id: mutation.id,
          type: mutation.type,
          data: JSON.stringify(mutation.data),
          created_at: mutation.createdAt,
          retries: 0,
        })
        .execute();
    });
    workspace.mutations.scheduleSync();
    return { success: true };
  }
}
```

*(Grep `WorkspaceService` for the device id property name — likely `workspace.deviceId` or via `workspace.account.deviceId`; use the correct accessor.)* The delete handler mirrors this with the delete mutation data; the `mute.set` handler simply calls `workspace.notificationMutes.setMute(input.nodeId, input.muted)` and returns `{ success: true }`.

- [ ] **Step 3: Register** — add the three `export *` lines to `packages/client/src/mutations/index.ts` and the three imports + map entries (`'pushSubscription.create': new PushSubscriptionCreateMutationHandler(app)`, etc.) to `packages/client/src/handlers/mutations/index.ts`.

- [ ] **Step 4: Typecheck + commit**

Run: `npm run build -w @colanode/client`
Expected: no type errors (the `MutationMap` union now covers all three; the server-facing `Mutation` union from Task 5 already includes them, so client sync serializes them correctly).

```bash
git add packages/client/src/mutations packages/client/src/handlers/mutations
git commit -m "feat(push): client mutations for push subscription + mute"
```

---

## Task 11: Client mute query + hook

**Files:**
- Create: `packages/client/src/queries/notifications/notification-mute-get.ts` + handler under `handlers/queries/...`
- Modify: `packages/client/src/queries/index.ts`, `packages/client/src/handlers/queries/index.ts`
- Create: `packages/ui/src/hooks/use-channel-mute.tsx`

**Interfaces:**
- Produces: query `notification-mute.get` (`{ userId, nodeId }` → `{ muted: boolean }`), reacting to `notification.mute.updated`. Hook `useChannelMute(userId, nodeId)` → `{ muted }`.

- [ ] **Step 1: Query def** — `packages/client/src/queries/notifications/notification-mute-get.ts`:

```typescript
export type NotificationMuteGetQueryInput = {
  type: 'notification-mute.get';
  userId: string;
  nodeId: string;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'notification-mute.get': {
      input: NotificationMuteGetQueryInput;
      output: { muted: boolean };
    };
  }
}
```

- [ ] **Step 2: Query handler** — `handlers/queries/notifications/notification-mute-get.ts` (mirror `notification-list` handler):

```typescript
export class NotificationMuteGetQueryHandler
  extends WorkspaceQueryHandlerBase
  implements QueryHandler<NotificationMuteGetQueryInput>
{
  public async handleQuery(input: NotificationMuteGetQueryInput): Promise<{ muted: boolean }> {
    const workspace = this.getWorkspace(input.userId);
    const row = await workspace.database
      .selectFrom('notification_mutes')
      .select(['muted'])
      .where('node_id', '=', input.nodeId)
      .executeTakeFirst();
    return { muted: row ? row.muted === 1 : false };
  }

  public async checkForChanges(
    event: Event,
    input: NotificationMuteGetQueryInput,
    _: { muted: boolean }
  ): Promise<ChangeCheckResult<NotificationMuteGetQueryInput>> {
    if (
      event.type === 'notification.mute.updated' &&
      event.workspace.userId === input.userId &&
      event.nodeId === input.nodeId
    ) {
      return { hasChanges: true, result: await this.handleQuery(input) };
    }
    return { hasChanges: false };
  }
}
```

- [ ] **Step 3: Register** the query export + handler map entry (mirror `notification.list` registration).

- [ ] **Step 4: Hook** — `packages/ui/src/hooks/use-channel-mute.tsx`:

```typescript
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

export const useChannelMute = (userId: string, nodeId: string) => {
  const query = useLiveQuery({ type: 'notification-mute.get', userId, nodeId });
  return { muted: query.data?.muted ?? false };
};
```

- [ ] **Step 5: Typecheck + commit**

Run: `npm run build -w @colanode/client && npm run build -w @colanode/ui`
Expected: no type errors.

```bash
git add packages/client/src/queries packages/client/src/handlers/queries packages/ui/src/hooks/use-channel-mute.tsx
git commit -m "feat(push): client mute query + useChannelMute hook"
```

---

## Task 12: Web subscribe/unsubscribe orchestration

**Files:**
- Create: `apps/web/src/services/push-service.ts`

**Interfaces:**
- Consumes: `navigator.serviceWorker`, `window.colanode.executeMutation`, server push public key from the client server config.
- Produces: `enableWebPush(userId, vapidPublicKey): Promise<boolean>`, `disableWebPush(userId): Promise<void>`, `isWebPushSupported(): boolean`, `getWebPushState(): 'unsupported' | 'denied' | 'enabled' | 'disabled'`.

- [ ] **Step 1: Implement the service** — `apps/web/src/services/push-service.ts`:

```typescript
const urlBase64ToUint8Array = (base64: string): Uint8Array => {
  const padding = '='.repeat((4 - (base64.length % 4)) % 4);
  const b64 = (base64 + padding).replace(/-/g, '+').replace(/_/g, '/');
  const raw = atob(b64);
  const out = new Uint8Array(raw.length);
  for (let i = 0; i < raw.length; i++) out[i] = raw.charCodeAt(i);
  return out;
};

export const isWebPushSupported = (): boolean =>
  typeof window !== 'undefined' &&
  'Notification' in window &&
  'serviceWorker' in navigator &&
  'PushManager' in window;

export const getWebPushState = async (): Promise<
  'unsupported' | 'denied' | 'enabled' | 'disabled'
> => {
  if (!isWebPushSupported()) return 'unsupported';
  if (Notification.permission === 'denied') return 'denied';
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  return sub ? 'enabled' : 'disabled';
};

const toKeys = (sub: PushSubscription) => {
  const p256dh = sub.getKey('p256dh');
  const auth = sub.getKey('auth');
  const b64 = (buf: ArrayBuffer | null) =>
    buf ? btoa(String.fromCharCode(...new Uint8Array(buf))) : '';
  return { p256dh: b64(p256dh), auth: b64(auth) };
};

export const enableWebPush = async (
  userId: string,
  vapidPublicKey: string
): Promise<boolean> => {
  if (!isWebPushSupported()) return false;
  const permission = await Notification.requestPermission();
  if (permission !== 'granted') return false;

  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.subscribe({
    userVisibleOnly: true,
    applicationServerKey: urlBase64ToUint8Array(vapidPublicKey),
  });

  const { p256dh, auth } = toKeys(sub);
  await window.colanode.executeMutation({
    type: 'pushSubscription.create',
    userId,
    endpoint: sub.endpoint,
    p256dh,
    auth,
  });
  return true;
};

export const disableWebPush = async (userId: string): Promise<void> => {
  if (!isWebPushSupported()) return;
  const reg = await navigator.serviceWorker.ready;
  const sub = await reg.pushManager.getSubscription();
  if (!sub) return;
  const endpoint = sub.endpoint;
  await sub.unsubscribe();
  await window.colanode.executeMutation({
    type: 'pushSubscription.delete',
    userId,
    endpoint,
  });
};
```

- [ ] **Step 2: Typecheck + commit**

Run: `npm run build -w @colanode/web`
Expected: no type errors. *(If `window.colanode.executeMutation` typing complains, grep for its declaration in `apps/web/src` and match the exact call shape.)*

```bash
git add apps/web/src/services/push-service.ts
git commit -m "feat(push): web subscribe/unsubscribe orchestration"
```

---

## Task 13: Service worker `push` + `notificationclick`

**Files:**
- Modify: `apps/web/src/workers/service.ts`

**Interfaces:**
- Consumes: web push payload `{ title, body, url, ... }` (JSON string sent by `sendWebPush`).

- [ ] **Step 1: Add listeners** — at the end of `apps/web/src/workers/service.ts` (before any exports), add:

```typescript
self.addEventListener('push', (event: PushEvent) => {
  if (!event.data) return;
  let payload: { title?: string; body?: string; url?: string; rootId?: string };
  try {
    payload = event.data.json();
  } catch {
    payload = { title: 'New message', body: event.data.text() };
  }
  event.waitUntil(
    self.registration.showNotification(payload.title ?? 'New message', {
      body: payload.body ?? '',
      data: { url: payload.url ?? '/' },
      tag: payload.rootId,
      icon: '/assets/colanode-logo-192.jpg',
    })
  );
});

self.addEventListener('notificationclick', (event: NotificationEvent) => {
  event.notification.close();
  const url = (event.notification.data as { url?: string })?.url ?? '/';
  event.waitUntil(
    (async () => {
      const clientsArr = await self.clients.matchAll({
        type: 'window',
        includeUncontrolled: true,
      });
      for (const client of clientsArr) {
        if ('focus' in client) {
          await client.focus();
          if ('navigate' in client) {
            try {
              await client.navigate(url);
            } catch {
              /* ignore cross-origin navigate errors */
            }
          }
          return;
        }
      }
      await self.clients.openWindow(url);
    })()
  );
});
```

- [ ] **Step 2: Build web to confirm SW compiles**

Run: `npm run build -w @colanode/web`
Expected: build succeeds (VitePWA injects the SW with the new listeners; no type errors — `PushEvent`/`NotificationEvent` come from the `webworker` lib already referenced at the top of the file).

- [ ] **Step 3: Commit**

```bash
git add apps/web/src/workers/service.ts
git commit -m "feat(push): service worker push + notificationclick handlers"
```

---

## Task 14: Settings "Notifications" toggle

**Files:**
- Create: `packages/ui/src/components/app/app-notification-settings.tsx`
- Modify: `packages/ui/src/components/app/app-appearance-container.tsx`

**Interfaces:**
- Consumes: `enableWebPush` / `disableWebPush` / `getWebPushState` from web push service (import via the web app boundary the other settings use — if `packages/ui` cannot import from `apps/web`, expose the three functions on `window.colanode` and call them there; grep how `window.colanode` is populated and add `push: { enable, disable, getState }`).

- [ ] **Step 1: Expose push ops on `window.colanode`** — grep `apps/web/src` for where `window.colanode` is assigned and add:

```typescript
  push: {
    enable: (userId: string, vapidPublicKey: string) => enableWebPush(userId, vapidPublicKey),
    disable: (userId: string) => disableWebPush(userId),
    getState: () => getWebPushState(),
    isSupported: () => isWebPushSupported(),
  },
```

Also add the matching type to the `window.colanode` interface declaration.

- [ ] **Step 2: Settings component** — `packages/ui/src/components/app/app-notification-settings.tsx`:

```typescript
import { useEffect, useState } from 'react';

import { Separator } from '@colanode/ui/components/ui/separator';
import { Switch } from '@colanode/ui/components/ui/switch';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const AppNotificationSettings = () => {
  const workspace = useWorkspace();
  const [state, setState] = useState<
    'unsupported' | 'denied' | 'enabled' | 'disabled' | 'loading'
  >('loading');

  useEffect(() => {
    window.colanode.push.getState().then(setState);
  }, []);

  const serverPush = workspace.server?.attributes?.push;

  const onToggle = async (checked: boolean) => {
    if (checked) {
      if (!serverPush?.enabled || !serverPush.publicKey) return;
      const ok = await window.colanode.push.enable(
        workspace.userId,
        serverPush.publicKey
      );
      setState(ok ? 'enabled' : 'denied');
    } else {
      await window.colanode.push.disable(workspace.userId);
      setState('disabled');
    }
  };

  return (
    <div>
      <h2 className="text-2xl font-semibold tracking-tight">Notifications</h2>
      <Separator className="mt-3" />
      <div className="mt-3 flex items-center justify-between">
        <div className="text-sm text-muted-foreground">
          {state === 'unsupported'
            ? 'Add this app to your Home Screen to enable notifications.'
            : state === 'denied'
              ? 'Notifications are blocked in your browser settings.'
              : 'Push notifications on this device.'}
        </div>
        <Switch
          checked={state === 'enabled'}
          disabled={state === 'unsupported' || state === 'denied' || state === 'loading' || !serverPush?.enabled}
          onCheckedChange={onToggle}
        />
      </div>
    </div>
  );
};
```

*(Confirm the `useWorkspace` context exposes `server.attributes.push` and `userId` — grep the context; adjust accessors. Confirm a `Switch` UI primitive exists at `components/ui/switch` — the repo uses shadcn-style primitives; if absent, use the existing toggle/checkbox primitive.)*

- [ ] **Step 3: Mount it** — in `app-appearance-container.tsx`, add `import { AppNotificationSettings } from '@colanode/ui/components/app/app-notification-settings';` and render `<AppNotificationSettings />` after `<AppChatSettings />`.

- [ ] **Step 4: Build + commit**

Run: `npm run build -w @colanode/ui`
Expected: no type errors.

```bash
git add packages/ui/src/components/app/app-notification-settings.tsx packages/ui/src/components/app/app-appearance-container.tsx
git commit -m "feat(push): notifications enable toggle in settings"
```

---

## Task 15: Channel/chat mute menu item

**Files:**
- Modify: `packages/ui/src/components/channels/channel-settings.tsx`
- Modify: `packages/ui/src/components/chats/chat-settings.tsx` — mirror for `chat` (DM) roots. Push notifications fire on DMs too, so muting a DM must be reachable from the UI; this is not optional. The component takes a `chat: LocalChatNode` prop (verified by reading the file), so use `chat.id` in place of `channel.id`.

**Interfaces:**
- Consumes: `useChannelMute(userId, nodeId)` (Task 11), `window.colanode.executeMutation({ type: 'mute.set', ... })`.

- [ ] **Step 1: Add the mute item to channels** — in `channel-settings.tsx`, import `Bell`, `BellOff` from `lucide-react`, `useChannelMute`, and `useWorkspace`; inside the component:

```typescript
  const workspace = useWorkspace();
  const { muted } = useChannelMute(workspace.userId, channel.id);
```

and add a menu item inside `<DropdownMenuContent>` (after a `<DropdownMenuSeparator />`):

```typescript
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              window.colanode.executeMutation({
                type: 'mute.set',
                userId: workspace.userId,
                nodeId: channel.id,
                muted: !muted,
              });
            }}
          >
            {muted ? (
              <Bell className="size-4" />
            ) : (
              <BellOff className="size-4" />
            )}
            {muted ? 'Unmute notifications' : 'Mute notifications'}
          </DropdownMenuItem>
```

- [ ] **Step 2: Add the identical mute item to chats (DMs)** — `chat-settings.tsx` currently just renders `NodeCollaboratorsPopover`; it has no dropdown menu of its own, so wrap it with the same mute affordance used on channels. Import `Bell`, `BellOff` from `lucide-react`, `useChannelMute`, `useWorkspace`, and the same `DropdownMenu`/`DropdownMenuContent`/`DropdownMenuItem`/`DropdownMenuSeparator`/`DropdownMenuTrigger` primitives used in `channel-settings.tsx`; inside the component:

```typescript
  const workspace = useWorkspace();
  const { muted } = useChannelMute(workspace.userId, chat.id);
```

and add the same menu item (after a `<DropdownMenuSeparator />` if there are other items, otherwise as the sole item) inside `<DropdownMenuContent>`:

```typescript
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              window.colanode.executeMutation({
                type: 'mute.set',
                userId: workspace.userId,
                nodeId: chat.id,
                muted: !muted,
              });
            }}
          >
            {muted ? (
              <Bell className="size-4" />
            ) : (
              <BellOff className="size-4" />
            )}
            {muted ? 'Unmute notifications' : 'Mute notifications'}
          </DropdownMenuItem>
```

- [ ] **Step 3: Build + commit**

Run: `npm run build -w @colanode/ui`
Expected: no type errors.

```bash
git add packages/ui/src/components/channels/channel-settings.tsx packages/ui/src/components/chats/chat-settings.tsx
git commit -m "feat(push): mute/unmute notifications menu item on channels and chats"
```

---

## Task 16: Full build + server test sweep + manual e2e checklist

**Files:** none (verification)

- [ ] **Step 1: Full monorepo typecheck/build**

Run: `npm run build`
Expected: all workspaces build with no type errors.

- [ ] **Step 2: Server test suite**

Run: `npm run test -w @colanode/server`
Expected: all tests pass, including `web-push-sender`, `notification-mutes`, `push-service`.

- [ ] **Step 3: Rebuild + redeploy images to dd** (see `~/workspace/ci/docs/colanode-dd-deploy-runbook.md`)

- Generate VAPID keys: `npx web-push generate-vapid-keys` → put `PUSH_VAPID_PUBLIC_KEY` / `PUSH_VAPID_PRIVATE_KEY` in `~anton/colanode/.env`, set `PUSH_VAPID_SUBJECT`/subject in `config.json` `push` block with `enabled: true`.
- Rebuild `colanode-server:dd` + `colanode-web:dd` from `feat/threads-and-tasks`, `docker save | ssh dd docker load`, `docker compose up -d`. New migrations `00034`/`00035` auto-apply on boot.

- [ ] **Step 4: Manual e2e on iPhone (acceptance)**

1. Open `https://chat.kvotaflow.ru` in iOS Safari → Share → **Add to Home Screen** → open the installed PWA.
2. Settings → Notifications → toggle on → grant permission.
3. From desktop (a second account that shares a channel) post a message in that channel → **push arrives** on the iPhone.
4. Tap the push → the PWA opens to the thread.
5. Mute the channel (channel header → Mute notifications) → post again → **no push**. Unmute → push resumes.

- [ ] **Step 5: Commit any deploy-config doc updates** (runbook / infra as needed).

---

## Notes for the implementer

- **Platform limitation — one push subscription per install:** push subscriptions are one-per-browser-install by web-platform constraint — a service-worker registration (one per origin/install) holds exactly ONE push subscription. The `push_subscriptions` `UNIQUE(endpoint)` upsert (Task 3/Task 6) therefore means that if a DIFFERENT account enables push on the SAME install, it takes over that device's push channel — this is expected, not a bug, and is the correct model for the constraint. The common cases are unaffected: the SAME account across multiple workspaces shares one account-level subscription, and different server origins get physically separate subscriptions (separate service-worker registrations). Optionally add a `shortcut:` comment in `push-subscriptions.ts` noting this when implementing Task 6.
- **Verify-before-use anchors** (grep, don't assume): `IdType` enum members used for ids; `helpers/seed` exports (`createAccount/createWorkspace/createUser/createSpaceNode/createMessageNode` + add `createChannelNode`); how `notifications` is added to the core `SynchronizerMap`; where `WorkspaceService` instantiates its sub-services and its `deviceId` accessor; where `window.colanode` is assembled in `apps/web`; the `Switch` UI primitive path; the chat header settings component (mirror of `channel-settings.tsx`).
- **Message preview**: the Task 8 `preview()` uses `extractBlockTexts(nodeId, attributes.content)` from `@colanode/core` — the same helper `messageModel.extractText` uses (`packages/core/src/registry/nodes/message.ts` / `packages/core/src/lib/texts.ts`) — to produce a real plain-text preview truncated to `PREVIEW_MAX`. Do NOT reintroduce a `JSON.stringify` slice.
- **Ordering**: Tasks 3 and 4 (migrations) must land before Task 2's test runs green and before Tasks 6–8; if using strict sequential execution, create the `push_subscriptions` migration (Task 3) before running Task 2's test. All other tasks are in dependency order.
- **DRY/YAGNI**: no quiet hours, no per-type settings, no Expo/native push, no badges — out of scope per the spec.
