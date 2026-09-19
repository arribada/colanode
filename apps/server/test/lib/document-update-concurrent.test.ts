import { sql } from 'kysely';
import { describe, expect, it } from 'vitest';

import { generateId, IdType, richTextContentSchema } from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { updateDocument } from '@colanode/server/lib/documents';

import {
  createAccount,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const paragraph = (
  parentId: string,
  id: string,
  index: string,
  text: string
) => ({
  id,
  type: 'paragraph',
  parentId,
  index,
  content: [{ type: 'text', text }],
});

const until = async (condition: () => Promise<boolean>, timeoutMs = 5000) => {
  const deadline = Date.now() + timeoutMs;
  while (Date.now() < deadline) {
    if (await condition()) {
      return true;
    }
    await new Promise((resolve) => setTimeout(resolve, 20));
  }
  return false;
};

// Number of transactions queued behind the given transaction id.
const waitersOn = async (xid: string) => {
  const result = await sql<{ count: string }>`
    select count(*) as count from pg_locks
    where locktype = 'transactionid' and not granted
      and transactionid::text = ${xid}
  `.execute(database);
  return Number(result.rows[0]?.count ?? 0);
};

const cachedParagraphs = async (pageId: string) => {
  const row = await database
    .selectFrom('documents')
    .select('content')
    .where('id', '=', pageId)
    .executeTakeFirstOrThrow();
  const content = (
    typeof row.content === 'string' ? JSON.parse(row.content) : row.content
  ) as { blocks: Record<string, { content?: { text?: string }[] }> };
  return Object.values(content.blocks)
    .map((block) => block.content?.[0]?.text)
    .sort();
};

describe('AI document writes racing a user edit', () => {
  it('keep the user edit in the cached content', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const space = await createSpaceNode({ ...base, name: 'S' });
    const page = await createPageNode({
      ...base,
      parentId: space,
      rootId: space,
    });

    expect(
      await updateDocument({
        documentId: page,
        ...base,
        updater: () => ({
          type: 'rich_text',
          blocks: { p1: paragraph(page, 'p1', 'a0', 'first') },
        }),
      })
    ).toBe(true);

    // A user's edit, written the way the mutation path writes it, and held
    // open: the AI write reads the page without it, then has to wait for it.
    const log = await database
      .selectFrom('document_updates')
      .select('data')
      .where('document_id', '=', page)
      .execute();
    const userDoc = new YDoc(log.map((row) => row.data));
    const userContent = {
      type: 'rich_text' as const,
      blocks: {
        p1: paragraph(page, 'p1', 'a0', 'first'),
        p2: paragraph(page, 'p2', 'a1', 'from the user'),
      },
    };
    const userUpdate = userDoc.update(richTextContentSchema, userContent)!;

    let release!: () => void;
    const released = new Promise<void>((resolve) => (release = resolve));
    let holding!: () => void;
    const held = new Promise<void>((resolve) => (holding = resolve));
    let xid = '';
    const userEdit = database.transaction().execute(async (trx) => {
      const created = await trx
        .insertInto('document_updates')
        .returningAll()
        .values({
          id: generateId(IdType.Update),
          document_id: page,
          root_id: space,
          workspace_id: workspace.id,
          data: userUpdate,
          created_at: new Date(),
          created_by: user.id,
          merged_updates: null,
        })
        .executeTakeFirstOrThrow();
      await trx
        .updateTable('documents')
        .set({
          content: JSON.stringify(userContent),
          revision: created.revision,
        })
        .where('id', '=', page)
        .execute();
      const row = await sql<{
        xid: string;
      }>`select txid_current()::text as xid`.execute(trx);
      xid = row.rows[0]!.xid;
      holding();
      await released;
    });
    await held;

    const aiEdit = updateDocument({
      documentId: page,
      ...base,
      updater: (content) => ({
        ...content,
        blocks: {
          ...(content as typeof userContent).blocks,
          p3: paragraph(page, 'p3', 'a2', 'from the AI'),
        },
      }),
    });

    expect(await until(async () => (await waitersOn(xid)) >= 1)).toBe(true);
    release();
    await userEdit;
    expect(await aiEdit).toBe(true);

    expect(await cachedParagraphs(page)).toEqual([
      'first',
      'from the AI',
      'from the user',
    ]);
  });
});
