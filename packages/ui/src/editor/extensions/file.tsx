import { mergeAttributes, Node } from '@tiptap/core';
import { Plugin, PluginKey, TextSelection } from '@tiptap/pm/state';
import { DecorationSet } from '@tiptap/pm/view';
import { ReactNodeViewRenderer } from '@tiptap/react';
import { toast } from 'sonner';

import { EditorContext, TempFile } from '@colanode/client/types';
import { createImageResizeGuardPlugin } from '@colanode/ui/editor/extensions/image-resize-guard';
import {
  blockDropPosition,
  createUploadPlaceholderPlugin,
  findUploadPlaceholder,
  nextUploadPlaceholderId,
} from '@colanode/ui/editor/extensions/upload-placeholder';
import { FileNodeView } from '@colanode/ui/editor/views';

interface FileNodeOptions {
  context: EditorContext;
}

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    file: {
      /**
       * Insert a file, where its upload placeholder sits when one is given,
       * otherwise at the cursor.
       */
      addFile: (file: TempFile, placeholderId?: string) => ReturnType;
    };
  }
}

export const FILE_UPLOAD_PLACEHOLDER = new PluginKey<DecorationSet>(
  'file-upload-placeholder'
);

export const FileNode = Node.create<FileNodeOptions>({
  name: 'file',
  group: 'block',
  atom: true,
  defining: true,
  draggable: true,
  addAttributes() {
    return {
      id: {
        default: null,
      },
      width: {
        default: null,
      },
      caption: {
        default: null,
      },
    };
  },
  renderHTML({ HTMLAttributes }) {
    return ['file', mergeAttributes(HTMLAttributes)];
  },
  addNodeView() {
    return ReactNodeViewRenderer(FileNodeView, {
      as: 'file',
    });
  },
  addCommands() {
    const options = this.options;
    return {
      addFile: (tempFile: TempFile, placeholderId?: string) => {
        return ({ editor }) => {
          (async () => {
            const fileCreateResult = await window.colanode.executeMutation({
              type: 'file.create',
              tempFileId: tempFile.id,
              userId: options.context.userId,
              parentId: options.context.documentId,
            });

            // Where the file was dropped, read before its mark is cleared. The
            // mark followed every edit made while the file was uploading.
            const dropped = placeholderId
              ? findUploadPlaceholder(
                  editor.state,
                  FILE_UPLOAD_PLACEHOLDER,
                  placeholderId
                )
              : null;
            if (placeholderId) {
              editor.view.dispatch(
                editor.state.tr.setMeta(FILE_UPLOAD_PLACEHOLDER, {
                  remove: [placeholderId],
                })
              );
            }

            if (!fileCreateResult.success) {
              toast.error(fileCreateResult.error.message);
              return;
            }

            const fileId = fileCreateResult.output.id;
            const pos = Math.min(
              dropped ?? editor.state.selection.$head.pos,
              editor.state.doc.content.size
            );
            editor
              .chain()
              .focus()
              .insertContentAt(pos, {
                type: 'file',
                attrs: {
                  id: fileId,
                },
              })
              // A file is an atom block; if it lands as the last child of its
              // container (e.g. a table cell) there is no text position after
              // it to type into, so add an empty paragraph and put the cursor
              // there. Only when nothing typable already follows.
              .command(({ tr, state, dispatch }) => {
                const after = pos + 1;
                if (after > tr.doc.content.size) {
                  return true;
                }
                const next = tr.doc.resolve(after).nodeAfter;
                if (next && next.isTextblock) {
                  return true;
                }
                if (dispatch) {
                  const paragraph = state.schema.nodes.paragraph?.create();
                  if (paragraph) {
                    tr.insert(after, paragraph);
                    tr.setSelection(
                      TextSelection.near(tr.doc.resolve(after + 1))
                    );
                  }
                }
                return true;
              })
              .run();
          })();

          return true;
        };
      },
    };
  },
  addProseMirrorPlugins() {
    const editor = this.editor;
    const options = this.options;

    if (!options.context) {
      return [];
    }

    return [
      createUploadPlaceholderPlugin(FILE_UPLOAD_PLACEHOLDER),
      createImageResizeGuardPlugin(),
      new Plugin({
        key: new PluginKey('file-paste'),
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
                  editor.commands.addFile(tempFile);
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
        key: new PluginKey('file-drop'),
        props: {
          handleDrop(view, event) {
            const files = Array.from(event.dataTransfer?.files || []);
            if (files.length == 0) {
              return false;
            }
            event.preventDefault();

            // The upload takes a moment, and the cursor is wherever it was last
            // left: the file used to land there, often at the bottom of the
            // page. The spot under the mouse is marked now, between two blocks,
            // and the file lands on that mark once it is uploaded.
            const ids = files.map(() => nextUploadPlaceholderId());
            const fileType = view.state.schema.nodes.file;
            const coords = view.posAtCoords({
              left: event.clientX,
              top: event.clientY,
            });
            if (coords && fileType) {
              const pos = blockDropPosition(
                view.state.doc,
                coords.pos,
                fileType.create()
              );
              view.dispatch(
                view.state.tr.setMeta(FILE_UPLOAD_PLACEHOLDER, {
                  add: ids.map((id) => ({ id, pos })),
                })
              );
            }

            (async () => {
              for (const [index, file] of files.entries()) {
                const id = ids[index]!;
                try {
                  const tempFile = await window.colanode.saveTempFile(file);
                  editor.commands.addFile(tempFile, id);
                } catch (error) {
                  editor.view.dispatch(
                    editor.state.tr.setMeta(FILE_UPLOAD_PLACEHOLDER, {
                      remove: [id],
                    })
                  );
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
