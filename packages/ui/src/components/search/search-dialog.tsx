// ABOUTME: The workspace search (Ctrl+K), after Notion's: filters and orders, how many
// ABOUTME: results and matches, marked excerpts, and a preview of the highlighted result.
import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { keepPreviousData } from '@tanstack/react-query';
import { useNavigate, useParams, useRouter } from '@tanstack/react-router';
import { Command as CommandPrimitive } from 'cmdk';
import { Clock, Home, Search, Settings, Trash2, X } from 'lucide-react';
import { useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  NodeSearchPassage,
  NodeSearchResult,
  NodeSearchSort,
} from '@colanode/client/queries';
import { User } from '@colanode/client/types';
import { timeAgo } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { NodePath } from '@colanode/ui/components/nodes/node-path';
import {
  SearchFilterBar,
  SearchSpaceOption,
} from '@colanode/ui/components/search/search-filter-bar';
import { SearchHighlight } from '@colanode/ui/components/search/search-highlight';
import {
  SEARCH_TYPE_LABELS,
  SearchPreview,
} from '@colanode/ui/components/search/search-preview';
import {
  Command,
  CommandEmpty,
  CommandGroup,
  CommandItem,
  CommandList,
} from '@colanode/ui/components/ui/command';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useLayout } from '@colanode/ui/contexts/layout';
import { useSearch } from '@colanode/ui/contexts/search';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useLiveQuery as useColanodeLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useNodePaths } from '@colanode/ui/hooks/use-node-paths';
import { useQuery } from '@colanode/ui/hooks/use-query';
import {
  FindRequest,
  findRequestHash,
  requestFind,
} from '@colanode/ui/lib/find-request';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';
import {
  EMPTY_SEARCH_FILTERS,
  SearchFilterState,
  hasNarrowingFilters,
  toNodeSearchFilters,
} from '@colanode/ui/lib/search-filters';
import {
  forgetSearches,
  readRecentSearches,
  rememberSearch,
} from '@colanode/ui/lib/search-history';
import { cn } from '@colanode/ui/lib/utils';

// Node types surfaced in the "Recent" section shown before the user types.
// Mirrors the home dashboard's "Recently updated" feed so both stay in sync.
const recentNodeTypes: string[] = [
  'page',
  'database',
  'record',
  'folder',
  'whiteboard',
];

const PAGE_SIZE = 30;

type OpenMode = 'same' | 'newtab' | 'modal';

const RESULT_PREFIX = 'result:';
const RECENT_PREFIX = 'recent:';
const QUERY_PREFIX = 'query:';

const resultName = (result: NodeSearchResult): string => {
  if (result.name) {
    return result.name;
  }

  return result.type === 'message' ? 'Comment' : 'Untitled';
};

// Notion's buckets when results are ordered by date.
const dateBucket = (iso: string, now: number): string => {
  const age = now - new Date(iso).getTime();
  const day = 24 * 60 * 60 * 1000;
  if (age < day) {
    return 'Today';
  }
  if (age < 7 * day) {
    return 'Past week';
  }
  if (age < 30 * day) {
    return 'Past 30 days';
  }
  return 'Older';
};

const sortDate = (result: NodeSearchResult, sort: NodeSearchSort): string =>
  sort === 'created_desc' || sort === 'created_asc'
    ? result.createdAt
    : (result.updatedAt ?? result.createdAt);

// What a find bar opened from a result looks for: the longest thing typed, a
// phrase before a word.
const primaryFindText = (query: string): string | null => {
  const phrase = query.match(/"([^"]+)"/)?.[1]?.trim();
  if (phrase) {
    return phrase;
  }
  const words = query
    .split(/\s+/)
    .filter((word) => word.length > 0 && !word.startsWith('-'))
    .map((word) => word.replace(/"/g, ''))
    .filter((word) => word.length > 0)
    .sort((a, b) => b.length - a.length);
  return words[0] ?? null;
};

const Kbd = ({ children }: { children: React.ReactNode }) => (
  <kbd className="rounded border bg-muted px-1 font-sans text-[10px] text-muted-foreground">
    {children}
  </kbd>
);

export const SearchDialog = () => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const router = useRouter();
  const layout = useLayout();
  const params = useParams({ strict: false }) as { nodeId?: string };
  const { open, setOpen } = useSearch();
  const [showChat] = useChatVisibility();
  const inputRef = useRef<HTMLInputElement>(null);

  const [searchQuery, setSearchQuery] = useState('');
  // Kept between openings in the same session, like Notion: the chips show
  // them, and Reset clears them.
  const [filters, setFilters] =
    useState<SearchFilterState>(EMPTY_SEARCH_FILTERS);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [selected, setSelected] = useState('');
  const [recentSearches, setRecentSearches] = useState<string[]>([]);
  // Ctrl/Cmd or Shift held on the click that picked a row.
  const clickModeRef = useRef<OpenMode | null>(null);

  // The Cmd-K toggle closes the dialog through the context without going through
  // handleOpenChange, so reset the query on every close path to keep the two in
  // sync (otherwise a re-open flashes the previous query/results).
  useEffect(() => {
    if (!open) {
      setSearchQuery('');
      setLimit(PAGE_SIZE);
      setSelected('');
    } else {
      setRecentSearches(readRecentSearches(workspace.userId));
    }
  }, [open, workspace.userId]);

  // Debounce the raw input so a query only fires once typing settles, not on
  // every keystroke. The input stays bound to the immediate value so it feels
  // responsive; the search + empty-state switch off the debounced value.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 175);
  const isTyping = debouncedSearchQuery.trim().length > 0;
  const narrowed = hasNarrowingFilters(filters);
  const isSearching = isTyping || narrowed;

  // A new question starts again from the first page of results.
  useEffect(() => {
    setLimit(PAGE_SIZE);
  }, [debouncedSearchQuery, filters]);

  const nodeSearchQuery = useQuery(
    {
      type: 'node.search',
      searchQuery: debouncedSearchQuery,
      userId: workspace.userId,
      limit,
      sort: filters.sort,
      filters: toNodeSearchFilters(filters, showChat),
    },
    {
      enabled: open && isSearching,
      // The rows on screen stay while the next query runs, instead of the
      // list emptying on every keystroke.
      placeholderData: keepPreviousData,
    }
  );

  // Recently-updated nodes, shown as a "Recent" section before the user types.
  // Same signal as the home dashboard's "Recently updated" feed: a live query
  // over the workspace nodes collection filtered to content types, sorted by
  // updatedAt. Gated on `open` (the dialog is always mounted) so the closed
  // palette costs nothing — when closed the filter matches no rows.
  const recentNodesQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) =>
          open ? inArray(nodes.type, recentNodeTypes) : eq(nodes.id, '')
        ),
    [workspace.userId, open]
  );

  const spacesQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) =>
          open ? eq(nodes.type, 'space') : eq(nodes.id, '')
        ),
    [workspace.userId, open]
  );

  const usersQuery = useColanodeLiveQuery(
    { type: 'user.list', userId: workspace.userId },
    { enabled: open }
  );

  const users = useMemo(
    () => usersQuery.data ?? ([] as User[]),
    [usersQuery.data]
  );
  const userById = useMemo(
    () => new Map(users.map((user) => [user.id, user])),
    [users]
  );

  const spaces = useMemo((): SearchSpaceOption[] => {
    return (spacesQuery.data ?? [])
      .map((node) => {
        const display = getMentionNodeDisplay(node);
        return {
          id: node.id,
          name: display.name,
          avatar: display.avatar ?? null,
        };
      })
      .sort((a, b) => a.name.localeCompare(b.name));
  }, [spacesQuery.data]);

  const recentNodes = useMemo(() => {
    const nodes = recentNodesQuery.data ?? [];
    return [...nodes]
      .sort((a, b) =>
        (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
      )
      .slice(0, 8);
  }, [recentNodesQuery.data]);

  const output = open && isSearching ? nodeSearchQuery.data : undefined;
  const results = useMemo(() => output?.results ?? [], [output]);
  const total = output?.total ?? 0;
  const matchTotal = results.reduce(
    (sum, result) => sum + result.matchCount,
    0
  );

  // Where each row lives. Without it fifteen results all read "Requirements".
  const pathOf = useNodePaths(
    isSearching
      ? results.map((result) => result.id)
      : recentNodes.map((node) => node.id),
    open
  );

  // Keep a row highlighted: the first result when the results change, so the
  // preview always has something to show.
  const firstValue = isSearching
    ? results[0]
      ? RESULT_PREFIX + results[0].id
      : ''
    : recentNodes[0]
      ? RECENT_PREFIX + recentNodes[0].id
      : '';
  // Only when the list itself changes, not when the user moves through it.
  const listKey = isSearching
    ? `results:${results.map((result) => result.id).join(',')}`
    : `recent:${recentNodes[0]?.id ?? ''}`;
  const firstValueRef = useRef(firstValue);
  firstValueRef.current = firstValue;
  useEffect(() => {
    if (open) {
      setSelected(firstValueRef.current);
    }
  }, [listKey, open]);

  const previewNodeId = selected.startsWith(RESULT_PREFIX)
    ? selected.slice(RESULT_PREFIX.length)
    : selected.startsWith(RECENT_PREFIX)
      ? selected.slice(RECENT_PREFIX.length)
      : null;

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setSearchQuery('');
    }
  };

  const openNode = (
    nodeId: string,
    mode: OpenMode,
    find: FindRequest | null
  ) => {
    if (debouncedSearchQuery.trim().length > 0) {
      setRecentSearches(rememberSearch(workspace.userId, debouncedSearchQuery));
    }
    handleOpenChange(false);

    if (mode === 'newtab') {
      const path = `/workspace/${workspace.userId}/${nodeId}${
        find ? findRequestHash(find) : ''
      }`;
      if (layout?.openInNewTab) {
        layout.openInNewTab(path);
      } else {
        window.open(path, '_blank', 'noopener,noreferrer');
      }
      return;
    }

    if (find) {
      requestFind(nodeId, find);
    }

    // A peek needs a page under it: from Home or Settings it opens in place.
    if (mode === 'modal' && params.nodeId && params.nodeId !== nodeId) {
      const base = window.location.pathname.replace(/\/modal\/[^/]+$/, '');
      router.history.push(`${base}/modal/${nodeId}`);
      return;
    }

    navigate({
      to: '/workspace/$userId/$nodeId',
      params: {
        userId: workspace.userId,
        nodeId,
      },
    });
  };

  const findForResult = (): FindRequest | null => {
    const text = primaryFindText(debouncedSearchQuery);
    return text ? { text, occurrence: 0 } : null;
  };

  const openResult = (nodeId: string, mode: OpenMode) =>
    openNode(nodeId, mode, findForResult());

  const openPassage = (nodeId: string, passage: NodeSearchPassage) =>
    openNode(
      nodeId,
      'same',
      passage.findText
        ? { text: passage.findText, occurrence: passage.findOccurrence ?? 0 }
        : findForResult()
    );

  const copyLink = (nodeId: string) => {
    const url = `${window.location.origin}/workspace/${workspace.userId}/${nodeId}`;
    void navigator.clipboard
      ?.writeText(url)
      .then(() => toast.success('Link copied'))
      .catch(() => toast.error('Could not copy the link'));
  };

  const modeFromClick = (): OpenMode => {
    const mode = clickModeRef.current ?? 'same';
    clickModeRef.current = null;
    return mode;
  };

  const rememberClickMode = (event: React.PointerEvent | React.MouseEvent) => {
    clickModeRef.current =
      event.ctrlKey || event.metaKey
        ? 'newtab'
        : event.shiftKey
          ? 'modal'
          : null;
  };

  const handleKeyDown = (event: React.KeyboardEvent) => {
    const mod = event.ctrlKey || event.metaKey;
    if (event.key === 'Enter' && (mod || event.shiftKey) && previewNodeId) {
      // Before cmdk, which would open the row in place.
      event.preventDefault();
      openResult(previewNodeId, mod ? 'newtab' : 'modal');
      return;
    }
    if (
      previewNodeId &&
      mod &&
      (event.key === 'l' || (event.shiftKey && event.key.toLowerCase() === 'c'))
    ) {
      event.preventDefault();
      copyLink(previewNodeId);
    }
  };

  // Quick actions turn the search box into a command palette: navigate to the
  // main workspace destinations without hunting through menus. Filtered by the
  // typed query so "trash" surfaces the Trash action.
  const actions = [
    {
      id: 'action-home',
      label: 'Go to Home',
      icon: Home,
      run: () =>
        navigate({
          to: '/workspace/$userId/home',
          params: { userId: workspace.userId },
        }),
    },
    {
      id: 'action-settings',
      label: 'Open Settings',
      icon: Settings,
      run: () =>
        navigate({
          to: '/workspace/$userId/settings',
          params: { userId: workspace.userId },
        }),
    },
    {
      id: 'action-trash',
      label: 'Open Trash',
      icon: Trash2,
      run: () =>
        navigate({
          to: '/workspace/$userId/trash',
          params: { userId: workspace.userId },
        }),
    },
  ];
  const actionQuery = searchQuery.trim().toLowerCase();
  const visibleActions =
    actionQuery === ''
      ? actions
      : actions.filter((a) => a.label.toLowerCase().includes(actionQuery));

  const byDate = filters.sort !== 'relevance';
  const now = Date.now();
  const resultGroups = byDate
    ? results.reduce<{ heading: string; results: NodeSearchResult[] }[]>(
        (groups, result) => {
          const heading = dateBucket(sortDate(result, filters.sort), now);
          const last = groups[groups.length - 1];
          if (last && last.heading === heading) {
            last.results.push(result);
          } else {
            groups.push({ heading, results: [result] });
          }
          return groups;
        },
        []
      )
    : [{ heading: '', results }];

  const loading = nodeSearchQuery.isFetching;
  const summary = isSearching
    ? output === undefined
      ? 'Searching…'
      : total === 0
        ? 'No results'
        : `${total.toLocaleString()} ${total === 1 ? 'result' : 'results'}` +
          (isTyping && matchTotal > 0
            ? ` · ${matchTotal.toLocaleString()} ${
                matchTotal === 1 ? 'match' : 'matches'
              }${results.length < total ? ` in the first ${results.length}` : ''}`
            : '')
    : null;

  return (
    <Dialog open={open} onOpenChange={handleOpenChange}>
      <DialogContent
        className="top-[8vh] flex h-[min(680px,84vh)] translate-y-0 flex-col gap-0 overflow-hidden p-0 sm:max-w-5xl"
        showCloseButton={false}
        data-testid="search-dialog"
      >
        <DialogTitle className="sr-only">Search</DialogTitle>
        <DialogDescription className="sr-only">
          Search everything in the workspace
        </DialogDescription>
        <Command
          shouldFilter={false}
          value={selected}
          onValueChange={setSelected}
          onKeyDown={handleKeyDown}
          className="flex min-h-0 grow flex-col [&_[cmdk-group-heading]]:px-2 [&_[cmdk-group-heading]]:font-medium [&_[cmdk-group-heading]]:text-muted-foreground [&_[cmdk-group]]:px-2"
        >
          <div className="flex h-12 shrink-0 items-center gap-2 border-b px-3">
            <Search className="size-4 shrink-0 opacity-50" />
            <CommandPrimitive.Input
              ref={inputRef}
              value={searchQuery}
              onValueChange={setSearchQuery}
              placeholder='Search… "exact phrase", -exclude'
              className="h-10 w-full bg-transparent text-sm outline-hidden placeholder:text-muted-foreground"
              data-testid="search-input"
            />
            {loading && (
              <span className="size-3.5 shrink-0 animate-spin rounded-full border-2 border-muted-foreground/30 border-t-muted-foreground" />
            )}
            {searchQuery.length > 0 && (
              <button
                type="button"
                onClick={() => {
                  setSearchQuery('');
                  inputRef.current?.focus();
                }}
                className="shrink-0 cursor-pointer rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
                aria-label="Clear search"
              >
                <X className="size-4" />
              </button>
            )}
          </div>

          <SearchFilterBar
            userId={workspace.userId}
            value={filters}
            onChange={setFilters}
            users={users}
            spaces={spaces}
            onDone={() => inputRef.current?.focus()}
          />

          <div className="flex min-h-0 grow flex-row">
            <CommandList className="max-h-none min-h-0 grow overflow-y-auto md:w-[56%] md:grow-0">
              {summary && (
                <div
                  className="flex items-center justify-between px-4 pt-2.5 pb-1 text-xs text-muted-foreground"
                  data-testid="search-summary"
                >
                  <span>{summary}</span>
                </div>
              )}
              {isSearching && output !== undefined && (
                <CommandEmpty>
                  {narrowed
                    ? 'Nothing matches with these filters.'
                    : 'No results found.'}
                </CommandEmpty>
              )}

              {!isSearching && recentSearches.length > 0 && (
                <CommandGroup heading="Recent searches">
                  {recentSearches.map((query) => (
                    <CommandItem
                      key={query}
                      value={QUERY_PREFIX + query}
                      onSelect={() => {
                        setSearchQuery(query);
                        inputRef.current?.focus();
                      }}
                      className="py-1.5"
                    >
                      <Clock className="size-4 shrink-0 text-muted-foreground" />
                      <span className="truncate text-sm">{query}</span>
                    </CommandItem>
                  ))}
                  <button
                    type="button"
                    onClick={() => {
                      forgetSearches(workspace.userId);
                      setRecentSearches([]);
                      inputRef.current?.focus();
                    }}
                    className="ml-8 cursor-pointer px-2 py-1 text-xs text-muted-foreground hover:text-foreground"
                  >
                    Clear recent searches
                  </button>
                </CommandGroup>
              )}

              {!isSearching && recentNodes.length === 0 && (
                <div className="py-6 text-center text-sm text-muted-foreground">
                  Nothing recent yet.
                </div>
              )}
              {!isSearching && recentNodes.length > 0 && (
                <CommandGroup heading="Recent">
                  {recentNodes.map((node) => {
                    const { name, avatar, label } = getMentionNodeDisplay(node);
                    return (
                      <CommandItem
                        key={node.id}
                        value={RECENT_PREFIX + node.id}
                        data-testid={`search-recent-${node.id}`}
                        onPointerDown={rememberClickMode}
                        onAuxClick={(event) => {
                          if (event.button === 1) {
                            openNode(node.id, 'newtab', null);
                          }
                        }}
                        onSelect={() =>
                          openNode(node.id, modeFromClick(), null)
                        }
                      >
                        <div className="flex w-full min-w-0 flex-row items-center gap-2">
                          <Avatar
                            id={node.id}
                            name={name}
                            avatar={avatar}
                            className="size-4 shrink-0"
                          />
                          <div className="flex min-w-0 grow flex-col">
                            <p className="truncate text-sm">{name}</p>
                            <NodePath segments={pathOf(node.id)} />
                          </div>
                          <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                            {label}
                          </span>
                        </div>
                      </CommandItem>
                    );
                  })}
                </CommandGroup>
              )}

              {resultGroups.map((group) => (
                <CommandGroup
                  key={group.heading || 'results'}
                  heading={group.heading || undefined}
                >
                  {group.results.map((result) => (
                    <CommandItem
                      key={result.id}
                      value={RESULT_PREFIX + result.id}
                      data-testid={`search-result-${result.id}`}
                      onPointerDown={rememberClickMode}
                      onAuxClick={(event) => {
                        if (event.button === 1) {
                          openResult(result.id, 'newtab');
                        }
                      }}
                      onSelect={() => openResult(result.id, modeFromClick())}
                      className="items-start py-2"
                    >
                      <Avatar
                        id={result.id}
                        name={result.name ?? undefined}
                        avatar={result.avatar}
                        className="mt-0.5 size-4 shrink-0"
                      />
                      <div className="flex min-w-0 grow flex-col">
                        <div className="flex min-w-0 items-center gap-2">
                          <p className="min-w-0 grow truncate text-sm">
                            <SearchHighlight
                              text={resultName(result)}
                              ranges={result.name ? result.nameHighlights : []}
                            />
                          </p>
                          {isTyping && result.matchCount > 0 && (
                            <span
                              className="shrink-0 rounded bg-yellow-100 px-1 text-[10px] font-medium text-yellow-900 tabular-nums dark:bg-yellow-500/20 dark:text-yellow-200"
                              title={`${result.matchCount} ${
                                result.matchCount === 1 ? 'match' : 'matches'
                              } in this ${(
                                SEARCH_TYPE_LABELS[result.type] ?? 'node'
                              ).toLowerCase()}`}
                              data-testid="search-result-count"
                            >
                              {result.matchCount}
                            </span>
                          )}
                          <span className="shrink-0 text-[11px] text-muted-foreground">
                            {timeAgo(sortDate(result, filters.sort))}
                          </span>
                        </div>
                        <NodePath segments={pathOf(result.id)} />
                        {result.snippet && (
                          <p className="line-clamp-2 text-xs text-muted-foreground">
                            <SearchHighlight
                              text={result.snippet}
                              ranges={result.snippetHighlights}
                            />
                          </p>
                        )}
                      </div>
                    </CommandItem>
                  ))}
                </CommandGroup>
              ))}

              {isSearching && results.length < total && (
                <div className="px-4 py-2">
                  <button
                    type="button"
                    onClick={() => setLimit((value) => value + PAGE_SIZE)}
                    className="w-full cursor-pointer rounded-md border px-2 py-1.5 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
                    data-testid="search-show-more"
                  >
                    Show {Math.min(PAGE_SIZE, total - results.length)} more of{' '}
                    {(total - results.length).toLocaleString()}
                  </button>
                </div>
              )}

              {visibleActions.length > 0 && (
                <CommandGroup heading="Actions">
                  {visibleActions.map((action) => (
                    <CommandItem
                      key={action.id}
                      value={action.id}
                      onSelect={() => {
                        handleOpenChange(false);
                        action.run();
                      }}
                      className="py-1.5"
                    >
                      <action.icon className="size-4 shrink-0 text-muted-foreground" />
                      <span className="text-sm">{action.label}</span>
                    </CommandItem>
                  ))}
                </CommandGroup>
              )}
            </CommandList>

            <div
              className={cn(
                'hidden min-h-0 border-l bg-muted/20 md:block md:w-[44%]'
              )}
            >
              {previewNodeId ? (
                <SearchPreview
                  key={previewNodeId}
                  userId={workspace.userId}
                  nodeId={previewNodeId}
                  searchQuery={isTyping ? debouncedSearchQuery : ''}
                  path={pathOf(previewNodeId)}
                  users={userById}
                  onOpen={() => openResult(previewNodeId, 'same')}
                  onOpenPassage={(passage) =>
                    openPassage(previewNodeId, passage)
                  }
                />
              ) : (
                <div className="flex h-full flex-col items-center justify-center gap-1 p-6 text-center text-xs text-muted-foreground">
                  <Search className="size-5" />
                  Move through the results to preview them here.
                </div>
              )}
            </div>
          </div>

          <div className="flex shrink-0 flex-wrap items-center gap-x-3 gap-y-1 border-t px-3 py-1.5 text-[11px] text-muted-foreground">
            <span>
              <Kbd>↑</Kbd> <Kbd>↓</Kbd> Select
            </span>
            <span>
              <Kbd>↵</Kbd> Open
            </span>
            <span>
              <Kbd>Ctrl</Kbd> <Kbd>↵</Kbd> New tab
            </span>
            {params.nodeId && (
              <span>
                <Kbd>Shift</Kbd> <Kbd>↵</Kbd> Peek
              </span>
            )}
            <span>
              <Kbd>Ctrl</Kbd> <Kbd>L</Kbd> Copy link
            </span>
            <span className="ml-auto hidden sm:inline">
              In a page, <Kbd>Ctrl</Kbd> <Kbd>F</Kbd> finds every match
            </span>
          </div>
        </Command>
      </DialogContent>
    </Dialog>
  );
};
