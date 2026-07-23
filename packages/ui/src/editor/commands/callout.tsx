import { Megaphone } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const CalloutCommand: EditorCommand = {
  key: 'callout',
  name: 'Callout',
  description: 'Insert a callout block',
  keywords: ['callout', 'note', 'info', 'warning', 'tip', 'aside'],
  icon: Megaphone,
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setCallout().run();
  },
};
