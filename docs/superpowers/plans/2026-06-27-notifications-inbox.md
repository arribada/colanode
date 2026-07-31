# Notifications In-App Inbox — Implementation Plan (Plan 1 of 2)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the in-app notification inbox (the bell) for the Colanode fork — a per-user `notifications` entity produced over the server `eventBus`, synced to every device via the existing synchronizer framework, with a mark-read mutation and a bell + inbox UI.

**Architecture:** A server `NotificationService` subscribes to `eventBus` (`node.created`/`node.updated`), extracts recipients (mentions; DM participants), and writes `notifications` rows whose `revision` is bumped by a Postgres sequence+trigger (mirroring `node_reactions`). A new `notifications` synchronizer streams rows by `revision` to clients, which persist them to the local workspace SQLite DB and render the bell/inbox via live queries. Mark-read is a client mutation mirroring `node.interaction.seen`. Push delivery is **Plan 2** (separate).

**Tech Stack:** TypeScript monorepo; server: Fastify + Kysely + Postgres + BullMQ + Redis eventBus; core: typed `SynchronizerMap`/`MutationMap`; client: Kysely-on-SQLite local DB + mediator + TanStack-Query live queries; UI: shared `@colanode/ui` (React) rendered on web/desktop/mobile-webview. Tests: Vitest 4 (server uses Testcontainers Postgres+Redis).

## Global Constraints

- **v1a scope:** only `mention` and `direct_message` notification types. `task_assigned`/`task_status` are deferred to a follow-up producer after the Tasks module lands (Plan 1b). Push (web-push/Expo), settings UI, and quiet hours are **Plan 2**.
- **`revision` is owned by Postgres** (sequence default + `BEFORE UPDATE` trigger). Never insert/update `revision` from app code. Schema type: `ColumnType<string, never, never>`.
- **Reuse, do not modify:** `extractBlocksMentions` (`packages/core/src/lib/mentions.ts`), `eventBus`, `socket-service`, `node-interactions` (read-state — untouched).
- **Notifications are workspace-level, per recipient user** — the synchronizer streams `WHERE user_id = <connected user> AND revision > cursor`; it is NOT per-root. Client registers it as a workspace-level singleton (mirror `userSynchronizer`/`collaborationSynchronizer`), cursorKey `notifications`.
- **Permission:** only create a notification for a user who has ≥`viewer` role on the node's root (use `extractNodeRole` + `hasNodeRole`).
- **Dedup:** do not create a new notification if an **unread** one with the same `(user_id, type, source_node_id)` already exists.
- **Test commands:** server `cd apps/server && npx vitest run <file>`; core `cd packages/core && npx vitest run`; ui `cd packages/ui && npx vitest run <file>`.
- **Commit style:** `feat(notifications): <what>` per task.

---

## File Structure

**core** (`packages/core/src`)
- Create `synchronizers/node-notifications.ts` — `SyncNotificationsInput`/`SyncNotificationData` + `SynchronizerMap` augmentation. Export from `synchronizers/index.ts`.
- Modify `types/mutations.ts` — add `notification.read` mutation schema to the discriminated union.

**server** (`apps/server/src`)
- Create `data/migrations/00020-create-notifications-table.ts` (number = next free; verify against `migrations/index.ts`). Register in `data/migrations/index.ts`.
- Modify `data/schema.ts` — `NotificationTable` + `notifications` in `DatabaseSchema`.
- Modify `types/events.ts` — `NotificationCreatedEvent`, `NotificationUpdatedEvent` in the `Event` union.
- Create `lib/notifications.ts` — `createNotification`, `markNotificationRead`.
- Create `services/notification-service.ts` — `NotificationService` (eventBus subscriber/producer), singleton `notificationService`. Wire `init()` in `index.ts`.
- Create `synchronizers/notifications.ts` — `NotificationSynchronizer`. Add branch in `services/socket-connection.ts buildSynchronizer`.
- Modify `api/client/routes/workspaces/mutations/mutations-sync.ts` — `notification.read` arm.

**client** (`packages/client/src`)
- Create `databases/workspace/migrations/00021-create-notifications-table.ts` (number = next free; verify `migrations/index.ts`). Register there.
- Modify `databases/workspace/schema.ts` — `NotificationTable` + `notifications` in `WorkspaceDatabaseSchema`.
- Modify `types/events.ts` — `NotificationCreatedEvent`, `NotificationReadEvent` in `Event` union.
- Create `services/workspaces/notification-service.ts` — `NotificationService` (`syncServerNotification`, `markAsRead`). Register in `services/workspaces/workspace-service.ts` + `sync-service.ts`.
- Create `mutations/notifications/notification-read.ts` + `handlers/mutations/notifications/notification-read.ts`. Register in `mutations/index.ts` + `handlers/mutations/index.ts`. Add consolidation arm in `services/workspaces/mutation-service.ts`.
- Create `queries/notifications/notification-list.ts` + `notification-unread-count.ts` + handlers under `handlers/queries/notifications/`. Register in `queries/index.ts` + `handlers/queries/index.ts`.

**ui** (`packages/ui/src`)
- Modify `components/layouts/sidebars/sidebar-menu.tsx` — add `Bell` icon → `'inbox'`.
- Modify `packages/client/src/types/workspaces.ts` — widen `SidebarMenuType` with `'inbox'`.
- Create `components/inbox/inbox-panel.tsx` — inbox list via `useLiveQuery`.

---

## Task 1: Server `notifications` table migration + schema

**Files:**
- Create: `apps/server/src/data/migrations/00020-create-notifications-table.ts`
- Modify: `apps/server/src/data/migrations/index.ts`
- Modify: `apps/server/src/data/schema.ts`
- Test: `apps/server/test/migrations/notifications-table.test.ts`

**Interfaces:**
- Produces: table `notifications(id, user_id, workspace_id, root_id, type, source_node_id, actor_id, preview jsonb, created_at, read_at, revision)`; `NotificationTable` Kysely interface + `SelectNotification`/`CreateNotification`/`UpdateNotification`.

- [ ] **Step 1: Confirm the next migration number.** Run `ls apps/server/src/data/migrations | sort | tail -3`. Use the next free `000NN` (the plan assumes `00020`; adjust the filename + index key if taken).

- [ ] **Step 2: Write the migration** `apps/server/src/data/migrations/00020-create-notifications-table.ts`:

```ts
import { sql, Migration } from 'kysely';

export const createNotificationsTable: Migration = {
  up: async (db) => {
    await sql`
      CREATE SEQUENCE IF NOT EXISTS notifications_revision_sequence
      START WITH 1000000000 INCREMENT BY 1 NO MINVALUE NO MAXVALUE CACHE 1;
    `.execute(db);

    await db.schema
      .createTable('notifications')
      .addColumn('id', 'varchar(30)', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('workspace_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('root_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('type', 'varchar(30)', (col) => col.notNull())
      .addColumn('source_node_id', 'varchar(30)', (col) => col.notNull())
      .addColumn('actor_id', 'varchar(30)')
      .addColumn('preview', 'jsonb', (col) => col.notNull().defaultTo(sql`'{}'::jsonb`))
      .addColumn('created_at', 'timestamptz', (col) => col.notNull())
      .addColumn('read_at', 'timestamptz')
      .addColumn('revision', 'bigint', (col) =>
        col.notNull().defaultTo(sql`nextval('notifications_revision_sequence')`)
      )
      .execute();

    await db.schema
      .createIndex('notifications_user_id_revision_idx')
      .on('notifications').columns(['user_id', 'revision']).execute();

    await db.schema
      .createIndex('notifications_user_id_read_at_idx')
      .on('notifications').columns(['user_id', 'read_at']).execute();

    await db.schema
      .createIndex('notifications_dedup_idx')
      .on('notifications').columns(['user_id', 'type', 'source_node_id']).execute();

    await sql`
      CREATE OR REPLACE FUNCTION update_notification_revision() RETURNS TRIGGER AS $$
      BEGIN
        NEW.revision = nextval('notifications_revision_sequence');
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql;

      CREATE TRIGGER trg_update_notification_revision
      BEFORE UPDATE ON notifications
      FOR EACH ROW EXECUTE FUNCTION update_notification_revision();
    `.execute(db);
  },
  down: async (db) => {
    await sql`
      DROP TRIGGER IF EXISTS trg_update_notification_revision ON notifications;
      DROP FUNCTION IF EXISTS update_notification_revision();
    `.execute(db);
    await db.schema.dropTable('notifications').execute();
    await sql`DROP SEQUENCE IF EXISTS notifications_revision_sequence`.execute(db);
  },
};
```

- [ ] **Step 3: Register the migration** in `apps/server/src/data/migrations/index.ts` — add the import and a map entry keyed with underscores (mirror existing entries):

```ts
import { createNotificationsTable } from './00020-create-notifications-table';
// ...inside databaseMigrations:
'00020_create_notifications_table': createNotificationsTable,
```

- [ ] **Step 4: Add Kysely types** to `apps/server/src/data/schema.ts` — add near `NodeReactionTable`:

```ts
import { ColumnType, Selectable, Insertable, Updateable } from 'kysely'; // already imported

interface NotificationTable {
  id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  type: ColumnType<string, string, never>;
  source_node_id: ColumnType<string, string, never>;
  actor_id: ColumnType<string | null, string | null, never>;
  preview: ColumnType<Record<string, unknown>, Record<string, unknown>, never>;
  created_at: ColumnType<Date, Date, never>;
  read_at: ColumnType<Date | null, Date | null, Date | null>;
  revision: ColumnType<string, never, never>;
}
export type SelectNotification = Selectable<NotificationTable>;
export type CreateNotification = Insertable<NotificationTable>;
export type UpdateNotification = Updateable<NotificationTable>;
```

And register it in the `DatabaseSchema` interface:

```ts
export interface DatabaseSchema {
  // ...existing...
  notifications: NotificationTable;
}
```

- [ ] **Step 5: Write the failing test** `apps/server/test/migrations/notifications-table.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { database } from '@colanode/server/data/database';
import { generateId, IdType } from '@colanode/core';

describe('notifications table', () => {
  it('inserts a row and auto-assigns a revision; UPDATE bumps it', async () => {
    const id = generateId(IdType.Notification ?? IdType.Node);
    const userId = generateId(IdType.User);
    const inserted = await database
      .insertInto('notifications')
      .returningAll()
      .values({
        id,
        user_id: userId,
        workspace_id: generateId(IdType.Workspace),
        root_id: generateId(IdType.Space),
        type: 'mention',
        source_node_id: generateId(IdType.Message ?? IdType.Node),
        actor_id: generateId(IdType.User),
        preview: {},
        created_at: new Date(),
        read_at: null,
      })
      .executeTakeFirstOrThrow();
    expect(BigInt(inserted.revision)).toBeGreaterThan(0n);

    const updated = await database
      .updateTable('notifications')
      .returningAll()
      .set({ read_at: new Date() })
      .where('id', '=', id)
      .executeTakeFirstOrThrow();
    expect(BigInt(updated.revision)).toBeGreaterThan(BigInt(inserted.revision));
  });
});
```

> Note: if `IdType.Notification` does not exist, add it to `packages/core/src/lib/id.ts` (mirror an existing entry, e.g. `Notification = 'notif'`) as Step 5a, then use `IdType.Notification`.

- [ ] **Step 6: Run the test (fails — table missing until migrate runs in global-setup; if it errors on the enum, fix Step 5a first):**

Run: `cd apps/server && npx vitest run test/migrations/notifications-table.test.ts`
Expected: PASS once migration is registered (global-setup runs `migrate()`); if FAIL on missing `notifications` relation, re-check Steps 2–3.

- [ ] **Step 7: Commit**

```bash
git add apps/server/src/data/migrations/00020-create-notifications-table.ts apps/server/src/data/migrations/index.ts apps/server/src/data/schema.ts apps/server/test/migrations/notifications-table.test.ts packages/core/src/lib/id.ts
git commit -m "feat(notifications): server notifications table + schema"
```

---

## Task 2: Core synchronizer type + events + mutation type

**Files:**
- Create: `packages/core/src/synchronizers/node-notifications.ts`
- Modify: `packages/core/src/synchronizers/index.ts`
- Modify: `packages/core/src/types/mutations.ts`
- Modify (server): `apps/server/src/types/events.ts`
- Test: `packages/core/src/synchronizers/node-notifications.test.ts`

**Interfaces:**
- Produces: `SyncNotificationData` (the wire shape used by both server synchronizer and client consumer); `NotificationReadMutation`; server events `notification.created`/`notification.updated`.

- [ ] **Step 1: Create the synchronizer type** `packages/core/src/synchronizers/node-notifications.ts`:

```ts
export type SyncNotificationsInput = {
  type: 'notifications';
};

export type SyncNotificationData = {
  id: string;
  userId: string;
  workspaceId: string;
  rootId: string;
  notificationType: 'mention' | 'direct_message' | 'task_assigned' | 'task_status';
  sourceNodeId: string;
  actorId: string | null;
  preview: Record<string, unknown>;
  createdAt: string;
  readAt: string | null;
  revision: string;
};

declare module '@colanode/core' {
  interface SynchronizerMap {
    notifications: {
      input: SyncNotificationsInput;
      data: SyncNotificationData;
    };
  }
}
```

- [ ] **Step 2: Export it** — add to `packages/core/src/synchronizers/index.ts`:

```ts
export * from './node-notifications';
```

- [ ] **Step 3: Add the mark-read mutation** to `packages/core/src/types/mutations.ts` (mirror `nodeInteractionSeenMutation*`):

```ts
export const notificationReadMutationDataSchema = z.object({
  notificationId: z.string(),
  readAt: z.string(),
});
export const notificationReadMutationSchema = mutationBaseSchema.extend({
  type: z.literal('notification.read'),
  data: notificationReadMutationDataSchema,
});
export type NotificationReadMutation = z.infer<typeof notificationReadMutationSchema>;
```

Add `notificationReadMutationSchema` to the `mutationSchema = z.discriminatedUnion('type', [ ... ])` array.

- [ ] **Step 4: Add server events** to `apps/server/src/types/events.ts` — define and add to the `Event` union:

```ts
export type NotificationCreatedEvent = {
  type: 'notification.created';
  notificationId: string;
  userId: string;
  workspaceId: string;
};
export type NotificationUpdatedEvent = {
  type: 'notification.updated';
  notificationId: string;
  userId: string;
  workspaceId: string;
};
// add to: export type Event = ... | NotificationCreatedEvent | NotificationUpdatedEvent;
```

- [ ] **Step 5: Write a failing type/shape test** `packages/core/src/synchronizers/node-notifications.test.ts`:

```ts
import { describe, expect, it } from 'vitest';
import { notificationReadMutationSchema } from '@colanode/core';

describe('notification.read mutation schema', () => {
  it('parses a valid mark-read mutation', () => {
    const parsed = notificationReadMutationSchema.parse({
      id: 'mut1',
      createdAt: new Date().toISOString(),
      type: 'notification.read',
      data: { notificationId: 'notif1', readAt: new Date().toISOString() },
    });
    expect(parsed.data.notificationId).toBe('notif1');
  });
});
```

- [ ] **Step 6: Run (fails first, then passes after Step 3 export is wired through the package index):**

Run: `cd packages/core && npx vitest run src/synchronizers/node-notifications.test.ts`
Expected: PASS (ensure `notificationReadMutationSchema` is exported from the package root — check `packages/core/src/index.ts` re-exports `types/mutations`).

- [ ] **Step 7: Commit**

```bash
git add packages/core/src/synchronizers/node-notifications.ts packages/core/src/synchronizers/index.ts packages/core/src/types/mutations.ts packages/core/src/synchronizers/node-notifications.test.ts apps/server/src/types/events.ts
git commit -m "feat(notifications): core sync type, read mutation, server events"
```

---

## Task 3: Server notification lib (`createNotification`, `markNotificationRead`)

**Files:**
- Create: `apps/server/src/lib/notifications.ts`
- Test: `apps/server/test/lib/notifications.test.ts`

**Interfaces:**
- Produces:
  - `createNotification(input: { userId, workspaceId, rootId, type, sourceNodeId, actorId, preview }): Promise<SelectNotification | null>` — dedups against unread same-`(user,type,source)`; publishes `notification.created`.
  - `markNotificationRead(workspace: WorkspaceContext, mutation: NotificationReadMutation): Promise<MutationStatus>` — sets `read_at`, publishes `notification.updated`.

- [ ] **Step 1: Write the failing test** `apps/server/test/lib/notifications.test.ts` (mirror `node-interactions`/seed helpers):

```ts
import { describe, expect, it } from 'vitest';
import { database } from '@colanode/server/data/database';
import { createNotification, markNotificationRead } from '@colanode/server/lib/notifications';
import { createAccount, createWorkspace, createUser } from '../helpers/seed';
import { generateId, IdType, MutationStatus } from '@colanode/core';

describe('notifications lib', () => {
  it('creates one notification and dedups a second unread for the same source', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace(account);
    const user = await createUser(workspace, 'collaborator');
    const rootId = generateId(IdType.Space);
    const sourceNodeId = generateId(IdType.Message);

    const first = await createNotification({
      userId: user.id, workspaceId: workspace.id, rootId,
      type: 'mention', sourceNodeId, actorId: generateId(IdType.User), preview: {},
    });
    const second = await createNotification({
      userId: user.id, workspaceId: workspace.id, rootId,
      type: 'mention', sourceNodeId, actorId: generateId(IdType.User), preview: {},
    });
    expect(first).not.toBeNull();
    expect(second).toBeNull();

    const rows = await database.selectFrom('notifications').selectAll()
      .where('user_id', '=', user.id).execute();
    expect(rows).toHaveLength(1);
  });

  it('marks a notification read', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace(account);
    const user = await createUser(workspace, 'collaborator');
    const created = await createNotification({
      userId: user.id, workspaceId: workspace.id, rootId: generateId(IdType.Space),
      type: 'direct_message', sourceNodeId: generateId(IdType.Message), actorId: null, preview: {},
    });
    const status = await markNotificationRead(
      { user: { id: user.id }, workspace: { id: workspace.id } } as never,
      { id: 'm1', createdAt: new Date().toISOString(), type: 'notification.read',
        data: { notificationId: created!.id, readAt: new Date().toISOString() } }
    );
    expect(status).toBe(MutationStatus.OK);
    const row = await database.selectFrom('notifications').selectAll()
      .where('id', '=', created!.id).executeTakeFirstOrThrow();
    expect(row.read_at).not.toBeNull();
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/server && npx vitest run test/lib/notifications.test.ts`
Expected: FAIL — `createNotification` not found.

- [ ] **Step 3: Implement** `apps/server/src/lib/notifications.ts`:

```ts
import { MutationStatus, NotificationReadMutation, generateId, IdType } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { SelectNotification } from '@colanode/server/data/schema';
import { WorkspaceContext } from '@colanode/server/types/api';

type CreateNotificationInput = {
  userId: string;
  workspaceId: string;
  rootId: string;
  type: 'mention' | 'direct_message' | 'task_assigned' | 'task_status';
  sourceNodeId: string;
  actorId: string | null;
  preview: Record<string, unknown>;
};

export const createNotification = async (
  input: CreateNotificationInput
): Promise<SelectNotification | null> => {
  const existing = await database
    .selectFrom('notifications')
    .select(['id'])
    .where('user_id', '=', input.userId)
    .where('type', '=', input.type)
    .where('source_node_id', '=', input.sourceNodeId)
    .where('read_at', 'is', null)
    .executeTakeFirst();
  if (existing) {
    return null;
  }

  const created = await database
    .insertInto('notifications')
    .returningAll()
    .values({
      id: generateId(IdType.Notification),
      user_id: input.userId,
      workspace_id: input.workspaceId,
      root_id: input.rootId,
      type: input.type,
      source_node_id: input.sourceNodeId,
      actor_id: input.actorId,
      preview: input.preview,
      created_at: new Date(),
      read_at: null,
    })
    .executeTakeFirst();
  if (!created) {
    return null;
  }

  eventBus.publish({
    type: 'notification.created',
    notificationId: created.id,
    userId: created.user_id,
    workspaceId: created.workspace_id,
  });
  return created;
};

export const markNotificationRead = async (
  workspace: WorkspaceContext,
  mutation: NotificationReadMutation
): Promise<MutationStatus> => {
  const notification = await database
    .selectFrom('notifications')
    .selectAll()
    .where('id', '=', mutation.data.notificationId)
    .where('user_id', '=', workspace.user.id)
    .executeTakeFirst();
  if (!notification) {
    return MutationStatus.NOT_FOUND;
  }
  if (notification.read_at !== null) {
    return MutationStatus.OK;
  }
  const updated = await database
    .updateTable('notifications')
    .returningAll()
    .set({ read_at: new Date(mutation.data.readAt) })
    .where('id', '=', mutation.data.notificationId)
    .executeTakeFirst();
  if (updated) {
    eventBus.publish({
      type: 'notification.updated',
      notificationId: updated.id,
      userId: updated.user_id,
      workspaceId: updated.workspace_id,
    });
  }
  return MutationStatus.OK;
};
```

> If `WorkspaceContext` shape differs (`workspace.user.id`), match the real type from `apps/server/src/types/api.ts` (the test stub above casts to `never`; align the real signature).

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/server && npx vitest run test/lib/notifications.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/lib/notifications.ts apps/server/test/lib/notifications.test.ts
git commit -m "feat(notifications): server createNotification + markNotificationRead"
```

---

## Task 4: Server producer service (mentions + DM) over eventBus

**Files:**
- Create: `apps/server/src/services/notification-service.ts`
- Modify: `apps/server/src/index.ts` (boot wiring)
- Test: `apps/server/test/services/notification-service.test.ts`

**Interfaces:**
- Consumes: `createNotification` (Task 3), `extractBlocksMentions`, `eventBus`, `mapNode`, `extractNodeRole`/`hasNodeRole`.
- Produces: `notificationService` singleton with `init()` that subscribes to `node.created`/`node.updated`.

- [ ] **Step 1: Write the failing test** `apps/server/test/services/notification-service.test.ts` — create a page node that @mentions a user, publish `node.created`, assert a notification row appears:

```ts
import { describe, expect, it, beforeAll } from 'vitest';
import { database } from '@colanode/server/data/database';
import { notificationService } from '@colanode/server/services/notification-service';
import { eventBus } from '@colanode/server/lib/event-bus';
import { createAccount, createWorkspace, createUser, createSpaceNode, createPageNode } from '../helpers/seed';
import { generateId, IdType } from '@colanode/core';

beforeAll(async () => { await notificationService.init(); });

const waitFor = async (fn: () => Promise<boolean>, ms = 2000) => {
  const start = Date.now();
  while (Date.now() - start < ms) { if (await fn()) return true; await new Promise((r) => setTimeout(r, 50)); }
  return false;
};

describe('NotificationService', () => {
  it('creates a mention notification when a node mentioning a user is created', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace(account);
    const author = await createUser(workspace, 'collaborator');
    const mentioned = await createUser(workspace, 'collaborator');
    const space = await createSpaceNode(workspace, author, [author.id, mentioned.id]);
    // createPageNode must embed a mention block targeting `mentioned.id`
    const page = await createPageNode(workspace, author, space.id, { mentionUserId: mentioned.id });

    eventBus.publish({ type: 'node.created', nodeId: page.id, rootId: space.id, workspaceId: workspace.id });

    const ok = await waitFor(async () => {
      const row = await database.selectFrom('notifications').select(['id'])
        .where('user_id', '=', mentioned.id).where('source_node_id', '=', page.id).executeTakeFirst();
      return !!row;
    });
    expect(ok).toBe(true);
  });
});
```

> If `createPageNode`/`createSpaceNode` seed helpers don't yet accept a mention block / member list, extend them in `apps/server/test/helpers/seed.ts` as Step 1a (mirror existing `buildCreateNodeMutation`, inserting a `mention` leaf `{ type:'mention', attrs:{ target:'user', id: mentionUserId } }` into the node's content blocks).

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/server && npx vitest run test/services/notification-service.test.ts`
Expected: FAIL — `notificationService` not found.

- [ ] **Step 3: Implement** `apps/server/src/services/notification-service.ts`:

```ts
import { extractBlocksMentions, extractNodeRole, hasNodeRole } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { mapNode } from '@colanode/server/lib/nodes';
import { createNotification } from '@colanode/server/lib/notifications';
import { Event } from '@colanode/server/types/events';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('notification-service');

class NotificationService {
  private subscriptionId: string | null = null;

  public async init() {
    if (this.subscriptionId) return;
    this.subscriptionId = eventBus.subscribe((event) => {
      void this.handleEvent(event).catch((e) => logger.error(e, 'notification handler failed'));
    });
  }

  private async handleEvent(event: Event) {
    if (event.type !== 'node.created' && event.type !== 'node.updated') return;

    const row = await database.selectFrom('nodes').selectAll()
      .where('id', '=', event.nodeId).executeTakeFirst();
    if (!row) return;
    const node = mapNode(row);

    const rootRow = await database.selectFrom('nodes').selectAll()
      .where('id', '=', event.rootId).executeTakeFirst();
    if (!rootRow) return;
    const root = mapNode(rootRow);

    const actorId = (row as { created_by?: string }).created_by ?? null;

    // mentions: extract mention targets from node content blocks
    const blocks = (node.attributes as { content?: Record<string, unknown> }).content ?? null;
    const mentions = extractBlocksMentions(node.id, blocks as never);
    for (const mention of mentions) {
      if (mention.target !== 'user') continue;
      if (mention.id === actorId) continue;
      const role = extractNodeRole(root, mention.id);
      if (!role || !hasNodeRole(role, 'viewer')) continue;
      await createNotification({
        userId: mention.id, workspaceId: event.workspaceId, rootId: event.rootId,
        type: 'mention', sourceNodeId: node.id, actorId, preview: { actorId },
      });
    }

    // direct messages: a message node in a chat -> notify other chat members
    if (event.type === 'node.created' && node.type === 'message' && root.type === 'chat') {
      const collaborators = Object.keys((root.attributes as { collaborators?: Record<string, string> }).collaborators ?? {});
      for (const userId of collaborators) {
        if (userId === actorId) continue;
        await createNotification({
          userId, workspaceId: event.workspaceId, rootId: event.rootId,
          type: 'direct_message', sourceNodeId: node.id, actorId, preview: { actorId },
        });
      }
    }
  }
}

export const notificationService = new NotificationService();
```

> Adjust the two attribute-shape reads (`attributes.content`, `root.attributes.collaborators`, node/root `type`) to the real node attribute shapes in `packages/core/src/registry/nodes/{message,chat,page,record}.ts`. These are the only spots needing shape-matching; the control flow is final.

- [ ] **Step 4: Wire boot** — in `apps/server/src/index.ts` `init()`, after `eventBus.init()`:

```ts
import { notificationService } from '@colanode/server/services/notification-service';
// ...
  await eventBus.init();
  await notificationService.init();
```

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/server && npx vitest run test/services/notification-service.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/services/notification-service.ts apps/server/src/index.ts apps/server/test/services/notification-service.test.ts apps/server/test/helpers/seed.ts
git commit -m "feat(notifications): server producer for mentions + DMs"
```

---

## Task 5: Server synchronizer + dispatch

**Files:**
- Create: `apps/server/src/synchronizers/notifications.ts`
- Modify: `apps/server/src/services/socket-connection.ts` (`buildSynchronizer`)
- Test: `apps/server/test/synchronizers/notifications.test.ts`

**Interfaces:**
- Consumes: `BaseSynchronizer`, `SyncNotificationData`, `Event`.
- Produces: `NotificationSynchronizer` streaming `notifications WHERE user_id = user.userId AND revision > cursor`, waking on `notification.created`/`notification.updated` for this user.

- [ ] **Step 1: Write the failing test** `apps/server/test/synchronizers/notifications.test.ts` (mirror `node-updates.test.ts`): insert two notification rows for a user, instantiate the synchronizer with cursor `'0'`, assert two items in revision order; re-run with the first revision as cursor, assert only the second returns.

```ts
import { describe, expect, it } from 'vitest';
import { database } from '@colanode/server/data/database';
import { NotificationSynchronizer } from '@colanode/server/synchronizers/notifications';
import { generateId, IdType } from '@colanode/core';

const insertNotif = (userId: string) =>
  database.insertInto('notifications').returningAll().values({
    id: generateId(IdType.Notification), user_id: userId,
    workspace_id: generateId(IdType.Workspace), root_id: generateId(IdType.Space),
    type: 'mention', source_node_id: generateId(IdType.Message), actor_id: null,
    preview: {}, created_at: new Date(), read_at: null,
  }).executeTakeFirstOrThrow();

describe('NotificationSynchronizer', () => {
  it('streams notifications in revision order after the cursor', async () => {
    const userId = generateId(IdType.User);
    const first = await insertNotif(userId);
    const second = await insertNotif(userId);

    const user = { userId, workspaceId: first.workspace_id, accountId: generateId(IdType.Account), deviceId: generateId(IdType.Device) };
    const all = await new NotificationSynchronizer('s1', user, { type: 'notifications' }, '0').fetchData();
    expect(all?.items).toHaveLength(2);

    const rest = await new NotificationSynchronizer('s2', user, { type: 'notifications' }, first.revision).fetchData();
    expect(rest?.items).toHaveLength(1);
    expect(rest?.items[0]?.data.id).toBe(second.id);
  });
});
```

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/server && npx vitest run test/synchronizers/notifications.test.ts`
Expected: FAIL — module not found.

- [ ] **Step 3: Implement** `apps/server/src/synchronizers/notifications.ts` (mirror `node-reactions.ts` synchronizer; map DB rows → `SyncNotificationData`):

```ts
import { SyncNotificationData, SynchronizerOutputMessage } from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { BaseSynchronizer } from '@colanode/server/synchronizers/base';
import { Event } from '@colanode/server/types/events';
import { SelectNotification } from '@colanode/server/data/schema';
import { createLogger } from '@colanode/server/lib/logger';

const logger = createLogger('notifications-synchronizer');

export class NotificationSynchronizer extends BaseSynchronizer<{ type: 'notifications' }> {
  public async fetchData(): Promise<SynchronizerOutputMessage<{ type: 'notifications' }> | null> {
    const rows = await this.fetchNotifications();
    if (rows.length === 0) return null;
    return this.buildMessage(rows);
  }

  public async fetchDataFromEvent(event: Event): Promise<SynchronizerOutputMessage<{ type: 'notifications' }> | null> {
    if (!this.shouldFetch(event)) return null;
    const rows = await this.fetchNotifications();
    if (rows.length === 0) return null;
    return this.buildMessage(rows);
  }

  private async fetchNotifications(): Promise<SelectNotification[]> {
    try {
      return await database
        .selectFrom('notifications')
        .selectAll()
        .where('user_id', '=', this.user.userId)
        .where('revision', '>', this.cursor)
        .orderBy('revision', 'asc')
        .limit(100)
        .execute();
    } catch (error) {
      logger.error(error, 'Error fetching notifications for sync');
      return [];
    }
  }

  private buildMessage(rows: SelectNotification[]): SynchronizerOutputMessage<{ type: 'notifications' }> {
    return {
      type: 'synchronizer.output',
      userId: this.user.userId,
      id: this.id,
      items: rows.map((row) => ({
        cursor: row.revision,
        data: {
          id: row.id,
          userId: row.user_id,
          workspaceId: row.workspace_id,
          rootId: row.root_id,
          notificationType: row.type as SyncNotificationData['notificationType'],
          sourceNodeId: row.source_node_id,
          actorId: row.actor_id,
          preview: row.preview,
          createdAt: row.created_at.toISOString(),
          readAt: row.read_at ? row.read_at.toISOString() : null,
          revision: row.revision,
        },
      })),
    };
  }

  private shouldFetch(event: Event): boolean {
    return (
      (event.type === 'notification.created' || event.type === 'notification.updated') &&
      event.userId === this.user.userId
    );
  }
}
```

- [ ] **Step 4: Add dispatch branch** in `apps/server/src/services/socket-connection.ts` `buildSynchronizer` (mirror the `node.reactions` branch):

```ts
} else if (message.input.type === 'notifications') {
  return new NotificationSynchronizer(message.id, user.user, message.input, cursor);
```

Add the import at top: `import { NotificationSynchronizer } from '@colanode/server/synchronizers/notifications';`

- [ ] **Step 5: Run to verify it passes**

Run: `cd apps/server && npx vitest run test/synchronizers/notifications.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add apps/server/src/synchronizers/notifications.ts apps/server/src/services/socket-connection.ts apps/server/test/synchronizers/notifications.test.ts
git commit -m "feat(notifications): server synchronizer + dispatch"
```

---

## Task 6: Server mark-read mutation route

**Files:**
- Modify: `apps/server/src/api/client/routes/workspaces/mutations/mutations-sync.ts`
- Test: `apps/server/test/api/notifications-mutations.test.ts`

**Interfaces:**
- Consumes: `markNotificationRead` (Task 3).

- [ ] **Step 1: Write the failing test** `apps/server/test/api/notifications-mutations.test.ts` (mirror `test/api/mutations.test.ts`): seed a notification, POST a `notification.read` mutation via `app.inject`, assert `MutationStatus.OK` and `read_at` set.

```ts
import { describe, expect, it } from 'vitest';
import { database } from '@colanode/server/data/database';
import { buildTestApp } from '../helpers/app';
import { createAccount, createWorkspace, createUser, buildAuthHeader } from '../helpers/seed';
import { createNotification } from '@colanode/server/lib/notifications';
import { generateId, IdType, MutationStatus } from '@colanode/core';

describe('notification.read mutation route', () => {
  it('marks a notification read', async () => {
    const app = await buildTestApp();
    const account = await createAccount();
    const workspace = await createWorkspace(account);
    const user = await createUser(workspace, 'collaborator');
    const notif = await createNotification({
      userId: user.id, workspaceId: workspace.id, rootId: generateId(IdType.Space),
      type: 'mention', sourceNodeId: generateId(IdType.Message), actorId: null, preview: {},
    });

    const res = await app.inject({
      method: 'POST',
      url: `/client/v1/workspaces/${workspace.id}/mutations`,
      headers: buildAuthHeader(user.token),
      payload: { mutations: [{
        id: generateId(IdType.Mutation), createdAt: new Date().toISOString(),
        type: 'notification.read', data: { notificationId: notif!.id, readAt: new Date().toISOString() },
      }] },
    });
    const body = res.json();
    expect(body.results[0].status).toBe(MutationStatus.OK);
    const row = await database.selectFrom('notifications').selectAll().where('id', '=', notif!.id).executeTakeFirstOrThrow();
    expect(row.read_at).not.toBeNull();
  });
});
```

> Match `user.token`/response shape (`body.results` vs `body`) to the real `mutations.test.ts` and `createUser` return.

- [ ] **Step 2: Run to verify it fails**

Run: `cd apps/server && npx vitest run test/api/notifications-mutations.test.ts`
Expected: FAIL — unknown mutation type.

- [ ] **Step 3: Add the handler arm** in `mutations-sync.ts` `handleMutation` switch (mirror the `node.interaction.seen` arm):

```ts
} else if (mutation.type === 'notification.read') {
  return await markNotificationRead(workspace, mutation);
```

Add import: `import { markNotificationRead } from '@colanode/server/lib/notifications';`

- [ ] **Step 4: Run to verify it passes**

Run: `cd apps/server && npx vitest run test/api/notifications-mutations.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add apps/server/src/api/client/routes/workspaces/mutations/mutations-sync.ts apps/server/test/api/notifications-mutations.test.ts
git commit -m "feat(notifications): server mark-read mutation route"
```

---

## Task 7: Client local DB table + schema

**Files:**
- Create: `packages/client/src/databases/workspace/migrations/00021-create-notifications-table.ts`
- Modify: `packages/client/src/databases/workspace/migrations/index.ts`
- Modify: `packages/client/src/databases/workspace/schema.ts`

**Interfaces:**
- Produces: local `notifications` table + `NotificationTable`/`SelectNotification`/`CreateNotification`/`UpdateNotification`.

- [ ] **Step 1: Confirm next number.** Run `ls packages/client/src/databases/workspace/migrations | sort | tail -3`. Use the next free `000NN` (plan assumes `00021`).

- [ ] **Step 2: Create the migration** `00021-create-notifications-table.ts`:

```ts
import { Migration } from 'kysely';

export const createNotificationsTable: Migration = {
  up: async (db) => {
    await db.schema
      .createTable('notifications')
      .addColumn('id', 'text', (col) => col.notNull().primaryKey())
      .addColumn('user_id', 'text', (col) => col.notNull())
      .addColumn('workspace_id', 'text', (col) => col.notNull())
      .addColumn('root_id', 'text', (col) => col.notNull())
      .addColumn('type', 'text', (col) => col.notNull())
      .addColumn('source_node_id', 'text', (col) => col.notNull())
      .addColumn('actor_id', 'text')
      .addColumn('preview', 'text', (col) => col.notNull().defaultTo('{}'))
      .addColumn('created_at', 'text', (col) => col.notNull())
      .addColumn('read_at', 'text')
      .addColumn('revision', 'text', (col) => col.notNull())
      .execute();
    await db.schema.createIndex('notifications_read_at_idx').on('notifications').column('read_at').execute();
  },
  down: async (db) => {
    await db.schema.dropTable('notifications').execute();
  },
};
```

- [ ] **Step 3: Register** in `migrations/index.ts` (ordered `workspaceDatabaseMigrations` map) — import + `'00021_create_notifications_table': createNotificationsTable,` (match the existing key style).

- [ ] **Step 4: Add Kysely types** in `databases/workspace/schema.ts` (mirror `NodeReactionTable`) and register in `WorkspaceDatabaseSchema`:

```ts
interface NotificationTable {
  id: ColumnType<string, string, never>;
  user_id: ColumnType<string, string, never>;
  workspace_id: ColumnType<string, string, never>;
  root_id: ColumnType<string, string, never>;
  type: ColumnType<string, string, never>;
  source_node_id: ColumnType<string, string, never>;
  actor_id: ColumnType<string | null, string | null, never>;
  preview: ColumnType<string, string, string>;
  created_at: ColumnType<string, string, never>;
  read_at: ColumnType<string | null, string | null, string | null>;
  revision: ColumnType<string, string, string>;
}
export type SelectNotification = Selectable<NotificationTable>;
export type CreateNotification = Insertable<NotificationTable>;
export type UpdateNotification = Updateable<NotificationTable>;
// in WorkspaceDatabaseSchema: notifications: NotificationTable;
```

- [ ] **Step 5: Commit** (no standalone test — exercised by Tasks 8–9):

```bash
git add packages/client/src/databases/workspace/migrations/00021-create-notifications-table.ts packages/client/src/databases/workspace/migrations/index.ts packages/client/src/databases/workspace/schema.ts
git commit -m "feat(notifications): client local notifications table"
```

---

## Task 8: Client sync consumer service + registration

**Files:**
- Create: `packages/client/src/services/workspaces/notification-service.ts`
- Modify: `packages/client/src/services/workspaces/workspace-service.ts`
- Modify: `packages/client/src/services/workspaces/sync-service.ts`
- Modify: `packages/client/src/types/events.ts`

**Interfaces:**
- Consumes: `SyncNotificationData`.
- Produces: `workspace.notifications.syncServerNotification(data)`; a workspace-level `notifications` synchronizer (cursorKey `notifications`); client events `notification.created`/`notification.updated`.

- [ ] **Step 1: Add client events** in `packages/client/src/types/events.ts` (mirror `NodeReactionCreatedEvent`) and add both to the `Event` union:

```ts
export type NotificationCreatedEvent = { type: 'notification.created'; workspace: WorkspaceEventData; notificationId: string };
export type NotificationReadEvent = { type: 'notification.read'; workspace: WorkspaceEventData; notificationId: string };
```

- [ ] **Step 2: Implement the service** `packages/client/src/services/workspaces/notification-service.ts` (mirror `node-reaction-service.ts syncServerNodeReaction` insert/update-by-revision + the seen-handler's local-write-plus-`mutations`-row pattern for `markAsRead`):

```ts
import { SyncNotificationData, generateId, IdType, NotificationReadMutation } from '@colanode/core';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import { eventBus } from '@colanode/client/lib/event-bus';

export class NotificationService {
  constructor(private readonly workspace: WorkspaceService) {}

  public async syncServerNotification(data: SyncNotificationData) {
    const existing = await this.workspace.database
      .selectFrom('notifications').select(['id', 'revision'])
      .where('id', '=', data.id).executeTakeFirst();

    if (existing) {
      if (existing.revision === data.revision) return;
      await this.workspace.database.updateTable('notifications')
        .set({ read_at: data.readAt, revision: data.revision })
        .where('id', '=', data.id).execute();
      eventBus.publish({ type: 'notification.read', workspace: this.workspace.eventData, notificationId: data.id });
      return;
    }

    await this.workspace.database.insertInto('notifications').values({
      id: data.id, user_id: data.userId, workspace_id: data.workspaceId, root_id: data.rootId,
      type: data.notificationType, source_node_id: data.sourceNodeId, actor_id: data.actorId,
      preview: JSON.stringify(data.preview), created_at: data.createdAt, read_at: data.readAt, revision: data.revision,
    }).onConflict((b) => b.column('id').doUpdateSet({ revision: data.revision, read_at: data.readAt })).execute();

    eventBus.publish({ type: 'notification.created', workspace: this.workspace.eventData, notificationId: data.id });
  }

  public async markAsRead(notificationId: string) {
    const now = new Date().toISOString();
    await this.workspace.database.transaction().execute(async (trx) => {
      await trx.updateTable('notifications').set({ read_at: now })
        .where('id', '=', notificationId).where('read_at', 'is', null).execute();
      const mutation: NotificationReadMutation = {
        id: generateId(IdType.Mutation), createdAt: now, type: 'notification.read',
        data: { notificationId, readAt: now },
      };
      await trx.insertInto('mutations').values({
        id: mutation.id, type: mutation.type, data: JSON.stringify(mutation.data), created_at: mutation.createdAt, retries: 0,
      }).execute();
    });
    this.workspace.mutations.scheduleSync();
    eventBus.publish({ type: 'notification.read', workspace: this.workspace.eventData, notificationId });
  }
}
```

> Match `this.workspace.eventData` / `WorkspaceEventData` to the real accessor used by `node-reaction-service.ts` (it builds `workspace: { ... }` inline — copy that exact expression).

- [ ] **Step 3: Register the service** in `workspace-service.ts` — add `public readonly notifications: NotificationService;` and `this.notifications = new NotificationService(this);` (mirror `nodeReactions`).

- [ ] **Step 4: Register the synchronizer** in `sync-service.ts` — add to `SyncHandlers`, bind in `syncHandlers` (`notifications: this.workspace.notifications.syncServerNotification.bind(this.workspace.notifications)`), and instantiate as a **workspace-level singleton** in `init()` (mirror `userSynchronizer`):

```ts
this.notificationSynchronizer = new Synchronizer(
  this.workspace,
  { type: 'notifications' },
  'notifications',
  this.syncHandlers.notifications
);
```

Add a matching field + teardown in `destroy()`.

- [ ] **Step 5: Write a failing test** `apps/web/test/notification-sync.test.ts` (or `packages/client-node/test/...`, wherever a bootable client test exists) that boots a workspace DB, calls `workspace.notifications.syncServerNotification(sample)`, and asserts a local row exists; then `markAsRead` and assert a `mutations` row exists.

> If no bootable client test harness exists yet for workspace services, defer this assertion to the MCP-driven smoke in Task 10's manual verification and keep Step 5 as a pure mapping unit test in `packages/ui/src/lib` instead.

- [ ] **Step 6: Run + Commit**

```bash
cd packages/client && npx vitest run --passWithNoTests
git add packages/client/src/services/workspaces/notification-service.ts packages/client/src/services/workspaces/workspace-service.ts packages/client/src/services/workspaces/sync-service.ts packages/client/src/types/events.ts
git commit -m "feat(notifications): client sync consumer + mark-read"
```

---

## Task 9: Client mutation handler + list/unread queries

**Files:**
- Create: `packages/client/src/mutations/notifications/notification-read.ts`
- Create: `packages/client/src/handlers/mutations/notifications/notification-read.ts`
- Modify: `packages/client/src/mutations/index.ts`, `packages/client/src/handlers/mutations/index.ts`
- Modify: `packages/client/src/services/workspaces/mutation-service.ts` (consolidation arm)
- Create: `packages/client/src/queries/notifications/notification-list.ts`, `notification-unread-count.ts`
- Create: `packages/client/src/handlers/queries/notifications/notification-list.ts`, `notification-unread-count.ts`
- Modify: `packages/client/src/queries/index.ts`, `packages/client/src/handlers/queries/index.ts`

**Interfaces:**
- Produces: mutation `notification.read` (UI command → `workspace.notifications.markAsRead`); queries `notification.list` → `SelectNotification[]`, `notification.unread-count` → `number`, both live (re-run on `notification.created`/`notification.read`).

- [ ] **Step 1: Mutation command type** `mutations/notifications/notification-read.ts` (mirror `node-reaction-create.ts`):

```ts
export type NotificationReadMutationInput = { type: 'notification.read'; userId: string; notificationId: string };
export type NotificationReadMutationOutput = { success: boolean };
declare module '@colanode/client/mutations' {
  interface MutationMap { 'notification.read': { input: NotificationReadMutationInput; output: NotificationReadMutationOutput } }
}
```
Export from `mutations/index.ts`.

- [ ] **Step 2: Mutation handler** `handlers/mutations/notifications/notification-read.ts` (thin, delegates to the service — mirror `node-reaction-create.ts` handler):

```ts
import { MutationHandler } from '@colanode/client/handlers';
import { NotificationReadMutationInput, NotificationReadMutationOutput } from '@colanode/client/mutations';
import { AppService } from '@colanode/client/services';

export class NotificationReadMutationHandler implements MutationHandler<NotificationReadMutationInput> {
  constructor(private readonly app: AppService) {}
  async handleMutation(input: NotificationReadMutationInput): Promise<NotificationReadMutationOutput> {
    const workspace = this.app.getWorkspace(input.userId);
    await workspace.notifications.markAsRead(input.notificationId);
    return { success: true };
  }
}
```
Register `'notification.read': new NotificationReadMutationHandler(app)` in `handlers/mutations/index.ts` (+ import). Match `this.app.getWorkspace(...)` to the real accessor used by the seen handler.

- [ ] **Step 3: Consolidation arm** in `mutation-service.ts consolidateMutations` — add a `notification.read` case that collapses repeated reads of the same `notificationId` to the latest (mirror the `node.interaction.seen` arm).

- [ ] **Step 4: List + unread queries** `queries/notifications/notification-list.ts` and `notification-unread-count.ts` (mirror `node-reaction-list.ts` query type + `MutationMap`-style `QueryMap` augmentation), and handlers under `handlers/queries/notifications/` with `handleQuery` (Kysely select on local `notifications`, newest first) + `checkForChanges` re-running on `notification.created`/`notification.read` events for the workspace. Register both in `queries/index.ts` + `handlers/queries/index.ts`.

```ts
// handlers/queries/notifications/notification-unread-count.ts (core of handleQuery)
const row = await workspace.database.selectFrom('notifications')
  .select((eb) => eb.fn.countAll<number>().as('count'))
  .where('read_at', 'is', null).executeTakeFirst();
return row?.count ?? 0;
```

- [ ] **Step 5: Test** — pure handler test where feasible (mirror `node-reaction-list.ts` test if one exists); otherwise rely on Task 10 manual smoke. Run `cd packages/client && npx vitest run --passWithNoTests`.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/mutations/notifications packages/client/src/handlers/mutations/notifications packages/client/src/queries/notifications packages/client/src/handlers/queries/notifications packages/client/src/mutations/index.ts packages/client/src/handlers/mutations/index.ts packages/client/src/queries/index.ts packages/client/src/handlers/queries/index.ts packages/client/src/services/workspaces/mutation-service.ts
git commit -m "feat(notifications): client read mutation + list/unread queries"
```

---

## Task 10: Bell icon + inbox panel UI

**Files:**
- Modify: `packages/client/src/types/workspaces.ts` (`SidebarMenuType`)
- Modify: `packages/ui/src/components/layouts/sidebars/sidebar-menu.tsx`
- Create: `packages/ui/src/components/inbox/inbox-panel.tsx`
- Modify: the workspace layout switch that renders panels by `SidebarMenuType` (find the consumer of `onChange`/`value` — same dir as `sidebar-menu.tsx`).

**Interfaces:**
- Consumes: `notification.list`, `notification.unread-count` queries; `notification.read` mutation.

- [ ] **Step 1: Widen the type** in `packages/client/src/types/workspaces.ts`:

```ts
export type SidebarMenuType = 'chats' | 'spaces' | 'inbox' | 'settings';
```

- [ ] **Step 2: Add the bell** in `sidebar-menu.tsx` — import `Bell` from `lucide-react` (the import already pulls icons) and add an icon with a live unread badge (place it above the spacer, after `spaces`):

```tsx
const unread = useLiveQuery({ type: 'notification.unread-count', userId });
<SidebarMenuIcon
  icon={Bell}
  onClick={() => onChange('inbox')}
  isActive={value === 'inbox'}
  unreadBadge={{ count: unread.data ?? 0, unread: (unread.data ?? 0) > 0, maxCount: 99 }}
/>
```

Match `userId`/`useLiveQuery` usage to the existing radar-driven badges in this file.

- [ ] **Step 3: Inbox panel** `packages/ui/src/components/inbox/inbox-panel.tsx` — list notifications via `useLiveQuery({ type: 'notification.list', userId })`, render each (resolve actor + source from local data the same way other lists do), and on click call `window.colanode.executeMutation({ type: 'notification.read', userId, notificationId })` then navigate to `sourceNodeId`:

```tsx
import { useLiveQuery } from '@colanode/ui/hooks/use-query';

export const InboxPanel = ({ userId }: { userId: string }) => {
  const { data } = useLiveQuery({ type: 'notification.list', userId });
  return (
    <div className="flex flex-col">
      {(data ?? []).map((n) => (
        <button key={n.id} className="text-left p-2 hover:bg-muted"
          onClick={() => window.colanode.executeMutation({ type: 'notification.read', userId, notificationId: n.id })}>
          <span className={n.read_at ? 'opacity-60' : 'font-semibold'}>{n.type} · {n.source_node_id}</span>
        </button>
      ))}
    </div>
  );
};
```

- [ ] **Step 4: Render the panel** — in the layout component that switches on `value`/`SidebarMenuType` (sibling of `sidebar-menu.tsx`), add an `inbox` case rendering `<InboxPanel userId={userId} />`.

- [ ] **Step 5: Manual verification (no DOM test harness for this view).** Build the web app and smoke it (or drive via MCP `apps/colanode-mcp` — `executeQuery {type:'notification.list'}` after a mention). Run: `cd apps/web && npm run build` (expect success). In a running stand: @mention a user → bell badge increments → open inbox → click → badge clears and source opens.

- [ ] **Step 6: Commit**

```bash
git add packages/client/src/types/workspaces.ts packages/ui/src/components/layouts/sidebars/sidebar-menu.tsx packages/ui/src/components/inbox/inbox-panel.tsx
git commit -m "feat(notifications): bell icon + inbox panel"
```

---

## Task 11: Add the notifications rule to project CLAUDE.md

**Files:**
- Modify: `CLAUDE.md` (Colanode repo root)

- [ ] **Step 1:** Append under a "Conventions" section:

> **Notifications:** when adding a feature, decide whether it should emit notifications. If yes, attach a producer for its event(s) to `apps/server/src/services/notification-service.ts` (subscribe to the relevant `eventBus` event → `createNotification(...)`), and add the new `type` to the `SyncNotificationData['notificationType']` union and the settings list.

- [ ] **Step 2: Commit**

```bash
git add CLAUDE.md
git commit -m "docs: notifications convention in CLAUDE.md"
```

---

## Self-Review

- **Spec coverage:** in-app inbox entity (Task 1,7) ✓; producer over eventBus for mention+DM (Task 4) ✓; synchronizer delivery (Task 5,8) ✓; mark-read mutation cross-device (Task 6,9) ✓; bell + inbox UI (Task 10) ✓; CLAUDE.md rule (Task 11) ✓; dedup (Task 3) ✓; permission gate (Task 4) ✓. **Deferred per Global Constraints:** `task_*` producers (Plan 1b, after Tasks module), push + settings UI + quiet hours (Plan 2). Mobile native registration is Plan 2 (the bell/inbox UI auto-renders on mobile via the shared `@colanode/ui` webview).
- **Placeholder scan:** the few "match to the real shape" notes (WorkspaceContext, node attribute shapes, eventData accessor, response body shape) are explicit shape-alignment steps against named files, not open TODOs; control flow + code are complete.
- **Type consistency:** `SyncNotificationData` fields are produced identically by the server synchronizer `buildMessage` (Task 5) and consumed by the client `syncServerNotification` (Task 8); `notification.read` mutation shape is identical in core (Task 2), server route (Task 6), and client mutation (Task 9); `revision` typed `never`-insert everywhere; `IdType.Notification` added in Task 1 Step 5a and reused.

## Sequencing note
- **Plan 1b (after Tasks module):** add `task_assigned`/`task_status` arms to `NotificationService.handleEvent` (detect `collaborator`/`select` field changes on `record` nodes) — one small task, no schema change (`notificationType` union already includes them).
- **Plan 2 (push):** `push_subscriptions` + `notification_settings` tables, settings UI (per-type push toggle + global mute), BullMQ push worker (Expo Push + web-push/VAPID, device-activity gate), web service worker, `expo-notifications` registration in `apps/mobile/src/app.tsx`.
