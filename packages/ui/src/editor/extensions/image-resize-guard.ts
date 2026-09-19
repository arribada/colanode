// ABOUTME: Lets an image's resize handle resize the image on the first press,
// ABOUTME: instead of ProseMirror getting the whole block ready to be dragged.
import { Plugin, PluginKey } from '@tiptap/pm/state';

// The class editor-image-block.tsx gives the image's resize handle.
export const RESIZE_HANDLE_CLASS = 'cn-img-resize-handle';

export const isResizeHandleTarget = (target: EventTarget | null): boolean =>
  typeof Element !== 'undefined' &&
  target instanceof Element &&
  target.closest(`.${RESIZE_HANDLE_CLASS}`) !== null;

/**
 * The image block is draggable, and ProseMirror answers a press on a draggable
 * block by getting it ready to be dragged. On the resize handle that made the
 * first gesture move the image, and only the next one resized it. Claimed here,
 * the press is left alone by ProseMirror and reaches the handle's own listener;
 * a drag that still starts while the handle is held is cancelled.
 */
export const createImageResizeGuardPlugin = () => {
  let resizing = false;

  return new Plugin({
    key: new PluginKey('image-resize-guard'),
    props: {
      handleDOMEvents: {
        mousedown: (_view, event) => {
          if (!isResizeHandleTarget(event.target)) {
            return false;
          }
          resizing = true;
          window.addEventListener(
            'mouseup',
            () => {
              resizing = false;
            },
            { once: true }
          );
          return true;
        },
        dragstart: (_view, event) => {
          if (!resizing) {
            return false;
          }
          event.preventDefault();
          return true;
        },
      },
    },
  });
};
