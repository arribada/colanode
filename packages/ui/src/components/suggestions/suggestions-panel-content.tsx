import { SuggestionComposer } from '@colanode/ui/components/suggestions/suggestion-composer';
import { SuggestionReviewList } from '@colanode/ui/components/suggestions/suggestion-review-list';
import { usePageSuggestions } from '@colanode/ui/contexts/page-suggestions';

interface SuggestionsPanelContentProps {
  pageId: string;
  // When set, show the composer for this target block; otherwise the review list.
  composeBlockId: string | null;
}

export const SuggestionsPanelContent = ({
  pageId,
  composeBlockId,
}: SuggestionsPanelContentProps) => {
  const { openSuggestions, closeSuggestions } = usePageSuggestions();

  if (composeBlockId) {
    return (
      <SuggestionComposer
        pageId={pageId}
        blockId={composeBlockId}
        onDone={() => openSuggestions(pageId)}
        onCancel={closeSuggestions}
      />
    );
  }

  return <SuggestionReviewList pageId={pageId} />;
};
