import { createContext, useContext } from 'react';

import { LocalMessageNode } from '@colanode/client/types';
import { NodeRole } from '@colanode/core';

interface ConversationContext {
  id: string;
  rootId: string;
  role: NodeRole;
  canCreateMessage: boolean;
  isThread: boolean;
  // Inline comment thread this conversation is scoped to. When set, only
  // messages whose anchorId matches are shown and new messages inherit it.
  anchorId?: string | null;
  onReply: (message: LocalMessageNode) => void;
  onQuoteReply: (message: LocalMessageNode) => void;
  onOpenThread: (messageId: string) => void;
  onLastMessageIdChange: (id: string) => void;
  canDeleteMessage: (message: LocalMessageNode) => boolean;
}

export const ConversationContext = createContext<ConversationContext>(
  {} as ConversationContext
);

export const useConversation = () => useContext(ConversationContext);
