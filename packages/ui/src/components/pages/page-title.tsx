// ABOUTME: The page title at the top of a page: laid over the cover when there is
// ABOUTME: one, and renamed in place by anyone allowed to edit the page.
import { KeyboardEvent, useEffect, useRef, useState } from 'react';

import { LocalPageNode } from '@colanode/client/types';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { resolveTitleEdit } from '@colanode/ui/lib/page-title';
import { cn } from '@colanode/ui/lib/utils';

interface PageTitleProps {
  page: LocalPageNode;
  canEdit: boolean;
  onCover?: boolean;
}

export const PageTitle = ({
  page,
  canEdit,
  onCover = false,
}: PageTitleProps) => {
  const workspace = useWorkspace();
  const [draft, setDraft] = useState(page.name ?? '');
  const cancelledRef = useRef(false);

  // Follow a rename made elsewhere -- the sidebar, the page dialog, another
  // member -- so the field never shows a stale name.
  useEffect(() => {
    setDraft(page.name ?? '');
  }, [page.name]);

  const commit = () => {
    if (cancelledRef.current) {
      cancelledRef.current = false;
      setDraft(page.name ?? '');
      return;
    }

    const next = resolveTitleEdit(draft, page.name);
    if (next === null) {
      setDraft(page.name ?? '');
      return;
    }

    const nodes = workspace.collections.nodes;
    if (!nodes.has(page.id)) {
      return;
    }

    nodes.update(page.id, (node) => {
      if (node.type !== 'page') {
        return;
      }

      node.name = next;
    });
  };

  const onKeyDown = (event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Enter') {
      event.preventDefault();
      event.currentTarget.blur();
    } else if (event.key === 'Escape') {
      // The blur that follows reads the draft from before this render, so the
      // cancellation travels in a ref rather than in state.
      cancelledRef.current = true;
      event.currentTarget.blur();
    }
  };

  const field = (
    <input
      value={draft}
      readOnly={!canEdit}
      onChange={(event) => setDraft(event.target.value)}
      onBlur={commit}
      onKeyDown={onKeyDown}
      placeholder="Untitled"
      aria-label="Page title"
      data-testid="page-title"
      spellCheck={false}
      className={cn(
        'w-full min-w-0 truncate border-none bg-transparent p-0 font-bold tracking-tight outline-none',
        onCover
          ? 'text-3xl text-white drop-shadow placeholder:text-white/60'
          : 'text-4xl text-foreground placeholder:text-muted-foreground/50',
        !canEdit && 'cursor-default'
      )}
    />
  );

  if (onCover) {
    return (
      <div className="absolute inset-x-0 bottom-0 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-6 pb-4 pt-12">
        {field}
      </div>
    );
  }

  return <div className="mb-2 mt-4">{field}</div>;
};
