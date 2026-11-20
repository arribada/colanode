// ABOUTME: The search dialog's side panel for the highlighted result: where it lives,
// ABOUTME: who made and last edited it, how many matches, and each passage to jump to.
import { CornerDownLeft, FileText } from 'lucide-react';
import { useMemo } from 'react';

import {
  NodePathSegment,
  NodeSearchPassage,
  NodeSearchPreview,
} from '@colanode/client/queries';
import { User } from '@colanode/client/types';
import {
  NodeType,
  findSearchMatches,
  formatDate,
  parseSearchQuery,
  timeAgo,
} from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { NodePath } from '@colanode/ui/components/nodes/node-path';
import { SearchHighlight } from '@colanode/ui/components/search/search-highlight';
import { useQuery } from '@colanode/ui/hooks/use-query';

export const SEARCH_TYPE_LABELS: Partial<Record<NodeType, string>> = {
  page: 'Page',
  database: 'Database',
  record: 'Record',
  folder: 'Folder',
  file: 'File',
  whiteboard: 'Whiteboard',
  space: 'Space',
  channel: 'Channel',
  chat: 'Chat',
  message: 'Comment',
};

interface SearchPreviewProps {
  userId: string;
  nodeId: string;
  searchQuery: string;
  path: NodePathSegment[];
  users: Map<string, User>;
  onOpen: () => void;
  onOpenPassage: (passage: NodeSearchPassage) => void;
}

const PersonLine = ({
  label,
  user,
  userId,
  date,
}: {
  label: string;
  user: User | undefined;
  userId: string;
  date: string;
}) => (
  <div className="flex min-w-0 items-center gap-1.5 text-xs text-muted-foreground">
    <span className="w-20 shrink-0">{label}</span>
    <Avatar
      id={userId}
      name={user ? user.customName || user.name : 'Someone'}
      avatar={user?.customAvatar ?? user?.avatar}
      className="size-4 shrink-0"
    />
    <span className="truncate text-foreground">
      {user ? user.customName || user.name : 'Someone'}
    </span>
    <span className="shrink-0" title={formatDate(date)}>
      · {timeAgo(date)}
    </span>
  </div>
);

export const SearchPreview = ({
  userId,
  nodeId,
  searchQuery,
  path,
  users,
  onOpen,
  onOpenPassage,
}: SearchPreviewProps) => {
  const previewQuery = useQuery({
    type: 'node.search.preview',
    userId,
    nodeId,
    searchQuery,
  });
  const preview: NodeSearchPreview | null | undefined = previewQuery.data;

  const nameHighlights = useMemo(
    () => findSearchMatches(preview?.name, parseSearchQuery(searchQuery)),
    [preview?.name, searchQuery]
  );

  if (!preview) {
    return (
      <div className="flex h-full items-center justify-center p-6 text-xs text-muted-foreground">
        {previewQuery.isPending ? 'Loading the preview…' : 'Nothing to show.'}
      </div>
    );
  }

  const name = preview.name ?? 'Untitled';
  const searching = searchQuery.trim().length > 0;

  return (
    <div className="flex h-full min-h-0 flex-col" data-testid="search-preview">
      <div className="border-b px-4 pt-4 pb-3">
        <div className="flex min-w-0 items-start gap-2">
          <Avatar
            id={preview.id}
            name={name}
            avatar={preview.avatar}
            className="mt-0.5 size-5 shrink-0"
          />
          <h3 className="min-w-0 text-base leading-snug font-semibold break-words">
            <SearchHighlight text={name} ranges={nameHighlights} />
          </h3>
        </div>
        <NodePath segments={path} className="mt-1" maxChars={80} />
        <div className="mt-3 flex flex-col gap-1">
          <PersonLine
            label="Created by"
            user={users.get(preview.createdBy)}
            userId={preview.createdBy}
            date={preview.createdAt}
          />
          {preview.updatedAt && preview.updatedBy && (
            <PersonLine
              label="Last edited"
              user={users.get(preview.updatedBy)}
              userId={preview.updatedBy}
              date={preview.updatedAt}
            />
          )}
        </div>
        <div className="mt-3 flex flex-wrap items-center gap-1.5 text-xs">
          <span className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
            {SEARCH_TYPE_LABELS[preview.type] ?? preview.type}
          </span>
          {searching && (
            <span
              className="rounded bg-yellow-100 px-1.5 py-0.5 font-medium text-yellow-900 dark:bg-yellow-500/20 dark:text-yellow-200"
              data-testid="search-preview-count"
            >
              {preview.matchCount}{' '}
              {preview.matchCount === 1 ? 'match' : 'matches'}
            </span>
          )}
          {preview.wordCount > 0 && (
            <span className="text-muted-foreground">
              {preview.wordCount.toLocaleString()} words
            </span>
          )}
        </div>
      </div>

      <div className="min-h-0 grow overflow-y-auto px-2 py-2">
        {preview.passages.length > 0 && (
          <ol className="flex flex-col gap-0.5">
            {preview.passages.map((passage, index) => (
              <li key={index}>
                <button
                  type="button"
                  onClick={() => onOpenPassage(passage)}
                  className="group flex w-full cursor-pointer gap-2 rounded-md px-2 py-1.5 text-left text-xs leading-relaxed hover:bg-accent"
                  title={
                    passage.findText
                      ? 'Open the page at this passage'
                      : 'Open the page'
                  }
                  data-testid={`search-passage-${index}`}
                >
                  <span className="w-5 shrink-0 pt-px text-right text-[10px] text-muted-foreground tabular-nums">
                    {index + 1}
                  </span>
                  <span className="min-w-0 grow break-words text-foreground/90">
                    <SearchHighlight
                      text={passage.text}
                      ranges={passage.highlights}
                    />
                  </span>
                  {passage.source === 'values' && (
                    <span className="shrink-0 text-[10px] text-muted-foreground">
                      field
                    </span>
                  )}
                </button>
              </li>
            ))}
          </ol>
        )}
        {preview.passagesTruncated && (
          <p className="px-2 py-1 text-xs text-muted-foreground">
            The first {preview.passages.length} passages are listed. Open the
            page and press Ctrl+F to go through every match.
          </p>
        )}
        {preview.passages.length === 0 && preview.opening && (
          <p className="px-2 text-xs leading-relaxed whitespace-pre-line text-muted-foreground">
            {preview.opening}
          </p>
        )}
        {preview.passages.length === 0 && !preview.opening && (
          <div className="flex flex-col items-center gap-2 py-8 text-xs text-muted-foreground">
            <FileText className="size-5" />
            {searching && preview.matchCount > 0
              ? 'The search matches the title.'
              : 'This page has no text yet.'}
          </div>
        )}
      </div>

      <div className="flex items-center justify-end border-t px-3 py-2">
        <button
          type="button"
          onClick={onOpen}
          className="flex cursor-pointer items-center gap-1.5 rounded-md bg-primary px-2.5 py-1 text-xs text-primary-foreground hover:bg-primary/90"
        >
          Open
          <CornerDownLeft className="size-3" />
        </button>
      </div>
    </div>
  );
};
