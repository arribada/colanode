// ABOUTME: Block-level diff for a whole-document suggestion — matches top-level
// ABOUTME: blocks by id and shows added / removed / changed / unchanged in order.
import { lazy, Suspense, useMemo, useState } from 'react';

import { Block, EditorNodeTypes, RichTextContent } from '@colanode/core';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import {
  extractBlockSubtree,
  wrapRowInSyntheticTable,
} from '@colanode/ui/lib/suggestions';
import { cn } from '@colanode/ui/lib/utils';

const PublicShareEditor = lazy(() =>
  import('@colanode/ui/editor/public/public-editor').then((module) => ({
    default: module.PublicShareEditor,
  }))
);

const Preview = ({ content }: { content: RichTextContent }) => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center py-3">
        <Spinner className="size-4" />
      </div>
    }
  >
    <PublicShareEditor token="" content={content} editable={false} />
  </Suspense>
);

type DiffStatus = 'unchanged' | 'added' | 'removed' | 'modified';

interface DiffRowData {
  id: string;
  status: DiffStatus;
  index: string;
}

// Top-level blocks (direct children of the document node), in reading order.
const topLevelBlocks = (content: RichTextContent, nodeId: string): Block[] =>
  Object.values(content.blocks ?? {})
    .filter((block) => block.parentId === nodeId)
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));

// Recursively drop volatile / empty values (null, '', {}, []) and sort keys, so
// serialization noise never reads as a real change: the external editor
// re-serializes the whole document, producing empty-vs-absent attrs, empty mark
// arrays, etc. that are semantically identical.
const canonical = (value: unknown): unknown => {
  if (Array.isArray(value)) {
    const arr = value.map(canonical).filter((v) => v !== undefined);
    return arr.length > 0 ? arr : undefined;
  }
  if (value && typeof value === 'object') {
    const out: Record<string, unknown> = {};
    for (const key of Object.keys(value as Record<string, unknown>).sort()) {
      const c = canonical((value as Record<string, unknown>)[key]);
      if (c !== undefined) {
        out[key] = c;
      }
    }
    return Object.keys(out).length > 0 ? out : undefined;
  }
  if (value === null || value === '') {
    return undefined;
  }
  return value;
};

// A STRUCTURAL fingerprint of the subtree rooted at `blockId`, ignoring block
// ids and fractional indexes (only type + content + attrs + child order matter).
// Two blocks with the same visible content therefore match even when the
// external editor regenerated their child ids on submit — killing the
// "everything is CHANGED" false positives.
const fingerprint = (
  blocks: Record<string, Block>,
  blockId: string
): unknown => {
  const block = blocks[blockId];
  if (!block) {
    return null;
  }
  const children = Object.values(blocks)
    .filter((b) => b.parentId === blockId)
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0))
    .map((child) => fingerprint(blocks, child.id));
  return {
    type: block.type,
    content: canonical(block.content),
    attrs: canonical(block.attrs),
    children: children.length > 0 ? children : undefined,
  };
};

const CHIP: Record<DiffStatus, string> = {
  added: 'bg-green-500/15 text-green-700 dark:text-green-300',
  removed: 'bg-red-500/15 text-red-700 dark:text-red-300',
  modified: 'bg-amber-500/15 text-amber-700 dark:text-amber-300',
  unchanged: 'bg-muted text-muted-foreground',
};
const LABEL: Record<DiffStatus, string> = {
  added: 'Added',
  removed: 'Removed',
  modified: 'Changed',
  unchanged: 'Unchanged',
};
const BORDER: Record<DiffStatus, string> = {
  added: 'border-l-green-500',
  removed: 'border-l-red-500',
  modified: 'border-l-amber-500',
  unchanged: 'border-l-border',
};

// ---------------------------------------------------------------------------
// Table row-level diff: when a modified top-level block is a TABLE, diff its
// rows (matched by id) instead of showing the whole table twice.
// ---------------------------------------------------------------------------

// Direct `tableRow` children of a table block, in reading order.
const childRows = (blocks: Record<string, Block>, tableId: string): Block[] =>
  Object.values(blocks)
    .filter(
      (b) => b.parentId === tableId && b.type === EditorNodeTypes.TableRow
    )
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));

// A row is a header row when any of its cells is a `tableHeader`.
const rowHasHeaderCell = (
  blocks: Record<string, Block>,
  rowId: string
): boolean =>
  Object.values(blocks).some(
    (b) => b.parentId === rowId && b.type === EditorNodeTypes.TableHeader
  );

// Is the block a table? (`type === 'table'`, or — defensively — it has
// `tableRow` children.)
const isTableBlock = (content: RichTextContent, blockId: string): boolean => {
  const blocks = content.blocks ?? {};
  const block = blocks[blockId];
  if (!block) {
    return false;
  }
  if (block.type === EditorNodeTypes.Table) {
    return true;
  }
  return Object.values(blocks).some(
    (b) => b.parentId === blockId && b.type === EditorNodeTypes.TableRow
  );
};

interface RowDiff {
  id: string;
  status: DiffStatus;
  index: string;
}

// Match a table's rows BY ID across current & proposed, classify each with the
// SAME structural fingerprint used at the top level, and locate the header row.
const computeRowDiff = (
  current: RichTextContent,
  proposed: RichTextContent,
  tableId: string
): { rows: RowDiff[]; headerRowId: string | null } => {
  const currentMap = current.blocks ?? {};
  const proposedMap = proposed.blocks ?? {};
  const currentById = new Map(childRows(currentMap, tableId).map((r) => [r.id, r]));
  const proposedById = new Map(
    childRows(proposedMap, tableId).map((r) => [r.id, r])
  );

  const ids = new Set<string>([...currentById.keys(), ...proposedById.keys()]);
  const rows: RowDiff[] = [];
  for (const id of ids) {
    const inCurrent = currentById.get(id);
    const inProposed = proposedById.get(id);
    const index = (inProposed ?? inCurrent)!.index;
    let status: DiffStatus;
    if (inCurrent && inProposed) {
      const a = JSON.stringify(fingerprint(currentMap, id));
      const b = JSON.stringify(fingerprint(proposedMap, id));
      status = a === b ? 'unchanged' : 'modified';
    } else if (inProposed) {
      status = 'added';
    } else {
      status = 'removed';
    }
    rows.push({ id, status, index });
  }
  rows.sort((x, y) => (x.index < y.index ? -1 : x.index > y.index ? 1 : 0));

  let headerRowId: string | null = null;
  for (const row of rows) {
    if (
      rowHasHeaderCell(currentMap, row.id) ||
      rowHasHeaderCell(proposedMap, row.id)
    ) {
      headerRowId = row.id;
      break;
    }
  }
  if (headerRowId === null && rows.length > 0) {
    headerRowId = rows[0]!.id;
  }

  return { rows, headerRowId };
};

// Render ONE table row as a real table row by wrapping it in a synthetic
// one-row table (a bare `tableRow` will not render on its own).
const RowPreview = ({
  nodeId,
  content,
  tableId,
  rowId,
}: {
  nodeId: string;
  content: RichTextContent;
  tableId: string;
  rowId: string;
}) => {
  const table = (content.blocks ?? {})[tableId];
  if (!table) {
    return null;
  }
  const tree = wrapRowInSyntheticTable(nodeId, content, table, rowId);
  if (!tree) {
    return null;
  }
  return <Preview content={tree} />;
};

const TableRowDiff = ({
  nodeId,
  tableId,
  current,
  proposed,
}: {
  nodeId: string;
  tableId: string;
  current: RichTextContent;
  proposed: RichTextContent;
}) => {
  const { rows, headerRowId } = useMemo(
    () => computeRowDiff(current, proposed, tableId),
    [current, proposed, tableId]
  );
  const [showUnchanged, setShowUnchanged] = useState(false);

  const headerStatus = rows.find((r) => r.id === headerRowId)?.status;
  const changedRows = rows.filter((r) => r.status !== 'unchanged');

  // Rows are matched by id. If current and proposed share NO row ids at all
  // (both sides non-empty) the editor regenerated the ids, so per-row matching
  // is meaningless — every row would read as removed + added. Detect that.
  const matchedCount = rows.filter(
    (r) => r.status === 'unchanged' || r.status === 'modified'
  ).length;
  const idsDisjoint =
    matchedCount === 0 &&
    rows.some((r) => r.status === 'added') &&
    rows.some((r) => r.status === 'removed');

  // Fall back to the whole-table Before/After when there is no usable per-row
  // signal: no row-level change (only the table's own attrs differ, or rows
  // merely reordered), or the rows have no stable ids to match on.
  if (changedRows.length === 0 || idsDisjoint) {
    const before = extractBlockSubtree(nodeId, current, tableId);
    const after = extractBlockSubtree(nodeId, proposed, tableId);
    return (
      <div className="flex flex-col gap-1.5">
        {before && (
          <div className="rounded bg-red-500/5 p-1.5">
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              Before
            </p>
            <Preview content={before} />
          </div>
        )}
        {after && (
          <div className="rounded bg-green-500/5 p-1.5">
            <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
              After
            </p>
            <Preview content={after} />
          </div>
        )}
      </div>
    );
  }

  // Show the header row as dim context (for column legibility) only when it is
  // itself unchanged — if the header changed it appears in the diff list below.
  const showHeaderContext = headerRowId !== null && headerStatus === 'unchanged';
  const headerContent =
    headerRowId !== null && (current.blocks ?? {})[headerRowId]
      ? current
      : proposed;
  const unchangedRows = rows.filter(
    (r) =>
      r.status === 'unchanged' && !(r.id === headerRowId && showHeaderContext)
  );

  return (
    <div className="flex flex-col gap-1.5">
      {showHeaderContext && headerRowId && (
        <div className="rounded border border-l-2 border-l-border border-border p-1.5 opacity-60">
          <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
            Header
          </p>
          <RowPreview
            nodeId={nodeId}
            content={headerContent}
            tableId={tableId}
            rowId={headerRowId}
          />
        </div>
      )}

      {rows.map((row) => {
        if (row.id === headerRowId && showHeaderContext) {
          return null;
        }
        if (row.status === 'unchanged' && !showUnchanged) {
          return null;
        }
        return (
          <div
            key={row.id}
            className={cn(
              'rounded border border-l-2 border-border py-1 pl-2 pr-1',
              BORDER[row.status],
              row.status === 'unchanged' && 'opacity-60'
            )}
          >
            <span
              className={cn(
                'mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
                CHIP[row.status]
              )}
            >
              {LABEL[row.status]}
            </span>
            {row.status === 'modified' ? (
              <div className="flex flex-col gap-1.5">
                <div className="rounded bg-red-500/5 p-1.5">
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    Before
                  </p>
                  <RowPreview
                    nodeId={nodeId}
                    content={current}
                    tableId={tableId}
                    rowId={row.id}
                  />
                </div>
                <div className="rounded bg-green-500/5 p-1.5">
                  <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                    After
                  </p>
                  <RowPreview
                    nodeId={nodeId}
                    content={proposed}
                    tableId={tableId}
                    rowId={row.id}
                  />
                </div>
              </div>
            ) : row.status === 'removed' ? (
              <div className="rounded bg-red-500/5 p-1.5">
                <RowPreview
                  nodeId={nodeId}
                  content={current}
                  tableId={tableId}
                  rowId={row.id}
                />
              </div>
            ) : row.status === 'added' ? (
              <div className="rounded bg-green-500/5 p-1.5">
                <RowPreview
                  nodeId={nodeId}
                  content={proposed}
                  tableId={tableId}
                  rowId={row.id}
                />
              </div>
            ) : (
              <div className="rounded p-1.5">
                <RowPreview
                  nodeId={nodeId}
                  content={(current.blocks ?? {})[row.id] ? current : proposed}
                  tableId={tableId}
                  rowId={row.id}
                />
              </div>
            )}
          </div>
        );
      })}

      {unchangedRows.length > 0 && (
        <button
          type="button"
          onClick={() => setShowUnchanged((v) => !v)}
          className="self-start text-xs text-blue-600 hover:underline"
        >
          {showUnchanged
            ? 'Hide unchanged rows'
            : `Show ${unchangedRows.length} unchanged row${unchangedRows.length > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
};

const DiffRow = ({
  row,
  nodeId,
  current,
  proposed,
}: {
  row: DiffRowData;
  nodeId: string;
  current: RichTextContent;
  proposed: RichTextContent;
}) => {
  const currentTree = extractBlockSubtree(nodeId, current, row.id);
  const proposedTree = extractBlockSubtree(nodeId, proposed, row.id);

  return (
    <div
      className={cn(
        'rounded border border-l-2 border-border py-1.5 pl-2 pr-1',
        BORDER[row.status],
        row.status === 'unchanged' && 'opacity-60'
      )}
    >
      <span
        className={cn(
          'mb-1 inline-block rounded px-1.5 py-0.5 text-[10px] font-medium uppercase tracking-wide',
          CHIP[row.status]
        )}
      >
        {LABEL[row.status]}
      </span>

      {row.status === 'modified' ? (
        isTableBlock(current, row.id) || isTableBlock(proposed, row.id) ? (
          <TableRowDiff
            nodeId={nodeId}
            tableId={row.id}
            current={current}
            proposed={proposed}
          />
        ) : (
          <div className="flex flex-col gap-1.5">
            {currentTree && (
              <div className="rounded bg-red-500/5 p-1.5">
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  Before
                </p>
                <Preview content={currentTree} />
              </div>
            )}
            {proposedTree && (
              <div className="rounded bg-green-500/5 p-1.5">
                <p className="mb-0.5 text-[10px] uppercase tracking-wide text-muted-foreground">
                  After
                </p>
                <Preview content={proposedTree} />
              </div>
            )}
          </div>
        )
      ) : row.status === 'removed' ? (
        currentTree && (
          <div className="rounded bg-red-500/5 p-1.5">
            <Preview content={currentTree} />
          </div>
        )
      ) : row.status === 'added' ? (
        proposedTree && (
          <div className="rounded bg-green-500/5 p-1.5">
            <Preview content={proposedTree} />
          </div>
        )
      ) : (
        (currentTree ?? proposedTree) && (
          <div className="rounded p-1.5">
            <Preview content={(currentTree ?? proposedTree)!} />
          </div>
        )
      )}
    </div>
  );
};

export const SuggestionDiff = ({
  nodeId,
  current,
  proposed,
}: {
  nodeId: string;
  current: RichTextContent;
  proposed: RichTextContent;
}) => {
  const rows = useMemo<DiffRowData[]>(() => {
    const currentBlocks = topLevelBlocks(current, nodeId);
    const proposedBlocks = topLevelBlocks(proposed, nodeId);
    const currentById = new Map(currentBlocks.map((b) => [b.id, b]));
    const proposedById = new Map(proposedBlocks.map((b) => [b.id, b]));
    const currentMap = current.blocks ?? {};
    const proposedMap = proposed.blocks ?? {};

    const ids = new Set<string>([
      ...currentById.keys(),
      ...proposedById.keys(),
    ]);
    const result: DiffRowData[] = [];
    for (const id of ids) {
      const inCurrent = currentById.get(id);
      const inProposed = proposedById.get(id);
      const index = (inProposed ?? inCurrent)!.index;
      let status: DiffStatus;
      if (inCurrent && inProposed) {
        const a = JSON.stringify(fingerprint(currentMap, id));
        const b = JSON.stringify(fingerprint(proposedMap, id));
        status = a === b ? 'unchanged' : 'modified';
      } else if (inProposed) {
        status = 'added';
      } else {
        status = 'removed';
      }
      result.push({ id, status, index });
    }
    result.sort((x, y) => (x.index < y.index ? -1 : x.index > y.index ? 1 : 0));
    return result;
  }, [current, proposed, nodeId]);

  const [showUnchanged, setShowUnchanged] = useState(false);
  const changedCount = rows.filter((r) => r.status !== 'unchanged').length;
  const unchangedCount = rows.length - changedCount;

  if (rows.length === 0) {
    return <p className="text-xs text-muted-foreground">No content.</p>;
  }

  return (
    <div className="flex flex-col gap-2">
      <p className="text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
        {changedCount === 0
          ? 'No changes'
          : `${changedCount} change${changedCount > 1 ? 's' : ''}`}
      </p>
      {rows.map((row) =>
        row.status === 'unchanged' && !showUnchanged ? null : (
          <DiffRow
            key={row.id}
            row={row}
            nodeId={nodeId}
            current={current}
            proposed={proposed}
          />
        )
      )}
      {unchangedCount > 0 && (
        <button
          type="button"
          onClick={() => setShowUnchanged((v) => !v)}
          className="self-start text-xs text-blue-600 hover:underline"
        >
          {showUnchanged
            ? 'Hide unchanged blocks'
            : `Show ${unchangedCount} unchanged block${unchangedCount > 1 ? 's' : ''}`}
        </button>
      )}
    </div>
  );
};
