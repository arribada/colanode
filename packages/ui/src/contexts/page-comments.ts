import { createContext, useContext } from 'react';

interface PageCommentsContextValue {
  commentsPageId: string | null;
  // When set, the panel is scoped to a single inline comment thread (the
  // `comment` mark's threadId); otherwise it shows page-level comments.
  commentsAnchorId: string | null;
  openComments: (pageId: string, anchorId?: string | null) => void;
  closeComments: () => void;
}

export const PageCommentsContext = createContext<PageCommentsContextValue>({
  commentsPageId: null,
  commentsAnchorId: null,
  openComments: () => {},
  closeComments: () => {},
});

export const usePageComments = () => useContext(PageCommentsContext);
