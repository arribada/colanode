// ABOUTME: A light, distraction-free full-screen reading overlay ("Present")
// ABOUTME: for a page — renders the current document read-only with a close btn.
import { X } from 'lucide-react';
import { lazy, Suspense, useEffect, useMemo } from 'react';

import { DocumentState, DocumentUpdate } from '@colanode/client/types';
import { RichTextContent } from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

// Read-only renderer reused from the public-share / suggestion-preview path. It
// takes a RichTextContent snapshot and renders it non-editable, so the overlay
// never mounts a second live editor for the same node (which would clobber the
// page's presence + export registration).
const PublicShareEditor = lazy(() =>
  import('@colanode/ui/editor/public/public-editor').then((module) => ({
    default: module.PublicShareEditor,
  }))
);

const buildYDoc = (
  state: DocumentState | null | undefined,
  updates: DocumentUpdate[]
) => {
  const ydoc = new YDoc(state?.state);
  for (const update of updates) {
    ydoc.applyUpdate(update.data);
  }
  return ydoc;
};

interface PagePresentOverlayProps {
  pageId: string;
  name: string;
  onClose: () => void;
}

export const PagePresentOverlay = ({
  pageId,
  name,
  onClose,
}: PagePresentOverlayProps) => {
  const workspace = useWorkspace();

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        onClose();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [onClose]);

  const stateQuery = useLiveQuery({
    type: 'document.state.get',
    documentId: pageId,
    userId: workspace.userId,
  });
  const updatesQuery = useLiveQuery({
    type: 'document.updates.list',
    documentId: pageId,
    userId: workspace.userId,
  });

  const content = useMemo<RichTextContent | null>(() => {
    if (stateQuery.isPending || updatesQuery.isPending) {
      return null;
    }
    const ydoc = buildYDoc(stateQuery.data, updatesQuery.data ?? []);
    return ydoc.getObject<RichTextContent>();
  }, [
    stateQuery.isPending,
    stateQuery.data,
    updatesQuery.isPending,
    updatesQuery.data,
  ]);

  return (
    <div className="fixed inset-0 z-50 overflow-y-auto bg-background">
      <div className="sticky top-0 z-10 flex items-center justify-between border-b border-border/60 bg-background/80 px-4 py-2 backdrop-blur">
        <span className="truncate text-sm font-medium text-muted-foreground">
          {name}
        </span>
        <button
          type="button"
          aria-label="Close"
          onClick={onClose}
          className="flex items-center gap-1 rounded-md px-2 py-1 text-sm text-muted-foreground hover:bg-accent hover:text-foreground"
        >
          <X className="size-4" />
          Close
        </button>
      </div>
      <div className="mx-auto w-full max-w-3xl px-6 py-10">
        {content == null ? (
          <div className="flex items-center justify-center py-10">
            <Spinner className="size-5" />
          </div>
        ) : (
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-10">
                <Spinner className="size-5" />
              </div>
            }
          >
            <PublicShareEditor token="" content={content} editable={false} />
          </Suspense>
        )}
      </div>
    </div>
  );
};
