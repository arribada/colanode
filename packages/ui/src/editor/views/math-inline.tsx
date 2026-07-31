import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';

import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { MathRender } from '@colanode/ui/editor/math-render';
import { cn } from '@colanode/ui/lib/utils';

export const MathInlineNodeView = ({
  node,
  editor,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const latex = (node.attrs.latex as string | null) ?? '';
  const editable = editor.isEditable;

  // Open the editor right away when the node was just inserted empty (slash
  // command or input rule). Nodes loaded empty from an unfocused document
  // stay closed.
  const [open, setOpen] = useState(
    editable && latex.length === 0 && editor.isFocused
  );

  if (!editable) {
    return (
      <NodeViewWrapper as="span" data-type="math-inline" className="inline">
        <MathRender latex={latex} display={false} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper
      as="span"
      data-type="math-inline"
      className={cn('inline rounded', selected && 'bg-accent')}
    >
      <Popover open={open} onOpenChange={setOpen} modal={true}>
        <PopoverTrigger
          aria-label="Edit math"
          className="cursor-pointer rounded px-0.5 hover:bg-muted/70"
        >
          <MathRender latex={latex} display={false} />
        </PopoverTrigger>
        <PopoverContent className="w-80 p-2" align="start">
          <Textarea
            // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the popover exists to edit this value
            autoFocus
            rows={2}
            value={latex}
            placeholder="E = mc^2"
            aria-label="LaTeX expression"
            className="min-h-0 font-mono text-sm"
            onChange={(e) => updateAttributes({ latex: e.target.value })}
            onKeyDown={(e) => {
              e.stopPropagation();
              if (
                (e.key === 'Enter' && !e.shiftKey) ||
                e.key === 'Escape'
              ) {
                e.preventDefault();
                setOpen(false);
                editor.commands.focus();
              }
            }}
          />
          <p className="mt-1 text-xs text-muted-foreground">
            LaTeX expression — Enter to close
          </p>
        </PopoverContent>
      </Popover>
    </NodeViewWrapper>
  );
};
