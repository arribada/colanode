import { EmojiElement } from '@colanode/ui/components/emojis/emoji-element';
import { useMessage } from '@colanode/ui/contexts/message';
import { useQuery } from '@colanode/ui/hooks/use-query';

interface MessageQuickReactionProps {
  emoji: string;
  onClick: (skinId: string) => void;
}

export const MessageQuickReaction = ({
  emoji,
  onClick,
}: MessageQuickReactionProps) => {
  const message = useMessage();
  const emojiGetQuery = useQuery({
    type: 'emoji.get',
    id: emoji,
  });

  const skinId = emojiGetQuery.data?.skins[0]?.id;
  if (!skinId) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label={`React with ${emojiGetQuery.data?.name ?? emoji}`}
      data-testid={`message-quick-reaction-${message.id}-${emoji}`}
      className="flex size-full cursor-pointer items-center justify-center border-0 bg-transparent p-0"
      onClick={() => onClick(skinId)}
    >
      <EmojiElement id={skinId} className="size-4" />
    </button>
  );
};
