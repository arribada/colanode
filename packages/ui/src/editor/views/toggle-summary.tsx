// ABOUTME: Toggle summary node view — the clickable header line of a /toggle,
// ABOUTME: which can be styled as normal text or an H1/H2/H3 title.
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewContent, NodeViewWrapper } from '@tiptap/react';

import { cn } from '@colanode/ui/lib/utils';

const LEVELS = [
  { level: 0, label: 'Text' },
  { level: 1, label: 'H1' },
  { level: 2, label: 'H2' },
  { level: 3, label: 'H3' },
] as const;

const levelClass = (level: number): string => {
  switch (level) {
    case 1:
      return 'text-2xl font-bold font-title';
    case 2:
      return 'text-xl font-semibold font-title';
    case 3:
      return 'text-lg font-semibold font-title';
    default:
      return '';
  }
};

export const ToggleSummaryNodeView = ({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) => {
  const level = (node.attrs.level as number) ?? 0;
  const editable = editor.isEditable;

  return (
    <NodeViewWrapper
      data-type="toggle-summary"
      className="group/summary relative min-w-0 flex-1"
    >
      <NodeViewContent
        className={cn('min-w-0 outline-none', levelClass(level))}
      />
      {editable && (
        <div
          contentEditable={false}
          className="absolute right-0 top-0 z-10 hidden gap-0.5 rounded-md border bg-popover p-0.5 shadow-sm group-hover/summary:flex"
        >
          {LEVELS.map((l) => (
            <button
              key={l.level}
              type="button"
              title={`Header: ${l.label}`}
              // Keep the editor selection; a plain click would blur the summary.
              onMouseDown={(e) => e.preventDefault()}
              onClick={() => updateAttributes({ level: l.level })}
              className={cn(
                'rounded px-1.5 py-0.5 text-xs hover:bg-accent',
                level === l.level && 'bg-accent font-medium'
              )}
            >
              {l.label}
            </button>
          ))}
        </div>
      )}
    </NodeViewWrapper>
  );
};
