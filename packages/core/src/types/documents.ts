import { z } from 'zod/v4';

import { documentContentSchema } from '@colanode/core/registry/documents/index';

export const documentSnapshotSummarySchema = z.object({
  id: z.string(),
  documentId: z.string(),
  revision: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  // Set when the snapshot was cut on purpose rather than by the merge job:
  // the version tag it was cut under (e.g. "v1.2.0")...
  name: z.string().nullable().optional(),
  // ...and the changelog written at the time, which is what the history and
  // the PDF's revision table show beside the tag.
  note: z.string().nullable().optional(),
});

// One recorded edit of a document, as the server still holds it. The merge
// job folds these into the snapshots after a couple of hours, so this is the
// fine-grained tail of the history rather than the whole of it.
export const documentUpdateSummarySchema = z.object({
  id: z.string(),
  documentId: z.string(),
  revision: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
  // How many separate edits this row now stands for, once the merge job has
  // folded a window of them together.
  mergedCount: z.number(),
});

export type DocumentUpdateSummary = z.infer<typeof documentUpdateSummarySchema>;

export const documentUpdateListOutputSchema = z.array(
  documentUpdateSummarySchema
);

export type DocumentUpdateListOutput = z.infer<
  typeof documentUpdateListOutputSchema
>;

export const documentUpdateContentOutputSchema =
  documentUpdateSummarySchema.extend({
    content: documentContentSchema,
  });

export type DocumentUpdateContentOutput = z.infer<
  typeof documentUpdateContentOutputSchema
>;

export const documentSnapshotCreateInputSchema = z.object({
  name: z.string().max(60).nullable().optional(),
  note: z.string().max(2000).nullable().optional(),
});

export type DocumentSnapshotCreateInput = z.infer<
  typeof documentSnapshotCreateInputSchema
>;

export type DocumentSnapshotSummary = z.infer<
  typeof documentSnapshotSummarySchema
>;

export const documentSnapshotListOutputSchema = z.array(
  documentSnapshotSummarySchema
);

export type DocumentSnapshotListOutput = z.infer<
  typeof documentSnapshotListOutputSchema
>;

export const documentSnapshotOutputSchema =
  documentSnapshotSummarySchema.extend({
    content: documentContentSchema,
  });

export type DocumentSnapshotOutput = z.infer<
  typeof documentSnapshotOutputSchema
>;
