import { createContext, useContext } from 'react';

interface PageCommentsContextValue {
  commentsPageId: string | null;
  openComments: (pageId: string) => void;
  closeComments: () => void;
}

export const PageCommentsContext = createContext<PageCommentsContextValue>({
  commentsPageId: null,
  openComments: () => {},
  closeComments: () => {},
});

export const usePageComments = () => useContext(PageCommentsContext);
