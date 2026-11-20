// ABOUTME: The page's find bar (Ctrl+F): "3 / 12", previous and next, match case and
// ABOUTME: whole word, and replace for editors; the search dialog opens it on a passage.
import { Editor } from '@tiptap/core';
import {
  CaseSensitive,
  ChevronDown,
  ChevronRight,
  ChevronUp,
  Replace,
  ReplaceAll,
  Search,
  WholeWord,
  X,
} from 'lucide-react';
import {
  ReactNode,
  RefObject,
  useCallback,
  useEffect,
  useRef,
  useState,
} from 'react';

import {
  FIND_MAX_MATCHES,
  getFindState,
  scrollToCurrentMatch,
} from '@colanode/ui/editor/extensions/find';
import {
  FindRequest,
  onFindRequest,
  parseFindRequestHash,
  takeFindRequest,
} from '@colanode/ui/lib/find-request';
import { cn } from '@colanode/ui/lib/utils';

interface FindTarget {
  container: () => HTMLElement | null;
  open: () => void;
  inputHasFocus: () => boolean;
}

// Every mounted page editor, oldest first. Ctrl+F goes to the one holding the
// focus, else to the newest: a page peeked over another one.
const targets: FindTarget[] = [];

const handleFindShortcut = (event: KeyboardEvent) => {
  const mod = event.ctrlKey || event.metaKey;
  if (
    !mod ||
    event.altKey ||
    event.shiftKey ||
    event.key.toLowerCase() !== 'f'
  ) {
    return;
  }
  const live = targets.filter((target) => target.container()?.isConnected);
  if (live.length === 0) {
    return;
  }
  const active = document.activeElement;
  const focused = live.find(
    (target) => active && target.container()?.contains(active)
  );
  // Ctrl+F again from the bar itself: the browser's own find takes over.
  if (focused?.inputHasFocus()) {
    return;
  }
  event.preventDefault();
  (focused ?? live[live.length - 1])!.open();
};

const registerTarget = (target: FindTarget) => {
  if (targets.length === 0) {
    window.addEventListener('keydown', handleFindShortcut, true);
  }
  targets.push(target);
  return () => {
    const index = targets.indexOf(target);
    if (index !== -1) {
      targets.splice(index, 1);
    }
    if (targets.length === 0) {
      window.removeEventListener('keydown', handleFindShortcut, true);
    }
  };
};

const ToolButton = ({
  label,
  pressed,
  disabled,
  onClick,
  children,
  testId,
}: {
  label: string;
  pressed?: boolean;
  disabled?: boolean;
  onClick: () => void;
  children: ReactNode;
  testId?: string;
}) => (
  <button
    type="button"
    title={label}
    aria-label={label}
    aria-pressed={pressed}
    disabled={disabled}
    // Keep the focus in the find box while clicking around it.
    onMouseDown={(event) => event.preventDefault()}
    onClick={onClick}
    className={cn(
      'flex size-7 shrink-0 cursor-pointer items-center justify-center rounded-md text-muted-foreground hover:bg-accent hover:text-foreground disabled:cursor-default disabled:opacity-40 disabled:hover:bg-transparent',
      pressed &&
        'bg-blue-100 text-blue-700 hover:bg-blue-100 dark:bg-blue-900/60 dark:text-blue-200'
    )}
    data-testid={testId}
  >
    {children}
  </button>
);

interface DocumentFindBarProps {
  editor: Editor;
  nodeId: string;
  canReplace: boolean;
  containerRef: RefObject<HTMLElement | null>;
}

export const DocumentFindBar = ({
  editor,
  nodeId,
  canReplace,
  containerRef,
}: DocumentFindBarProps) => {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [matchCase, setMatchCase] = useState(false);
  const [wholeWord, setWholeWord] = useState(false);
  const [showReplace, setShowReplace] = useState(false);
  const [replacement, setReplacement] = useState('');
  const [status, setStatus] = useState({ count: 0, current: -1 });
  const inputRef = useRef<HTMLInputElement>(null);
  const pendingOccurrence = useRef<number | null>(null);

  const focusInput = () =>
    requestAnimationFrame(() => {
      inputRef.current?.focus();
      inputRef.current?.select();
    });

  const openBar = useCallback(() => {
    // A short selection on one line is what the reader wants to find.
    const { from, to, empty } = editor.state.selection;
    if (!empty) {
      const selected = editor.state.doc.textBetween(from, to, '\n');
      if (
        selected.length > 0 &&
        selected.length <= 120 &&
        !selected.includes('\n')
      ) {
        setQuery(selected);
      }
    }
    setOpen(true);
    focusInput();
  }, [editor]);

  const applyRequest = useCallback((request: FindRequest) => {
    pendingOccurrence.current = request.occurrence;
    setMatchCase(false);
    setWholeWord(false);
    setQuery(request.text);
    setOpen(true);
    // Enter then steps to the next match straight away.
    requestAnimationFrame(() => inputRef.current?.focus());
  }, []);

  useEffect(
    () =>
      registerTarget({
        container: () => containerRef.current,
        open: openBar,
        inputHasFocus: () =>
          !!inputRef.current && document.activeElement === inputRef.current,
      }),
    [containerRef, openBar]
  );

  // A find asked for by the search dialog, before this page opened (or in
  // the address, for a page opened in a new tab) or while it is open.
  useEffect(() => {
    const fromHash = parseFindRequestHash(window.location.hash);
    if (fromHash) {
      window.history.replaceState(
        window.history.state,
        '',
        window.location.pathname + window.location.search
      );
    }
    const request = takeFindRequest(nodeId) ?? fromHash;
    if (request) {
      applyRequest(request);
    }
    return onFindRequest((requestedId) => {
      if (requestedId !== nodeId) {
        return;
      }
      const next = takeFindRequest(nodeId);
      if (next) {
        applyRequest(next);
      }
    });
  }, [nodeId, applyRequest]);

  useEffect(() => {
    const update = () => {
      const state = getFindState(editor.state);
      setStatus({
        count: state?.matches.length ?? 0,
        current: state?.current ?? -1,
      });
    };
    editor.on('transaction', update);
    return () => {
      editor.off('transaction', update);
    };
  }, [editor]);

  useEffect(() => {
    if (!open || editor.isDestroyed) {
      return;
    }
    editor.commands.setFindQuery(query, { matchCase, wholeWord });
    const occurrence = pendingOccurrence.current;
    pendingOccurrence.current = null;
    if (occurrence !== null) {
      editor.commands.setFindIndex(occurrence);
      // The page is still settling after the navigation.
      window.setTimeout(() => scrollToCurrentMatch(editor.view), 80);
    } else {
      scrollToCurrentMatch(editor.view);
    }
  }, [open, query, matchCase, wholeWord, editor]);

  const close = (selectMatch: boolean) => {
    const state = getFindState(editor.state);
    const match = state?.matches[state.current];
    editor.commands.clearFind();
    setOpen(false);
    setShowReplace(false);
    if (selectMatch && match) {
      editor.chain().focus().setTextSelection(match).run();
    }
  };

  const step = (direction: 1 | -1) => {
    if (direction === 1) {
      editor.commands.findNext();
    } else {
      editor.commands.findPrevious();
    }
    scrollToCurrentMatch(editor.view);
  };

  if (!open) {
    return null;
  }

  const hasMatches = status.count > 0;
  const countLabel =
    query.length === 0
      ? ''
      : !hasMatches
        ? 'No results'
        : `${status.current + 1} / ${status.count}${
            status.count >= FIND_MAX_MATCHES ? '+' : ''
          }`;

  return (
    <div
      className="fixed top-14 right-4 z-50 flex w-[min(440px,calc(100vw-2rem))] flex-col gap-1 rounded-lg border bg-popover p-1.5 text-popover-foreground shadow-lg"
      data-testid="find-bar"
      role="search"
    >
      <div className="flex items-center gap-0.5">
        {canReplace && (
          <ToolButton
            label={showReplace ? 'Hide replace' : 'Replace'}
            onClick={() => setShowReplace((value) => !value)}
            testId="find-toggle-replace"
          >
            <ChevronRight
              className={cn(
                'size-4 transition-transform',
                showReplace && 'rotate-90'
              )}
            />
          </ToolButton>
        )}
        <div className="flex h-8 min-w-0 grow items-center gap-1.5 rounded-md border px-2 focus-within:border-ring">
          <Search className="size-3.5 shrink-0 text-muted-foreground" />
          <input
            ref={inputRef}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'Enter') {
                event.preventDefault();
                step(event.shiftKey ? -1 : 1);
              } else if (event.key === 'Escape') {
                event.preventDefault();
                event.stopPropagation();
                close(true);
              }
            }}
            placeholder="Find in page"
            aria-label="Find in page"
            spellCheck={false}
            className="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground"
            data-testid="find-input"
          />
          <span
            className={cn(
              'shrink-0 text-xs tabular-nums',
              query.length > 0 && !hasMatches
                ? 'text-red-600 dark:text-red-400'
                : 'text-muted-foreground'
            )}
            data-testid="find-count"
          >
            {countLabel}
          </span>
        </div>
        <ToolButton
          label="Match case"
          pressed={matchCase}
          onClick={() => setMatchCase((value) => !value)}
          testId="find-match-case"
        >
          <CaseSensitive className="size-4" />
        </ToolButton>
        <ToolButton
          label="Whole word"
          pressed={wholeWord}
          onClick={() => setWholeWord((value) => !value)}
          testId="find-whole-word"
        >
          <WholeWord className="size-4" />
        </ToolButton>
        <ToolButton
          label="Previous match (Shift+Enter)"
          disabled={!hasMatches}
          onClick={() => step(-1)}
          testId="find-previous"
        >
          <ChevronUp className="size-4" />
        </ToolButton>
        <ToolButton
          label="Next match (Enter)"
          disabled={!hasMatches}
          onClick={() => step(1)}
          testId="find-next"
        >
          <ChevronDown className="size-4" />
        </ToolButton>
        <ToolButton
          label="Close (Esc)"
          onClick={() => close(false)}
          testId="find-close"
        >
          <X className="size-4" />
        </ToolButton>
      </div>
      {canReplace && showReplace && (
        <div className="flex items-center gap-0.5 pl-7">
          <div className="flex h-8 min-w-0 grow items-center rounded-md border px-2 focus-within:border-ring">
            <input
              value={replacement}
              onChange={(event) => setReplacement(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  if (event.ctrlKey || event.metaKey) {
                    editor.commands.replaceAllMatches(replacement);
                  } else {
                    editor.commands.replaceCurrentMatch(replacement);
                    scrollToCurrentMatch(editor.view);
                  }
                } else if (event.key === 'Escape') {
                  event.preventDefault();
                  event.stopPropagation();
                  close(true);
                }
              }}
              placeholder="Replace with"
              aria-label="Replace with"
              spellCheck={false}
              className="min-w-0 grow bg-transparent text-sm outline-none placeholder:text-muted-foreground"
              data-testid="find-replace-input"
            />
          </div>
          <ToolButton
            label="Replace (Enter)"
            disabled={!hasMatches}
            onClick={() => {
              editor.commands.replaceCurrentMatch(replacement);
              scrollToCurrentMatch(editor.view);
            }}
            testId="find-replace-one"
          >
            <Replace className="size-4" />
          </ToolButton>
          <ToolButton
            label="Replace all (Ctrl+Enter)"
            disabled={!hasMatches}
            onClick={() => editor.commands.replaceAllMatches(replacement)}
            testId="find-replace-all"
          >
            <ReplaceAll className="size-4" />
          </ToolButton>
        </div>
      )}
    </div>
  );
};
