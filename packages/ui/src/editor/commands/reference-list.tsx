import { Image, Table2 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const TableOfFiguresCommand: EditorCommand = {
  key: 'table-of-figures',
  name: 'Table of figures',
  description: 'List of your captioned figures',
  keywords: [
    'figures',
    'table of figures',
    'figure',
    'captions',
    'table des figures',
  ],
  icon: Image,
  group: 'layout',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setTableOfFigures().run();
  },
};

export const TableOfTablesCommand: EditorCommand = {
  key: 'table-of-tables',
  name: 'Table of tables',
  description: 'List of your captioned tables',
  keywords: [
    'tables',
    'table of tables',
    'captions',
    'table des tableaux',
  ],
  icon: Table2,
  group: 'layout',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setTableOfTables().run();
  },
};
