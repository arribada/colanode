// ABOUTME: Deep-copies a page together with its ENTIRE descendant subtree —
// ABOUTME: pages, databases (+ views + records), whiteboards, folders and files.

import type { SelectNode } from '@colanode/client/databases';
import { duplicateNodeDocument } from '@colanode/client/lib/node-document-copy';
import type { WorkspaceService } from '@colanode/client/services/workspaces/workspace-service';
import {
  DatabaseAttributes,
  IdType,
  NodeAttributes,
  NodeType,
  PageAttributes,
  RecordAttributes,
  generateId,
} from '@colanode/core';

// Transform applied to the ROOT page's attributes only (rename it, mark it
// isTemplate, strip isTemplate/deletedAt/deletedBy, ...). The helper always
// overrides parentId with the caller-supplied rootParentId afterwards, so the
// hook neither needs to nor should set it. The root is always a page (every
// caller passes a page); descendant nodes of any copyable type copy their own
// attributes with only their references remapped (see below).
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

// The node types copied as part of a page subtree: pages, databases (together
// with their database_view + record children), whiteboards, folders and files.
// Files are copied best-effort — only when their blob is present locally (see
// the pre-filter below); a file with no local blob is skipped rather than
// copied as a broken, contentless node. Messaging nodes (channel/chat/message)
// never live under a page. A reference block/value pointing at a skipped node
// keeps pointing at the original (the nodeIdMap falls back to it).
const COPYABLE_TYPES: NodeType[] = [
  'page',
  'database',
  'database_view',
  'record',
  'whiteboard',
  'folder',
  'file',
];

// Exported (with the remap helpers below) for unit testing the reference-
// remapping logic; not part of the module's intended public surface.
export const idTypeForNodeType = (type: NodeType): IdType => {
  switch (type) {
    case 'database':
      return IdType.Database;
    case 'database_view':
      return IdType.DatabaseView;
    case 'record':
      return IdType.Record;
    case 'whiteboard':
      return IdType.Whiteboard;
    case 'folder':
      return IdType.Folder;
    case 'file':
      return IdType.File;
    case 'page':
    default:
      return IdType.Page;
  }
};

// Remaps a database's relation-field definitions: a relation field points at
// another database via `databaseId`; when that database is part of the copied
// subtree the copy must point at the duplicated database, otherwise it keeps
// pointing at the original (nodeIdMap fallback). Every other field definition
// (and rollup's internal relationFieldId, which is a field id — not a node id)
// is left untouched.
export const remapDatabaseFields = (
  fields: DatabaseAttributes['fields'],
  nodeIdMap: Map<string, string>
): DatabaseAttributes['fields'] => {
  const result: DatabaseAttributes['fields'] = {};
  for (const [fieldId, field] of Object.entries(fields)) {
    if (field.type === 'relation' && field.databaseId) {
      result[fieldId] = {
        ...field,
        databaseId: nodeIdMap.get(field.databaseId) ?? field.databaseId,
      };
    } else {
      result[fieldId] = field;
    }
  }
  return result;
};

// Remaps a record's field values. Relation values are stored as plain string /
// string_array of record ids (there is no dedicated relation value type), so an
// exact-match lookup against nodeIdMap is safe: it only rewrites a value that is
// EXACTLY an old id of a node copied in this subtree. Node ids are globally
// unique and type-prefixed, so a select-option id, url or free-text value can
// never collide, and a relation pointing outside the subtree falls back to the
// original id.
export const remapRecordFields = (
  fields: RecordAttributes['fields'],
  nodeIdMap: Map<string, string>
): RecordAttributes['fields'] => {
  const result: RecordAttributes['fields'] = {};
  for (const [fieldId, value] of Object.entries(fields)) {
    if (value.type === 'string') {
      result[fieldId] = {
        ...value,
        value: nodeIdMap.get(value.value) ?? value.value,
      };
    } else if (value.type === 'string_array') {
      result[fieldId] = {
        ...value,
        value: value.value.map((id) => nodeIdMap.get(id) ?? id),
      };
    } else {
      result[fieldId] = value;
    }
  }
  return result;
};

// Builds the attributes for a copied DESCENDANT node: its new parent, its
// remapped references, and (for pages/records) template-ness stripped so a
// copied child of a template is never itself a template. Files are handled
// separately (they carry a blob, not attributes-only), so they never reach
// here. The caller owns the ROOT separately (see transformRootAttributes).
export const buildDescendantAttributes = (
  attributes: NodeAttributes,
  newParentId: string,
  nodeIdMap: Map<string, string>
): NodeAttributes => {
  switch (attributes.type) {
    case 'page': {
      const { isTemplate: _isTemplate, ...rest } = attributes;
      return { ...rest, parentId: newParentId };
    }
    case 'record': {
      const { isTemplate: _isTemplate, ...rest } = attributes;
      return {
        ...rest,
        parentId: newParentId,
        databaseId: nodeIdMap.get(rest.databaseId) ?? rest.databaseId,
        fields: remapRecordFields(rest.fields, nodeIdMap),
      };
    }
    case 'database': {
      return {
        ...attributes,
        parentId: newParentId,
        fields: remapDatabaseFields(attributes.fields, nodeIdMap),
      };
    }
    case 'database_view':
    case 'whiteboard':
    case 'folder':
      // A database_view references only internal field ids; a whiteboard scene
      // references only its own element ids; a folder holds nothing but a
      // parent — so these copy verbatim save for the new parent.
      return { ...attributes, parentId: newParentId };
    default:
      // Unreachable: COPYABLE_TYPES only yields the types above (files are
      // handled before this). Returned as-is so the switch stays exhaustive.
      return attributes;
  }
};

// Collects the source page plus EVERY descendant of a copyable type, walking
// parent_id breadth-first so the result is a stable parent-before-child order
// (each level is fully emitted before the next). A visited set guards against
// cycles in a corrupted parent_id chain.
const collectSubtree = async (
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
      .where('type', 'in', COPYABLE_TYPES)
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

// Deep-copies a page's FULL subtree: the page itself plus every descendant of a
// copyable type (pages, databases with their views + records, whiteboards,
// folders and — best-effort — files). Messaging nodes are not copied, and a
// file whose blob is not present locally is skipped (see COPYABLE_TYPES).
//
// The whole old->new node id map is built UP FRONT so that a reference/mention
// block OR a relation field value anywhere in the subtree remaps to the copied
// node it points at (a reference can point at any node in the subtree, in any
// direction). References that point OUTSIDE the copied subtree — or at a skipped
// file — keep pointing at the original node (every remap falls back to it).
//
// Nodes are inserted parent-before-child (the BFS order) so every insert finds
// its already-created new parent (insertNode derives the new root_id from that
// parent's tree). Returns the old->new node id map, root included.
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

  const orderedRows = await collectSubtree(workspace, sourcePageId);

  // Files can only be copied when their blob is present locally; pre-compute
  // which are copyable so non-copyable ones are neither id-mapped nor inserted
  // (references to them then fall back to the original file).
  const fileIds = orderedRows
    .filter((row) => row.type === 'file')
    .map((row) => row.id);
  const copyableFileIds =
    await workspace.files.getLocallyAvailableFileIds(fileIds);

  // Build the full node id map BEFORE inserting anything, so a reference in any
  // node can be remapped to its copied target regardless of processing order.
  const nodeIdMap = new Map<string, string>();
  nodeIdMap.set(sourcePageId, newRootId);
  for (const row of orderedRows) {
    if (nodeIdMap.has(row.id)) {
      continue;
    }
    if (row.type === 'file' && !copyableFileIds.has(row.id)) {
      continue;
    }
    nodeIdMap.set(row.id, generateId(idTypeForNodeType(row.type as NodeType)));
  }

  for (const row of orderedRows) {
    const newId = nodeIdMap.get(row.id);
    if (!newId) {
      // A skipped file (blob not available locally).
      continue;
    }

    if (row.type === 'file') {
      // Files carry a binary blob, not a rich-text document: duplicate the node
      // + copy the local blob (+ queue its own upload) through the file service.
      const newParentId = nodeIdMap.get(row.parent_id ?? '') ?? newRootId;
      await workspace.files.duplicateFile(row, newId, newParentId);
      continue;
    }

    const attributes = JSON.parse(row.attributes) as NodeAttributes;

    if (row.id === sourcePageId) {
      // The caller owns the root (always a page): it picks the parent and
      // rewrites the root's attributes (rename / mark template / strip markers).
      if (attributes.type !== 'page') {
        continue;
      }
      await workspace.nodes.insertNode(newId, {
        ...transformRootAttributes(attributes),
        parentId: rootParentId,
      });
    } else {
      const newParentId = nodeIdMap.get(row.parent_id ?? '') ?? newRootId;
      await workspace.nodes.insertNode(
        newId,
        buildDescendantAttributes(attributes, newParentId, nodeIdMap)
      );
    }

    // Pages and records carry rich-text documents; databases/views/whiteboards/
    // folders have none, in which case this is a no-op (no source document row).
    // Reference blocks in the copied document are remapped through the shared map.
    await duplicateNodeDocument(workspace, row.id, newId, nodeIdMap);
  }

  return nodeIdMap;
};
