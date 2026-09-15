import { Heading4 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const Heading4Command: EditorCommand = {
  key: 'heading4',
  name: 'Heading 4',
  description: 'Insert a heading 4 element',
  keywords: ['heading', 'heading4', 'h4'],
  icon: Heading4,
  group: 'basic',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setNode('heading4').run();
  },
};
