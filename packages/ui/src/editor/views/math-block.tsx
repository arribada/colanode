import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { useState } from 'react';

import { Textarea } from '@colanode/ui/components/ui/textarea';
import { MathRender } from '@colanode/ui/editor/math-render';
import { cn } from '@colanode/ui/lib/utils';

export const MathBlockNodeView = ({
  node,
  editor,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const latex = (node.attrs.latex as string | null) ?? '';
  const editable = editor.isEditable;

  // Start in editing mode when the block was just inserted empty (slash
  // command or input rule). Empty blocks loaded from an unfocused document
  // stay closed.
  const [editing, setEditing] = useState(
    editable && latex.length === 0 && editor.isFocused
  );

  return (
    <NodeViewWrapper
      data-type="math-block"
      className={cn(
        'my-1 rounded-md',
        selected && !editing && 'bg-accent/50'
      )}
    >
      <div contentEditable={false} className="select-none">
        {editable ? (
          <button
            type="button"
            aria-label="Edit math block"
            className="flex w-full cursor-pointer justify-center overflow-x-auto rounded-md px-3 py-2 hover:bg-muted/50"
            onClick={() => setEditing(true)}
          >
            <MathRender latex={latex} display={true} />
          </button>
        ) : (
          <div className="flex w-full justify-center overflow-x-auto px-3 py-2">
            <MathRender latex={latex} display={true} />
          </div>
        )}
        {editable && editing && (
          <div className="mt-1 rounded-md border bg-muted/30 p-2">
            <Textarea
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: the editing panel exists to edit this value
              autoFocus
              rows={3}
              value={latex}
              placeholder="\frac{a}{b}"
              aria-label="LaTeX expression"
              className="min-h-0 font-mono text-sm"
              onChange={(e) => updateAttributes({ latex: e.target.value })}
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
              LaTeX expression — Escape or Ctrl+Enter to close
            </p>
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
