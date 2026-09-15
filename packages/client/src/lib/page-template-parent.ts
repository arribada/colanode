// ABOUTME: Rules for where "New from template" may file a copy (a space, page or
// ABOUTME: folder of the template's space) and the index that puts it last there.
import type { LocalNode } from '@colanode/client/types/nodes';
import {
  compareString,
  extractNodeRole,
  generateFractionalIndex,
  hasNodeRole,
  isNodeTrashed,
} from '@colanode/core';

// The node types that hold pages in the sidebar tree. Databases, whiteboards
// and records have their own children, so a page tree never goes under them.
export const TEMPLATE_PARENT_TYPES = ['space', 'page', 'folder'] as const;

/**
 * Why the template copy cannot go under `parentId`, or null when it can.
 * `tree` is the parent's ancestor chain, root (the space) first and the parent
 * itself last — what fetchNodeTree returns.
 */
export const getTemplateParentError = (
  tree: LocalNode[],
  parentId: string,
  spaceId: string,
  userId: string
): string | null => {
  const parent = tree[tree.length - 1];
  if (!parent || parent.id !== parentId) {
    return 'The page or folder to create under could not be found.';
  }

  if (!(TEMPLATE_PARENT_TYPES as readonly string[]).includes(parent.type)) {
    return 'Pages from a template can only be created in a space, page or folder.';
  }

  if (tree[0]?.id !== spaceId) {
    return 'Templates can only be used inside their own space.';
  }

  if (tree.some((node) => isNodeTrashed(node))) {
    return 'Cannot create a page inside something that is in the trash.';
  }

  const role = extractNodeRole(tree, userId);
  if (!role || !hasNodeRole(role, 'editor')) {
    return "You don't have permission to create pages here.";
  }

  return null;
};

/**
 * An index that sorts after every existing child of a parent, using the same
 * model as the sidebar tree: siblings in id order get sequential default keys
 * and a node's own `index` overrides its default.
 *
 * Once the new node exists it takes a slot in that id order too, pushing the
 * default key of every sibling after it one step up. Its id is usually the
 * newest, but ids from another device's clock need not be, so each sibling's
 * default is taken one slot higher than today — the most it can become.
 * Likewise, passing more children than the sidebar shows (files, trashed
 * nodes) only raises the maximum. Null when no key can be derived (a malformed
 * custom index): the copy then falls back to id order.
 */
export const generateAppendIndex = (
  siblings: { id: string; index?: string | null }[]
): string | null => {
  const sortedById = siblings.toSorted((a, b) => compareString(a.id, b.id));

  // The slot the new node may take ahead of every sibling.
  let lastDefault: string | null = generateFractionalIndex(null, null);
  let max: string | null = null;
  for (const sibling of sortedById) {
    lastDefault = generateFractionalIndex(lastDefault, null);
    const key =
      typeof sibling.index === 'string' && sibling.index.length > 0
        ? sibling.index
        : lastDefault;
    if (max === null || compareString(key, max) > 0) {
      max = key;
    }
  }

  try {
    return generateFractionalIndex(max, null);
  } catch {
    return null;
  }
};
