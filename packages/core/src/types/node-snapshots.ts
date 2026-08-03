import { z } from 'zod/v4';

// Version-history snapshots of a node's attributes. Mirrors the document
// snapshot schemas (see types/documents.ts) but captures the node attributes
// (which, for whiteboards, hold the board scene) rather than document content.
// Attributes are kept as a permissive record so any node type can be snapshot
// without coupling this schema to a specific node model.
export const nodeSnapshotSummarySchema = z.object({
  id: z.string(),
  nodeId: z.string(),
  revision: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type NodeSnapshotSummary = z.infer<typeof nodeSnapshotSummarySchema>;

export const nodeSnapshotListOutputSchema = z.array(nodeSnapshotSummarySchema);

export type NodeSnapshotListOutput = z.infer<
  typeof nodeSnapshotListOutputSchema
>;

export const nodeSnapshotOutputSchema = nodeSnapshotSummarySchema.extend({
  attributes: z.record(z.string(), z.unknown()),
});

export type NodeSnapshotOutput = z.infer<typeof nodeSnapshotOutputSchema>;
