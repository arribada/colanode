import { NodeReactionCount, LocalMessageNode } from '@colanode/client/types';
import { MessageReactionCountTooltipContent } from '@colanode/ui/components/messages/message-reaction-count-tooltip-content';
import {
  Tooltip,
  TooltipContent,
  TooltipTrigger,
} from '@colanode/ui/components/ui/tooltip';

interface MessageReactionCountTooltipProps {
  message: LocalMessageNode;
  reactionCount: NodeReactionCount;
  children: React.ReactNode;
  onOpen: () => void;
}

export const MessageReactionCountTooltip = ({
  message,
  reactionCount,
  children,
  onOpen,
}: MessageReactionCountTooltipProps) => {
  if (reactionCount.count === 0) {
    return <>{children}</>;
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>{children}</TooltipTrigger>
      <TooltipContent className="p-2 shadow-md">
        <button
          type="button"
          aria-label="View who reacted"
          className="w-full cursor-pointer border-0 bg-transparent p-0 text-left"
          onClick={onOpen}
        >
          <MessageReactionCountTooltipContent
            message={message}
            reactionCount={reactionCount}
          />
        </button>
      </TooltipContent>
    </Tooltip>
  );
};
