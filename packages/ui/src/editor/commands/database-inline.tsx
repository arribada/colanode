import { DatabaseZap } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const DatabaseInlineCommand: EditorCommand = {
  key: 'database-inline',
  name: 'Database - Inline',
  description: 'Insert a database inline in the current document',
  keywords: ['database', 'inline'],
  icon: DatabaseZap,
  group: 'database',
  disabled: false,
  handler({ editor, range, context }) {
    // Remove the slash trigger, then let the document editor open a modal to
    // name the database and set up its properties. Nothing is created until the
    // modal is confirmed, so bailing out never leaves an orphan Untitled DB.
    editor.chain().focus().deleteRange(range).run();
    context?.onCreateInlineDatabase?.();
  },
};
