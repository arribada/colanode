import { type NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';
import { Lightbulb, PaintBucket } from 'lucide-react';
import { useState } from 'react';

import { EmojiElement } from '@colanode/ui/components/emojis/emoji-element';
import { EmojiPicker } from '@colanode/ui/components/emojis/emoji-picker';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import {
  calloutColors,
  defaultClasses,
  getCalloutColorClass,
} from '@colanode/ui/editor/classes';
import { cn } from '@colanode/ui/lib/utils';

export const CalloutNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const [iconPickerOpen, setIconPickerOpen] = useState(false);

  const icon = (node.attrs.icon as string | null) ?? null;
  const color = (node.attrs.color as string | null) ?? 'default';
  const editable = editor.isEditable;

  const iconElement = icon ? (
    <EmojiElement id={icon} className="size-5" />
  ) : (
    <Lightbulb className="size-5 text-muted-foreground" />
  );

  return (
    <NodeViewWrapper
      data-type="callout"
      data-color={color}
      className={cn(
        defaultClasses.callout,
        getCalloutColorClass(color),
        'group/callout'
      )}
    >
      <div
        contentEditable={false}
        className="flex select-none flex-col items-center gap-1"
      >
        {editable ? (
          <Popover
            open={iconPickerOpen}
            onOpenChange={setIconPickerOpen}
            modal={true}
          >
            <PopoverTrigger
              aria-label="Change callout icon"
              className="flex size-6 cursor-pointer items-center justify-center rounded hover:bg-black/5 dark:hover:bg-white/10"
            >
              {iconElement}
            </PopoverTrigger>
            <PopoverContent className="w-max p-0" align="start">
              <EmojiPicker
                onPick={(emoji, skinTone) => {
                  const id = emoji.skins[skinTone]?.id;
                  if (!id) {
                    return;
                  }

                  updateAttributes({ icon: id });
                  setIconPickerOpen(false);
                }}
              />
            </PopoverContent>
          </Popover>
        ) : (
          <div className="flex size-6 items-center justify-center">
            {iconElement}
          </div>
        )}
        {editable && (
          <DropdownMenu>
            <DropdownMenuTrigger
              aria-label="Change callout color"
              className="flex size-5 cursor-pointer items-center justify-center rounded opacity-0 transition-opacity hover:bg-black/5 group-hover/callout:opacity-100 dark:hover:bg-white/10"
            >
              <PaintBucket className="size-3.5 text-muted-foreground" />
            </DropdownMenuTrigger>
            <DropdownMenuContent align="start">
              {calloutColors.map((calloutColor) => (
                <DropdownMenuItem
                  key={calloutColor.value}
                  onClick={() => updateAttributes({ color: calloutColor.value })}
                >
                  <span
                    className={cn(
                      'size-4 rounded-sm border border-border',
                      calloutColor.class
                    )}
                  />
                  {calloutColor.label}
                </DropdownMenuItem>
              ))}
            </DropdownMenuContent>
          </DropdownMenu>
        )}
      </div>
      <NodeViewContent className="min-w-0 flex-1" />
    </NodeViewWrapper>
  );
};
