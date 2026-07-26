import { Sparkles } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';
import { openAiPrompt } from '@colanode/ui/editor/ai/ai-prompt';

export const AiCommand: EditorCommand = {
  key: 'ai',
  name: 'Ask AI',
  description: 'Generate or continue text with Claude',
  keywords: ['ai', 'ask', 'claude', 'anthropic', 'generate', 'write', 'gpt'],
  icon: Sparkles,
  disabled: false,
  handler: ({ editor, range, context }) => {
    // Remove the "/ai" trigger, then hand the resulting cursor position to the
    // React prompt dialog rendered inside the document editor.
    editor.chain().focus().deleteRange(range).run();
    const insertPos = editor.state.selection.from;
    openAiPrompt({
      editor,
      insertPos,
      userId: context?.userId ?? null,
    });
  },
};
