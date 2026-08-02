import { Workflow } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const MermaidCommand: EditorCommand = {
  key: 'mermaid',
  name: 'Mermaid diagram',
  description: 'Insert a diagram (flowchart, sequence, state, gantt…)',
  keywords: [
    'mermaid',
    'diagram',
    'flowchart',
    'sequence',
    'graph',
    'state',
    'gantt',
    'class',
    'er',
  ],
  icon: Workflow,
  group: 'media',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).insertMermaid().run();
  },
};
