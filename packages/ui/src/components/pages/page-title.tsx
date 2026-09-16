// ABOUTME: The page title at the top of a page: laid over the cover when there is
// ABOUTME: one, and renamed in place by anyone allowed to edit the page.
import { KeyboardEvent, useEffect, useRef, useState } from 'react';

import { LocalPageNode } from '@colanode/client/types';
import { SameNameHint } from '@colanode/ui/components/nodes/same-name-hint';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { resolveTitleEdit } from '@colanode/ui/lib/page-title';
import { cn } from '@colanode/ui/lib/utils';

const HINT_LINGER_MS = 500;

interface PageTitleProps {
  page: LocalPageNode;
  canEdit: boolean;
  // Where the title sits: over a real cover (white, on the dark gradient that
  // keeps it readable over any picture), over the grey band a page without a
  // cover shows (the page's own colours), or on its own above the text.
  placement?: 'cover' | 'placeholder' | 'inline';
}

export const PageTitle = ({
  page,
  canEdit,
  placement = 'inline',
}: PageTitleProps) => {
  const workspace = useWorkspace();
  const [draft, setDraft] = useState(page.name ?? '');
  const [editing, setEditing] = useState(false);
  const [nameAtFocus, setNameAtFocus] = useState(page.name ?? '');
  const cancelledRef = useRef(false);
  const blurTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (blurTimer.current) {
        clearTimeout(blurTimer.current);
      }
    },
    []
  );

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
      onFocus={() => {
        if (blurTimer.current) {
          clearTimeout(blurTimer.current);
          blurTimer.current = null;
        }
        setNameAtFocus(page.name ?? '');
        setEditing(true);
      }}
      onBlur={() => {
        commit();
        // Pressing the hint's link is what blurs the field: the hint has to
        // outlive the blur long enough for that click to land on it.
        blurTimer.current = setTimeout(
          () => setEditing(false),
          HINT_LINGER_MS
        );
      }}
      onKeyDown={onKeyDown}
      placeholder="Untitled"
      aria-label="Page title"
      data-testid="page-title"
      spellCheck={false}
      className={cn(
        'w-full min-w-0 truncate border-none bg-transparent p-0 font-bold tracking-tight outline-none',
        placement === 'inline' ? 'text-4xl' : 'text-3xl',
        placement === 'cover'
          ? 'text-white drop-shadow placeholder:text-white/60'
          : 'text-foreground placeholder:text-muted-foreground/50',
        !canEdit && 'cursor-default'
      )}
    />
  );

  // Only while a new title is being typed: an existing duplicate is not news
  // every time the page opens.
  const hint = (
    <SameNameHint
      rootId={page.rootId}
      name={draft}
      excludeId={page.id}
      // Compared with the name the field had when focused, not the saved one:
      // the blur saves the new title, and the hint must survive that save.
      enabled={
        canEdit && editing && resolveTitleEdit(draft, nameAtFocus) !== null
      }
      onCover={placement === 'cover'}
    />
  );

  if (placement === 'cover') {
    return (
      <div className="absolute inset-x-0 bottom-0 z-10 bg-gradient-to-t from-black/60 via-black/25 to-transparent px-6 pb-4 pt-12">
        {field}
        {hint}
      </div>
    );
  }

  if (placement === 'placeholder') {
    // Same place as over a real cover, on the grey band: no dark gradient, so
    // the title keeps the colour the rest of the page uses.
    return (
      <div className="absolute inset-x-0 bottom-0 z-10 px-6 pb-4 pt-12">
        {field}
        {hint}
      </div>
    );
  }

  return (
    <div className="mb-2 mt-4">
      {field}
      {hint}
    </div>
  );
};
