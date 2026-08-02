import { eq, useLiveQuery } from '@tanstack/react-db';
import { type NodeViewProps } from '@tiptap/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, Plus, Presentation } from 'lucide-react';

import { EditorContext, LocalWhiteboardNode } from '@colanode/client/types';
import { IdType, generateId } from '@colanode/core';
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
// only from the board opened standalone (or via the "Open board" modal below).
const EMBED_ROLE = 'viewer' as const;

// Renders the referenced whiteboard by id, resolved through the same
// NodeProvider/useNode path the database node view uses to render a node it
// references (see editor/views/database.tsx). `embedded` makes the canvas yield
// wheel/touch to the page and suppress the collaboration controls + presence.
const WhiteboardEmbedContent = () => {
  const { node } = useNode<LocalWhiteboardNode>();

  if (node.type !== 'whiteboard') {
    return (
      <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
        Not a whiteboard
      </div>
    );
  }

  return <WhiteboardContainer whiteboard={node} role={EMBED_ROLE} embedded />;
};

// Empty-state picker: create a brand-new board, or embed one of the workspace's
// existing whiteboards (a live list, mirroring databases/database-select.tsx
// filtered to type === 'whiteboard'). Create-new needs the containing page id +
// rootId, threaded in via `context`; when it is absent (node rendered outside an
// editable document) only the existing-board path is offered.
const WhiteboardEmbedPicker = ({
  context,
  onPick,
}: {
  context: EditorContext | null;
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

  // Create a new whiteboard parented to the page the embed lives on, then swap
  // the embed to reference it (same body the old "/whiteboard" command ran).
  const createNewBoard = () => {
    if (!context) {
      return;
    }
    const whiteboardId = generateId(IdType.Whiteboard);
    const whiteboard: LocalWhiteboardNode = {
      id: whiteboardId,
      type: 'whiteboard',
      name: 'Whiteboard',
      parentId: context.documentId,
      rootId: context.rootId,
      scene: {},
      createdAt: new Date().toISOString(),
      createdBy: context.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };
    workspace.collections.nodes.insert(whiteboard);
    onPick(whiteboardId);
  };

  return (
    <div
      contentEditable={false}
      className="my-1 select-none rounded-md border border-dashed border-border bg-muted/30 p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <Presentation className="size-4 shrink-0 text-muted-foreground" />
        Whiteboard
      </div>
      {context && (
        <button
          type="button"
          onMouseDown={(e) => e.stopPropagation()}
          onClick={createNewBoard}
          className="mb-2 flex w-full items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent"
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          Create a new board
        </button>
      )}
      {whiteboards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {context
            ? 'Or embed an existing whiteboard — none in this workspace yet.'
            : 'No whiteboards available in this workspace.'}
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
            Embed an existing whiteboard&hellip;
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
  extension,
  updateAttributes,
}: NodeViewProps) => {
  const navigate = useNavigate();
  const workspace = useWorkspace();
  // The embed lives inside a page rendered at /workspace/$userId/$nodeId, so
  // `nodeId` is that page. Used to open the board in the editable modal *over*
  // the page (preserving page context) rather than navigating away.
  const params = useParams({ strict: false }) as { nodeId?: string };
  const context =
    (extension.options as { context?: EditorContext | null }).context ?? null;
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
          context={context}
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
          onClick={() => {
            const pageNodeId = params.nodeId;
            // Open the board in the editable modal over the current page. Fall
            // back to a full navigation when the page route can't be resolved.
            if (pageNodeId) {
              navigate({
                to: '/workspace/$userId/$nodeId/modal/$modalNodeId',
                params: {
                  userId: workspace.userId,
                  nodeId: pageNodeId,
                  modalNodeId: id,
                },
              });
            } else {
              navigate({
                to: '/workspace/$userId/$nodeId',
                params: { userId: workspace.userId, nodeId: id },
              });
            }
          }}
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
