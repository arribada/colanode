import { PencilRuler } from 'lucide-react';
import { useCallback, useEffect, useState } from 'react';

import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';
import { usePageSuggestions } from '@colanode/ui/contexts/page-suggestions';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

interface PageSuggestionsButtonProps {
  pageId: string;
}

export const PageSuggestionsButton = ({
  pageId,
}: PageSuggestionsButtonProps) => {
  const workspace = useWorkspace();
  const { suggestionsPageId, openSuggestions, closeSuggestions } =
    usePageSuggestions();
  const [count, setCount] = useState(0);

  const isOpen = suggestionsPageId === pageId;

  const refresh = useCallback(async () => {
    try {
      const result = await window.colanode.executeMutation({
        type: 'document.suggestion.list',
        userId: workspace.userId,
        nodeId: pageId,
      });
      if (result.success) {
        setCount(result.output.suggestions.length);
      }
    } catch {
      // leave the count as-is
    }
  }, [workspace.userId, pageId]);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  // Auto-refresh so pending feedback (member or external guest) shows up on the
  // badge WITHOUT a manual reload: poll on an interval + re-count when the tab
  // regains focus. Notification events already trigger a re-count when they
  // sync, but polling covers the case where they haven't yet.
  useEffect(() => {
    const interval = window.setInterval(() => void refresh(), 15000);
    const onFocus = () => void refresh();
    window.addEventListener('focus', onFocus);
    document.addEventListener('visibilitychange', onFocus);
    return () => {
      window.clearInterval(interval);
      window.removeEventListener('focus', onFocus);
      document.removeEventListener('visibilitychange', onFocus);
    };
  }, [refresh]);

  // Re-count whenever this page's panel closes (a review may have resolved some).
  useEffect(() => {
    if (suggestionsPageId !== pageId) {
      void refresh();
    }
  }, [suggestionsPageId, pageId, refresh]);

  // Keep the count LIVE: a new suggestion fires a notification to the owner, so
  // re-count on any notification event — the badge then updates while they are
  // on the page, without a reload.
  useEffect(() => {
    const subscriptionId = window.eventBus.subscribe((event) => {
      if (
        event.type === 'notification.created' ||
        event.type === 'notification.read'
      ) {
        void refresh();
      }
    });
    return () => window.eventBus.unsubscribe(subscriptionId);
  }, [refresh]);

  const hasPending = count > 0;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <button
          type="button"
          aria-label={isOpen ? 'Close suggestions' : 'Open suggestions'}
          data-testid={`page-suggestions-button-${pageId}`}
          className={cn(
            'flex cursor-pointer flex-row items-center gap-1 rounded-md p-1 hover:bg-accent',
            hasPending
              ? 'text-amber-600 hover:text-amber-700'
              : 'text-muted-foreground hover:text-foreground',
            isOpen && 'bg-accent text-foreground'
          )}
          onClick={() => {
            if (isOpen) {
              closeSuggestions();
            } else {
              openSuggestions(pageId);
            }
          }}
        >
          <PencilRuler className="size-4" />
          {hasPending && (
            <span className="rounded-full bg-amber-500 px-1.5 text-xs font-medium tabular-nums text-white">
              {count}
            </span>
          )}
        </button>
      </TooltipTrigger>
      <TooltipContent>
        {hasPending
          ? `${count} proposed edit${count > 1 ? 's' : ''} from members/guests — click to review &amp; approve change by change`
          : 'Proposed edits (from members or external guests)'}
      </TooltipContent>
    </Tooltip>
  );
};
