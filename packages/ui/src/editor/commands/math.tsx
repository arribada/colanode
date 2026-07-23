import { Radical, Sigma } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const MathBlockCommand: EditorCommand = {
  key: 'math-block',
  name: 'Math block',
  description: 'Insert a LaTeX math block',
  keywords: ['math', 'katex', 'latex', 'equation', 'formula'],
  icon: Sigma,
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).insertMathBlock().run();
  },
};

export const MathInlineCommand: EditorCommand = {
  key: 'math-inline',
  name: 'Inline math',
  description: 'Insert inline LaTeX math',
  keywords: ['math', 'katex', 'latex', 'equation', 'inline'],
  icon: Radical,
  disabled: false,
  handler: ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).insertMathInline().run();
  },
};
