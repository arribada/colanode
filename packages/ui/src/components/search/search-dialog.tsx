import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { Home, Settings, Trash2 } from 'lucide-react';
import { useMemo, useState } from 'react';


import { NodeSearchResult } from '@colanode/client/queries';
import { NodeType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@colanode/ui/components/ui/command';
import { useSearch } from '@colanode/ui/contexts/search';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

const groupOrder: NodeType[] = [
  'page',
  'database',
  'database_view',
  'record',
  'folder',
  'file',
  'space',
  'channel',
  'chat',
  'message',
];

const groupLabels: Partial<Record<NodeType, string>> = {
  page: 'Pages',
  database: 'Databases',
  database_view: 'Views',
  record: 'Records',
  folder: 'Folders',
  file: 'Files',
  space: 'Spaces',
  channel: 'Channels',
  chat: 'Chats',
  message: 'Messages',
};

// Node types surfaced in the "Recent" section shown before the user types.
// Mirrors the home dashboard's "Recently updated" feed so both stay in sync.
const recentNodeTypes: string[] = [
  'page',
  'database',
  'record',
  'folder',
  'whiteboard',
];

const resultName = (result: NodeSearchResult): string => {
  if (result.name) {
    return result.name;
  }

  return result.type === 'message' ? 'Message' : 'Unnamed';
};

// Node types that only exist for chat; filtered out of results while chat is
// hidden. Message nodes are kept: page comments are messages too (wave 1).
const chatNodeTypes: NodeType[] = ['channel', 'chat'];

export const SearchDialog = () => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { open, setOpen } = useSearch();
  const [showChat] = useChatVisibility();

  const [searchQuery, setSearchQuery] = useState('');
  // Debounce the raw input so a query only fires once typing settles, not on
  // every keystroke. The input stays bound to the immediate value so it feels
  // responsive; the search + empty-state switch off the debounced value.
  const debouncedSearchQuery = useDebouncedValue(searchQuery, 175);
  const isSearching = debouncedSearchQuery.length > 0;

  const nodeSearchQuery = useQuery(
    {
      type: 'node.search',
      searchQuery: debouncedSearchQuery,
      userId: workspace.userId,
      limit: 30,
    },
    {
      enabled: open && isSearching,
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

  const recentNodes = useMemo(() => {
    const nodes = recentNodesQuery.data ?? [];
    return [...nodes]
      .sort((a, b) =>
        (b.updatedAt ?? b.createdAt).localeCompare(a.updatedAt ?? a.createdAt)
      )
      .slice(0, 8);
  }, [recentNodesQuery.data]);

  const allResults = open && isSearching ? (nodeSearchQuery.data ?? []) : [];

  const results = showChat
    ? allResults
    : allResults.filter((result) => !chatNodeTypes.includes(result.type));

  const groups = groupOrder
    .map((type) => ({
      type,
      label: groupLabels[type] ?? type,
      results: results.filter((result) => result.type === type),
    }))
    .filter((group) => group.results.length > 0);

  const handleOpenChange = (value: boolean) => {
    setOpen(value);
    if (!value) {
      setSearchQuery('');
    }
  };

  const handleNavigate = (nodeId: string) => {
    handleOpenChange(false);
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: {
        userId: workspace.userId,
        nodeId,
      },
    });
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

  return (
    <CommandDialog
      open={open}
      onOpenChange={handleOpenChange}
      title="Search"
      description="Search everything in the workspace"
      shouldFilter={false}
    >
      <CommandInput
        value={searchQuery}
        onValueChange={setSearchQuery}
        placeholder="Search pages, databases, messages..."
      />
      <CommandList className="max-h-[400px]">
        <CommandEmpty>
          {isSearching ? 'No results found.' : 'Nothing recent yet.'}
        </CommandEmpty>
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
              >
                <div className="flex w-full flex-row items-center gap-2">
                  <action.icon className="size-4 shrink-0 text-muted-foreground" />
                  <span className="text-sm">{action.label}</span>
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        )}
        {!isSearching && recentNodes.length > 0 && (
          <CommandGroup heading="Recent">
            {recentNodes.map((node) => {
              const { name, avatar, label } = getMentionNodeDisplay(node);
              return (
                <CommandItem
                  key={node.id}
                  value={node.id}
                  data-testid={`search-recent-${node.id}`}
                  onSelect={() => handleNavigate(node.id)}
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
        {groups.map((group) => (
          <CommandGroup key={group.type} heading={group.label}>
            {group.results.map((result) => (
              <CommandItem
                key={result.id}
                value={result.id}
                data-testid={`search-result-${result.id}`}
                onSelect={() => handleNavigate(result.id)}
              >
                <div className="flex w-full min-w-0 flex-row items-center gap-2">
                  <Avatar
                    id={result.id}
                    name={result.name}
                    avatar={result.avatar}
                    className="size-4 shrink-0"
                  />
                  <div className="flex min-w-0 grow flex-col">
                    <p className="truncate text-sm">{resultName(result)}</p>
                    {result.snippet && (
                      <p className="truncate text-xs text-muted-foreground">
                        {result.snippet}
                      </p>
                    )}
                  </div>
                  {result.spaceName && result.rootId !== result.id && (
                    <span className="ml-auto shrink-0 text-xs text-muted-foreground">
                      {result.spaceName}
                    </span>
                  )}
                </div>
              </CommandItem>
            ))}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  );
};
