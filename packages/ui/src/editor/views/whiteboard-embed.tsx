import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { useNavigate } from '@tanstack/react-router';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Presentation } from 'lucide-react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { NodeProvider } from '@colanode/ui/components/nodes/node-provider';
import { WhiteboardContainer } from '@colanode/ui/components/whiteboards/whiteboard-container';
import { useNode } from '@colanode/ui/contexts/node';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const HEIGHT_OPTIONS = [320, 480, 640, 800];

// The embedded board is always rendered as a READ-ONLY preview.
// `WhiteboardCanvas` derives `canEdit`/`canComment` from its `role` prop
// (`hasNodeRole(role, 'editor' | 'collaborator')`), so forcing the lowest role,
// 'viewer', disables all pointer editing, persistence and commenting. A board
// embedded in a page therefore can never be mutated from inside that page —
// only from the board opened standalone.
const EMBED_ROLE = 'viewer' as const;

// Renders the referenced whiteboard by id, resolved through the same
// NodeProvider/useNode path the database node view uses to render a node it
// references (see editor/views/database.tsx).
const WhiteboardEmbedContent = () => {
  const { node } = useNode<LocalWhiteboardNode>();

  if (node.type !== 'whiteboard') {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Not a whiteboard
      </div>
    );
  }

  return <WhiteboardContainer whiteboard={node} role={EMBED_ROLE} />;
};

// Empty-state picker: a live list of the workspace's whiteboards (mirrors
// databases/database-select.tsx, filtered to type === 'whiteboard').
const WhiteboardEmbedPicker = ({
  onPick,
}: {
  onPick: (whiteboardId: string) => void;
}) => {
  const workspace = useWorkspace();

  const whiteboardListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'whiteboard'))
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    []
  );

  const whiteboards = whiteboardListQuery.data.map(
    (node) => node as LocalWhiteboardNode
  );

  return (
    <div
      contentEditable={false}
      className="my-1 select-none rounded-md border border-dashed border-border bg-muted/30 p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Presentation className="size-4 shrink-0 text-muted-foreground" />
        Whiteboard
      </div>
      {whiteboards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          No whiteboards available in this workspace.
        </p>
      ) : (
        <select
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const whiteboardId = e.target.value;
            if (whiteboardId) {
              onPick(whiteboardId);
            }
          }}
          className="w-full rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none"
        >
          <option value="" disabled>
            Choose a whiteboard&hellip;
          </option>
          {[...whiteboards]
            .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''))
            .map((whiteboard) => (
              <option key={whiteboard.id} value={whiteboard.id}>
                {whiteboard.name ?? 'Untitled'}
              </option>
            ))}
        </select>
      )}
    </div>
  );
};

export const WhiteboardEmbedNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  const id = node.attrs.id as string | null;
  const height = (node.attrs.height as number | null) ?? 480;

  if (!id) {
    if (!editor.isEditable) {
      return (
        <NodeViewWrapper data-type="whiteboard-embed" className="my-2">
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            No whiteboard selected
          </div>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper data-type="whiteboard-embed" className="my-2">
        <WhiteboardEmbedPicker
          onPick={(whiteboardId) => updateAttributes({ id: whiteboardId })}
        />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-type="whiteboard-embed" className="my-2">
      <div
        contentEditable={false}
        className="mb-1 flex items-center justify-between gap-2"
      >
        <button
          type="button"
          onClick={() =>
            navigate({
              to: '/workspace/$userId/$nodeId',
              params: { userId: workspace.userId, nodeId: id },
            })
          }
          className="flex items-center gap-1 text-xs text-muted-foreground hover:text-foreground"
        >
          <ExternalLink className="size-3.5" />
          Open board
        </button>
        {editor.isEditable && (
          <select
            value={height}
            onMouseDown={(e) => e.stopPropagation()}
            onChange={(e) =>
              updateAttributes({ height: Number(e.target.value) })
            }
            className="rounded border border-border/60 bg-background px-1.5 py-0.5 text-xs text-muted-foreground outline-none"
          >
            {HEIGHT_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}px
              </option>
            ))}
          </select>
        )}
      </div>
      <div
        contentEditable={false}
        className="select-none overflow-hidden rounded-md border border-border/60 bg-background"
        style={{ height }}
      >
        <NodeProvider nodeId={id}>
          <WhiteboardEmbedContent />
        </NodeProvider>
      </div>
    </NodeViewWrapper>
  );
};
