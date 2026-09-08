import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { type NodeViewProps } from '@tiptap/core';
import { useNavigate, useParams } from '@tanstack/react-router';
import { NodeViewWrapper } from '@tiptap/react';
import { useRef, useState } from 'react';
import { ExternalLink, Plus, Presentation } from 'lucide-react';
import { toast } from 'sonner';

import { EditorContext, LocalWhiteboardNode } from '@colanode/client/types';
import { IdType, generateId } from '@colanode/core';
import { WhiteboardContainer } from '@colanode/ui/components/whiteboards/whiteboard-container';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const HEIGHT_OPTIONS = [320, 480, 640, 800];

// The embedded board is always rendered as a READ-ONLY preview.
// `WhiteboardCanvas` derives `canEdit`/`canComment` from its `role` prop
// (`hasNodeRole(role, 'editor' | 'collaborator')`), so forcing the lowest role,
// 'viewer', disables all pointer editing, persistence and commenting. A board
// embedded in a page therefore can never be mutated from inside that page —
// only from the board opened standalone (or via the "Open board" modal below).
const EMBED_ROLE = 'viewer' as const;

// Empty-state picker: create a brand-new board, or embed one of the workspace's
// existing whiteboards (a live list filtered to type === 'whiteboard').
// Create-new persists through the SAME mutation path the sidebar/standalone
// flows ultimately use (`node.create` via executeMutation) — inserting into
// `workspace.collections.nodes` does NOT work here because that tanstack-db
// collection is on-demand-synced and seeded only with space/chat/database/
// channel types, so a whiteboard insert never reached the server (a phantom id
// that then read back as "Whiteboard unavailable").
const WhiteboardEmbedPicker = ({
  context,
  notFoundId,
  onPick,
}: {
  context: EditorContext | null;
  notFoundId?: string | null;
  onPick: (whiteboardId: string) => void;
}) => {
  const workspace = useWorkspace();
  const [creating, setCreating] = useState(false);

  const whiteboardListQuery = useLiveQuery({
    type: 'node.list',
    userId: workspace.userId,
    filters: [{ field: ['type'], operator: 'in', value: ['whiteboard'] }],
    sorts: [],
  });

  const whiteboards = (whiteboardListQuery.data ?? [])
    .map((node) => node as LocalWhiteboardNode)
    .filter((node) => node.type === 'whiteboard')
    .sort((a, b) => (a.name ?? '').localeCompare(b.name ?? ''));

  // Create a new whiteboard parented to the space (rootId), exactly like the
  // standalone create flow, then swap the embed to reference it. Await the
  // mutation so the id is only written into the embed once the board really
  // exists locally + is queued for the server.
  const createNewBoard = async () => {
    if (!context || creating) {
      return;
    }
    setCreating(true);
    try {
      const whiteboardId = generateId(IdType.Whiteboard);
      const result = await window.colanode.executeMutation({
        type: 'node.create',
        userId: workspace.userId,
        nodeId: whiteboardId,
        attributes: {
          type: 'whiteboard',
          name: 'Whiteboard',
          avatar: null,
          parentId: context.rootId,
          scene: {},
        },
      });
      if (!result.success) {
        toast.error(result.error.message);
        return;
      }
      onPick(whiteboardId);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Failed to create whiteboard'
      );
    } finally {
      setCreating(false);
    }
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
      {notFoundId && (
        <p className="mb-2 text-sm text-muted-foreground">
          The board this embed pointed to could not be found. Pick another one
          below, or create a new board.
        </p>
      )}
      {context && (
        <button
          type="button"
          disabled={creating}
          onMouseDown={(e) => e.stopPropagation()}
          onClick={createNewBoard}
          className="mb-2 flex w-full items-center gap-1.5 rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none hover:bg-accent disabled:opacity-60"
        >
          <Plus className="size-4 shrink-0 text-muted-foreground" />
          {creating ? 'Creating board…' : 'Create a new board'}
        </button>
      )}
      {whiteboards.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          {whiteboardListQuery.isLoading
            ? 'Loading existing whiteboards…'
            : context
              ? 'Or embed an existing whiteboard — none in this workspace yet.'
              : 'No whiteboards available in this workspace.'}
        </p>
      ) : (
        <div className="rounded border border-border/60 bg-background">
          <p className="border-b border-border/60 px-2 py-1.5 text-xs font-medium text-muted-foreground">
            Or embed an existing whiteboard:
          </p>
          <div className="max-h-56 overflow-y-auto">
            {whiteboards.map((whiteboard) => (
              <button
                key={whiteboard.id}
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => onPick(whiteboard.id)}
                className="flex w-full items-center gap-1.5 px-2 py-1.5 text-left text-sm text-foreground outline-none hover:bg-accent"
              >
                <Presentation className="size-4 shrink-0 text-muted-foreground" />
                <span className="truncate">
                  {whiteboard.name?.trim() ? whiteboard.name : 'Untitled'}
                </span>
              </button>
            ))}
          </div>
        </div>
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
  const region =
    (node.attrs.region as { x: number; y: number; zoom: number } | null) ??
    null;
  // Latest viewport reported by the preview, saved into `region` on "Set view".
  const latestViewportRef = useRef<{
    x: number;
    y: number;
    zoom: number;
  } | null>(region);

  // Resolve the referenced board DIRECTLY via node.list rather than through
  // NodeProvider: the embed always renders read-only (EMBED_ROLE), so it does
  // not need the ancestor-chain ROLE resolution NodeProvider gates on — and
  // that gate is what left the embed stuck on a "syncing" skeleton. Queried
  // unconditionally (hooks) with a sentinel empty id when none is set.
  const boardQuery = useLiveQuery({
    type: 'node.list',
    userId: workspace.userId,
    filters: [{ field: ['id'], operator: 'in', value: [id ?? ''] }],
    sorts: [],
  });
  const boardNode = boardQuery.data?.[0];
  const board =
    boardNode && boardNode.type === 'whiteboard'
      ? (boardNode as LocalWhiteboardNode)
      : undefined;

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
          onPick={(whiteboardId) =>
            updateAttributes({ id: whiteboardId, region: null })
          }
        />
      </NodeViewWrapper>
    );
  }

  // The id points at a board that does not exist (deleted, or a phantom left
  // behind by an earlier failed create). Instead of a dead "unavailable" box,
  // drop straight back into the picker so the user can fix the embed in place.
  if (!boardQuery.isLoading && !board) {
    if (!editor.isEditable) {
      return (
        <NodeViewWrapper data-type="whiteboard-embed" className="my-2">
          <div className="rounded-md border border-dashed border-border bg-muted/30 p-3 text-sm text-muted-foreground">
            Whiteboard unavailable
          </div>
        </NodeViewWrapper>
      );
    }

    return (
      <NodeViewWrapper data-type="whiteboard-embed" className="my-2">
        <WhiteboardEmbedPicker
          context={context}
          notFoundId={id}
          onPick={(whiteboardId) =>
            updateAttributes({ id: whiteboardId, region: null })
          }
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
          <div className="flex items-center gap-2">
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() => updateAttributes({ id: null, region: null })}
              className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
              title="Pick a different whiteboard for this embed"
            >
              Change board
            </button>
            <button
              type="button"
              onMouseDown={(e) => e.stopPropagation()}
              onClick={() =>
                updateAttributes({ region: latestViewportRef.current })
              }
              className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
              title="Pan/zoom the preview (middle- or right-drag to pan, Ctrl+wheel to zoom), then save that framing as the displayed view"
            >
              Set this view
            </button>
            {region && (
              <button
                type="button"
                onMouseDown={(e) => e.stopPropagation()}
                onClick={() => updateAttributes({ region: null })}
                className="whitespace-nowrap text-xs text-muted-foreground hover:text-foreground"
                title="Show the whole board again"
              >
                Reset
              </button>
            )}
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
          </div>
        )}
      </div>
      <div
        contentEditable={false}
        className="select-none overflow-hidden rounded-md border border-border/60 bg-background"
        style={{ height }}
      >
        {board ? (
          <WhiteboardContainer
            node={board}
            role={EMBED_ROLE}
            embedded
            initialViewport={region ?? undefined}
            onViewport={(vp) => {
              latestViewportRef.current = vp;
            }}
          />
        ) : (
          <div className="flex h-full w-full items-center justify-center text-sm text-muted-foreground">
            Loading board&hellip;
          </div>
        )}
      </div>
    </NodeViewWrapper>
  );
};
