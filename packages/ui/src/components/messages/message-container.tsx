import { LocalMessageNode } from '@colanode/client/types';
import { NodeRole } from '@colanode/core';
import { Message } from '@colanode/ui/components/messages/message';
import { ConversationContext } from '@colanode/ui/contexts/conversation';

interface MessageContainerProps {
  message: LocalMessageNode;
  role: NodeRole;
}

export const MessageContainer = ({ message, role }: MessageContainerProps) => {
  return (
    <ConversationContext.Provider
      value={{
        id: message.id,
        role: role,
        rootId: message.rootId,
        // No composer is mounted in the standalone message view, so message
        // creation must be off — otherwise the Reply/Quote controls render
        // with no backing behaviour. Reactions and Create-task use
        // collections/mutations directly and do not depend on this flag.
        canCreateMessage: false,
        isThread: false,
        onReply: () => {},
        onQuoteReply: () => {},
        onOpenThread: () => {},
        onLastMessageIdChange: () => {},
        canDeleteMessage: () => false,
      }}
    >
      <Message message={message} />
    </ConversationContext.Provider>
  );
};
