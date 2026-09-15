import { Heading5 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const Heading5Command: EditorCommand = {
  key: 'heading5',
  name: 'Heading 5',
  description: 'Insert a heading 5 element',
  keywords: ['heading', 'heading5', 'h5'],
  icon: Heading5,
  group: 'basic',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setNode('heading5').run();
  },
};
