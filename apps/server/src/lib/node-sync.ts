import { SyncDocumentUpdateData, SyncNodeUpdateData } from '@colanode/core';
import { encodeState } from '@colanode/crdt';
import {
  SelectDocumentUpdate,
  SelectNodeUpdate,
} from '@colanode/server/data/schema';

// The shape the per-space synchronizers send over the socket. The on-demand
// route below sends exactly the same rows in the same shape, so the client
// applies them with the same idempotent code and a later stream delivery of
// the same rows changes nothing.

export const mapNodeUpdate = (
  nodeUpdate: SelectNodeUpdate
): SyncNodeUpdateData => ({
  id: nodeUpdate.id,
  nodeId: nodeUpdate.node_id,
  rootId: nodeUpdate.root_id,
  workspaceId: nodeUpdate.workspace_id,
  revision: nodeUpdate.revision.toString(),
  data: encodeState(nodeUpdate.data),
  createdAt: nodeUpdate.created_at.toISOString(),
  createdBy: nodeUpdate.created_by,
  mergedUpdates: nodeUpdate.merged_updates,
});

// The socket payload carries the root and workspace ids too, which the
// document type in core does not name; kept so both paths send the same bytes.
export type DocumentUpdatePayload = SyncDocumentUpdateData & {
  rootId: string;
  workspaceId: string;
};

export const mapDocumentUpdate = (
  documentUpdate: SelectDocumentUpdate
): DocumentUpdatePayload => ({
  id: documentUpdate.id,
  documentId: documentUpdate.document_id,
  rootId: documentUpdate.root_id,
  workspaceId: documentUpdate.workspace_id,
  revision: documentUpdate.revision.toString(),
  data: encodeState(documentUpdate.data),
  createdAt: documentUpdate.created_at.toISOString(),
  createdBy: documentUpdate.created_by,
  mergedUpdates: documentUpdate.merged_updates,
});
