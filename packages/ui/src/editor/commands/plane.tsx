import { FolderKanban } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const PlaneCommand: EditorCommand = {
  key: 'plane',
  name: 'Plane project',
  description: 'Embed links to a Plane project (read-only)',
  keywords: [
    'plane',
    'projet',
    'project',
    'board',
    'tableau',
    'kanban',
    'issues',
    'taches',
    'tasks',
    'liens',
  ],
  icon: FolderKanban,
  disabled: false,
  handler: ({ editor, range }) => {
    // Insert with an empty projectId — the block itself renders a project
    // picker (mirrors how /embed and /bookmark insert an empty block that
    // then prompts for its URL). Read-only: the block only ever links out.
    editor.chain().focus().deleteRange(range).setPlaneEmbed().run();
  },
};
