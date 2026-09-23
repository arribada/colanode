import { afterAll, beforeAll, describe, expect, it } from 'vitest';

import {
  ApiErrorCode,
  DocumentContent,
  generateId,
  IdType,
  richTextContentSchema,
} from '@colanode/core';
import { decodeState, YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import {
  estimateDocumentSync,
  fetchDocumentStates,
} from '@colanode/server/lib/document-bootstrap';

import { buildTestApp } from '../helpers/app';
import {
  buildAuthHeader,
  createAccount,
  createDevice,
  createPageNode,
  createSpaceNode,
  createUser,
  createWorkspace,
} from '../helpers/seed';

const app = buildTestApp();

beforeAll(async () => {
  await app.ready();
});

afterAll(async () => {
  await app.close();
});

const paragraph = (documentId: string, index: string, text: string) => {
  const id = generateId(IdType.Block);
  return {
    [id]: {
      id,
      type: 'paragraph',
      parentId: documentId,
      index,
      content: [{ type: 'text', text }],
    },
  };
};

// Writes one update row, the way an edit is written.
const writeUpdate = async (input: {
  documentId: string;
  rootId: string;
  workspaceId: string;
  userId: string;
  ydoc: YDoc;
  blocks: DocumentContent['blocks'];
}) => {
  const update = input.ydoc.update(richTextContentSchema, {
    type: 'rich_text',
    blocks: input.blocks,
  });

  if (!update) {
    throw new Error('no update produced');
  }

  await database
    .insertInto('document_updates')
    .values({
      id: generateId(IdType.Update),
      document_id: input.documentId,
      root_id: input.rootId,
      workspace_id: input.workspaceId,
      data: Buffer.from(update),
      created_at: new Date(),
      created_by: input.userId,
      merged_updates: null,
    })
    .execute();
};

const textsOf = (state: string) => {
  const ydoc = new YDoc(decodeState(state));
  const content = ydoc.getObject<DocumentContent>();
  return Object.values(content.blocks ?? {})
    .map((block) => block.content?.[0]?.text ?? '')
    .sort();
};

const rawBytes = async (documentId: string) => {
  const rows = await database
    .selectFrom('document_updates')
    .select(['data'])
    .where('document_id', '=', documentId)
    .execute();
  return rows.reduce((sum, row) => sum + row.data.length, 0);
};

describe('document states of a space', () => {
  it('replaces the log with one state per document and drops what was deleted', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const rootId = await createSpaceNode({ ...base, name: 'Space' });
    const documentId = await createPageNode({
      ...base,
      parentId: rootId,
      rootId,
    });

    // A page written, largely thrown away, then finished: the log keeps every
    // deleted paragraph, the state does not.
    const ydoc = new YDoc();
    let blocks: DocumentContent['blocks'] = {};
    for (let i = 0; i < 40; i++) {
      blocks = {
        ...blocks,
        ...paragraph(
          documentId,
          `a${i}`,
          `draft paragraph number ${i} `.repeat(20)
        ),
      };
      await writeUpdate({ ...base, documentId, rootId, ydoc, blocks });
    }

    blocks = paragraph(documentId, 'a0', 'the only paragraph that survived');
    await writeUpdate({ ...base, documentId, rootId, ydoc, blocks });

    const page = await fetchDocumentStates({
      rootId,
      after: null,
      maxDocuments: 25,
      maxBytes: 4 * 1024 * 1024,
    });

    expect(page.items).toHaveLength(1);
    expect(page.next).toBeNull();

    const item = page.items[0]!;
    expect(item.documentId).toBe(documentId);
    expect(textsOf(item.data)).toEqual(['the only paragraph that survived']);

    // The point of the whole thing: half the bytes or better.
    const raw = await rawBytes(documentId);
    const state = decodeState(item.data).length;
    expect(state).toBeLessThan(raw / 2);

    // The cursor the client will resume from, and the rows it can drop.
    const rows = await database
      .selectFrom('document_updates')
      .select(['id', 'revision'])
      .where('document_id', '=', documentId)
      .execute();
    expect(page.revision).toBe(
      rows
        .map((row) => BigInt(row.revision))
        .reduce((max, revision) => (revision > max ? revision : max))
        .toString()
    );
    expect(
      [item.id, ...(item.mergedUpdates ?? []).map((update) => update.id)].sort()
    ).toEqual(rows.map((row) => row.id).sort());

    // And nothing was destroyed on the way.
    expect(rows).toHaveLength(41);
  });

  it('walks every document of the space once, page by page', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const rootId = await createSpaceNode({ ...base, name: 'Space' });

    const documentIds: string[] = [];
    for (let i = 0; i < 7; i++) {
      const documentId = await createPageNode({
        ...base,
        parentId: rootId,
        rootId,
      });
      documentIds.push(documentId);
      const ydoc = new YDoc();
      await writeUpdate({
        ...base,
        documentId,
        rootId,
        ydoc,
        blocks: paragraph(documentId, 'a0', `page ${i}`),
      });
    }

    const seen: string[] = [];
    let after: string | null = null;
    let pages = 0;
    for (;;) {
      const page = await fetchDocumentStates({
        rootId,
        after,
        maxDocuments: 3,
        maxBytes: 4 * 1024 * 1024,
      });
      pages++;
      seen.push(...page.items.map((item) => item.documentId));
      if (!page.next) {
        break;
      }
      after = page.next;
      expect(pages).toBeLessThan(10);
    }

    expect(seen.sort()).toEqual([...documentIds].sort());
    expect(new Set(seen).size).toBe(documentIds.length);
    expect(pages).toBe(3);
  });

  it('keeps walking when a page is cut short by its size budget', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const rootId = await createSpaceNode({ ...base, name: 'Space' });

    // Documents far too big to fit together: every page carries one, so the
    // walk has to continue even though the document limit was never reached.
    const documentIds: string[] = [];
    for (let i = 0; i < 4; i++) {
      const documentId = await createPageNode({
        ...base,
        parentId: rootId,
        rootId,
      });
      documentIds.push(documentId);
      await writeUpdate({
        ...base,
        documentId,
        rootId,
        ydoc: new YDoc(),
        blocks: paragraph(documentId, 'a0', `big ${i} `.repeat(20000)),
      });
    }

    const seen: string[] = [];
    let after: string | null = null;
    let pages = 0;
    for (;;) {
      const page = await fetchDocumentStates({
        rootId,
        after,
        maxDocuments: 25,
        maxBytes: 150 * 1024,
      });
      pages++;
      expect(page.items.length).toBeGreaterThan(0);
      seen.push(...page.items.map((item) => item.documentId));
      if (!page.next) {
        break;
      }
      after = page.next;
      expect(pages).toBeLessThan(10);
    }

    expect(seen.sort()).toEqual([...documentIds].sort());
    expect(pages).toBe(4);
  });

  it('tells a client how far behind it is, so it can choose how to catch up', async () => {
    const account = await createAccount();
    const workspace = await createWorkspace({ createdBy: account.id });
    const user = await createUser({
      workspaceId: workspace.id,
      account,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: user.id };
    const rootId = await createSpaceNode({ ...base, name: 'Space' });

    const documentId = await createPageNode({
      ...base,
      parentId: rootId,
      rootId,
    });
    const ydoc = new YDoc();
    await writeUpdate({
      ...base,
      documentId,
      rootId,
      ydoc,
      blocks: paragraph(documentId, 'a0', 'first'),
    });

    const afterFirst = await database
      .selectFrom('document_updates')
      .select(['revision'])
      .where('root_id', '=', rootId)
      .orderBy('revision', 'desc')
      .executeTakeFirstOrThrow();

    await writeUpdate({
      ...base,
      documentId,
      rootId,
      ydoc,
      blocks: {
        ...paragraph(documentId, 'a0', 'first'),
        ...paragraph(documentId, 'a1', 'second, much longer edit '.repeat(40)),
      },
    });

    // A client that has everything owes nothing.
    const latest = await database
      .selectFrom('document_updates')
      .select(['revision'])
      .where('root_id', '=', rootId)
      .orderBy('revision', 'desc')
      .executeTakeFirstOrThrow();

    const caughtUp = await estimateDocumentSync({
      rootId,
      cursor: latest.revision.toString(),
    });
    expect(caughtUp.pending).toBe(0);
    expect(caughtUp.total).toBeGreaterThan(0);

    // A fresh client owes the whole log.
    const cold = await estimateDocumentSync({ rootId, cursor: '0' });
    expect(cold.pending).toBe(cold.total);

    // One behind: what it owes is the second update, not the whole log.
    const behind = await estimateDocumentSync({
      rootId,
      cursor: afterFirst.revision.toString(),
    });
    expect(behind.pending).toBeGreaterThan(0);
    expect(behind.pending).toBeLessThan(behind.total);

    const { token } = await createDevice({ accountId: account.id });
    const response = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${rootId}/documents/estimate?cursor=${afterFirst.revision}`,
      headers: buildAuthHeader(token),
    });
    expect(response.statusCode).toBe(200);
    expect(response.json()).toEqual({
      pending: behind.pending,
      total: behind.total,
    });
  });

  it('is refused to a member with no role on the space, and to a page', async () => {
    const ownerAccount = await createAccount();
    const workspace = await createWorkspace({ createdBy: ownerAccount.id });
    const owner = await createUser({
      workspaceId: workspace.id,
      account: ownerAccount,
      role: 'owner',
    });
    const base = { workspaceId: workspace.id, userId: owner.id };
    const rootId = await createSpaceNode({ ...base, name: 'Space' });
    const pageId = await createPageNode({ ...base, parentId: rootId, rootId });

    const outsiderAccount = await createAccount();
    await createUser({
      workspaceId: workspace.id,
      account: outsiderAccount,
      role: 'collaborator',
    });
    const outsider = await createDevice({ accountId: outsiderAccount.id });

    const refused = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${rootId}/documents`,
      headers: buildAuthHeader(outsider.token),
    });
    expect(refused.statusCode).toBe(403);
    expect(refused.json()).toMatchObject({ code: ApiErrorCode.NodeNoAccess });

    // A page is not a space: asking there would hand over the whole space.
    const ownerDevice = await createDevice({ accountId: ownerAccount.id });
    const notARoot = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${pageId}/documents`,
      headers: buildAuthHeader(ownerDevice.token),
    });
    expect(notARoot.statusCode).toBe(404);

    const allowed = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${rootId}/documents`,
      headers: buildAuthHeader(ownerDevice.token),
    });
    expect(allowed.statusCode).toBe(200);

    // The estimate answers about the same space, so it is gated the same way.
    const refusedEstimate = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${rootId}/documents/estimate?cursor=0`,
      headers: buildAuthHeader(outsider.token),
    });
    expect(refusedEstimate.statusCode).toBe(403);

    const pageEstimate = await app.inject({
      method: 'GET',
      url: `/client/v1/workspaces/${workspace.id}/nodes/${pageId}/documents/estimate?cursor=0`,
      headers: buildAuthHeader(ownerDevice.token),
    });
    expect(pageEstimate.statusCode).toBe(404);
  });
});
