import { VisuallyHidden } from '@radix-ui/react-visually-hidden';
import { MessagesSquare, Quote, Reply, SquareCheckBig, Trash2 } from 'lucide-react';
import { Fragment, useCallback, useState } from 'react';

import { LocalMessageNode } from '@colanode/client/types';
import { MessageCreateTaskDialog } from '@colanode/ui/components/messages/message-create-task-dialog';
import { MessageQuickReaction } from '@colanode/ui/components/messages/message-quick-reaction';
import { MessageReactionCreatePopover } from '@colanode/ui/components/messages/message-reaction-create-popover';
import {
  Sheet,
  SheetContent,
  SheetDescription,
  SheetTitle,
} from '@colanode/ui/components/ui/sheet';
import { useConversation } from '@colanode/ui/contexts/conversation';
import { useMessage } from '@colanode/ui/contexts/message';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { defaultEmojis } from '@colanode/ui/lib/assets';
import { buildNodeReactionKey } from '@colanode/ui/lib/nodes';
import { cn } from '@colanode/ui/lib/utils';

interface MessageMenuMobileProps {
  message: LocalMessageNode;
  isOpen: boolean;
  onOpenChange: (open: boolean) => void;
}

const MenuAction = ({
  children,
  onClick,
  className,
}: {
  children: React.ReactNode;
  onClick?: () => void;
  className?: string;
}) => {
  return (
    <button
      onClick={onClick}
      className={cn(
        'flex items-center gap-3 w-full p-4 text-left hover:bg-accent transition-colors',
        className
      )}
    >
      {children}
    </button>
  );
};

export const MessageMenuMobile = ({
  isOpen,
  onOpenChange,
}: MessageMenuMobileProps) => {
  const workspace = useWorkspace();
  const conversation = useConversation();
  const message = useMessage();
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

      onOpenChange(false);
    },
    [workspace.userId, message.id, conversation.rootId]
  );

  const handleReply = () => {
    conversation.onReply(message);
    onOpenChange(false);
  };

  const handleOpenThread = () => {
    conversation.onOpenThread(message.id);
    onOpenChange(false);
  };

  const handleQuoteReply = () => {
    conversation.onQuoteReply(message);
    onOpenChange(false);
  };

  return (
    <Fragment>
    <Sheet open={isOpen} onOpenChange={onOpenChange}>
      <VisuallyHidden>
        <SheetTitle>Message Actions</SheetTitle>
        <SheetDescription>Actions for the selected message</SheetDescription>
      </VisuallyHidden>
      <SheetContent
        side="bottom"
        className="rounded-t-3xl border-0 p-0"
        aria-describedby="mobile-message-menu-description"
      >
        <div className="p-6 space-y-2">
          <div className="mb-6">
            <p className="text-sm font-medium text-muted-foreground mb-3">
              Quick Reactions
            </p>
            <div className="flex gap-2">
              <div className="flex items-center justify-center w-12 h-12 rounded-xl border hover:bg-accent transition-colors">
                <MessageQuickReaction
                  emoji={defaultEmojis.like}
                  onClick={handleReactionClick}
                />
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl border hover:bg-accent transition-colors">
                <MessageQuickReaction
                  emoji={defaultEmojis.heart}
                  onClick={handleReactionClick}
                />
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl border hover:bg-accent transition-colors">
                <MessageQuickReaction
                  emoji={defaultEmojis.check}
                  onClick={handleReactionClick}
                />
              </div>
              <div className="flex items-center justify-center w-12 h-12 rounded-xl border hover:bg-accent transition-colors">
                <MessageReactionCreatePopover
                  onReactionClick={handleReactionClick}
                />
              </div>
            </div>
          </div>

          {/* Actions Section */}
          <div className="space-y-1">
            {message.canReplyInThread && (
              <MenuAction onClick={handleOpenThread}>
                <MessagesSquare className="size-5 text-muted-foreground" />
                <span>Reply in thread</span>
              </MenuAction>
            )}

            {conversation.canCreateMessage && (
              <MenuAction onClick={handleQuoteReply}>
                <Quote className="size-5 text-muted-foreground" />
                <span>Quote reply</span>
              </MenuAction>
            )}

            {conversation.canCreateMessage && (
              <MenuAction onClick={handleReply}>
                <Reply className="size-5 text-muted-foreground" />
                <span>Reply</span>
              </MenuAction>
            )}

            {message.createdBy === workspace.userId && !message.taskId && (
              <MenuAction
                onClick={() => {
                  onOpenChange(false);
                  setOpenCreateTask(true);
                }}
              >
                <SquareCheckBig className="size-5 text-muted-foreground" />
                <span>Create task</span>
              </MenuAction>
            )}

            {message.canDelete && (
              <MenuAction
                onClick={() => {
                  message.openDelete();
                }}
                className="text-destructive hover:bg-destructive/10"
              >
                <Trash2 className="size-5" />
                <span>Delete message</span>
              </MenuAction>
            )}
          </div>
        </div>
      </SheetContent>
    </Sheet>
    {openCreateTask && (
      <MessageCreateTaskDialog
        open={openCreateTask}
        onOpenChange={setOpenCreateTask}
      />
    )}
    </Fragment>
  );
};
