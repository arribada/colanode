// ABOUTME: Pure transforms that turn a stored suggestion into the "after"
// ABOUTME: RichTextContent the reviewer applies via ydoc.update + document.update.
import { JSONContent } from '@tiptap/core';

import {
  buildEditorContent,
  mapBlocksToContents,
  mapContentsToBlocks,
} from '@colanode/client/lib';
import { Block, RichTextContent } from '@colanode/core';

// The document's top-level blocks are parented to the page/node id, which is
// itself NOT a block. Find that id from any blocks record so the block↔content
// mappers can locate the roots regardless of which parent id the producer used.
export const rootParentIdOf = (content: RichTextContent): string | null => {
  const blocks = content.blocks ?? {};
  const ids = new Set(Object.keys(blocks));
  for (const block of Object.values(blocks)) {
    if (block.parentId && !ids.has(block.parentId)) {
      return block.parentId;
    }
  }
  return null;
};

// Build an index map (blockId -> fractional index) from a document's current
// blocks. Feeding this to mapContentsToBlocks keeps every unchanged block's
// index stable, so ydoc.update produces a minimal delta (only the blocks that
// actually changed are written).
const buildIndexMap = (content: RichTextContent): Map<string, string> => {
  const indexMap = new Map<string, string>();
  for (const [id, block] of Object.entries(content.blocks ?? {})) {
    indexMap.set(id, block.index);
  }
  return indexMap;
};

// Reconstruct the proposed blocks as an array of top-level editor content
// nodes, re-rooting from whatever parent id they were stored under.
const proposedNodes = (proposedContent: RichTextContent): JSONContent[] => {
  const root = rootParentIdOf(proposedContent);
  if (root === null) {
    return [];
  }
  return mapBlocksToContents(root, Object.values(proposedContent.blocks ?? {}));
};

// BLOCK SCOPE: replace ONLY the subtree rooted at `blockId`, leaving every
// other block untouched. The target block keeps its id, its parent (the doc)
// and its fractional index, so it stays exactly in place; its content and
// descendants are swapped for the proposal (descendants keep their freshly
// generated, unique ids). Returns null when the change cannot be applied
// (target block gone / not top-level, or an empty proposal).
export const applyBlockSuggestion = (
  nodeId: string,
  currentContent: RichTextContent,
  blockId: string,
  proposedContent: RichTextContent
): RichTextContent | null => {
  const currentBlocks = currentContent.blocks ?? {};
  const target = currentBlocks[blockId];

  // The target must still exist as a top-level block (parented to the doc).
  if (!target || target.parentId !== nodeId) {
    return null;
  }

  const nodes = proposedNodes(proposedContent);
  const firstProposed = nodes[0];
  if (!firstProposed) {
    return null;
  }

  // Keep the target block in place: the first proposed node takes the target
  // block's id (so, via the index map below, it keeps its position/index). Any
  // further proposed top-level nodes are inserted immediately after it.
  firstProposed.attrs = { ...(firstProposed.attrs ?? {}), id: blockId };

  const currentDoc = buildEditorContent(nodeId, currentContent);
  const currentNodes = currentDoc.content ?? [];
  const targetIndex = currentNodes.findIndex(
    (node) => node.attrs?.id === blockId
  );
  if (targetIndex === -1) {
    return null;
  }

  const newNodes = [
    ...currentNodes.slice(0, targetIndex),
    ...nodes,
    ...currentNodes.slice(targetIndex + 1),
  ];

  // Preserve every unchanged block's index; validateBlocksIndexes (inside
  // mapContentsToBlocks) reflows only the newly inserted nodes.
  const afterBlocks = mapContentsToBlocks(
    nodeId,
    newNodes,
    buildIndexMap(currentContent)
  );

  return { type: 'rich_text', blocks: afterBlocks };
};

// DOCUMENT SCOPE: replace the whole document with the proposal. Unchanged block
// ids keep their index (minimal delta); everything else is rewritten. Returns
// null for an empty proposal.
export const applyDocumentSuggestion = (
  nodeId: string,
  currentContent: RichTextContent,
  proposedContent: RichTextContent
): RichTextContent | null => {
  const nodes = proposedNodes(proposedContent);
  if (nodes.length === 0) {
    return null;
  }
  const afterBlocks = mapContentsToBlocks(
    nodeId,
    nodes,
    buildIndexMap(currentContent)
  );
  return { type: 'rich_text', blocks: afterBlocks };
};

// Extract the current subtree rooted at `blockId` (target block + descendants)
// as its own RichTextContent, for the read-only "original" preview.
export const extractBlockSubtree = (
  nodeId: string,
  currentContent: RichTextContent,
  blockId: string
): RichTextContent | null => {
  const blocks = currentContent.blocks ?? {};
  const target = blocks[blockId];
  if (!target) {
    return null;
  }

  const subtree: Record<string, Block> = {
    [blockId]: { ...target, parentId: nodeId },
  };
  let frontier = [blockId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const block of Object.values(blocks)) {
      if (block.parentId && frontier.includes(block.parentId)) {
        subtree[block.id] = block;
        next.push(block.id);
      }
    }
    frontier = next;
  }

  return { type: 'rich_text', blocks: subtree };
};

// Wrap a SINGLE table row in a synthetic one-row table so it can be rendered on
// its own. A bare `tableRow` has no `<table>` ancestor in the public editor's
// ProseMirror schema and therefore will not render; the synthetic wrapper gives
// it one. The wrapper table:
//   - gets a clearly-synthetic id (prefix `synthetic-table-`): real block ids are
//     `ulid().toLowerCase()` + a 2-char type suffix (lowercase base32, no hyphens),
//     so this can never collide with a real id;
//   - is parented to `nodeId` (the document), so it is the sole block whose parent
//     is not itself a block — `findRootParentId` re-roots there and
//     `buildEditorContent(nodeId, …)` emits `<doc><table><tr>…`;
//   - copies the real table's `attrs` so table-level rendering matches.
// The row is re-parented to the synthetic table; its full cell/content subtree
// (tableCell / tableHeader with colspan / rowspan / colwidth / align /
// backgroundColor / borderStyle attrs, and every descendant) is copied UNCHANGED,
// so cells render correctly.
export const wrapRowInSyntheticTable = (
  nodeId: string,
  content: RichTextContent,
  table: Block,
  rowId: string
): RichTextContent | null => {
  const blocks = content.blocks ?? {};
  const row = blocks[rowId];
  if (!row) {
    return null;
  }

  const syntheticTableId = `synthetic-table-${rowId}`;

  const subtree: Record<string, Block> = {
    [syntheticTableId]: { ...table, id: syntheticTableId, parentId: nodeId },
    [rowId]: { ...row, parentId: syntheticTableId },
  };

  // Copy the row's descendants (cells -> their content -> …) verbatim.
  let frontier = [rowId];
  while (frontier.length > 0) {
    const next: string[] = [];
    for (const block of Object.values(blocks)) {
      if (block.parentId && frontier.includes(block.parentId)) {
        subtree[block.id] = block;
        next.push(block.id);
      }
    }
    frontier = next;
  }

  return { type: 'rich_text', blocks: subtree };
};
