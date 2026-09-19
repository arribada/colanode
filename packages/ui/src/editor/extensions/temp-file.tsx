import { CommandProps, mergeAttributes, Node } from '@tiptap/core';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { toast } from 'sonner';

import { TempFile } from '@colanode/client/types';
import {
  blockDropPosition,
  createUploadPlaceholderPlugin,
  findUploadPlaceholder,
  nextUploadPlaceholderId,
} from '@colanode/ui/editor/extensions/upload-placeholder';
import { TempFileNodeView } from '@colanode/ui/editor/views';

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    tempFile: {
      // `at`: where to insert, when the file was dropped on a given spot;
      // otherwise at the cursor.
      addTempFile: (file: TempFile, at?: number) => ReturnType;
    };
  }
}

export const TEMP_FILE_UPLOAD_PLACEHOLDER = new PluginKey<DecorationSet>(
  'temp-file-upload-placeholder'
);

export const TempFileNode = Node.create({
  name: 'tempFile',
  group: 'block',
  atom: true,
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      id: {
        default: null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['tempFile', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(TempFileNodeView, {
      as: 'tempFile',
    });
  },
  addCommands() {
    return {
      addTempFile:
        (file: TempFile, at?: number) =>
        ({ editor, tr }: CommandProps) => {
          const pos = Math.min(
            at ?? tr.selection.$head.pos,
            tr.doc.content.size
          );
          editor
            .chain()
            .focus()
            .insertContentAt(pos, {
              type: 'tempFile',
              attrs: {
                id: file.id,
              },
            })
            .run();

          return true;
        },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    return [
      createUploadPlaceholderPlugin(TEMP_FILE_UPLOAD_PLACEHOLDER),
      new Plugin({
        key: new PluginKey('temp-file-paste'),
        props: {
          handlePaste(_, event) {
            const files = Array.from(event.clipboardData?.files || []);
            if (files.length == 0) {
              return false;
            }

            (async () => {
              for (const file of files) {
                try {
                  const tempFile = await window.colanode.saveTempFile(file);
                  editor.commands.addTempFile(tempFile);
                } catch (error) {
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Could not upload the file'
                  );
                }
              }
            })();

            return true;
          },
        },
      }),
      new Plugin({
        key: new PluginKey('temp-file-drop'),
        props: {
          handleDrop(view, event) {
            const files = Array.from(event.dataTransfer?.files || []);
            if (files.length == 0) {
              return false;
            }
            event.preventDefault();

            // Mark the spot under the mouse now: the file lands there once
            // saved, not at wherever the cursor was last left.
            const ids = files.map(() => nextUploadPlaceholderId());
            const tempFileType = view.state.schema.nodes.tempFile;
            const coords = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (coords && tempFileType) {
              const pos = blockDropPosition(
                view.state.doc,
                coords.pos,
                tempFileType.create()
              );
              view.dispatch(
                view.state.tr.setMeta(TEMP_FILE_UPLOAD_PLACEHOLDER, {
                  add: ids.map((id) => ({ id, pos })),
                })
              );
            }

            const clearMark = (id: string) => {
              const at = findUploadPlaceholder(
                editor.state,
                TEMP_FILE_UPLOAD_PLACEHOLDER,
                id
              );
              editor.view.dispatch(
                editor.state.tr.setMeta(TEMP_FILE_UPLOAD_PLACEHOLDER, {
                  remove: [id],
                })
              );
              return at;
            };

            (async () => {
              for (const [index, file] of files.entries()) {
                const id = ids[index]!;
                try {
                  const tempFile = await window.colanode.saveTempFile(file);
                  // Read and clear the mark before inserting: the insert is
                  // its own command and must see the state it will change.
                  const at = clearMark(id);
                  editor.commands.addTempFile(tempFile, at ?? undefined);
                } catch (error) {
                  clearMark(id);
                  toast.error(
                    error instanceof Error
                      ? error.message
                      : 'Could not upload the file'
                  );
                }
              }
            })();

            return true;
          },
        },
      }),
    ];
  },
});
