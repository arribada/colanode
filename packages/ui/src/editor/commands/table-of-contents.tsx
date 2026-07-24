import { ListTree } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const TableOfContentsCommand: EditorCommand = {
  key: 'table-of-contents',
  name: 'Table of contents',
  description: 'Outline built from your headings',
  keywords: ['toc', 'table of contents', 'sommaire', 'outline', 'headings'],
  icon: ListTree,
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setTableOfContents().run();
  },
};
