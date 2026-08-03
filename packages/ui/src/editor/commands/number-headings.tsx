// ABOUTME: Slash-menu command that toggles document-wide heading auto-numbering.
// ABOUTME: Numbering is display-only (decorations) and defaults to off.
import { ListOrdered } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const NumberHeadingsCommand: EditorCommand = {
  key: 'number-headings',
  name: 'Number headings',
  description: 'Toggle automatic 1, 1.1, 1.1.1 heading numbering',
  keywords: ['number', 'numbering', 'headings', 'outline', 'auto'],
  icon: ListOrdered,
  group: 'basic',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).toggleHeadingNumbering().run();
  },
};
