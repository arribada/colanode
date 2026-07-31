import { Check } from 'lucide-react';

import { Button } from '@colanode/ui/components/ui/button';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';
import { cn } from '@colanode/ui/lib/utils';

const replyDefaultOptions = [
  {
    key: 'thread',
    value: 'thread' as const,
    label: 'Reply opens a thread (default)',
    title: 'Open a thread',
  },
  {
    key: 'quote',
    value: 'quote' as const,
    label: 'Reply quotes in channel',
    title: 'Quote in channel',
  },
];

export const AppChatSettings = () => {
  const [replyDefault, setReplyDefault] = useMetadata<'thread' | 'quote'>(
    'app',
    'chat.reply-default'
  );

  const activeValue = replyDefault ?? 'thread';

  return (
    <div className="space-y-6">
      <div>
        <h2 className="text-2xl font-semibold tracking-tight">Chat</h2>
        <Separator className="mt-3" />
      </div>

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {replyDefaultOptions.map((option) => {
          const isActive = activeValue === option.value;

          return (
            <Button
              key={option.key}
              variant="outline"
              aria-pressed={isActive}
              onClick={() => {
                setReplyDefault(option.value);
              }}
              className={cn(
                'relative h-10 w-full justify-start gap-2',
                isActive && 'border-primary ring-1 ring-ring'
              )}
              title={option.title}
            >
              {option.label}
              {isActive && (
                <Check className="absolute -right-2 -top-2 size-5 rounded-full bg-primary p-0.5 text-background" />
              )}
            </Button>
          );
        })}
      </div>
    </div>
  );
};
