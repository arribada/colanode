import { createContext, useContext } from 'react';

interface PageSuggestionsContextValue {
  suggestionsPageId: string | null;
  // When set, the panel is in compose mode for this target top-level block id;
  // otherwise it shows the review list for the page.
  composeBlockId: string | null;
  // Open the review list for a page.
  openSuggestions: (pageId: string) => void;
  // Open the composer for a specific block (from the "Suggest edit" toolbar).
  openSuggest: (pageId: string, blockId: string) => void;
  closeSuggestions: () => void;
}

export const PageSuggestionsContext =
  createContext<PageSuggestionsContextValue>({
    suggestionsPageId: null,
    composeBlockId: null,
    openSuggestions: () => {},
    openSuggest: () => {},
    closeSuggestions: () => {},
  });

export const usePageSuggestions = () => useContext(PageSuggestionsContext);
