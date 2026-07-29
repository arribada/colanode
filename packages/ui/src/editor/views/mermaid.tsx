import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';

import { Textarea } from '@colanode/ui/components/ui/textarea';
import { MermaidRender } from '@colanode/ui/editor/mermaid-render';
import { cn } from '@colanode/ui/lib/utils';

export const MermaidNodeView = ({
  node,
  editor,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const source = (node.attrs.source as string | null) ?? '';
  const editable = editor.isEditable;

  // Open the source panel automatically when the block was just inserted empty.
  const [editing, setEditing] = useState(
    editable && source.trim().length === 0 && editor.isFocused
  );

  return (
    <NodeViewWrapper
      data-type="mermaid"
      className={cn('my-1 rounded-md', selected && !editing && 'bg-accent/50')}
    >
      <div contentEditable={false} className="select-none">
        {editable ? (
          <button
            type="button"
            aria-label="Edit diagram"
            className="flex w-full cursor-pointer justify-center overflow-x-auto rounded-md px-3 py-2 hover:bg-muted/50"
            onClick={() => setEditing(true)}
          >
            <MermaidRender source={source} />
          </button>
        ) : (
          <div className="flex w-full justify-center overflow-x-auto px-3 py-2">
            <MermaidRender source={source} />
          </div>
        )}
        {editable && editing && (
          <div className="mt-1 rounded-md border bg-muted/30 p-2">
            <Textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the editing panel exists to edit this value
              autoFocus
              rows={6}
              value={source}
              placeholder={'graph TD\n  A --> B'}
              aria-label="Mermaid diagram source"
              className="min-h-0 font-mono text-sm"
              onChange={(e) => updateAttributes({ source: e.target.value })}
              onKeyDown={(e) => {
                e.stopPropagation();
                if (
                  e.key === 'Escape' ||
                  (e.key === 'Enter' && (e.metaKey || e.ctrlKey))
                ) {
                  e.preventDefault();
                  setEditing(false);
                  editor.commands.focus();
                }
              }}
              onBlur={() => setEditing(false)}
            />
            <p className="mt-1 text-xs text-muted-foreground">
              Mermaid diagram — Escape or Ctrl+Enter to close
            </p>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
