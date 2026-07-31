import { useNavigate } from '@tanstack/react-router';
import { useState } from 'react';

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
import { useQuery } from '@colanode/ui/hooks/use-query';

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

  const nodeSearchQuery = useQuery(
    {
      type: 'node.search',
      searchQuery,
      userId: workspace.userId,
      limit: 30,
    },
    {
      enabled: open && searchQuery.length > 0,
    }
  );

  const allResults =
    open && searchQuery.length > 0 ? (nodeSearchQuery.data ?? []) : [];

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

  const handleSelect = (result: NodeSearchResult) => {
    handleOpenChange(false);
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: {
        userId: workspace.userId,
        nodeId: result.id,
      },
    });
  };

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
          {searchQuery.length > 0
            ? 'No results found.'
            : 'Type to search the workspace.'}
        </CommandEmpty>
        {groups.map((group) => (
          <CommandGroup key={group.type} heading={group.label}>
            {group.results.map((result) => (
              <CommandItem
                key={result.id}
                value={result.id}
                data-testid={`search-result-${result.id}`}
                onSelect={() => handleSelect(result)}
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
