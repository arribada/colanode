import { JSONContent } from '@tiptap/core';
import { Lightbulb } from 'lucide-react';

import { EmojiElement } from '@colanode/ui/components/emojis/emoji-element';
import {
  defaultClasses,
  getCalloutColorClass,
} from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';
import { cn } from '@colanode/ui/lib/utils';

interface CalloutRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const CalloutRenderer = ({ node, keyPrefix }: CalloutRendererProps) => {
  const icon = (node.attrs?.icon as string | null) ?? null;
  const color = (node.attrs?.color as string | null) ?? 'default';

  return (
    <div
      data-type="callout"
      data-color={color}
      className={cn(defaultClasses.callout, getCalloutColorClass(color))}
    >
      <div className="flex size-6 select-none items-center justify-center">
        {icon ? (
          <EmojiElement id={icon} className="size-5" />
        ) : (
          <Lightbulb className="size-5 text-muted-foreground" />
        )}
      </div>
      <div className="min-w-0 flex-1">
        <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
      </div>
    </div>
  );
};
