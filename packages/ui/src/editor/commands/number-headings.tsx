// ABOUTME: Slash-menu commands that toggle document-wide heading auto-numbering
// ABOUTME: in nested (1, 1.1, 1.1.1) or flat (1, 2, 3) style. Display-only.
import { ListOrdered, ListTree } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const NumberHeadingsCommand: EditorCommand = {
  key: 'number-headings',
  name: 'Number headings (nested)',
  description: 'Toggle hierarchical 1, 1.1, 1.1.1 heading numbering',
  keywords: ['number', 'numbering', 'headings', 'outline', 'auto', 'nested'],
  icon: ListTree,
  group: 'basic',
  disabled: false,
  handler: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .setHeadingNumberingMode('nested')
      .run();
  },
};

export const NumberHeadingsFlatCommand: EditorCommand = {
  key: 'number-headings-flat',
  name: 'Number headings (flat)',
  description: 'Toggle simple 1, 2, 3 heading numbering across the page',
  keywords: ['number', 'numbering', 'headings', 'outline', 'auto', 'flat'],
  icon: ListOrdered,
  group: 'basic',
  disabled: false,
  handler: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .setHeadingNumberingMode('flat')
      .run();
  },
};
