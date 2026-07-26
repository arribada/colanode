import { Editor } from '@tiptap/core';
import { Sparkles } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AiCompleteMutationOutput } from '@colanode/client/mutations';
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
  // Where the generated text should be inserted (the cursor position left after
  // the "/ai" trigger text was deleted).
  insertPos: number;
  userId: string | null;
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

// Grab a chunk of document text preceding `pos` so the model has grounding when
// the action is "continue writing" (empty prompt).
const getPrecedingContext = (editor: Editor, pos: number): string => {
  const from = Math.max(0, pos - 2000);
  try {
    return editor.state.doc.textBetween(from, pos, '\n', ' ').trim();
  } catch {
    return '';
  }
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
          'Set up the AI assistant in your workspace settings first.'
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

    const trimmed = prompt.trim();
    const { editor, insertPos } = request;
    const context = getPrecedingContext(editor, insertPos);

    setIsPending(true);
    try {
      const result = await window.colanode.executeMutation({
        type: 'ai.complete',
        userId: request.userId,
        // Empty prompt -> "continue writing" from the preceding text.
        action: trimmed.length > 0 ? 'custom' : 'continue',
        prompt: trimmed,
        context,
      });

      if (!result.success) {
        setIsPending(false);
        toast.error(result.error.message);
        return;
      }

      const output = result.output as AiCompleteMutationOutput;
      editor
        .chain()
        .focus()
        .insertContentAt(insertPos, output.text)
        .run();
      close();
    } catch {
      setIsPending(false);
      toast.error('The AI request failed. Please try again.');
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
            Ask AI
          </DialogTitle>
          <DialogDescription>
            Describe what to write and Claude will insert it at your cursor.
            Leave it empty to continue writing from the text above.
          </DialogDescription>
        </DialogHeader>
        <Textarea
          ref={textareaRef}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="e.g. Write an intro paragraph about sea turtle tracking…"
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
            Cancel
          </Button>
          <Button type="button" onClick={run} disabled={isPending}>
            {isPending && <Spinner className="mr-2 size-4" />}
            Generate
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
