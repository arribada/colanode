import { Editor } from '@tiptap/core';
import {
  ArrowRightFromLine,
  Check,
  Languages,
  MessageSquarePlus,
  Sparkles,
  SpellCheck,
  Text,
  Wand2,
} from 'lucide-react';
import { useRef, useState } from 'react';
import { toast } from 'sonner';

import { AiCompletionAction } from '@colanode/core';
import { AiCompleteMutationOutput } from '@colanode/client/mutations';
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
}

const TRANSLATE_LANGUAGES = [
  'English',
  'French',
  'Spanish',
  'German',
  'Portuguese',
  'Italian',
];

export const AiButton = ({ editor, userId }: AiButtonProps) => {
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
        toast.error(result.error.message);
        return;
      }

      const output = result.output as AiCompleteMutationOutput;
      editor
        .chain()
        .focus()
        .insertContentAt({ from: range.from, to: range.to }, output.text)
        .run();
    } catch {
      toast.error('The AI request failed. Please try again.');
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
          aria-label="Ask AI"
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
            <span className="text-sm font-medium">AI</span>
          </span>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('improve')}
          >
            <Wand2 className="size-4" />
            Improve writing
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('fix')}
          >
            <SpellCheck className="size-4" />
            Fix grammar
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('shorter')}
          >
            <Text className="size-4" />
            Make shorter
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('longer')}
          >
            <ArrowRightFromLine className="size-4" />
            Make longer
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onSelect={() => runAction('summarize')}
          >
            <Text className="size-4" />
            Summarize
          </DropdownMenuItem>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger className="flex items-center gap-2 cursor-pointer">
              <Languages className="size-4" />
              Translate
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
            Ask AI…
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
              Ask AI about the selection
            </DialogTitle>
            <DialogDescription>
              Tell Claude what to do with the selected text. The result replaces
              your selection.
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={askPrompt}
            onChange={(e) => setAskPrompt(e.target.value)}
            placeholder="e.g. Rewrite this in a friendlier tone…"
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
              Cancel
            </Button>
            <Button
              type="button"
              disabled={isRunning || askPrompt.trim().length === 0}
              onClick={async () => {
                setIsAskOpen(false);
                await runAction('custom', askPrompt.trim());
              }}
            >
              {isRunning && <Spinner className="mr-2 size-4" />}
              Run
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
