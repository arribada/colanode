import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { Copy, Maximize2, Pencil } from 'lucide-react';
import { useState } from 'react';

import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { MermaidRender } from '@colanode/ui/editor/mermaid-render';
import {
  MediaLightbox,
  copyPicture,
} from '@colanode/ui/editor/views/media-lightbox';
import { cn } from '@colanode/ui/lib/utils';

// Rendered on demand from the lazy mermaid module, so copying never pulls the
// mermaid bundle into the main editor chunk.
const diagramPng = async (source: string): Promise<Blob> => {
  const { renderMermaidPng } =
    await import('@colanode/ui/editor/mermaid-diagram');
  return renderMermaidPng(source);
};

export const MermaidNodeView = ({
  node,
  editor,
  updateAttributes,
  selected,
}: NodeViewProps) => {
  const source = (node.attrs.source as string | null) ?? '';
  const editable = editor.isEditable;
  const hasSource = source.trim().length > 0;

  // Open the source panel automatically when the block was just inserted empty.
  const [editing, setEditing] = useState(
    editable && !hasSource && editor.isFocused
  );
  const [viewerOpen, setViewerOpen] = useState(false);

  // A click used to open the source panel, which made the diagram awkward to
  // select, enlarge or copy. Now a double-click enlarges it and editing lives
  // in the right-click menu and the pencil button; an empty diagram still
  // opens its source on a click, since there is nothing to look at yet.
  const startEditing = () => setEditing(true);
  const copy = () => copyPicture(() => diagramPng(source));

  return (
    <NodeViewWrapper
      data-type="mermaid"
      className={cn('my-1 rounded-md', selected && !editing && 'bg-accent/50')}
    >
      <div contentEditable={false} className="select-none">
        <ContextMenu>
          <ContextMenuTrigger asChild>
            <div
              role="button"
              tabIndex={0}
              aria-label="Diagram: double-click to enlarge, right-click for more"
              data-testid="mermaid-diagram"
              className={cn(
                'group/mermaid relative flex w-full justify-center overflow-x-auto rounded-md px-3 py-2',
                editable && 'hover:bg-muted/50'
              )}
              onClick={() => {
                if (editable && !hasSource) {
                  startEditing();
                }
              }}
              onDoubleClick={() => {
                if (hasSource) {
                  setViewerOpen(true);
                }
              }}
              onKeyDown={(event) => {
                if (event.key !== 'Enter') {
                  return;
                }
                event.preventDefault();
                if (editable) {
                  startEditing();
                } else if (hasSource) {
                  setViewerOpen(true);
                }
              }}
            >
              <MermaidRender source={source} />
              {editable && hasSource && !editing && (
                <button
                  type="button"
                  aria-label="Edit diagram"
                  title="Edit diagram"
                  className="absolute right-1 top-1 rounded-md border bg-background p-1 text-muted-foreground opacity-0 shadow-sm transition-opacity hover:text-foreground focus-visible:opacity-100 group-hover/mermaid:opacity-100"
                  onClick={(event) => {
                    event.stopPropagation();
                    startEditing();
                  }}
                  onDoubleClick={(event) => event.stopPropagation()}
                >
                  <Pencil className="size-3.5" />
                </button>
              )}
            </div>
          </ContextMenuTrigger>
          <ContextMenuContent>
            {editable && (
              <ContextMenuItem
                onClick={startEditing}
                className="flex items-center gap-2"
              >
                <Pencil className="size-4" />
                Edit diagram
              </ContextMenuItem>
            )}
            {hasSource && (
              <ContextMenuItem
                onClick={() => setViewerOpen(true)}
                className="flex items-center gap-2"
              >
                <Maximize2 className="size-4" />
                View full size
              </ContextMenuItem>
            )}
            {hasSource && (
              <ContextMenuItem
                onClick={copy}
                className="flex items-center gap-2"
              >
                <Copy className="size-4" />
                Copy as image
              </ContextMenuItem>
            )}
          </ContextMenuContent>
        </ContextMenu>
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
              Mermaid diagram: Escape or Ctrl+Enter to close
            </p>
          </div>
        )}
      </div>
      {hasSource && (
        <MediaLightbox
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          title="Diagram"
          onCopy={copy}
        >
          <MermaidRender
            source={source}
            className="h-full w-full [&_svg]:!h-full [&_svg]:!w-full [&_svg]:!max-w-none"
          />
        </MediaLightbox>
      )}
    </NodeViewWrapper>
  );
};
