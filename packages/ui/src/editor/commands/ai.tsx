import { Sparkles } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';
import { openAiPrompt } from '@colanode/ui/editor/ai/ai-prompt';

export const AiCommand: EditorCommand = {
  key: 'ai',
  name: 'AI',
  description: 'Ask the AI agent (create, edit, complete…)',
  keywords: [
    'ai',
    'ia',
    'ask',
    'claude',
    'anthropic',
    'generate',
    'write',
    'gpt',
    'agent',
  ],
  icon: Sparkles,
  group: 'ai',
  disabled: false,
  handler: ({ editor, range, context }) => {
    // Remove the "/ai" trigger, then hand the resulting cursor position (and the
    // current page id) to the React agent prompt rendered inside the editor.
    editor.chain().focus().deleteRange(range).run();
    const insertPos = editor.state.selection.from;
    openAiPrompt({
      editor,
      insertPos,
      userId: context?.userId ?? null,
      pageId: context?.documentId ?? null,
    });
  },
};
