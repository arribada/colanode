import { z } from 'zod/v4';

import { DocumentContent } from '@colanode/core/registry/documents';
import { Node, NodeAttributes } from '@colanode/core/registry/nodes';
import { Mention } from '@colanode/core/types/mentions';
import { WorkspaceRole } from '@colanode/core/types/workspaces';

export type NodeRole = 'admin' | 'editor' | 'collaborator' | 'viewer';
export const nodeRoleEnum = z.enum([
  'admin',
  'editor',
  'collaborator',
  'viewer',
]);

// Optional decorative banner shown at the top of a node container (pages and
// records). The value is a preset key resolved by the UI; unknown values fall
// back to a neutral banner so the palette can evolve safely.
export const nodeCoverSchema = z.object({
  type: z.enum(['color', 'gradient']),
  value: z.string(),
});

export type NodeCover = z.infer<typeof nodeCoverSchema>;

export interface NodeMutationUser {
  id: string;
  role: WorkspaceRole;
  workspaceId: string;
  accountId: string;
}

export type CanCreateNodeContext = {
  user: NodeMutationUser;
  tree: Node[];
  attributes: NodeAttributes;
};

export type CanUpdateAttributesContext = {
  user: NodeMutationUser;
  tree: Node[];
  node: Node;
  attributes: NodeAttributes;
};

export type CanUpdateDocumentContext = {
  user: NodeMutationUser;
  tree: Node[];
  node: Node;
};

export type CanDeleteNodeContext = {
  user: NodeMutationUser;
  tree: Node[];
  node: Node;
};

export interface CanReactNodeContext {
  user: NodeMutationUser;
  tree: Node[];
  node: Node;
}

export type NodeText = {
  name: string | null | undefined;
  attributes: string | null | undefined;
};

export interface NodeModel {
  type: string;
  attributesSchema: z.ZodType;
  documentSchema?: z.ZodType;
  canCreate: (context: CanCreateNodeContext) => boolean;
  canUpdateAttributes: (context: CanUpdateAttributesContext) => boolean;
  canUpdateDocument: (context: CanUpdateDocumentContext) => boolean;
  canDelete: (context: CanDeleteNodeContext) => boolean;
  canReact: (context: CanReactNodeContext) => boolean;
  extractText: (id: string, attributes: NodeAttributes) => NodeText | null;
  extractMentions: (id: string, attributes: NodeAttributes) => Mention[];
  extractDocumentMentions?: (id: string, content: DocumentContent) => Mention[];
}
