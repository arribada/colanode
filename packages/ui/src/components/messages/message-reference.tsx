import { eq, useLiveQuery } from '@tanstack/react-db';

import { LocalMessageNode } from '@colanode/client/types';
import { MessageAuthorAvatar } from '@colanode/ui/components/messages/message-author-avatar';
import { MessageAuthorName } from '@colanode/ui/components/messages/message-author-name';
import { MessageContent } from '@colanode/ui/components/messages/message-content';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface MessageReferenceProps {
  messageId: string;
}

export const MessageReference = ({ messageId }: MessageReferenceProps) => {
  const workspace = useWorkspace();
  const messageGetQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, messageId))
        .findOne(),
    [workspace.userId, messageId]
  );

  if (messageGetQuery.isLoading) {
    return null;
  }

  // Once the query has settled, a missing node (or a node that is no longer a
  // message) means the referenced message was deleted — surface that instead
  // of silently rendering nothing.
  if (!messageGetQuery.data || messageGetQuery.data.type !== 'message') {
    return (
      <div className="flex flex-row gap-2 border-l-4 p-2">
        <span className="text-sm text-muted-foreground">
          Message not found or has been deleted
        </span>
      </div>
    );
  }

  const message = messageGetQuery.data as LocalMessageNode;

  return (
    <div className="flex flex-row gap-2 border-l-4 p-2">
      <MessageAuthorAvatar message={message} className="size-5 mt-1" />
      <div className="grow flex-col gap-1">
        <MessageAuthorName message={message} />
        <MessageContent message={message} />
      </div>
    </div>
  );
};
