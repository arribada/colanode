import { generateKeyBetween } from 'fractional-indexing-jittered';

import { Node, NodeAttributes, NodeRole, NodeType } from '@colanode/core';

export const extractNodeCollaborators = (
  attributes: NodeAttributes | NodeAttributes[]
): Record<string, NodeRole> => {
  const items = Array.isArray(attributes) ? attributes : [attributes];
  const collaborators: Record<string, NodeRole> = {};

  for (const item of items) {
    if ('collaborators' in item && item.collaborators) {
      for (const [collaboratorId, role] of Object.entries(item.collaborators)) {
        collaborators[collaboratorId] = role as NodeRole;
      }
    }
  }

  return collaborators;
};

export const extractNodeName = (attributes: NodeAttributes): string | null => {
  if ('name' in attributes && attributes.name) {
    return attributes.name as string;
  }

  return null;
};

export const extractNodeAvatar = (
  attributes: NodeAttributes
): string | null => {
  if ('avatar' in attributes && attributes.avatar) {
    return attributes.avatar as string;
  }

  return null;
};

export const extractNodeRole = (
  tree: Node | Node[],
  collaboratorId: string
): NodeRole | null => {
  const nodes = Array.isArray(tree) ? tree : [tree];
  let role: NodeRole | null = null;
  for (const node of nodes) {
    const collaborators = extractNodeCollaborators(node);
    const collaboratorRole = collaborators[collaboratorId];
    if (collaboratorRole) {
      role = collaboratorRole;
    }
  }

  return role;
};

// Returns true when the node-level collaborators record differs between two
// attribute snapshots. Used by node models to require admin role for
// permission changes while keeping regular edits at editor level.
export const haveNodeCollaboratorsChanged = (
  before: Node | NodeAttributes,
  after: Node | NodeAttributes
): boolean => {
  const beforeCollaborators = extractNodeCollaborators(before);
  const afterCollaborators = extractNodeCollaborators(after);

  const beforeEntries = Object.entries(beforeCollaborators);
  if (beforeEntries.length !== Object.keys(afterCollaborators).length) {
    return true;
  }

  for (const [collaboratorId, role] of beforeEntries) {
    if (afterCollaborators[collaboratorId] !== role) {
      return true;
    }
  }

  return false;
};

export const generateFractionalIndex = (
  previous?: string | null,
  next?: string | null
) => {
  const lower = previous === undefined ? null : previous;
  const upper = next === undefined ? null : next;

  return generateKeyBetween(lower, upper);
};

// Node types that support soft delete (trash). Deleting them from the UI sets
// a deletedAt/deletedBy attribute (synced as a normal update); a hard
// node.delete only happens from the trash ("Delete forever") or for the
// remaining types (space, channel, chat, message, database_view).
export const softDeletableNodeTypes: NodeType[] = [
  'page',
  'folder',
  'database',
  'record',
  'file',
  'whiteboard',
];

export const isSoftDeletableNodeType = (type: NodeType): boolean => {
  return softDeletableNodeTypes.includes(type);
};

export const isNodeTrashed = (
  node: Node | NodeAttributes | { deletedAt?: string | null }
): boolean => {
  return (
    'deletedAt' in node &&
    typeof node.deletedAt === 'string' &&
    node.deletedAt.length > 0
  );
};
