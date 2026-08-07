import { cloneDeep } from 'lodash-es';

import {
  CanUpdateDocumentContext,
  DocumentContent,
  generateId,
  getNodeModel,
  IdType,
  Mention,
  MutationStatus,
  NodeModel,
  UpdateDocumentMutationData,
} from '@colanode/core';
import { decodeState, YDoc } from '@colanode/crdt';
import { database } from '@colanode/server/data/database';
import { eventBus } from '@colanode/server/lib/event-bus';
import { createLogger } from '@colanode/server/lib/logger';
import { fetchNode, fetchNodeTree, mapNode } from '@colanode/server/lib/nodes';
import { createMentionNotifications } from '@colanode/server/lib/notifications';
import { WorkspaceContext } from '@colanode/server/types/api';
import {
  CreateDocumentInput,
  CreateDocumentOutput,
  UpdateDocumentInput,
} from '@colanode/server/types/documents';
import { ConcurrentUpdateResult } from '@colanode/server/types/nodes';

const logger = createLogger('server:lib:documents');

const UPDATE_RETRIES_LIMIT = 10;

// Diff document mentions so only newly-added mentions notify. The before
// state is the stored content of the document row (if any).
const extractAddedDocumentMentions = (
  model: NodeModel,
  documentId: string,
  beforeContent: DocumentContent | null | undefined,
  afterContent: DocumentContent
): Mention[] => {
  if (!model.extractDocumentMentions) {
    return [];
  }

  const afterMentions = model.extractDocumentMentions(documentId, afterContent);
  if (afterMentions.length === 0) {
    return [];
  }

  const beforeMentions = beforeContent
    ? model.extractDocumentMentions(documentId, beforeContent)
    : [];

  return afterMentions.filter(
    (after) =>
      !beforeMentions.some(
        (before) => before.id === after.id && before.target === after.target
      )
  );
};

export const createDocument = async (
  input: CreateDocumentInput
): Promise<CreateDocumentOutput | null> => {
  const node = await fetchNode(input.nodeId);
  if (!node) {
    return null;
  }

  const model = getNodeModel(node.type);
  if (!model.documentSchema) {
    return null;
  }

  const ydoc = new YDoc();
  const update = ydoc.update(model.documentSchema, input.content);
  if (!update) {
    return null;
  }

  const content = ydoc.getObject<DocumentContent>();

  const { createdDocument, createdDocumentUpdate } = await database
    .transaction()
    .execute(async (trx) => {
      const createdDocumentUpdate = await trx
        .insertInto('document_updates')
        .returningAll()
        .values({
          id: generateId(IdType.Update),
          document_id: input.nodeId,
          workspace_id: input.workspaceId,
          root_id: node.root_id,
          data: update,
          created_at: new Date(),
          created_by: input.userId,
        })
        .executeTakeFirst();

      if (!createdDocumentUpdate) {
        throw new Error('Failed to create document update');
      }

      const createdDocument = await trx
        .insertInto('documents')
        .returningAll()
        .values({
          id: input.nodeId,
          workspace_id: input.workspaceId,
          content: JSON.stringify(content),
          created_at: new Date(),
          created_by: input.userId,
          revision: createdDocumentUpdate.revision,
        })
        .executeTakeFirst();

      if (!createdDocument) {
        throw new Error('Failed to create document');
      }

      return {
        createdDocument,
        createdDocumentUpdate,
      };
    });

  if (!createdDocument || !createdDocumentUpdate) {
    return null;
  }

  eventBus.publish({
    type: 'document.updated',
    documentId: input.nodeId,
    workspaceId: input.workspaceId,
  });

  eventBus.publish({
    type: 'document.update.created',
    documentId: input.nodeId,
    rootId: node.root_id,
    workspaceId: input.workspaceId,
  });

  return {
    document: createdDocument,
  };
};

export const updateDocumentFromMutation = async (
  workspace: WorkspaceContext,
  mutation: UpdateDocumentMutationData
): Promise<MutationStatus> => {
  for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
    const existingDocumentUpdate = await database
      .selectFrom('document_updates')
      .where('id', '=', mutation.updateId)
      .selectAll()
      .executeTakeFirst();

    if (existingDocumentUpdate) {
      return MutationStatus.OK;
    }

    const result = await tryUpdateDocumentFromMutation(workspace, mutation);

    if (result.type === 'success') {
      return result.output;
    }

    if (result.type === 'error') {
      return MutationStatus.INTERNAL_SERVER_ERROR;
    }
  }

  return MutationStatus.INTERNAL_SERVER_ERROR;
};

const tryUpdateDocumentFromMutation = async (
  workspace: WorkspaceContext,
  mutation: UpdateDocumentMutationData
): Promise<ConcurrentUpdateResult<MutationStatus>> => {
  const tree = await fetchNodeTree(mutation.documentId);
  if (tree.length === 0) {
    return { type: 'success', output: MutationStatus.NOT_FOUND };
  }

  const node = tree[tree.length - 1];
  if (!node) {
    return { type: 'success', output: MutationStatus.NOT_FOUND };
  }

  const model = getNodeModel(node.type);
  if (!model.documentSchema) {
    return { type: 'success', output: MutationStatus.NOT_FOUND };
  }

  const context: CanUpdateDocumentContext = {
    user: {
      id: workspace.user.id,
      role: workspace.user.role,
      workspaceId: workspace.id,
      accountId: workspace.user.accountId,
    },
    node: mapNode(node),
    tree: tree.map((node) => mapNode(node)),
  };

  if (!model.canUpdateDocument(context)) {
    return { type: 'success', output: MutationStatus.FORBIDDEN };
  }

  const document = await database
    .selectFrom('documents')
    .where('id', '=', mutation.documentId)
    .selectAll()
    .executeTakeFirst();

  const documentUpdates = await database
    .selectFrom('document_updates')
    .where('document_id', '=', mutation.documentId)
    .selectAll()
    .execute();

  const ydoc = new YDoc();
  for (const update of documentUpdates) {
    ydoc.applyUpdate(update.data);
  }

  ydoc.applyUpdate(mutation.data);
  const content = ydoc.getObject<DocumentContent>();

  if (!model.documentSchema.safeParse(content).success) {
    return { type: 'success', output: MutationStatus.BAD_REQUEST };
  }

  try {
    const outcome = await database
      .transaction()
      .execute(async (trx) => {
        // Idempotent insert: a replayed update (same id — an at-least-once
        // retry after e.g. a dropped response) inserts nothing. The append-only
        // log already has it, so the document is already up to date: report a
        // replay and skip re-writing the cache / re-broadcasting.
        const createdDocumentUpdate = await trx
          .insertInto('document_updates')
          .returningAll()
          .values({
            id: mutation.updateId,
            document_id: mutation.documentId,
            root_id: node.root_id,
            workspace_id: workspace.id,
            data: decodeState(mutation.data),
            created_at: new Date(mutation.createdAt),
            created_by: workspace.user.id,
            merged_updates: null,
          })
          .onConflict((cb) => cb.doNothing())
          .executeTakeFirst();

        if (!createdDocumentUpdate) {
          return { replay: true as const };
        }

        // Fast path: refresh the derived `documents` cache to the content we
        // computed, guarded on the revision we read.
        let updatedDocument = document
          ? await trx
              .updateTable('documents')
              .returningAll()
              .set({
                content: JSON.stringify(content),
                updated_at: new Date(mutation.createdAt),
                updated_by: workspace.user.id,
                revision: createdDocumentUpdate.revision,
              })
              .where('id', '=', mutation.documentId)
              .where('revision', '=', document.revision)
              .executeTakeFirst()
          : await trx
              .insertInto('documents')
              .returningAll()
              .values({
                id: mutation.documentId,
                workspace_id: workspace.id,
                content: JSON.stringify(content),
                created_at: new Date(mutation.createdAt),
                created_by: workspace.user.id,
                revision: createdDocumentUpdate.revision,
              })
              .onConflict((cb) => cb.doNothing())
              .executeTakeFirst();

        // Merge path (rare): a concurrent edit moved the revision (or a racing
        // first-insert already created the row), so the guarded write touched 0
        // rows. That concurrent update is committed (that is WHY the revision
        // changed), so re-reading the append-only log now sees every update.
        // Rebuild the merged (Yjs CRDT, conflict-free) content and write it
        // unconditionally, so neither user's edit is dropped from the cache.
        if (!updatedDocument) {
          const allUpdates = await trx
            .selectFrom('document_updates')
            .where('document_id', '=', mutation.documentId)
            .selectAll()
            .execute();
          const mergedYdoc = new YDoc();
          for (const documentUpdate of allUpdates) {
            mergedYdoc.applyUpdate(documentUpdate.data);
          }
          const mergedContent = mergedYdoc.getObject<DocumentContent>();
          const maxRevision = allUpdates.reduce(
            (max, documentUpdate) =>
              documentUpdate.revision > max ? documentUpdate.revision : max,
            createdDocumentUpdate.revision
          );

          updatedDocument = await trx
            .updateTable('documents')
            .returningAll()
            .set({
              content: JSON.stringify(mergedContent),
              updated_at: new Date(mutation.createdAt),
              updated_by: workspace.user.id,
              revision: maxRevision,
            })
            .where('id', '=', mutation.documentId)
            .executeTakeFirst();

          if (!updatedDocument) {
            updatedDocument = await trx
              .insertInto('documents')
              .returningAll()
              .values({
                id: mutation.documentId,
                workspace_id: workspace.id,
                content: JSON.stringify(mergedContent),
                created_at: new Date(mutation.createdAt),
                created_by: workspace.user.id,
                revision: maxRevision,
              })
              .onConflict((cb) => cb.doNothing())
              .executeTakeFirst();
          }
        }

        if (!updatedDocument) {
          throw new Error('Failed to update document');
        }

        return {
          replay: false as const,
          updatedDocument,
          createdDocumentUpdate,
        };
      });

    // A replayed (already-applied) update: it was already broadcast + notified
    // the first time, so report success idempotently and stop here.
    if (outcome.replay) {
      return {
        type: 'success',
        output: MutationStatus.OK,
      };
    }

    const { updatedDocument, createdDocumentUpdate } = outcome;

    if (!updatedDocument || !createdDocumentUpdate) {
      throw new Error('Failed to update document');
    }

    eventBus.publish({
      type: 'document.updated',
      documentId: mutation.documentId,
      workspaceId: workspace.id,
    });

    eventBus.publish({
      type: 'document.update.created',
      documentId: mutation.documentId,
      rootId: node.root_id,
      workspaceId: workspace.id,
    });

    // Fire mention notifications for people newly mentioned in this
    // document update (pages/records) — mirrors the message pipeline in
    // notification-service.
    const addedMentions = extractAddedDocumentMentions(
      model,
      mutation.documentId,
      document?.content,
      content
    );

    const rootNode = tree[0];
    if (addedMentions.length > 0 && rootNode) {
      await createMentionNotifications({
        mentions: addedMentions,
        workspaceId: workspace.id,
        rootId: node.root_id,
        rootNode: mapNode(rootNode),
        sourceNodeId: mutation.documentId,
        actorId: workspace.user.id,
      });
    }

    return {
      type: 'success',
      output: MutationStatus.OK,
    };
  } catch (error) {
    logger.error(error, `Failed to update document`);
    return { type: 'retry' };
  }
};

export const updateDocument = async (
  input: UpdateDocumentInput
): Promise<boolean> => {
  for (let count = 0; count < UPDATE_RETRIES_LIMIT; count++) {
    const result = await tryUpdateDocument(input);

    if (result.type === 'success') {
      return true;
    }

    if (result.type === 'error') {
      return false;
    }
  }

  return false;
};

const tryUpdateDocument = async (
  input: UpdateDocumentInput
): Promise<ConcurrentUpdateResult<boolean>> => {
  const node = await fetchNode(input.documentId);
  if (!node) {
    return { type: 'error', error: 'Node not found' };
  }

  const model = getNodeModel(node.type);
  if (!model.documentSchema) {
    return { type: 'error', error: 'Node does not support documents' };
  }

  const documentUpdates = await database
    .selectFrom('document_updates')
    .where('document_id', '=', input.documentId)
    .selectAll()
    .execute();

  const ydoc = new YDoc();
  for (const update of documentUpdates) {
    ydoc.applyUpdate(update.data);
  }

  const currentContent = ydoc.getObject<DocumentContent>();
  const updatedContent = input.updater(cloneDeep(currentContent));
  if (!updatedContent) {
    return { type: 'error', error: 'Failed to update document' };
  }

  const update = ydoc.update(model.documentSchema, updatedContent);
  if (!update) {
    return { type: 'error', error: 'Failed to create document update' };
  }

  const content = ydoc.getObject<DocumentContent>();

  if (!model.documentSchema.safeParse(content).success) {
    return { type: 'error', error: 'Updated content is invalid' };
  }

  const date = new Date();
  const updateId = generateId(IdType.Update);

  try {
    const { updatedDocument, createdDocumentUpdate } = await database
      .transaction()
      .execute(async (trx) => {
        const createdDocumentUpdate = await trx
          .insertInto('document_updates')
          .returningAll()
          .values({
            id: updateId,
            document_id: input.documentId,
            root_id: node.root_id,
            workspace_id: input.workspaceId,
            data: update,
            created_at: date,
            created_by: input.userId,
            merged_updates: null,
          })
          .executeTakeFirst();

        if (!createdDocumentUpdate) {
          throw new Error('Failed to create document update');
        }

        const updatedDocument = await trx
          .insertInto('documents')
          .returningAll()
          .values({
            id: input.documentId,
            workspace_id: input.workspaceId,
            content: JSON.stringify(content),
            created_at: date,
            created_by: input.userId,
            revision: createdDocumentUpdate.revision,
          })
          .onConflict((cb) =>
            cb.column('id').doUpdateSet({
              content: JSON.stringify(content),
              updated_at: date,
              updated_by: input.userId,
              revision: createdDocumentUpdate.revision,
            })
          )
          .executeTakeFirst();

        if (!updatedDocument) {
          throw new Error('Failed to update document');
        }

        return {
          updatedDocument,
          createdDocumentUpdate,
        };
      });

    if (!updatedDocument || !createdDocumentUpdate) {
      throw new Error('Failed to update document');
    }

    eventBus.publish({
      type: 'document.updated',
      documentId: input.documentId,
      workspaceId: input.workspaceId,
    });

    eventBus.publish({
      type: 'document.update.created',
      documentId: input.documentId,
      rootId: node.root_id,
      workspaceId: input.workspaceId,
    });

    return {
      type: 'success',
      output: true,
    };
  } catch (error) {
    logger.error(error, `Failed to update document`);
    return { type: 'retry' };
  }
};
