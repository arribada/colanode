import { Presentation } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const WhiteboardCommand: EditorCommand = {
  key: 'whiteboard',
  name: 'Whiteboard (embed)',
  description: 'Embed a whiteboard in the current document',
  keywords: ['whiteboard', 'board', 'canvas', 'draw', 'diagram', 'sketch'],
  icon: Presentation,
  group: 'media',
  disabled: false,
  // Insert an empty embed (id: null). The node view then renders the picker
  // (see WhiteboardEmbedPicker), letting the user either embed an EXISTING
  // whiteboard or create a brand-new one — both reachable from one command.
  async handler({ editor, range, context }) {
    if (context == null) {
      return;
    }

    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'whiteboardEmbed',
        attrs: {
          id: null,
          height: 480,
        },
      })
      .run();
  },
};
