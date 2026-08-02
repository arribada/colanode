// ABOUTME: Deep-copies a page together with its ENTIRE descendant page subtree
// ABOUTME: (recursive BFS), reusing duplicateNodeDocument for block remapping.

import { SelectNode } from '@colanode/client/databases';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import { IdType, PageAttributes, generateId } from '@colanode/core';

// Transform applied to the ROOT page's attributes only (rename it, mark it
// isTemplate, strip isTemplate/deletedAt/deletedBy, ...). The helper always
// overrides parentId with the caller-supplied rootParentId afterwards, so the
// hook neither needs to nor should set it. Descendant pages copy their own
// attributes as-is (minus isTemplate — see below).
export type RootAttributesTransform = (
  attributes: PageAttributes
) => PageAttributes;

export interface DuplicatePageSubtreeOptions {
  workspace: WorkspaceService;
  // Id of the existing page whose subtree is being copied.
  sourcePageId: string;
  // Pre-generated id for the new root copy (the caller returns it to the UI).
  newRootId: string;
  // Parent the new root copy is filed under (the original parent, a space, ...).
  rootParentId: string;
  // Hook that rewrites ONLY the root copy's attributes.
  transformRootAttributes: RootAttributesTransform;
}

// Collects the source page plus EVERY descendant page (type='page'), walking
// parent_id breadth-first so the result is a stable parent-before-child order
// (each level is fully emitted before the next). A visited set guards against
// cycles in a corrupted parent_id chain. Non-page children (records,
// databases, whiteboards, folders, files) are intentionally NOT collected.
const collectPageSubtree = async (
  workspace: WorkspaceService,
  sourcePageId: string
): Promise<SelectNode[]> => {
  const rootRow = await workspace.database
    .selectFrom('nodes')
    .selectAll()
    .where('id', '=', sourcePageId)
    .where('type', '=', 'page')
    .executeTakeFirst();

  if (!rootRow) {
    return [];
  }

  const ordered: SelectNode[] = [rootRow];
  const visited = new Set<string>([sourcePageId]);
  let frontier: string[] = [sourcePageId];

  while (frontier.length > 0) {
    const childRows = await workspace.database
      .selectFrom('nodes')
      .selectAll()
      .where('parent_id', 'in', frontier)
      .where('type', '=', 'page')
      .execute();

    const nextFrontier: string[] = [];
    for (const childRow of childRows) {
      // Defensive cycle guard: a well-formed tree never revisits a node, but a
      // corrupted parent_id chain must not spin this loop forever.
      if (visited.has(childRow.id)) {
        continue;
      }

      visited.add(childRow.id);
      ordered.push(childRow);
      nextFrontier.push(childRow.id);
    }

    frontier = nextFrontier;
  }

  return ordered;
};

// Deep-copies a page's FULL subtree: the page itself plus every descendant
// page, recursively. Only type='page' descendants are copied; non-page
// children (records, databases, whiteboards, folders, files) are left behind.
//
// The whole old->new node id map is built UP FRONT so that reference/mention
// blocks anywhere in the subtree remap to the copied node they point at (a
// block can reference any node in the subtree, in any direction). References
// that point OUTSIDE the copied subtree keep pointing at the original node —
// duplicateNodeDocument falls back to the original id when it is not mapped.
//
// Nodes are inserted parent-before-child (the BFS order) so every insert finds
// its already-created new parent. Returns the old->new node id map, root
// included, for callers/tests that want it.
export const duplicatePageSubtree = async (
  options: DuplicatePageSubtreeOptions
): Promise<Map<string, string>> => {
  const {
    workspace,
    sourcePageId,
    newRootId,
    rootParentId,
    transformRootAttributes,
  } = options;

  const orderedRows = await collectPageSubtree(workspace, sourcePageId);

  // Build the full node id map BEFORE inserting anything, so a reference block
  // in any page can be remapped to its copied target regardless of the order
  // in which the pages are processed.
  const nodeIdMap = new Map<string, string>();
  nodeIdMap.set(sourcePageId, newRootId);
  for (const row of orderedRows) {
    if (nodeIdMap.has(row.id)) {
      continue;
    }
    nodeIdMap.set(row.id, generateId(IdType.Page));
  }

  for (const row of orderedRows) {
    const newId = nodeIdMap.get(row.id);
    if (!newId) {
      continue;
    }

    const attributes = JSON.parse(row.attributes) as PageAttributes;

    if (row.id === sourcePageId) {
      // The caller owns the root: it picks the parent and rewrites the root's
      // attributes (rename / mark template / strip template markers).
      await workspace.nodes.insertNode(newId, {
        ...transformRootAttributes(attributes),
        parentId: rootParentId,
      });
    } else {
      // Descendants copy their attributes verbatim, except template-ness is
      // never propagated: a copied child of a template must not itself be a
      // template. Their new parent is the copied parent, already inserted
      // thanks to the parent-before-child ordering.
      const { isTemplate: _isTemplate, ...rest } = attributes;
      const newParentId = nodeIdMap.get(row.parent_id ?? '') ?? newRootId;
      await workspace.nodes.insertNode(newId, {
        ...rest,
        parentId: newParentId,
      });
    }

    await duplicateNodeDocument(workspace, row.id, newId, nodeIdMap);
  }

  return nodeIdMap;
};
