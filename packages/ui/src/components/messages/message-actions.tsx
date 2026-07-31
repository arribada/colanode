import { MessagesSquare, Quote, Reply, SquareCheckBig, Trash2 } from 'lucide-react';
import { Fragment, useCallback, useState } from 'react';

import { MessageCreateTaskDialog } from '@colanode/ui/components/messages/message-create-task-dialog';
import { MessageQuickReaction } from '@colanode/ui/components/messages/message-quick-reaction';
import { MessageReactionCreatePopover } from '@colanode/ui/components/messages/message-reaction-create-popover';
import { useConversation } from '@colanode/ui/contexts/conversation';
import { useMessage } from '@colanode/ui/contexts/message';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { defaultEmojis } from '@colanode/ui/lib/assets';
import { buildNodeReactionKey } from '@colanode/ui/lib/nodes';

const MessageAction = ({ children }: { children: React.ReactNode }) => {
  return (
    <li className="flex size-8 cursor-pointer items-center justify-center rounded-md hover:bg-input">
      {children}
    </li>
  );
};

export const MessageActions = () => {
  const message = useMessage();
  const workspace = useWorkspace();
  const conversation = useConversation();
  const [openCreateTask, setOpenCreateTask] = useState(false);

  const handleReactionClick = useCallback(
    (reaction: string) => {
      const reactionKey = buildNodeReactionKey(
        message.id,
        workspace.userId,
        reaction
      );
      if (workspace.collections.nodeReactions.has(reactionKey)) {
        workspace.collections.nodeReactions.delete(reactionKey);
      } else {
        workspace.collections.nodeReactions.insert({
          nodeId: message.id,
          collaboratorId: workspace.userId,
          reaction,
          rootId: conversation.rootId,
          createdAt: new Date().toISOString(),
        });
      }
    },
    [workspace.userId, message.id, conversation.rootId]
  );

  return (
    <Fragment>
    <ul className="invisible absolute -top-5 right-1 z-10 flex flex-row items-center rounded-md bg-muted p-0.5 text-muted-foreground shadow-md group-hover:visible">
      <MessageAction>
        <MessageQuickReaction emoji={defaultEmojis.like} onClick={handleReactionClick} />
      </MessageAction>
      <MessageAction>
        <MessageQuickReaction emoji={defaultEmojis.heart} onClick={handleReactionClick} />
      </MessageAction>
      <MessageAction>
        <MessageQuickReaction emoji={defaultEmojis.check} onClick={handleReactionClick} />
      </MessageAction>
      <div className="mx-1 h-6 w-px bg-border" />
      {message.canReplyInThread && (
        <MessageAction>
          <button
            type="button"
            aria-label="Reply in thread"
            className="flex size-full cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            onClick={() => {
              conversation.onOpenThread(message.id);
            }}
          >
            <MessagesSquare className="size-4" />
          </button>
        </MessageAction>
      )}
      <MessageAction>
        <MessageReactionCreatePopover onReactionClick={handleReactionClick} />
      </MessageAction>
      {conversation.canCreateMessage && (
        <MessageAction>
          <button
            type="button"
            aria-label="Quote reply"
            className="flex size-full cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            onClick={() => {
              conversation.onQuoteReply(message);
            }}
          >
            <Quote className="size-4" />
          </button>
        </MessageAction>
      )}
      {conversation.canCreateMessage && (
        <MessageAction>
          <button
            type="button"
            aria-label="Reply"
            className="flex size-full cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            onClick={() => {
              conversation.onReply(message);
            }}
          >
            <Reply className="size-4" />
          </button>
        </MessageAction>
      )}
      {message.createdBy === workspace.userId && !message.taskId && (
        <MessageAction>
          <button
            type="button"
            aria-label="Create task from message"
            className="flex size-full cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            onClick={() => {
              setOpenCreateTask(true);
            }}
          >
            <SquareCheckBig className="size-4" />
          </button>
        </MessageAction>
      )}
      {message.canDelete && (
        <MessageAction>
          <button
            type="button"
            aria-label="Delete message"
            className="flex size-full cursor-pointer items-center justify-center border-0 bg-transparent p-0"
            onClick={() => {
              message.openDelete();
            }}
          >
            <Trash2 className="size-4" />
          </button>
        </MessageAction>
      )}
    </ul>
    {openCreateTask && (
      <MessageCreateTaskDialog
        open={openCreateTask}
        onOpenChange={setOpenCreateTask}
      />
    )}
    </Fragment>
  );
};
