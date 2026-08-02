import { Code } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const CodeBlockCommand: EditorCommand = {
  key: 'code-block',
  name: 'Code',
  description: 'Insert a code block',
  keywords: ['code', 'codeblock'],
  icon: Code,
  group: 'basic',
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).toggleCodeBlock().run();
  },
};
