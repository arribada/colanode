import { createContext, useContext } from 'react';

// Controls the docked "Assistant IA" chat cockpit. Lives at the workspace
// layout level so both the docked panel and the floating toggle share one
// open/closed state (persisted per-user via metadata by the provider).
interface AiChatPanelContextValue {
  isOpen: boolean;
  openPanel: () => void;
  closePanel: () => void;
  togglePanel: () => void;
}

export const AiChatPanelContext = createContext<AiChatPanelContextValue>({
  isOpen: false,
  openPanel: () => {},
  closePanel: () => {},
  togglePanel: () => {},
});

export const useAiChatPanel = () => useContext(AiChatPanelContext);
