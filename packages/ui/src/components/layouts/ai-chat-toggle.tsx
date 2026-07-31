import { Sparkles } from 'lucide-react';

import { useAiChatPanel } from '@colanode/ui/contexts/ai-chat-panel';

// Always-available floating launcher for the AI chat cockpit. Rendered by the
// workspace layout (authenticated workspace chrome). Hidden while the panel is
// open — the panel header carries its own close button.
export const AiChatToggle = () => {
  const { isOpen, openPanel } = useAiChatPanel();

  if (isOpen) {
    return null;
  }

  return (
    <button
      type="button"
      aria-label="Ouvrir l’assistant IA"
      title="Assistant IA"
      onClick={openPanel}
      className="fixed bottom-4 right-4 z-40 flex items-center gap-2 rounded-full border border-border bg-background px-4 py-2 text-sm font-medium text-foreground shadow-lg transition-colors hover:bg-accent hover:text-accent-foreground"
    >
      <Sparkles className="size-4 text-primary" />
      Assistant IA
    </button>
  );
};
