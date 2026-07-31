import { Editor } from '@tiptap/core';
import {
  ArrowRightFromLine,
  Languages,
  MessageSquarePlus,
  Sparkles,
  SpellCheck,
  Text,
  Wand2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  AiAgentMutationOutput,
  AiCompleteMutationOutput,
} from '@colanode/client/mutations';
import { AiAgentAction, AiCompletionAction } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { cn } from '@colanode/ui/lib/utils';

interface AiButtonProps {
  editor: Editor;
  userId: string;
  // The node id of the page being edited; forwarded to the wiki agent so it can
  // anchor its work to the current page.
  pageId?: string;
}

const TRANSLATE_LANGUAGES = [
  'Anglais',
  'Français',
  'Espagnol',
  'Allemand',
  'Portugais',
  'Italien',
];

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

export const AiButton = ({ editor, userId, pageId }: AiButtonProps) => {
  const [isOpen, setIsOpen] = useState(false);
  const [isRunning, setIsRunning] = useState(false);
  const [isAskOpen, setIsAskOpen] = useState(false);
  const [askPrompt, setAskPrompt] = useState('');
  // The selection range captured when the menu opened. The dropdown keeps the
  // ProseMirror selection alive, but we snapshot it so a late-arriving result
  // still replaces the right text.
  const rangeRef = useRef<{ from: number; to: number } | null>(null);

  const snapshotSelection = () => {
    const { from, to } = editor.state.selection;
    rangeRef.current = { from, to };
  };

  // Canned rewrite actions (Improve/Fix/Shorter/Longer/Summarize/Translate).
  // These stay on the fast ai.complete path: a pure text rewrite, no wiki tools.
  const runAction = async (action: AiCompletionAction, prompt = '') => {
    const range = rangeRef.current;
    if (!range || range.from === range.to) {
      return;
    }

    const selection = editor.state.doc.textBetween(
      range.from,
      range.to,
      '\n',
      ' '
    );

    setIsRunning(true);
    setIsOpen(false);
    try {
      const result = await window.colanode.executeMutation({
        type: 'ai.complete',
        userId,
        action,
        prompt,
        selection,
      });

      if (!result.success) {
        toast.error(friendlyAiError(result.error.message));
        return;
      }

      const output = result.output as AiCompleteMutationOutput;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: range.from, to: range.to }, output.text)
        .run();
    } catch {
      toast.error('La requête IA a échoué. Réessaie.');
    } finally {
      setIsRunning(false);
    }
  };

  // "Demander à l’IA…" — the free-prompt path runs the wiki AGENT, so it can do
  // more than rewrite (create/edit pages & databases). If the agent returns
  // text it replaces the selection (undoable); the actions it performed are
  // always toasted.
  const runAgent = async (message: string) => {
    const range = rangeRef.current;
    if (!range || range.from === range.to) {
      return;
    }

    const selection = editor.state.doc.textBetween(
      range.from,
      range.to,
      '\n',
      ' '
    );

    setIsRunning(true);
    setIsOpen(false);
    try {
      const result = await window.colanode.executeMutation({
        type: 'ai.agent',
        userId,
        message,
        selection,
        pageId,
      });

      if (!result.success) {
        toast.error(friendlyAiError(result.error.message));
        return;
      }

      const output = result.output as AiAgentMutationOutput;

      if (output.text.trim().length > 0) {
        editor
          .chain()
          .focus()
          .insertContentAt({ from: range.from, to: range.to }, output.text)
          .run();
      }

      const summary = summarizeActions(output.actions);
      if (output.actions.length > 0) {
        toast.success(summary);
      } else {
        toast(summary);
      }
    } catch {
      toast.error('La requête IA a échoué. Réessaie.');
    } finally {
      setIsRunning(false);
    }
  };

  return (
    <>
      <DropdownMenu
        open={isOpen}
        onOpenChange={(open) => {
          if (open) {
            snapshotSelection();
          }
          setIsOpen(open);
        }}
      >
        <DropdownMenuTrigger
          aria-label="Demander à l’IA"
          data-testid="editor-toolbar-ai"
          disabled={isRunning}
        >
          <span
            className={cn(
              'flex h-8 items-center justify-center gap-1 rounded-md px-2 cursor-pointer text-primary hover:bg-input',
              isOpen && 'bg-input'
            )}
          >
            {isRunning ? (
              <Spinner className="size-4" />
            ) : (
              <Sparkles className="size-4" />
            )}
            <span className="text-sm font-medium">IA</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('improve')}
          >
            <Wand2 className="size-4" />
            Améliorer l’écriture
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('fix')}
          >
            <SpellCheck className="size-4" />
            Corriger la grammaire
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('shorter')}
          >
            <Text className="size-4" />
            Raccourcir
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('longer')}
          >
            <ArrowRightFromLine className="size-4" />
            Rallonger
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('summarize')}
          >
            <Text className="size-4" />
            Résumer
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
              <Languages className="size-4" />
              Traduire
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              {TRANSLATE_LANGUAGES.map((language) => (
                <DropdownMenuItem
                  key={language}
                  className="cursor-pointer"
                  onSelect={() => runAction('translate', language)}
                >
                  {language}
                </DropdownMenuItem>
              ))}
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => {
              // Keep the snapshot from the menu open; open the free-prompt.
              setAskPrompt('');
              setIsAskOpen(true);
            }}
          >
            <MessageSquarePlus className="size-4" />
            Demander à l’IA…
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      <Dialog
        open={isAskOpen}
        onOpenChange={(open) => {
          if (!isRunning) {
            setIsAskOpen(open);
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
              Dis à l’agent IA quoi faire avec la sélection. Il peut la réécrire,
              mais aussi créer ou modifier des pages du wiki. S’il renvoie du
              texte, il remplace la sélection.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={askPrompt}
            onChange={(e) => setAskPrompt(e.target.value)}
            placeholder="ex : réécris ce passage, crée une page liée, ajoute une section…"
            className="min-h-24"
            autoFocus
          />
          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsAskOpen(false)}
              disabled={isRunning}
            >
              Annuler
            </Button>
            <Button
              type="button"
              disabled={isRunning || askPrompt.trim().length === 0}
              onClick={async () => {
                setIsAskOpen(false);
                await runAgent(askPrompt.trim());
              }}
            >
              {isRunning && <Spinner className="mr-2 size-4" />}
              Envoyer
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
