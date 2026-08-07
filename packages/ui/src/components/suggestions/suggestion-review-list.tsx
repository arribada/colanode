// ABOUTME: Review list for a page's pending suggestions — shows original vs
// ABOUTME: proposed and applies the change client-side on Accept (block or doc).
import { eq, useLiveQuery as useCollectionQuery } from '@tanstack/react-db';
import {
  lazy,
  Suspense,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { toast } from 'sonner';

import { DocumentSuggestionItem } from '@colanode/client/mutations';
import { DocumentState, DocumentUpdate } from '@colanode/client/types';
import {
  extractNodeRole,
  hasNodeRole,
  RichTextContent,
  richTextContentSchema,
} from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';
import { SuggestionDiff } from '@colanode/ui/components/suggestions/suggestion-diff';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import {
  applyBlockSuggestion,
  applyDocumentSuggestion,
  extractBlockSubtree,
} from '@colanode/ui/lib/suggestions';

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

const ReadOnlyPreview = ({ content }: { content: RichTextContent }) => (
  <Suspense
    fallback={
      <div className="flex items-center justify-center py-4">
        <Spinner className="size-4" />
      </div>
    }
  >
    <PublicShareEditor token="" content={content} editable={false} />
  </Suspense>
);

interface SuggestionReviewListProps {
  pageId: string;
}

export const SuggestionReviewList = ({ pageId }: SuggestionReviewListProps) => {
  const workspace = useWorkspace();
  const [suggestions, setSuggestions] = useState<DocumentSuggestionItem[]>([]);
  const [loading, setLoading] = useState(false);
  const [expanded, setExpanded] = useState<string | null>(null);
  const [busy, setBusy] = useState<string | null>(null);
  // Suggestions whose document change we already applied this session. Even if
  // the server-side resolve failed (they stay 'pending' on the server), they
  // must never be offered for Accept again — re-applying a document-scope
  // proposal would delete edits made in between. refresh() filters these out.
  const appliedIdsRef = useRef<Set<string>>(new Set());

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

  const currentContent = useMemo<RichTextContent | null>(() => {
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

  const pageQuery = useCollectionQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, pageId))
        .findOne(),
    [workspace.userId, pageId]
  );
  const page = pageQuery.data;
  const rootNodeQuery = useCollectionQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, page?.rootId ?? ''))
        .findOne(),
    [workspace.userId, page?.rootId]
  );
  const rootNode = rootNodeQuery.data;
  const role = rootNode ? extractNodeRole(rootNode, workspace.userId) : null;
  const canReview = role ? hasNodeRole(role, 'editor') : false;

  // Page lock: when the page is locked or in suggest mode, only a privileged
  // user (the page creator or a node admin) may APPLY a suggestion - the server
  // enforces this in document.update, so mirror it here to keep the Accept
  // button honest. Null/absent lock => 'open', so unlocked pages are unaffected.
  const pageNode = page && page.type === 'page' ? page : null;
  const lockMode = pageNode?.lockMode ?? 'open';
  const isPrivileged =
    !!pageNode &&
    (pageNode.createdBy === workspace.userId ||
      (role ? hasNodeRole(role, 'admin') : false));
  const applyRestricted = lockMode === 'locked' || lockMode === 'suggest';
  const canAccept = canReview && (!applyRestricted || isPrivileged);

  const refresh = useCallback(async () => {
    setLoading(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'document.suggestion.list',
        userId: workspace.userId,
        nodeId: pageId,
      });
      if (result.success) {
        setSuggestions(
          result.output.suggestions.filter(
            (s) => !appliedIdsRef.current.has(s.id)
          )
        );
      }
    } catch {
      // leave the list as-is
    } finally {
      setLoading(false);
    }
  }, [workspace.userId, pageId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // No own interval / focus listeners here: the always-mounted suggestions badge
  // (page-suggestions-button) already polls + refreshes on tab return, so running
  // a second set from this panel meant a double fetch of document.suggestion.list
  // whenever it was open. This list refreshes on open (above) and after every
  // accept/reject, which is enough while the panel is the active view.

  const accept = async (suggestion: DocumentSuggestionItem) => {
    if (!canAccept || busy) {
      return;
    }
    setBusy(suggestion.id);
    try {
      // Build a fresh YDoc from the page's current synced state so the delta is
      // computed against exactly what the server has (same path as the editor's
      // debouncedSave), then let document.update re-authorise + merge it.
      const ydoc = buildYDoc(stateQuery.data, updatesQuery.data ?? []);
      const content = ydoc.getObject<RichTextContent>();

      const afterContent =
        suggestion.scope === 'document'
          ? applyDocumentSuggestion(
              suggestion.nodeId,
              content,
              suggestion.proposedContent
            )
          : suggestion.blockId
            ? applyBlockSuggestion(
                suggestion.nodeId,
                content,
                suggestion.blockId,
                suggestion.proposedContent
              )
            : null;

      if (!afterContent) {
        toast.error(
          'This suggestion can no longer be applied — the target block may have changed or been deleted.'
        );
        return;
      }

      const update = ydoc.update(richTextContentSchema, afterContent);
      if (update) {
        const applied = await window.colanode.executeMutation({
          type: 'document.update',
          userId: workspace.userId,
          documentId: suggestion.nodeId,
          update: encodeState(update),
        });
        if (!applied.success) {
          // e.g. the reviewer lost edit rights — do NOT resolve.
          toast.error(applied.error.message ?? 'Could not apply the change.');
          return;
        }
      }

      // The change is now in the document. Guard against re-accepting it: even
      // if the resolve below fails, re-applying a document-scope proposal would
      // clobber edits made in the meantime. Mark it applied and drop it locally
      // so no refresh (trailing, poll, or focus) can offer it again this
      // session.
      appliedIdsRef.current.add(suggestion.id);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));

      const resolved = await window.colanode.executeMutation({
        type: 'document.suggestion.resolve',
        userId: workspace.userId,
        suggestionId: suggestion.id,
        status: 'accepted',
      });
      if (!resolved.success) {
        toast.error(
          'The change was applied but the suggestion could not be marked resolved.'
        );
      } else {
        toast.success('Suggestion accepted and applied.');
      }
      await refresh();
    } catch {
      toast.error('Could not accept the suggestion.');
    } finally {
      setBusy(null);
    }
  };

  const reject = async (suggestion: DocumentSuggestionItem) => {
    if (!canReview || busy) {
      return;
    }
    setBusy(suggestion.id);
    try {
      const resolved = await window.colanode.executeMutation({
        type: 'document.suggestion.resolve',
        userId: workspace.userId,
        suggestionId: suggestion.id,
        status: 'rejected',
      });
      if (!resolved.success) {
        toast.error('Could not reject the suggestion.');
      }
      await refresh();
    } catch {
      toast.error('Could not reject the suggestion.');
    } finally {
      setBusy(null);
    }
  };

  if (pageQuery.isLoading) {
    return (
      <div className="flex items-center justify-center p-6">
        <Spinner className="size-4" />
      </div>
    );
  }
  if (!page || (page.type !== 'page' && page.type !== 'record')) {
    return (
      <p className="p-4 text-sm text-muted-foreground">Page not found.</p>
    );
  }

  return (
    <div className="flex h-full min-h-0 flex-col">
      <div className="min-h-0 flex-1 overflow-y-auto p-4">
        {loading && suggestions.length === 0 && (
          <div className="flex items-center justify-center py-6">
            <Spinner className="size-5" />
          </div>
        )}
        {!loading && suggestions.length === 0 && (
          <p className="text-sm text-muted-foreground">
            No pending suggestions. Select some text and choose “Suggest edit”
            to propose a change.
          </p>
        )}
        {!canReview && suggestions.length > 0 && (
          <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
            You can see pending suggestions, but only an editor of this page can
            accept or reject them.
          </p>
        )}
        {canReview &&
          applyRestricted &&
          !isPrivileged &&
          suggestions.length > 0 && (
            <p className="mb-3 rounded-md bg-muted px-3 py-2 text-xs text-muted-foreground">
              This page is locked. You can review and reject suggestions, but
              only the page owner or an admin can accept them.
            </p>
          )}
        <div className="flex flex-col gap-3">
          {suggestions.map((suggestion) => {
            const isExpanded = expanded === suggestion.id;
            const original =
              suggestion.scope === 'block' && suggestion.blockId && currentContent
                ? extractBlockSubtree(
                    suggestion.nodeId,
                    currentContent,
                    suggestion.blockId
                  )
                : null;
            const isBusy = busy === suggestion.id;
            return (
              <div
                key={suggestion.id}
                className="rounded-md border border-border p-3 text-sm"
              >
                <div className="flex items-center gap-2">
                  <span className="min-w-0 flex-1 truncate">
                    <span className="font-medium">
                      {suggestion.authorName ?? 'A contributor'}
                    </span>{' '}
                    <span
                      className="rounded bg-muted px-1.5 py-0.5 text-[10px] uppercase tracking-wide text-muted-foreground"
                      title={
                        suggestion.origin === 'external'
                          ? 'From a public share link'
                          : 'From a workspace member'
                      }
                    >
                      {suggestion.origin === 'external' ? 'External' : 'Member'}
                    </span>{' '}
                    {suggestion.scope === 'document' && (
                      <span className="text-xs text-muted-foreground">
                        whole page
                      </span>
                    )}
                  </span>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded(isExpanded ? null : suggestion.id)
                    }
                    className="shrink-0 text-xs text-blue-600 hover:underline"
                  >
                    {isExpanded ? 'Hide' : 'View'}
                  </button>
                </div>

                {suggestion.previewText && !isExpanded && (
                  <p className="mt-1 line-clamp-2 text-xs text-muted-foreground">
                    {suggestion.previewText}
                  </p>
                )}

                {isExpanded && (
                  <div className="mt-3 flex flex-col gap-3">
                    {original && (
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Current
                        </p>
                        <div className="rounded border border-border bg-muted/40 p-2">
                          <ReadOnlyPreview content={original} />
                        </div>
                      </div>
                    )}
                    {suggestion.scope === 'document' ? (
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Proposed changes
                        </p>
                        <SuggestionDiff
                          nodeId={suggestion.nodeId}
                          current={
                            currentContent ?? { type: 'rich_text', blocks: {} }
                          }
                          proposed={suggestion.proposedContent}
                        />
                      </div>
                    ) : (
                      <div>
                        <p className="mb-1 text-[11px] font-medium uppercase tracking-wide text-muted-foreground">
                          Proposed
                        </p>
                        <div className="rounded border border-border bg-green-500/5 p-2">
                          <ReadOnlyPreview
                            content={suggestion.proposedContent}
                          />
                        </div>
                      </div>
                    )}
                    {suggestion.scope === 'document' &&
                      suggestion.origin === 'external' && (
                        <p className="rounded-md bg-amber-500/10 px-2 py-1.5 text-[11px] text-amber-700 dark:text-amber-400">
                          Accepting replaces the entire page with this proposal.
                          Content an external editor cannot represent (mentions,
                          embedded files, databases, whiteboards) is not carried
                          over — review carefully before accepting.
                        </p>
                      )}
                  </div>
                )}

                <div className="mt-3 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    disabled={!canReview || isBusy}
                    onClick={() => void reject(suggestion)}
                    className="rounded border px-2.5 py-1 text-xs hover:bg-accent disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    Reject
                  </button>
                  <button
                    type="button"
                    disabled={!canAccept || isBusy}
                    onClick={() => void accept(suggestion)}
                    title={
                      applyRestricted && !isPrivileged
                        ? 'This page is locked - only the page owner or an admin can accept suggestions.'
                        : undefined
                    }
                    className="flex items-center gap-1 rounded bg-green-600 px-2.5 py-1 text-xs text-white hover:bg-green-700 disabled:cursor-not-allowed disabled:opacity-50"
                  >
                    {isBusy ? <Spinner className="size-3" /> : null}
                    Accept
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
