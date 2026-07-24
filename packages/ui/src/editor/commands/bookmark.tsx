import { Bookmark } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const BookmarkCommand: EditorCommand = {
  key: 'bookmark',
  name: 'Bookmark',
  description: 'Embed a link as a bookmark card',
  keywords: ['bookmark', 'link', 'embed', 'url', 'signet', 'lien'],
  icon: Bookmark,
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setBookmark('').run();
  },
};
