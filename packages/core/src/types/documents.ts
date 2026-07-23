import { z } from 'zod/v4';

import { documentContentSchema } from '@colanode/core/registry/documents/index';

export const documentSnapshotSummarySchema = z.object({
  id: z.string(),
  documentId: z.string(),
  revision: z.string(),
  createdAt: z.string(),
  createdBy: z.string(),
});

export type DocumentSnapshotSummary = z.infer<
  typeof documentSnapshotSummarySchema
>;

export const documentSnapshotListOutputSchema = z.array(
  documentSnapshotSummarySchema
);

export type DocumentSnapshotListOutput = z.infer<
  typeof documentSnapshotListOutputSchema
>;

export const documentSnapshotOutputSchema = documentSnapshotSummarySchema.extend(
  {
    content: documentContentSchema,
  }
);

export type DocumentSnapshotOutput = z.infer<
  typeof documentSnapshotOutputSchema
>;
