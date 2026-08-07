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

const EMPTY: RichTextContent = { type: 'rich_text', blocks: {} };

// Top-level blocks (direct children of the document node), in reading order.
const topLevelBlocks = (content: RichTextContent, nodeId: string): Block[] =>
  Object.values(content.blocks ?? {})
    .filter((block) => block.parentId === nodeId)
    .sort((a, b) => (a.index < b.index ? -1 : a.index > b.index ? 1 : 0));

// A stable signature of a block subtree for equality: the volatile fractional
// `index` is dropped (a pure move is not a content change) and keys are sorted.
const signature = (content: RichTextContent | null): string => {
  const blocks = content?.blocks ?? {};
  const normalized: Record<string, unknown> = {};
  for (const id of Object.keys(blocks).sort()) {
    const block = blocks[id]!;
    normalized[id] = {
      type: block.type,
      parentId: block.parentId,
      content: block.content ?? null,
      attrs: block.attrs ?? null,
    };
  }
  return JSON.stringify(normalized);
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
        const a = signature(extractBlockSubtree(nodeId, current, id) ?? EMPTY);
        const b = signature(extractBlockSubtree(nodeId, proposed, id) ?? EMPTY);
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
