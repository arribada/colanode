// ABOUTME: Block-level diff for a whole-document suggestion — matches top-level
// ABOUTME: blocks by id and shows added / removed / changed / unchanged in order.
import { lazy, Suspense, useMemo, useState } from 'react';

import { Block, RichTextContent } from '@colanode/core';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { extractBlockSubtree } from '@colanode/ui/lib/suggestions';
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
