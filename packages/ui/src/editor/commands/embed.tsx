import { MonitorPlay } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const EmbedCommand: EditorCommand = {
  key: 'embed',
  name: 'Embed',
  description: 'Embed a Google Drive doc, YouTube video, Figma file, or any URL',
  keywords: [
    'embed',
    'iframe',
    'integrer',
    'drive',
    'google',
    'docs',
    'sheets',
    'slides',
    'youtube',
    'video',
    'figma',
  ],
  icon: MonitorPlay,
  group: 'embeds',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).setEmbed('').run();
  },
};
