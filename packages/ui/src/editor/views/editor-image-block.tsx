// ABOUTME: Editor node view for an IMAGE file -- resizable, with an optional
// ABOUTME: caption that carries a live, auto-updating "Figure N" number.
import { type NodeViewProps } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import { Captions, CaptionsOff } from 'lucide-react';
import { Resizable } from 're-resizable';

import { DownloadStatus, LocalFileNode } from '@colanode/client/types';
import { FileStatus } from '@colanode/core';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

interface EditorImageBlockProps {
  file: LocalFileNode;
  node: NodeViewProps['node'];
  editor: NodeViewProps['editor'];
  getPos: NodeViewProps['getPos'];
  updateAttributes: NodeViewProps['updateAttributes'];
}

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 120;
const MAX_WIDTH = 900;

export const EditorImageBlock = ({
  file,
  node,
  editor,
  getPos,
  updateAttributes,
}: EditorImageBlockProps) => {
  const workspace = useWorkspace();
  const localFileQuery = useLiveQuery({
    type: 'local.file.get',
    fileId: file.id,
    userId: workspace.userId,
    autoDownload: true,
  });

  const url = localFileQuery.data?.url ?? null;
  const width =
    typeof node.attrs.width === 'number' && node.attrs.width > 0
      ? node.attrs.width
      : DEFAULT_WIDTH;
  const caption = (node.attrs.caption as string | null | undefined) ?? null;
  const hasCaption = caption !== null;
  const editable = editor.isEditable;

  // This figure's live ordinal among ALL captioned file nodes in the document,
  // in document order -- recomputed on every change so adding, removing or
  // reordering figures renumbers every caption automatically.
  const figureNumber = useEditorState({
    editor,
    selector: ({ editor: current }): number | null => {
      if (!hasCaption || typeof getPos !== 'function') {
        return null;
      }
      const myPos = getPos();
      if (myPos == null) {
        return null;
      }
      let seen = 0;
      let mine: number | null = null;
      current.state.doc.descendants((child, pos) => {
        if (
          child.type.name === 'file' &&
          child.attrs.caption !== null &&
          child.attrs.caption !== undefined
        ) {
          seen += 1;
          if (pos === myPos) {
            mine = seen;
          }
        }
        return true;
      });
      return mine;
    },
  });

  return (
    <ContextMenu>
      <ContextMenuTrigger asChild>
        <figure
          className="my-2 flex w-fit max-w-full flex-col gap-1"
          contentEditable={false}
        >
          <Resizable
            size={{ width }}
            style={{ maxWidth: '100%' }}
            minWidth={MIN_WIDTH}
            maxWidth={MAX_WIDTH}
            enable={editable ? { right: true } : {}}
            handleClasses={{
              right:
                'cn-img-resize-handle opacity-0 hover:opacity-100 transition-opacity bg-primary/50 rounded',
            }}
            className="relative overflow-hidden rounded-md border border-border"
            onResizeStop={(_event, _direction, ref) => {
              updateAttributes({ width: Math.round(ref.offsetWidth) });
            }}
          >
            {url ? (
              <img
                src={url}
                alt={file.name}
                draggable={false}
                className="block h-auto w-full select-none"
              />
            ) : file.status === FileStatus.Pending ? (
              <div className="flex h-40 w-full flex-col items-center justify-center gap-1 bg-muted px-3 text-center text-xs text-muted-foreground">
                <span className="font-medium text-foreground">
                  Upload didn't finish
                </span>
                <span>
                  This image never reached the server. Delete the block and
                  re-upload it.
                </span>
              </div>
            ) : localFileQuery.data?.downloadStatus === DownloadStatus.Failed ? (
              <div className="flex h-40 w-full items-center justify-center bg-muted px-3 text-center text-xs text-muted-foreground">
                Couldn't load this image.
              </div>
            ) : (
              <div className="flex h-40 w-full items-center justify-center bg-muted text-xs text-muted-foreground">
                Loading image…
              </div>
            )}
          </Resizable>
          {hasCaption && (
            <figcaption
              className="text-sm text-muted-foreground"
              style={{ width, maxWidth: '100%' }}
            >
              <span className="font-medium text-foreground">
                Figure {figureNumber ?? '?'}
              </span>
              {' — '}
              {editable ? (
                <input
                  // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the caption right after "Add caption"
                  autoFocus={caption === ''}
                  value={caption ?? ''}
                  onPointerDown={(event) => event.stopPropagation()}
                  onChange={(event) =>
                    updateAttributes({ caption: event.target.value })
                  }
                  placeholder="Describe this figure…"
                  className="w-64 max-w-full border-none bg-transparent italic outline-none placeholder:not-italic placeholder:text-muted-foreground"
                />
              ) : (
                <span className="italic">{caption}</span>
              )}
            </figcaption>
          )}
        </figure>
      </ContextMenuTrigger>
      <ContextMenuContent>
        {hasCaption ? (
          <ContextMenuItem
            onClick={() => updateAttributes({ caption: null })}
            className="flex items-center gap-2"
          >
            <CaptionsOff className="size-4" />
            Remove caption
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            onClick={() => updateAttributes({ caption: '' })}
            className="flex items-center gap-2"
          >
            <Captions className="size-4" />
            Add caption
          </ContextMenuItem>
        )}
      </ContextMenuContent>
    </ContextMenu>
  );
};
