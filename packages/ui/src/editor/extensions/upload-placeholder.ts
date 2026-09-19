// ABOUTME: Keeps the spot a file was dropped on while it uploads, so it lands
// ABOUTME: there even if the text around it changes meanwhile, and marks it.
import { Fragment, Node as ProseMirrorNode, Slice } from '@tiptap/pm/model';
import { EditorState, Plugin, PluginKey } from '@tiptap/pm/state';
import { dropPoint } from '@tiptap/pm/transform';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type UploadPlaceholderMeta =
  | { add: { id: string; pos: number }[] }
  | { remove: string[] };

let sequence = 0;

export const nextUploadPlaceholderId = (): string => {
  sequence += 1;
  return `upload-${Date.now().toString(36)}-${sequence}`;
};

const renderPlaceholder = (): HTMLElement => {
  const element = document.createElement('div');
  element.className =
    'my-2 flex h-20 items-center justify-center rounded-md border border-dashed border-border bg-muted/40 text-xs text-muted-foreground';
  element.textContent = 'Uploading…';
  element.setAttribute('data-testid', 'upload-placeholder');
  element.contentEditable = 'false';
  return element;
};

/**
 * A mark per file being uploaded, at the spot it was dropped on. The marks are
 * decorations, which ProseMirror moves along with every edit: typing above the
 * spot while the file uploads still lands the file where it was dropped.
 */
export const createUploadPlaceholderPlugin = (
  key: PluginKey<DecorationSet>
) =>
  new Plugin<DecorationSet>({
    key,
    state: {
      init: () => DecorationSet.empty,
      apply(tr, current) {
        let set = current.map(tr.mapping, tr.doc);
        const meta = tr.getMeta(key) as UploadPlaceholderMeta | undefined;
        if (meta && 'add' in meta) {
          set = set.add(
            tr.doc,
            meta.add.map(({ id, pos }) =>
              // Side 1: a mark keeps to the right of anything inserted at its
              // spot, so files dropped together land in the order they came.
              Decoration.widget(pos, renderPlaceholder, { id, side: 1 })
            )
          );
        } else if (meta && 'remove' in meta) {
          set = set.remove(
            set.find(undefined, undefined, (spec) =>
              meta.remove.includes(spec.id as string)
            )
          );
        }
        return set;
      },
    },
    props: {
      decorations(state) {
        return key.getState(state);
      },
    },
  });

/** Where the mark for `id` currently sits, or null once it is gone. */
export const findUploadPlaceholder = (
  state: EditorState,
  key: PluginKey<DecorationSet>,
  id: string
): number | null => {
  const found =
    key.getState(state)?.find(undefined, undefined, (spec) => spec.id === id) ??
    [];
  return found.length > 0 ? found[0]!.from : null;
};

/**
 * Where a block dropped at `pos` can go: between two blocks, never cutting a
 * line of text in two -- the same rule ProseMirror uses for dragged content.
 */
export const blockDropPosition = (
  doc: ProseMirrorNode,
  pos: number,
  block: ProseMirrorNode
): number => {
  const clamped = Math.max(0, Math.min(pos, doc.content.size));
  return (
    dropPoint(doc, clamped, new Slice(Fragment.from(block), 0, 0)) ?? clamped
  );
};
