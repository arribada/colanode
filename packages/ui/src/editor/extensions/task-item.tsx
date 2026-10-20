import { TaskItem } from '@tiptap/extension-list';

import { defaultClasses } from '@colanode/ui/editor/classes';

export const TaskItemNode = TaskItem.configure({
  // A task may hold blocks after its first paragraph -- a sub-checklist above
  // all -- and Tab / Shift-Tab indent and outdent it like a bullet. Off, Tab
  // fell through to TabKeymap and typed a tab character into the task.
  nested: true,
  HTMLAttributes: {
    class: defaultClasses.taskItem,
  },
});
