import { FocusPosition } from '@tiptap/core';
import { lazy, Suspense } from 'react';

import { LocalNode } from '@colanode/client/types';
import { DocumentSkeleton } from '@colanode/ui/components/documents/document-skeleton';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

// The TipTap editor (extensions/commands/menus -- most of what used to sit
// in the entry bundle) is only needed once a document is actually opened, so
// it's dynamic-imported here instead of being pulled in by every route that
// can render a Document (pages, records). A viewer who never opens a
// page/record never pays for it.
const DocumentEditor = lazy(() =>
  import('@colanode/ui/components/documents/document-editor').then(
    (module) => ({ default: module.DocumentEditor })
  )
);

interface DocumentProps {
  node: LocalNode;
  canEdit: boolean;
  autoFocus?: FocusPosition;
}

export const Document = ({ node, canEdit, autoFocus }: DocumentProps) => {
  const workspace = useWorkspace();

  const documentStateQuery = useLiveQuery({
    type: 'document.state.get',
    documentId: node.id,
    userId: workspace.userId,
  });

  const documentUpdatesQuery = useLiveQuery({
    type: 'document.updates.list',
    documentId: node.id,
    userId: workspace.userId,
  });

  if (documentStateQuery.isPending || documentUpdatesQuery.isPending) {
    return null;
  }

  const state = documentStateQuery.data ?? null;
  const updates = documentUpdatesQuery.data ?? [];

  return (
    <Suspense fallback={<DocumentSkeleton />}>
      <DocumentEditor
        key={node.id}
        node={node}
        state={state}
        updates={updates}
        canEdit={canEdit}
        // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary field (document title/content) focused when the containing page/record is opened
        autoFocus={autoFocus}
      />
    </Suspense>
  );
};
