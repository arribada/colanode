import { Editor } from '@tiptap/core';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AiAgentMutationOutput } from '@colanode/client/mutations';
import { AiAgentAction } from '@colanode/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Button } from '@colanode/ui/components/ui/button';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { Textarea } from '@colanode/ui/components/ui/textarea';

// Payload the /ai slash command hands to the (React) prompt dialog. The command
// handler has no React scope of its own, so it publishes through this tiny bus
// and the <AiSlashPrompt /> rendered inside the document editor picks it up.
export interface AiPromptRequest {
  editor: Editor;
  // Where any generated text should be inserted (the cursor position left after
  // the "/ai" trigger text was deleted).
  insertPos: number;
  userId: string | null;
  // The node id of the page the request is anchored to, so the wiki agent knows
  // which page the user is working on.
  pageId: string | null;
}

type Listener = (request: AiPromptRequest) => void;

const listeners = new Set<Listener>();

export const openAiPrompt = (request: AiPromptRequest) => {
  if (listeners.size === 0) {
    return;
  }
  for (const listener of listeners) {
    listener(request);
  }
};

const subscribeAiPrompt = (listener: Listener) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// Grab a chunk of document text preceding `pos` so the agent has grounding on
// what the user is currently looking at.
const getPrecedingContext = (editor: Editor, pos: number): string => {
  const from = Math.max(0, pos - 2000);
  try {
    return editor.state.doc.textBetween(from, pos, '\n', ' ').trim();
  } catch {
    return '';
  }
};

// Turn the agent's action list into a short, human toast summary.
const summarizeActions = (actions: AiAgentAction[]): string => {
  if (actions.length === 0) {
    return 'IA : aucune action';
  }
  const details = actions
    .map((action) => action.summary.trim())
    .filter((summary) => summary.length > 0);
  const count = `IA : ${actions.length} action${actions.length > 1 ? 's' : ''}`;
  return details.length > 0 ? `${count} — ${details.join(' ; ')}` : count;
};

// The server flattens the AiNotConfigured error to its (English) message; turn
// the known phrasing into a friendly French toast pointing at the settings.
const friendlyAiError = (message: string): string => {
  if (/no ai credentials/i.test(message)) {
    return 'L’IA n’est pas encore configurée. Ouvre Réglages → Assistant IA pour ajouter ta clé, ou demande à un admin d’activer la clé d’équipe.';
  }
  return message;
};

export const AiSlashPrompt = () => {
  const [request, setRequest] = useState<AiPromptRequest | null>(null);
  const [prompt, setPrompt] = useState('');
  const [isPending, setIsPending] = useState(false);
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    return subscribeAiPrompt((req) => {
      if (!req.userId) {
        toast.error(
          'Configure d’abord l’assistant IA dans les réglages de l’espace de travail.'
        );
        return;
      }
      setPrompt('');
      setRequest(req);
    });
  }, []);

  useEffect(() => {
    if (request) {
      // Defer focus until the dialog content has mounted.
      const id = window.setTimeout(() => textareaRef.current?.focus(), 50);
      return () => window.clearTimeout(id);
    }
    return undefined;
  }, [request]);

  const close = () => {
    setRequest(null);
    setPrompt('');
    setIsPending(false);
  };

  const run = async () => {
    if (!request || !request.userId) {
      return;
    }

    const message = prompt.trim();
    if (message.length === 0) {
      return;
    }

    const { editor, insertPos, pageId } = request;
    const context = getPrecedingContext(editor, insertPos);

    setIsPending(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'ai.agent',
        userId: request.userId,
        message,
        pageId: pageId ?? undefined,
        context,
      });

      if (!result.success) {
        setIsPending(false);
        toast.error(friendlyAiError(result.error.message));
        return;
      }

      const output = result.output as AiAgentMutationOutput;

      // The agent may return a text answer to drop at the cursor, may only act
      // on other pages, or both. Insert text when present (undoable)…
      if (output.text.trim().length > 0) {
        editor.chain().focus().insertContentAt(insertPos, output.text).run();
      }

      // …and always report what the agent actually did.
      const summary = summarizeActions(output.actions);
      if (output.actions.length > 0) {
        toast.success(summary);
      } else {
        toast(summary);
      }

      close();
    } catch {
      setIsPending(false);
      toast.error('La requête IA a échoué. Réessaie.');
    }
  };

  return (
    <Dialog
      open={request != null}
      onOpenChange={(open) => {
        if (!open && !isPending) {
          close();
        }
      }}
    >
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="size-4 text-primary" />
            Demander à l’IA
          </DialogTitle>
          <DialogDescription>
            Décris ce que l’agent IA doit faire. Il peut répondre au curseur,
            mais aussi créer, lire et modifier des pages et bases du wiki.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Demande à l’IA… (ex : crée une page X, ajoute une section, corrige les liens)"
          className="min-h-24"
          onKeyDown={(e) => {
            if ((e.metaKey || e.ctrlKey) && e.key === 'Enter') {
              e.preventDefault();
              if (!isPending) {
                run();
              }
            }
          }}
        />
        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            onClick={close}
            disabled={isPending}
          >
            Annuler
          </Button>
          <Button
            type="button"
            onClick={run}
            disabled={isPending || prompt.trim().length === 0}
          >
            {isPending && <Spinner className="mr-2 size-4" />}
            Envoyer
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
