import { Columns2 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const ColumnsCommand: EditorCommand = {
  key: 'columns',
  name: 'Columns',
  description: 'Side-by-side column layout',
  keywords: ['columns', 'colonnes', 'layout', 'side by side', 'grid'],
  icon: Columns2,
  group: 'layout',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setColumns(2).run();
  },
};
