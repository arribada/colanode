// ABOUTME: Editor node view for an IMAGE file -- resizable, with an optional
// ABOUTME: caption that carries a live, auto-updating "Figure N" number.
import { type NodeViewProps } from '@tiptap/core';
import { useEditorState } from '@tiptap/react';
import {
  AlignCenter,
  AlignLeft,
  AlignRight,
  Captions,
  CaptionsOff,
  Check,
  Copy,
  Download,
  Maximize2,
  Scaling,
} from 'lucide-react';
import { Resizable } from 're-resizable';
import { useRef, useState } from 'react';

import { DownloadStatus, LocalFileNode } from '@colanode/client/types';
import { FileStatus } from '@colanode/core';
import {
  ContextMenu,
  ContextMenuContent,
  ContextMenuItem,
  ContextMenuLabel,
  ContextMenuSeparator,
  ContextMenuTrigger,
} from '@colanode/ui/components/ui/context-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { CaptionField } from '@colanode/ui/editor/views/caption-field';
import {
  MediaLightbox,
  copyPicture,
} from '@colanode/ui/editor/views/media-lightbox';
import { useFileDownload } from '@colanode/ui/hooks/use-file-download';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { imageUrlToPng } from '@colanode/ui/lib/image-export';
import { cn } from '@colanode/ui/lib/utils';

interface EditorImageBlockProps {
  file: LocalFileNode;
  node: NodeViewProps['node'];
  editor: NodeViewProps['editor'];
  getPos: NodeViewProps['getPos'];
  updateAttributes: NodeViewProps['updateAttributes'];
  selected: boolean;
}

const DEFAULT_WIDTH = 420;
const MIN_WIDTH = 120;
const MAX_WIDTH = 900;

export type ImageAlign = 'left' | 'center' | 'right';

export const IMAGE_ALIGNMENTS: {
  value: ImageAlign;
  label: string;
  icon: typeof AlignLeft;
}[] = [
  { value: 'left', label: 'Align left', icon: AlignLeft },
  { value: 'center', label: 'Align center', icon: AlignCenter },
  { value: 'right', label: 'Align right', icon: AlignRight },
];

// Width presets, so a picture can be sized in one click instead of dragged.
// "Full width" is the column the editor draws in, capped like the handle.
export const IMAGE_SIZES: { key: string; label: string; width: number | 'full' }[] = [
  { key: 'small', label: 'Small', width: 320 },
  { key: 'medium', label: 'Medium', width: 480 },
  { key: 'large', label: 'Large', width: 720 },
  { key: 'full', label: 'Full width', width: 'full' },
];

export const readImageAlign = (value: unknown): ImageAlign =>
  value === 'center' || value === 'right' ? value : 'left';

// The stored value: the flow (left) is stored as nothing, like text alignment.
export const imageAlignAttr = (value: ImageAlign): ImageAlign | null =>
  value === 'left' ? null : value;

export const alignmentClass = (align: ImageAlign): string | false =>
  align === 'center' ? 'mx-auto' : align === 'right' && 'ml-auto';

export const presetWidth = (
  preset: number | 'full',
  editorWidth: number
): number =>
  preset === 'full'
    ? Math.max(MIN_WIDTH, Math.min(MAX_WIDTH, Math.round(editorWidth)))
    : preset;

export const EditorImageBlock = ({
  file,
  node,
  editor,
  getPos,
  updateAttributes,
  selected,
}: EditorImageBlockProps) => {
  const workspace = useWorkspace();
  const localFileQuery = useLiveQuery({
    type: 'local.file.get',
    fileId: file.id,
    userId: workspace.userId,
    autoDownload: true,
  });

  const url = localFileQuery.data?.url ?? null;
  const downloadProgress = localFileQuery.data?.downloadProgress ?? 0;
  const width =
    typeof node.attrs.width === 'number' && node.attrs.width > 0
      ? node.attrs.width
      : DEFAULT_WIDTH;
  const caption = (node.attrs.caption as string | null | undefined) ?? null;
  const hasCaption = caption !== null;
  const align = readImageAlign(node.attrs.align);
  const setAlign = (value: ImageAlign) =>
    updateAttributes({ align: imageAlignAttr(value) });
  const setSize = (preset: number | 'full') =>
    updateAttributes({
      width: presetWidth(preset, editor.view.dom.clientWidth),
    });
  const editable = editor.isEditable;
  // Double-click opens the image full size; the right-click menu can also copy
  // it as a PNG for other apps (Ctrl+C keeps copying the block, so pasting it
  // back in the wiki does not upload a second file).
  const [viewerOpen, setViewerOpen] = useState(false);
  // Set when "Add caption" was chosen: the menu then closes without pulling
  // focus back to the editor, so the new caption field keeps the cursor.
  const keepCaptionFocusRef = useRef(false);
  const copy = url ? () => copyPicture(() => imageUrlToPng(url)) : undefined;
  // Saved as the file that was uploaded, not as a re-encoded PNG, so a photo
  // keeps its original format and quality.
  const { download } = useFileDownload(file);

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
          className={cn(
            'group/img my-2 flex w-fit max-w-full flex-col gap-1',
            alignmentClass(align)
          )}
          data-align={align}
          contentEditable={false}
        >
          <Resizable
            size={{ width }}
            style={{ maxWidth: '100%' }}
            minWidth={MIN_WIDTH}
            maxWidth={MAX_WIDTH}
            enable={editable ? { right: true } : {}}
            handleClasses={{
              right: cn(
                'cn-img-resize-handle transition-opacity',
                editable
                  ? 'opacity-0 group-hover/img:opacity-100'
                  : 'opacity-0',
                editable && selected && '!opacity-100'
              ),
            }}
            handleStyles={{ right: { width: '16px', right: '-8px' } }}
            handleComponent={{
              right: editable ? (
                <div className="flex h-full items-center justify-center">
                  <div className="h-10 max-h-[70%] w-1.5 rounded-full bg-primary shadow ring-1 ring-background" />
                </div>
              ) : undefined,
            }}
            className={cn(
              'relative rounded-md border border-border',
              selected && 'ring-2 ring-primary ring-offset-1'
            )}
            onResizeStop={(_event, _direction, ref) => {
              updateAttributes({ width: Math.round(ref.offsetWidth) });
            }}
          >
            {url ? (
              <img
                src={url}
                alt={file.name}
                draggable={false}
                className="block h-auto w-full select-none rounded-md"
                onDoubleClick={() => setViewerOpen(true)}
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
            ) : localFileQuery.data?.downloadStatus ===
              DownloadStatus.Failed ? (
              <div className="flex h-40 w-full items-center justify-center bg-muted px-3 text-center text-xs text-muted-foreground">
                Couldn't load this image.
              </div>
            ) : (
              <div className="flex h-40 w-full flex-col items-center justify-center gap-2 bg-muted text-xs text-muted-foreground">
                <span>Loading image…</span>
                {downloadProgress > 0 && (
                  <span
                    className="h-1 w-24 overflow-hidden rounded-full bg-border"
                    role="progressbar"
                    aria-valuenow={downloadProgress}
                  >
                    <span
                      className="block h-full bg-primary transition-all"
                      style={{ width: `${downloadProgress}%` }}
                    />
                  </span>
                )}
              </div>
            )}
          </Resizable>
          {hasCaption && (
            <figcaption
              // A row, so that a caption too long for one line wraps under
              // itself rather than pushing the figure number about.
              className="flex items-start justify-center gap-1 text-sm leading-5 text-muted-foreground"
              style={{ width, maxWidth: '100%' }}
            >
              <span className="shrink-0 font-medium text-foreground">
                Figure {figureNumber ?? '?'} ·
              </span>
              {editable ? (
                <CaptionField
                  // The field appears because the author just asked for a
                  // caption: the cursor belongs in it.
                  // eslint-disable-next-line jsx-a11y/no-autofocus
                  autoFocus={caption === ''}
                  value={caption ?? ''}
                  onChange={(value) => updateAttributes({ caption: value })}
                  placeholder="Describe this figure…"
                  className="min-w-0 flex-1"
                />
              ) : (
                <span className="italic">{caption}</span>
              )}
            </figcaption>
          )}
        </figure>
      </ContextMenuTrigger>
      <ContextMenuContent
        onCloseAutoFocus={(event) => {
          if (keepCaptionFocusRef.current) {
            keepCaptionFocusRef.current = false;
            event.preventDefault();
          }
        }}
      >
        {url && (
          <>
            <ContextMenuItem
              onClick={() => setViewerOpen(true)}
              className="flex items-center gap-2"
            >
              <Maximize2 className="size-4" />
              View full size
            </ContextMenuItem>
            <ContextMenuItem onClick={copy} className="flex items-center gap-2">
              <Copy className="size-4" />
              Copy image
            </ContextMenuItem>
            <ContextMenuItem
              onClick={download}
              className="flex items-center gap-2"
            >
              <Download className="size-4" />
              Download
            </ContextMenuItem>
            {editable && <ContextMenuSeparator />}
          </>
        )}
        {!editable ? null : hasCaption ? (
          <ContextMenuItem
            onClick={() => updateAttributes({ caption: null })}
            className="flex items-center gap-2"
          >
            <CaptionsOff className="size-4" />
            Remove caption
          </ContextMenuItem>
        ) : (
          <ContextMenuItem
            data-testid="image-add-caption"
            onClick={() => {
              keepCaptionFocusRef.current = true;
              updateAttributes({ caption: '' });
            }}
            className="flex items-center gap-2"
          >
            <Captions className="size-4" />
            Add caption
          </ContextMenuItem>
        )}
        {editable && (
          <>
            <ContextMenuSeparator />
            <ContextMenuLabel className="text-xs text-muted-foreground">
              Placement
            </ContextMenuLabel>
            {IMAGE_ALIGNMENTS.map((option) => (
              <ContextMenuItem
                key={option.value}
                data-testid={`image-align-${option.value}`}
                onClick={() => setAlign(option.value)}
                className="flex items-center gap-2"
              >
                <option.icon className="size-4" />
                {option.label}
                {align === option.value && <Check className="ml-auto size-4" />}
              </ContextMenuItem>
            ))}
            <ContextMenuSeparator />
            <ContextMenuLabel className="text-xs text-muted-foreground">
              Size
            </ContextMenuLabel>
            {IMAGE_SIZES.map((option) => (
              <ContextMenuItem
                key={option.key}
                data-testid={`image-size-${option.key}`}
                onClick={() => setSize(option.width)}
                className="flex items-center gap-2"
              >
                <Scaling className="size-4" />
                {option.label}
                {option.width !== 'full' && option.width === width && (
                  <Check className="ml-auto size-4" />
                )}
              </ContextMenuItem>
            ))}
          </>
        )}
      </ContextMenuContent>
      {url && (
        <MediaLightbox
          open={viewerOpen}
          onOpenChange={setViewerOpen}
          title={file.name}
          onCopy={copy}
          onDownload={download}
        >
          <img
            src={url}
            alt={file.name}
            className="max-h-full max-w-full object-contain"
          />
        </MediaLightbox>
      )}
    </ContextMenu>
  );
};
