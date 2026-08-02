import { useNavigate, useParams } from '@tanstack/react-router';
import { Send, Sparkles, SquarePen, X } from 'lucide-react';
import { Resizable } from 're-resizable';
import { useEffect, useRef, useState } from 'react';
import { toast } from 'sonner';

import { AiChatMutationOutput } from '@colanode/client/mutations';
import { AiAgentAction } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import {
  ScrollArea,
  ScrollViewport,
} from '@colanode/ui/components/ui/scroll-area';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { useAiChatPanel } from '@colanode/ui/contexts/ai-chat-panel';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';
import { cn } from '@colanode/ui/lib/utils';

const DEFAULT_WIDTH = 400;

// A single transcript turn. Assistant turns also carry the wiki actions the
// agent performed, so the chips survive a reload with the persisted session.
interface ChatEntry {
  role: 'user' | 'assistant';
  content: string;
  actions?: AiAgentAction[];
}

interface ChatSession {
  entries: ChatEntry[];
}

const EXAMPLE_PROMPTS = [
  'Summarise this page',
  'Create a “Field notes” page under this page',
  'Search for pages about turtles',
];

// Mirrors the AiNotConfigured handling used elsewhere in the editor: the server
// flattens the error to its (English) message; we point the user at settings.
const CREDENTIALS_HINT =
  'The AI isn’t set up yet. Open Settings → AI Assistant → Team key to add a key (or ask an admin to enable it).';

const isCredentialsError = (message: string): boolean =>
  /no ai credentials/i.test(message);

// Short verb from the action type; the server summary carries the detail.
const actionVerb = (type: string): string => {
  const t = type.toLowerCase();
  if (t.includes('create')) return 'Created';
  if (t.includes('update') || t.includes('edit') || t.includes('append')) {
    return 'Edited';
  }
  if (t.includes('delete') || t.includes('remove') || t.includes('trash')) {
    return 'Deleted';
  }
  if (t.includes('move')) return 'Moved';
  if (
    t.includes('search') ||
    t.includes('find') ||
    t.includes('list') ||
    t.includes('read') ||
    t.includes('get') ||
    t.includes('fetch')
  ) {
    return 'Viewed';
  }
  return 'Action';
};

const EmptyState = ({ onPick }: { onPick: (prompt: string) => void }) => (
  <div className="flex flex-col gap-3 py-6 text-center">
    <Sparkles className="mx-auto size-6 text-primary" />
    <div>
      <p className="text-sm font-medium">Wiki AI assistant</p>
      <p className="mt-1 text-xs text-muted-foreground">
        Ask a question or request an action. The assistant can search, read,
        create and edit wiki pages and databases with your permissions.
      </p>
    </div>
    <div className="flex flex-col gap-1.5">
      {EXAMPLE_PROMPTS.map((prompt) => (
        <button
          key={prompt}
          type="button"
          className="cursor-pointer rounded-md border border-border px-3 py-2 text-left text-xs text-muted-foreground hover:bg-muted hover:text-foreground"
          onClick={() => onPick(prompt)}
        >
          {prompt}
        </button>
      ))}
    </div>
  </div>
);

const ChatBubble = ({
  entry,
  onOpenNode,
}: {
  entry: ChatEntry;
  onOpenNode: (nodeId: string) => void;
}) => {
  const isUser = entry.role === 'user';
  return (
    <div className={cn('flex flex-col', isUser ? 'items-end' : 'items-start')}>
      <div
        className={cn(
          'max-w-[85%] whitespace-pre-wrap break-words rounded-lg px-3 py-2 text-sm',
          isUser
            ? 'bg-primary text-primary-foreground'
            : 'bg-muted text-foreground'
        )}
      >
        {entry.content.length > 0 ? (
          entry.content
        ) : (
          <span className="italic text-muted-foreground">
            (no text response)
          </span>
        )}
      </div>
      {!isUser && entry.actions && entry.actions.length > 0 && (
        <div className="mt-1 flex max-w-[85%] flex-col gap-1">
          {entry.actions.map((action, index) => {
            const verb = actionVerb(action.type);
            const summary = action.summary.trim();
            const inner = (
              <>
                <span className="text-emerald-600 dark:text-emerald-400">
                  ✓
                </span>
                <span className="font-medium">{verb}</span>
                {summary.length > 0 && (
                  <span className="text-muted-foreground">— {summary}</span>
                )}
              </>
            );
            const nodeId = action.nodeId;
            if (nodeId) {
              return (
                <button
                  key={index}
                  type="button"
                  title="Open in the wiki"
                  className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-left text-xs hover:bg-muted"
                  onClick={() => onOpenNode(nodeId)}
                >
                  {inner}
                </button>
              );
            }
            return (
              <div
                key={index}
                className="flex items-center gap-1 rounded-md bg-muted/60 px-2 py-1 text-xs"
              >
                {inner}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
};

export const AiChatPanel = () => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { isOpen, closePanel } = useAiChatPanel();

  // The panel sits beside the router <Outlet />, so the open page id comes from
  // the router params (only present when a node route is actually matched — a
  // static sibling route like /settings yields no nodeId). A modal node, when
  // open, is what the user is looking at, so it wins.
  const params = useParams({ strict: false }) as {
    nodeId?: string;
    modalNodeId?: string;
  };
  const pageId = params.modalNodeId ?? params.nodeId;

  const [width, setWidth] = useMetadata<number>(
    workspace.userId,
    'ai.chat.width'
  );
  const [session, setSession] = useMetadata<ChatSession>(
    workspace.userId,
    'ai.chat.session'
  );
  const entries = session?.entries ?? [];

  const [input, setInput] = useState('');
  const [isSending, setIsSending] = useState(false);
  const [inlineError, setInlineError] = useState<string | null>(null);

  const viewportRef = useRef<HTMLDivElement>(null);

  // Keep the transcript pinned to the latest turn.
  useEffect(() => {
    const viewport = viewportRef.current;
    if (viewport) {
      viewport.scrollTop = viewport.scrollHeight;
    }
  }, [entries.length, isSending, isOpen]);

  if (!isOpen) {
    return null;
  }

  const send = async () => {
    const text = input.trim();
    if (text.length === 0 || isSending) {
      return;
    }

    setInlineError(null);
    setInput('');

    // Snapshots drive the optimistic update and any rollback — never the
    // (async, possibly stale) live-query `entries`.
    const priorEntries = entries;
    const sentEntries: ChatEntry[] = [
      ...priorEntries,
      { role: 'user', content: text },
    ];
    setSession({ entries: sentEntries });
    setIsSending(true);

    try {
      const result = await window.colanode.executeMutation({
        type: 'ai.chat',
        userId: workspace.userId,
        messages: sentEntries.map((entry) => ({
          role: entry.role,
          content: entry.content,
        })),
        pageId,
      });

      if (!result.success) {
        // Roll the optimistic turn back and hand the text back to the user so
        // nothing they typed is lost.
        setSession({ entries: priorEntries });
        setInput(text);
        const message = result.error.message;
        if (isCredentialsError(message)) {
          setInlineError(CREDENTIALS_HINT);
          toast.error(CREDENTIALS_HINT);
        } else {
          toast.error('The AI request failed. Try again.');
        }
        return;
      }

      const output = result.output as AiChatMutationOutput;
      setSession({
        entries: [
          ...sentEntries,
          {
            role: 'assistant',
            content: output.text,
            actions: output.actions,
          },
        ],
      });
    } catch {
      setSession({ entries: priorEntries });
      setInput(text);
      toast.error('The AI request failed. Try again.');
    } finally {
      setIsSending(false);
    }
  };

  const clearConversation = () => {
    setSession(undefined);
    setInlineError(null);
    setInput('');
  };

  return (
    <Resizable
      as="aside"
      size={{ width: width ?? DEFAULT_WIDTH, height: '100%' }}
      className="border-l border-border bg-background"
      minWidth={320}
      maxWidth={640}
      enable={{
        bottom: false,
        bottomLeft: false,
        bottomRight: false,
        left: true,
        right: false,
        top: false,
        topLeft: false,
        topRight: false,
      }}
      onResize={(_, __, ref) => setWidth(ref.offsetWidth)}
    >
      <div className="flex h-full min-h-0 flex-col">
        <div className="flex h-10 shrink-0 flex-row items-center justify-between border-b border-border px-3">
          <p className="flex items-center gap-1.5 text-sm font-semibold">
            <Sparkles className="size-4 text-primary" />
            AI assistant
          </p>
          <div className="flex items-center gap-2">
            <button
              type="button"
              aria-label="New conversation"
              title="New conversation"
              className="cursor-pointer text-muted-foreground hover:text-foreground disabled:cursor-default disabled:opacity-40"
              onClick={clearConversation}
              disabled={isSending || entries.length === 0}
            >
              <SquarePen className="size-4" />
            </button>
            <button
              type="button"
              aria-label="Close the assistant"
              title="Close"
              className="cursor-pointer text-muted-foreground hover:text-foreground"
              onClick={closePanel}
            >
              <X className="size-4" />
            </button>
          </div>
        </div>

        <ScrollArea className="min-h-0 flex-1">
          <ScrollViewport ref={viewportRef} className="h-full">
            <div className="flex flex-col gap-3 p-3">
              {entries.length === 0 && !isSending ? (
                <EmptyState onPick={(prompt) => setInput(prompt)} />
              ) : (
                entries.map((entry, index) => (
                  <ChatBubble
                    key={index}
                    entry={entry}
                    onOpenNode={(nodeId) =>
                      navigate({
                        to: '/workspace/$userId/$nodeId',
                        params: { userId: workspace.userId, nodeId },
                      })
                    }
                  />
                ))
              )}
              {isSending && (
                <div className="mr-auto flex max-w-[85%] items-center gap-2 rounded-lg bg-muted px-3 py-2 text-sm text-muted-foreground">
                  <Spinner className="size-4" />
                  The assistant is thinking…
                </div>
              )}
            </div>
          </ScrollViewport>
        </ScrollArea>

        {inlineError && (
          <div className="mx-3 mb-2 rounded-md border border-destructive/40 bg-destructive/10 px-3 py-2 text-xs text-destructive">
            {inlineError}
          </div>
        )}

        <div className="shrink-0 border-t border-border p-3">
          <div className="relative">
            <Textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              placeholder="Write to the assistant…  (Enter = send, Shift+Enter = new line)"
              className="max-h-40 min-h-16 resize-none pr-12"
              disabled={isSending}
              onKeyDown={(e) => {
                if (e.key === 'Enter' && !e.shiftKey) {
                  e.preventDefault();
                  send();
                }
              }}
            />
            <Button
              type="button"
              size="icon"
              className="absolute bottom-2 right-2 size-8"
              aria-label="Send"
              onClick={send}
              disabled={isSending || input.trim().length === 0}
            >
              {isSending ? (
                <Spinner className="size-4" />
              ) : (
                <Send className="size-4" />
              )}
            </Button>
          </div>
          <p className="mt-1.5 text-[11px] text-muted-foreground">
            {pageId
              ? 'Context: the open page is passed to the assistant.'
              : 'Open a page to give the assistant context.'}
          </p>
        </div>
      </div>
    </Resizable>
  );
};
