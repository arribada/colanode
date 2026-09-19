import { HTML5Backend as ReactDndHTML5Backend } from 'react-dnd-html5-backend';

// We need to create a modified version of the HTML5Backend that ignores
// events that are part of the ProseMirror editor, because it intercepts
// them and causes issues with the drag and drop in the editor.

// For more information, see:
// https://github.com/react-dnd/react-dnd/issues/802

// Whether react-dnd should leave this event to the editor: anything inside a
// ProseMirror editor, except inside an embedded database view.
//
// Decided from the event's path, not from its target's ancestors: ProseMirror
// handles a drop first and may replace the node the event targeted, and a
// detached target has no .ProseMirror ancestor anymore. react-dnd then took
// the editor's own drop and threw "Cannot call hover while not dragging".
// composedPath() is fixed when the event is dispatched.
export const shouldIgnoreEventPath = (path: EventTarget[]): boolean => {
  for (const node of path) {
    const classes = (node as Partial<Element>).classList;
    if (!classes) {
      continue;
    }
    if (
      classes.contains('react-renderer') &&
      classes.contains('node-database')
    ) {
      return false;
    }
    if (classes.contains('ProseMirror')) {
      return true;
    }
  }
  return false;
};

export const HTML5Backend = (...args: unknown[]) => {
  // @ts-expect-error - HTML5Backend is not typed
  const instance = new ReactDndHTML5Backend(...args);

  const listeners = [
    'handleTopDragStart',
    'handleTopDragStartCapture',
    'handleTopDragEndCapture',
    'handleTopDragEnter',
    'handleTopDragEnterCapture',
    'handleTopDragLeaveCapture',
    'handleTopDragOver',
    'handleTopDragOverCapture',
    'handleTopDrop',
    'handleTopDropCapture',
  ];
  listeners.forEach((name) => {
    const original = instance[name];
    instance[name] = (e: Event, ...extraArgs: unknown[]) => {
      if (!shouldIgnoreEventPath(e.composedPath())) {
        original(e, ...extraArgs);
      }
    };
  });

  return instance;
};
