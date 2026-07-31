import { Link2 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const DatabaseLinkCommand: EditorCommand = {
  key: 'database-link',
  name: 'Linked database',
  description: 'Insert a view of an existing database',
  keywords: ['database', 'linked', 'link', 'existing'],
  icon: Link2,
  disabled: false,
  async handler({ editor, range }) {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'database',
        attrs: {
          id: null,
          inline: true,
        },
      })
      .run();
  },
};
