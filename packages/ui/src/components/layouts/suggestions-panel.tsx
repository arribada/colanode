import { X } from 'lucide-react';
import { Resizable } from 're-resizable';

import { SuggestionsPanelContent } from '@colanode/ui/components/suggestions/suggestions-panel-content';
import { usePageSuggestions } from '@colanode/ui/contexts/page-suggestions';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useIsMobile } from '@colanode/ui/hooks/use-is-mobile';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

const DEFAULT_WIDTH = 420;

export const SuggestionsPanel = () => {
  const workspace = useWorkspace();
  const isMobile = useIsMobile();
  const { suggestionsPageId, composeBlockId, closeSuggestions } =
    usePageSuggestions();
  const [width, setWidth] = useMetadata<number>(
    workspace.userId,
    'suggestions-panel.width'
  );

  if (!suggestionsPageId) {
    return null;
  }

  const title = composeBlockId ? 'Suggest edit' : 'Suggestions';

  const body = (
    <div className="flex h-full flex-col">
      <div className="flex h-10 shrink-0 flex-row items-center justify-between border-b border-border px-3">
        <p className="text-sm font-semibold">{title}</p>
        <button
          type="button"
          aria-label="Close suggestions"
          className="cursor-pointer text-muted-foreground hover:text-foreground"
          onClick={closeSuggestions}
        >
          <X className="size-4" />
        </button>
      </div>
      <div className="min-h-0 flex-1">
        <SuggestionsPanelContent
          pageId={suggestionsPageId}
          composeBlockId={composeBlockId}
        />
      </div>
    </div>
  );

  if (isMobile) {
    return <div className="fixed inset-0 z-50 bg-background">{body}</div>;
  }

  return (
    <Resizable
      as="aside"
      size={{ width: width ?? DEFAULT_WIDTH, height: '100%' }}
      className="border-l border-border bg-background"
      minWidth={320}
      maxWidth={680}
      enable={{
        bottom: false,
        bottomLeft: false,
        bottomRight: false,
        left: true,
        right: false,
        top: false,
        topLeft: false,
        topRight: false,
      }}
      onResize={(_, __, ref) => setWidth(ref.offsetWidth)}
    >
      {body}
    </Resizable>
  );
};
