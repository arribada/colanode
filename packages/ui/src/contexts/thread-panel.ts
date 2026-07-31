import { createContext, useContext } from 'react';

interface ThreadPanelContextValue {
  threadRootId: string | null;
  openThread: (messageId: string) => void;
  closeThread: () => void;
}

export const ThreadPanelContext = createContext<ThreadPanelContextValue>({
  threadRootId: null,
  openThread: () => {},
  closeThread: () => {},
});

export const useThreadPanel = () => useContext(ThreadPanelContext);
