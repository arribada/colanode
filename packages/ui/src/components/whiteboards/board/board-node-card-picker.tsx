// ABOUTME: Picker for the whiteboard link-card tool — searches every linkable
// ABOUTME: node type and hands back the one chosen, so a card can reference it.
import { useState } from 'react';

import type { NodeType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { cn } from '@colanode/ui/lib/utils';

// What a card can point at. Channels, chats, messages and files are left out:
// a card renders a document, and those are not one.
const LINKABLE: NodeType[] = [
  'page',
  'database',
  'record',
  'folder',
  'whiteboard',
];

const TYPE_LABEL: Partial<Record<NodeType, string>> = {
  page: 'Page',
  database: 'Database',
  record: 'Record',
  folder: 'Folder',
  whiteboard: 'Whiteboard',
};

export interface BoardNodeCardPick {
  id: string;
  name: string;
  type: NodeType;
}

interface BoardNodeCardPickerProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onPick: (pick: BoardNodeCardPick) => void;
}

export const BoardNodeCardPicker = ({
  open,
  onOpenChange,
  onPick,
}: BoardNodeCardPickerProps) => {
  const workspace = useWorkspace();
  const [query, setQuery] = useState('');
  const debounced = useDebouncedValue(query, 175);

  const searchQuery = useLiveQuery(
    {
      type: 'node.search',
      searchQuery: debounced,
      userId: workspace.userId,
      limit: 40,
    },
    { enabled: debounced.trim().length > 0 }
  );

  const results = (searchQuery.data ?? []).filter((node) =>
    LINKABLE.includes(node.type)
  );

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Link a card to…</DialogTitle>
          <DialogDescription>
            The card shows the page and opens it on double-click, so a board can
            carry real notes instead of copies of them.
          </DialogDescription>
        </DialogHeader>
        <Input
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search pages, databases, whiteboards…"
        />
        <div className="max-h-80 overflow-y-auto">
          {debounced.trim().length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              Start typing to find a page, a database or another whiteboard.
            </p>
          ) : results.length === 0 ? (
            <p className="p-3 text-sm text-muted-foreground">
              {searchQuery.isPending ? 'Searching…' : 'Nothing matches that.'}
            </p>
          ) : (
            <div className="flex flex-col gap-0.5">
              {results.map((node) => (
                <button
                  key={node.id}
                  type="button"
                  className={cn(
                    'flex w-full flex-row items-center gap-2 rounded-md p-2 text-left',
                    'hover:bg-accent'
                  )}
                  onClick={() => {
                    onPick({
                      id: node.id,
                      name: node.name ?? 'Untitled',
                      type: node.type,
                    });
                    onOpenChange(false);
                    setQuery('');
                  }}
                >
                  <Avatar
                    size="small"
                    id={node.id}
                    name={node.name ?? 'Untitled'}
                    avatar={node.avatar ?? undefined}
                  />
                  <span className="flex-1 truncate text-sm">
                    {node.name ?? 'Untitled'}
                  </span>
                  {node.spaceName && (
                    <span className="max-w-32 truncate text-xs text-muted-foreground">
                      {node.spaceName}
                    </span>
                  )}
                  <span className="shrink-0 text-xs text-muted-foreground">
                    {TYPE_LABEL[node.type] ?? node.type}
                  </span>
                </button>
              ))}
            </div>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
};
