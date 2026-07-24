import { Editor, Extension } from '@tiptap/core';
import { Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

import { withAlpha } from '@colanode/ui/lib/presence';

export interface RemoteCaret {
  // Stable identity of the remote session (userId:deviceId).
  key: string;
  name: string;
  color: string;
  // Absolute ProseMirror positions of the remote selection.
  anchor: number;
  head: number;
}

export const presencePluginKey = new PluginKey<DecorationSet>(
  'presence-carets'
);

const clamp = (value: number, min: number, max: number): number =>
  Math.max(min, Math.min(max, value));

const buildCaretElement = (caret: RemoteCaret): HTMLElement => {
  const wrapper = document.createElement('span');
  wrapper.className = 'presence-caret';
  wrapper.setAttribute('contenteditable', 'false');
  wrapper.style.position = 'relative';
  wrapper.style.display = 'inline-block';
  wrapper.style.width = '0';
  wrapper.style.height = '1.2em';
  wrapper.style.verticalAlign = 'text-bottom';
  wrapper.style.pointerEvents = 'none';
  wrapper.style.borderLeft = `2px solid ${caret.color}`;
  wrapper.style.marginLeft = '-1px';

  const flag = document.createElement('span');
  flag.textContent = caret.name || 'Anonymous';
  flag.style.position = 'absolute';
  flag.style.top = '-1.3em';
  flag.style.left = '-1px';
  flag.style.whiteSpace = 'nowrap';
  flag.style.fontSize = '11px';
  flag.style.lineHeight = '1';
  flag.style.padding = '2px 4px';
  flag.style.borderRadius = '3px';
  flag.style.color = '#ffffff';
  flag.style.backgroundColor = caret.color;
  flag.style.userSelect = 'none';
  wrapper.appendChild(flag);

  return wrapper;
};

const buildDecorations = (
  doc: ProseMirrorNode,
  carets: RemoteCaret[]
): DecorationSet => {
  const size = doc.content.size;
  const decorations: Decoration[] = [];

  for (const caret of carets) {
    const from = clamp(Math.min(caret.anchor, caret.head), 0, size);
    const to = clamp(Math.max(caret.anchor, caret.head), 0, size);
    const head = clamp(caret.head, 0, size);

    if (to > from) {
      decorations.push(
        Decoration.inline(from, to, {
          class: 'presence-selection',
          style: `background-color:${withAlpha(caret.color, 0.25)}`,
        })
      );
    }

    decorations.push(
      Decoration.widget(head, () => buildCaretElement(caret), {
        side: 1,
        key: `presence-caret-${caret.key}`,
        ignoreSelection: true,
      })
    );
  }

  return DecorationSet.create(doc, decorations);
};

/**
 * Renders remote collaborators' carets and selections as ProseMirror
 * decorations. Positions are absolute (this editor is not bound to a shared
 * ProseMirror-Yjs document), so they are best-effort and self-correct on the
 * next presence update — perfectly adequate for ephemeral cursors.
 *
 * Remote carets are pushed in from React via `setRemoteCarets`.
 */
export const PresenceExtension = Extension.create({
  name: 'presence',

  addProseMirrorPlugins() {
    return [
      new Plugin<DecorationSet>({
        key: presencePluginKey,
        state: {
          init: () => DecorationSet.empty,
          apply(tr, old) {
            const meta = tr.getMeta(presencePluginKey) as
              | RemoteCaret[]
              | undefined;
            if (meta) {
              return buildDecorations(tr.doc, meta);
            }
            return old.map(tr.mapping, tr.doc);
          },
        },
        props: {
          decorations(state) {
            return presencePluginKey.getState(state);
          },
        },
      }),
    ];
  },
});

/** Push the current set of remote carets into the editor's presence plugin. */
export const setRemoteCarets = (
  editor: Editor,
  carets: RemoteCaret[]
): void => {
  const { view } = editor;
  if (!view || view.isDestroyed) {
    return;
  }
  view.dispatch(view.state.tr.setMeta(presencePluginKey, carets));
};
