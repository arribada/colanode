// ABOUTME: The "Suggest edit" composer — a mini editor seeded with the target
// ABOUTME: block's current content; on submit it stores a pending block suggestion.
import { Editor } from '@tiptap/core';
import { lazy, Suspense, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { mapContentsToBlocks } from '@colanode/client/lib';
import { DocumentState, DocumentUpdate } from '@colanode/client/types';
import { RichTextContent } from '@colanode/core';
import { YDoc } from '@colanode/crdt';
import { Button } from '@colanode/ui/components/ui/button';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { extractBlockSubtree } from '@colanode/ui/lib/suggestions';

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

interface SuggestionComposerProps {
  pageId: string;
  blockId: string;
  onDone: () => void;
  onCancel: () => void;
}

export const SuggestionComposer = ({
  pageId,
  blockId,
  onDone,
  onCancel,
}: SuggestionComposerProps) => {
  const workspace = useWorkspace();
  const [editor, setEditor] = useState<Editor | null>(null);
  const [submitting, setSubmitting] = useState(false);

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

  const seed = useMemo<RichTextContent | null>(() => {
    if (stateQuery.isPending || updatesQuery.isPending) {
      return null;
    }
    const ydoc = buildYDoc(stateQuery.data, updatesQuery.data ?? []);
    const content = ydoc.getObject<RichTextContent>();
    return extractBlockSubtree(pageId, content, blockId);
  }, [
    pageId,
    blockId,
    stateQuery.isPending,
    stateQuery.data,
    updatesQuery.isPending,
    updatesQuery.data,
  ]);

  const submit = async () => {
    if (!editor || submitting) {
      return;
    }
    const json = editor.getJSON();
    const blocks = mapContentsToBlocks(pageId, json.content ?? [], new Map());
    if (Object.keys(blocks).length === 0) {
      toast.error('The suggestion is empty.');
      return;
    }
    setSubmitting(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'document.suggestion.create',
        userId: workspace.userId,
        nodeId: pageId,
        blockId,
        scope: 'block',
        proposedContent: { type: 'rich_text', blocks },
        previewText: editor.getText().slice(0, 2000),
      });
      if (!result.success) {
        toast.error(result.error.message ?? 'Could not submit the suggestion.');
        return;
      }
      toast.success('Suggestion submitted for review.');
      onDone();
    } catch {
      toast.error('Could not submit the suggestion.');
    } finally {
      setSubmitting(false);
    }
  };

  if (stateQuery.isPending || updatesQuery.isPending) {
    return (
      <div className="flex flex-1 items-center justify-center p-6">
        <Spinner className="size-5" />
      </div>
    );
  }

  if (!seed) {
    return (
      <div className="flex flex-1 flex-col gap-3 p-4">
        <p className="text-sm text-muted-foreground">
          The block you selected no longer exists. It may have been edited or
          deleted since.
        </p>
        <Button type="button" variant="secondary" onClick={onCancel}>
          Back
        </Button>
      </div>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto px-4 py-3">
        <p className="mb-3 text-xs text-muted-foreground">
          Edit the block below. Your proposal is sent for review — the page is
          not changed until an editor accepts it.
        </p>
        <div className="rounded-md border border-border p-3">
          <Suspense
            fallback={
              <div className="flex items-center justify-center py-6">
                <Spinner className="size-5" />
              </div>
            }
          >
            <PublicShareEditor
              token=""
              content={seed}
              editable
              onEditorReady={setEditor}
            />
          </Suspense>
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-end gap-2 border-t border-border px-4 py-3">
        <Button
          type="button"
          variant="secondary"
          onClick={onCancel}
          disabled={submitting}
        >
          Cancel
        </Button>
        <Button type="button" onClick={submit} disabled={submitting || !editor}>
          {submitting ? <Spinner className="size-4" /> : 'Submit suggestion'}
        </Button>
      </div>
    </div>
  );
};
