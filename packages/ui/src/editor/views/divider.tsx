// ABOUTME: Divider block node view — renders the rule in the chosen style and
// ABOUTME: shows a hover menu to switch thin / thick / dashed / dotted.
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';

import { cn } from '@colanode/ui/lib/utils';

const VARIANTS = [
  { key: 'line', label: 'Thin' },
  { key: 'thick', label: 'Thick' },
  { key: 'dashed', label: 'Dashed' },
  { key: 'dotted', label: 'Dotted' },
] as const;

const lineClass = (variant: string): string => {
  switch (variant) {
    case 'thick':
      return 'h-1 rounded-sm bg-muted-foreground/50';
    case 'dashed':
      return 'h-0 border-t-2 border-dashed border-muted-foreground/50';
    case 'dotted':
      return 'h-0 border-t-2 border-dotted border-muted-foreground/60';
    default:
      return 'h-0.5 rounded-sm bg-muted';
  }
};

// Miniature preview of each style used inside the picker buttons.
const swatchClass = (variant: string): string => {
  switch (variant) {
    case 'thick':
      return 'h-1 rounded-sm bg-foreground/70';
    case 'dashed':
      return 'border-t-2 border-dashed border-foreground/70';
    case 'dotted':
      return 'border-t-2 border-dotted border-foreground/70';
    default:
      return 'h-0.5 rounded-sm bg-foreground/60';
  }
};

export const DividerNodeView = ({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) => {
  const variant = (node.attrs.variant as string) ?? 'line';
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      data-type="divider"
      className="group/divider relative my-2"
      contentEditable={false}
    >
      <div className={cn('w-full', lineClass(variant))} />
      {editable && (
        <div className="absolute right-0 -top-3.5 z-10 hidden gap-0.5 rounded-md border bg-popover p-0.5 shadow-sm group-hover/divider:flex">
          {VARIANTS.map((v) => (
            <button
              key={v.key}
              type="button"
              title={v.label}
              aria-label={v.label}
              onClick={() => updateAttributes({ variant: v.key })}
              className={cn(
                'flex h-6 w-9 items-center justify-center rounded px-1.5 hover:bg-accent',
                variant === v.key && 'bg-accent'
              )}
            >
              <span className={cn('w-full', swatchClass(v.key))} />
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
};
