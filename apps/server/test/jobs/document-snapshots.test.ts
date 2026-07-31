import { describe, expect, it } from 'vitest';

import {
  DocumentContent,
  IdType,
  generateId,
  richTextContentSchema,
} from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { SelectUser, SelectWorkspace } from '@colanode/server/data/schema';
import { processDocumentUpdates } from '@colanode/server/jobs/document-updates-merge';
import {
  captureDocumentSnapshot,
  pruneDocumentSnapshots,
} from '@colanode/server/lib/document-snapshots';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const MERGE_WINDOW = 3600; // seconds
const CUTOFF_WINDOW = 7200; // seconds
const RETENTION = { keepCount: 20, maxAgeDays: 90 };

const buildContent = (pageId: string, text: string): DocumentContent => {
  const blockId = generateId(IdType.Block);
  return {
    type: 'rich_text',
    blocks: {
      [blockId]: {
        id: blockId,
        type: 'paragraph',
        parentId: pageId,
        index: 'a0',
        content: [{ type: 'text', text }],
      },
    },
  };
};

type SeedContext = {
  workspace: SelectWorkspace;
  user: SelectUser;
  spaceId: string;
};

const seedWorkspace = async (): Promise<SeedContext> => {
  const account = await createAccount();
  const workspace = await createWorkspace({ createdBy: account.id });
  const user = await createUser({
    workspaceId: workspace.id,
    account,
    role: 'owner',
  });
  const spaceId = await createSpaceNode({
    workspaceId: workspace.id,
    userId: user.id,
  });

  return { workspace, user, spaceId };
};

// Creates a page with `texts.length` sequential document updates and the
// matching materialized `documents` row (content = state after the last
// update, revision = revision of the last update).
const seedDocument = async (
  context: SeedContext,
  texts: string[],
  baseTime: Date
): Promise<{ pageId: string; finalContent: DocumentContent }> => {
  const pageId = await createPageNode({
    workspaceId: context.workspace.id,
    userId: context.user.id,
    parentId: context.spaceId,
    rootId: context.spaceId,
  });

  const ydoc = new YDoc();
  let lastRevision = '0';
  let lastCreatedAt = baseTime;

  for (let i = 0; i < texts.length; i++) {
    const update = ydoc.update(
      richTextContentSchema,
      buildContent(pageId, texts[i]!)
    );

    if (!update) {
      throw new Error('Failed to build document update');
    }

    const createdAt = new Date(baseTime.getTime() + i * 60 * 1000);
    const createdUpdate = await database
      .insertInto('document_updates')
      .returningAll()
      .values({
        id: generateId(IdType.Update),
        document_id: pageId,
        root_id: context.spaceId,
        workspace_id: context.workspace.id,
        data: update,
        created_at: createdAt,
        created_by: context.user.id,
      })
      .executeTakeFirstOrThrow();

    lastRevision = createdUpdate.revision;
    lastCreatedAt = createdAt;
  }

  const finalContent = ydoc.getObject<DocumentContent>();

  await database
    .insertInto('documents')
    .values({
      id: pageId,
      workspace_id: context.workspace.id,
      revision: lastRevision,
      content: JSON.stringify(finalContent),
      created_at: baseTime,
      created_by: context.user.id,
      updated_at: lastCreatedAt,
      updated_by: context.user.id,
    })
    .execute();

  return { pageId, finalContent };
};

const fetchUpdates = async (documentId: string) => {
  return database
    .selectFrom('document_updates')
    .selectAll()
    .where('document_id', '=', documentId)
    .orderBy('revision', 'asc')
    .execute();
};

const fetchSnapshots = async (documentId: string) => {
  return database
    .selectFrom('document_snapshots')
    .selectAll()
    .where('document_id', '=', documentId)
    .orderBy('created_at', 'desc')
    .orderBy('id', 'desc')
    .execute();
};

describe('document snapshot on merge', () => {
  it('captures a snapshot before compacting document updates', async () => {
    const context = await seedWorkspace();
    const baseTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { pageId, finalContent } = await seedDocument(
      context,
      ['first', 'second', 'third'],
      baseTime
    );

    const updates = await fetchUpdates(pageId);
    expect(updates).toHaveLength(3);

    const result = await processDocumentUpdates(
      pageId,
      updates,
      MERGE_WINDOW,
      CUTOFF_WINDOW,
      RETENTION
    );

    expect(result.mergedGroups).toBe(1);
    expect(result.deletedUpdates).toBe(2);

    const remainingUpdates = await fetchUpdates(pageId);
    expect(remainingUpdates).toHaveLength(1);

    const snapshots = await fetchSnapshots(pageId);
    expect(snapshots).toHaveLength(1);

    const snapshot = snapshots[0]!;
    expect(snapshot.content).toEqual(finalContent);
    expect(snapshot.created_by).toBe(context.user.id);

    const document = await database
      .selectFrom('documents')
      .selectAll()
      .where('id', '=', pageId)
      .executeTakeFirstOrThrow();

    expect(snapshot.revision).toBe(document.revision);
  });

  it('does not snapshot or merge when there is nothing to compact', async () => {
    const context = await seedWorkspace();
    const baseTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { pageId } = await seedDocument(context, ['only one'], baseTime);

    const updates = await fetchUpdates(pageId);
    const result = await processDocumentUpdates(
      pageId,
      updates,
      MERGE_WINDOW,
      CUTOFF_WINDOW,
      RETENTION
    );

    expect(result.mergedGroups).toBe(0);
    expect(result.deletedUpdates).toBe(0);

    const snapshots = await fetchSnapshots(pageId);
    expect(snapshots).toHaveLength(0);
  });

  it('deduplicates snapshots on the document revision', async () => {
    const context = await seedWorkspace();
    const baseTime = new Date(Date.now() - 3 * 60 * 60 * 1000);
    const { pageId } = await seedDocument(context, ['a', 'b'], baseTime);

    const first = await captureDocumentSnapshot(pageId);
    expect(first).not.toBeNull();

    const second = await captureDocumentSnapshot(pageId);
    expect(second).toBeNull();

    const snapshots = await fetchSnapshots(pageId);
    expect(snapshots).toHaveLength(1);
  });

  it('returns null when the document does not exist', async () => {
    const missing = await captureDocumentSnapshot(generateId(IdType.Page));
    expect(missing).toBeNull();
  });
});

describe('document snapshot retention', () => {
  const insertSnapshot = async (
    context: SeedContext,
    documentId: string,
    createdAt: Date
  ): Promise<string> => {
    const id = generateId(IdType.Version);
    await database
      .insertInto('document_snapshots')
      .values({
        id,
        document_id: documentId,
        workspace_id: context.workspace.id,
        revision: '1',
        content: JSON.stringify(buildContent(documentId, 'snapshot')),
        created_at: createdAt,
        created_by: context.user.id,
      })
      .execute();

    return id;
  };

  it('keeps only the newest keepCount snapshots', async () => {
    const context = await seedWorkspace();
    const { pageId } = await seedDocument(
      context,
      ['content'],
      new Date(Date.now() - 3 * 60 * 60 * 1000)
    );

    const keptIds: string[] = [];
    for (let i = 0; i < 25; i++) {
      const createdAt = new Date(Date.now() - i * 24 * 60 * 60 * 1000);
      const id = await insertSnapshot(context, pageId, createdAt);
      if (i < 20) {
        keptIds.push(id);
      }
    }

    const deleted = await pruneDocumentSnapshots(pageId, RETENTION);
    expect(deleted).toBe(5);

    const snapshots = await fetchSnapshots(pageId);
    expect(snapshots).toHaveLength(20);
    expect(snapshots.map((snapshot) => snapshot.id).sort()).toEqual(
      [...keptIds].sort()
    );
  });

  it('prunes snapshots older than maxAgeDays', async () => {
    const context = await seedWorkspace();
    const { pageId } = await seedDocument(
      context,
      ['content'],
      new Date(Date.now() - 3 * 60 * 60 * 1000)
    );

    await insertSnapshot(
      context,
      pageId,
      new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    );
    const recentId = await insertSnapshot(
      context,
      pageId,
      new Date(Date.now() - 5 * 24 * 60 * 60 * 1000)
    );
    const newestId = await insertSnapshot(
      context,
      pageId,
      new Date(Date.now() - 24 * 60 * 60 * 1000)
    );

    const deleted = await pruneDocumentSnapshots(pageId, RETENTION);
    expect(deleted).toBe(1);

    const snapshots = await fetchSnapshots(pageId);
    expect(snapshots.map((snapshot) => snapshot.id)).toEqual([
      newestId,
      recentId,
    ]);
  });

  it('deletes everything when all snapshots are expired', async () => {
    const context = await seedWorkspace();
    const { pageId } = await seedDocument(
      context,
      ['content'],
      new Date(Date.now() - 3 * 60 * 60 * 1000)
    );

    await insertSnapshot(
      context,
      pageId,
      new Date(Date.now() - 120 * 24 * 60 * 60 * 1000)
    );
    await insertSnapshot(
      context,
      pageId,
      new Date(Date.now() - 100 * 24 * 60 * 60 * 1000)
    );

    const deleted = await pruneDocumentSnapshots(pageId, RETENTION);
    expect(deleted).toBe(2);

    const snapshots = await fetchSnapshots(pageId);
    expect(snapshots).toHaveLength(0);
  });
});
