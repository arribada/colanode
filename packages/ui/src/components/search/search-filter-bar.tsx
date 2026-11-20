// ABOUTME: The chips under the search box, after Notion's: order, title only, type,
// ABOUTME: author, where (a space or a page and what is below it) and when.
import {
  ArrowUpDown,
  CalendarDays,
  Check,
  ChevronDown,
  FolderTree,
  Heading,
  Shapes,
  UserRound,
  X,
} from 'lucide-react';
import { ReactNode, forwardRef, useMemo, useState } from 'react';

import { NodeSearchSort } from '@colanode/client/queries';
import { User } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useQuery } from '@colanode/ui/hooks/use-query';
import {
  EMPTY_SEARCH_FILTERS,
  SEARCH_DATE_PRESET_LABELS,
  SEARCH_SORT_LABELS,
  SEARCH_TYPE_OPTIONS,
  SearchDateFilter,
  SearchFilterState,
  dateFilterLabel,
  isDefaultSearchFilters,
  resolveCustomRange,
  resolveDatePreset,
  toDateInputValue,
} from '@colanode/ui/lib/search-filters';
import { cn } from '@colanode/ui/lib/utils';

export interface SearchSpaceOption {
  id: string;
  name: string;
  avatar: string | null;
}

interface SearchFilterBarProps {
  userId: string;
  value: SearchFilterState;
  onChange: (next: SearchFilterState) => void;
  users: User[];
  spaces: SearchSpaceOption[];
  // Called when a menu closes, to hand the keyboard back to the search box.
  onDone: () => void;
}

type ChipProps = React.ComponentProps<'button'> & {
  active: boolean;
  icon: ReactNode;
  label: string;
};

const Chip = forwardRef<HTMLButtonElement, ChipProps>(
  ({ active, icon, label, className, ...props }, ref) => (
    <button
      ref={ref}
      type="button"
      className={cn(
        'flex h-7 max-w-56 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs transition-colors',
        active
          ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
          : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground',
        className
      )}
      {...props}
    >
      <span className="shrink-0 [&_svg]:size-3.5">{icon}</span>
      <span className="truncate">{label}</span>
      <ChevronDown className="size-3 shrink-0 opacity-60" />
    </button>
  )
);
Chip.displayName = 'SearchFilterChip';

const userName = (user: User) => user.customName || user.name;

const listLabel = (names: string[], noun: string): string =>
  names.length === 0
    ? noun
    : names.length === 1
      ? names[0]!
      : `${names[0]} +${names.length - 1}`;

export const SearchFilterBar = ({
  userId,
  value,
  onChange,
  users,
  spaces,
  onDone,
}: SearchFilterBarProps) => {
  const set = (patch: Partial<SearchFilterState>) =>
    onChange({ ...value, ...patch });
  const closeAutoFocus = (event: Event) => {
    event.preventDefault();
    onDone();
  };

  const typeLabels = SEARCH_TYPE_OPTIONS.filter((option) =>
    value.types.includes(option.type)
  ).map((option) => option.label);
  const authorNames = users
    .filter((user) => value.createdBy.includes(user.id))
    .map(userName);

  return (
    <div
      className="flex flex-row items-center gap-1.5 overflow-x-auto border-b px-3 py-2"
      data-testid="search-filters"
    >
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Chip
            active={value.sort !== 'relevance'}
            icon={<ArrowUpDown />}
            label={
              value.sort === 'relevance'
                ? 'Sort'
                : SEARCH_SORT_LABELS[value.sort]
            }
            data-testid="search-filter-sort"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={closeAutoFocus}>
          <DropdownMenuRadioGroup
            value={value.sort}
            onValueChange={(sort) => set({ sort: sort as NodeSearchSort })}
          >
            {(Object.keys(SEARCH_SORT_LABELS) as NodeSearchSort[]).map(
              (sort) => (
                <DropdownMenuRadioItem
                  key={sort}
                  value={sort}
                  data-testid={`search-sort-${sort}`}
                >
                  {SEARCH_SORT_LABELS[sort]}
                </DropdownMenuRadioItem>
              )
            )}
          </DropdownMenuRadioGroup>
        </DropdownMenuContent>
      </DropdownMenu>

      <button
        type="button"
        aria-pressed={value.titleOnly}
        onClick={() => set({ titleOnly: !value.titleOnly })}
        className={cn(
          'flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md border px-2 text-xs transition-colors',
          value.titleOnly
            ? 'border-blue-300 bg-blue-50 text-blue-700 dark:border-blue-800 dark:bg-blue-950 dark:text-blue-300'
            : 'border-border text-muted-foreground hover:bg-accent hover:text-foreground'
        )}
        data-testid="search-filter-title-only"
      >
        <Heading className="size-3.5" />
        Title only
      </button>

      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Chip
            active={value.types.length > 0}
            icon={<Shapes />}
            label={listLabel(typeLabels, 'Type')}
            data-testid="search-filter-type"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" onCloseAutoFocus={closeAutoFocus}>
          {SEARCH_TYPE_OPTIONS.map((option) => (
            <DropdownMenuCheckboxItem
              key={option.type}
              checked={value.types.includes(option.type)}
              // Several types in a row without reopening the menu.
              onSelect={(event) => event.preventDefault()}
              onCheckedChange={(checked) =>
                set({
                  types: checked
                    ? [...value.types, option.type]
                    : value.types.filter((type) => type !== option.type),
                })
              }
              data-testid={`search-type-${option.type}`}
            >
              {option.label}
            </DropdownMenuCheckboxItem>
          ))}
          {value.types.length > 0 && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onSelect={() => set({ types: [] })}>
                Any type
              </DropdownMenuItem>
            </>
          )}
        </DropdownMenuContent>
      </DropdownMenu>

      <AuthorFilter
        users={users}
        selected={value.createdBy}
        label={listLabel(authorNames, 'Created by')}
        onChange={(createdBy) => set({ createdBy })}
        onCloseAutoFocus={closeAutoFocus}
      />

      <WithinFilter
        userId={userId}
        spaces={spaces}
        selected={value.within}
        onChange={(within) => set({ within })}
        onCloseAutoFocus={closeAutoFocus}
      />

      <DateFilter
        selected={value.date}
        onChange={(date) => set({ date })}
        onCloseAutoFocus={closeAutoFocus}
      />

      {!isDefaultSearchFilters(value) && (
        <button
          type="button"
          onClick={() => {
            onChange(EMPTY_SEARCH_FILTERS);
            onDone();
          }}
          className="ml-auto flex h-7 shrink-0 cursor-pointer items-center gap-1 rounded-md px-2 text-xs text-muted-foreground hover:bg-accent hover:text-foreground"
          data-testid="search-filters-reset"
        >
          <X className="size-3.5" />
          Reset
        </button>
      )}
    </div>
  );
};

const AuthorFilter = ({
  users,
  selected,
  label,
  onChange,
  onCloseAutoFocus,
}: {
  users: User[];
  selected: string[];
  label: string;
  onChange: (ids: string[]) => void;
  onCloseAutoFocus: (event: Event) => void;
}) => {
  const [filter, setFilter] = useState('');
  const visible = useMemo(() => {
    const needle = filter.trim().toLowerCase();
    return users
      .filter(
        (user) =>
          needle === '' ||
          userName(user).toLowerCase().includes(needle) ||
          user.email.toLowerCase().includes(needle)
      )
      .sort((a, b) => userName(a).localeCompare(userName(b)));
  }, [users, filter]);

  return (
    <Popover onOpenChange={(open) => !open && setFilter('')}>
      <PopoverTrigger asChild>
        <Chip
          active={selected.length > 0}
          icon={<UserRound />}
          label={label}
          data-testid="search-filter-author"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-1"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="Search people…"
          className="mb-1 h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
        />
        <div className="max-h-64 overflow-y-auto">
          {visible.map((user) => {
            const checked = selected.includes(user.id);
            return (
              <button
                key={user.id}
                type="button"
                onClick={() =>
                  onChange(
                    checked
                      ? selected.filter((id) => id !== user.id)
                      : [...selected, user.id]
                  )
                }
                className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
                data-testid={`search-author-${user.id}`}
              >
                <Avatar
                  id={user.id}
                  name={userName(user)}
                  avatar={user.customAvatar ?? user.avatar}
                  className="size-5"
                />
                <span className="min-w-0 grow truncate">{userName(user)}</span>
                {checked && <Check className="size-4 shrink-0" />}
              </button>
            );
          })}
          {visible.length === 0 && (
            <p className="px-2 py-3 text-center text-xs text-muted-foreground">
              Nobody by that name.
            </p>
          )}
        </div>
        {selected.length > 0 && (
          <button
            type="button"
            onClick={() => onChange([])}
            className="mt-1 w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Anyone
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};

const WithinFilter = ({
  userId,
  spaces,
  selected,
  onChange,
  onCloseAutoFocus,
}: {
  userId: string;
  spaces: SearchSpaceOption[];
  selected: SearchFilterState['within'];
  onChange: (within: SearchFilterState['within']) => void;
  onCloseAutoFocus: (event: Event) => void;
}) => {
  const [open, setOpen] = useState(false);
  const [filter, setFilter] = useState('');
  const debounced = useDebouncedValue(filter, 175);

  const pagesQuery = useQuery(
    {
      type: 'node.search',
      userId,
      searchQuery: debounced,
      limit: 12,
      filters: {
        titleOnly: true,
        types: ['page', 'folder', 'database', 'whiteboard'],
      },
    },
    { enabled: open && debounced.trim().length > 0 }
  );

  const needle = filter.trim().toLowerCase();
  const visibleSpaces = spaces.filter(
    (space) => needle === '' || space.name.toLowerCase().includes(needle)
  );
  const pages =
    debounced.trim().length > 0 ? (pagesQuery.data?.results ?? []) : [];

  const pick = (within: SearchFilterState['within']) => {
    onChange(within);
    setOpen(false);
  };

  return (
    <Popover
      open={open}
      onOpenChange={(next) => {
        setOpen(next);
        if (!next) {
          setFilter('');
        }
      }}
    >
      <PopoverTrigger asChild>
        <Chip
          active={selected !== null}
          icon={<FolderTree />}
          label={selected ? `In: ${selected.name}` : 'In'}
          data-testid="search-filter-within"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-72 p-1"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <input
          value={filter}
          onChange={(event) => setFilter(event.target.value)}
          placeholder="A space, or a page and its subpages…"
          className="mb-1 h-8 w-full rounded-md border bg-transparent px-2 text-sm outline-none focus:border-ring"
          data-testid="search-within-input"
        />
        <div className="max-h-72 overflow-y-auto">
          {visibleSpaces.length > 0 && (
            <p className="px-2 pt-1 pb-0.5 text-xs font-medium text-muted-foreground">
              Spaces
            </p>
          )}
          {visibleSpaces.map((space) => (
            <button
              key={space.id}
              type="button"
              onClick={() => pick({ id: space.id, name: space.name })}
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            >
              <Avatar
                id={space.id}
                name={space.name}
                avatar={space.avatar}
                className="size-4"
              />
              <span className="min-w-0 grow truncate">{space.name}</span>
              {selected?.id === space.id && <Check className="size-4" />}
            </button>
          ))}
          {pages.length > 0 && (
            <p className="px-2 pt-2 pb-0.5 text-xs font-medium text-muted-foreground">
              Pages, folders and databases
            </p>
          )}
          {pages.map((page) => (
            <button
              key={page.id}
              type="button"
              onClick={() =>
                pick({ id: page.id, name: page.name ?? 'Untitled' })
              }
              className="flex w-full cursor-pointer items-center gap-2 rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
              data-testid={`search-within-${page.id}`}
            >
              <Avatar
                id={page.id}
                name={page.name ?? 'Untitled'}
                avatar={page.avatar}
                className="size-4"
              />
              <span className="min-w-0 grow truncate">
                {page.name ?? 'Untitled'}
              </span>
              {page.spaceName && (
                <span className="max-w-24 shrink-0 truncate text-xs text-muted-foreground">
                  {page.spaceName}
                </span>
              )}
            </button>
          ))}
          {needle !== '' &&
            visibleSpaces.length === 0 &&
            pages.length === 0 && (
              <p className="px-2 py-3 text-center text-xs text-muted-foreground">
                {pagesQuery.isFetching ? 'Searching…' : 'Nothing by that name.'}
              </p>
            )}
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => pick(null)}
            className="mt-1 w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Anywhere
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};

const DateFilter = ({
  selected,
  onChange,
  onCloseAutoFocus,
}: {
  selected: SearchDateFilter | null;
  onChange: (date: SearchDateFilter | null) => void;
  onCloseAutoFocus: (event: Event) => void;
}) => {
  const [field, setField] = useState<SearchDateFilter['field']>(
    selected?.field ?? 'edited'
  );
  const [from, setFrom] = useState(toDateInputValue(selected?.from ?? null));
  const [to, setTo] = useState(toDateInputValue(selected?.to ?? null, true));

  const choose = (nextField: SearchDateFilter['field']) => {
    setField(nextField);
    // Switching between "edited" and "created" keeps the chosen period.
    if (selected) {
      onChange({ ...selected, field: nextField });
    }
  };

  return (
    <Popover
      onOpenChange={(open) => {
        if (open) {
          setField(selected?.field ?? 'edited');
          setFrom(toDateInputValue(selected?.from ?? null));
          setTo(toDateInputValue(selected?.to ?? null, true));
        }
      }}
    >
      <PopoverTrigger asChild>
        <Chip
          active={selected !== null}
          icon={<CalendarDays />}
          label={selected ? dateFilterLabel(selected) : 'Date'}
          data-testid="search-filter-date"
        />
      </PopoverTrigger>
      <PopoverContent
        align="start"
        className="w-64 p-2"
        onCloseAutoFocus={onCloseAutoFocus}
      >
        <div className="mb-2 grid grid-cols-2 gap-1 rounded-md bg-muted p-0.5">
          {(['edited', 'created'] as const).map((option) => (
            <button
              key={option}
              type="button"
              onClick={() => choose(option)}
              className={cn(
                'cursor-pointer rounded px-2 py-1 text-xs',
                field === option
                  ? 'bg-background text-foreground shadow-sm'
                  : 'text-muted-foreground hover:text-foreground'
              )}
              data-testid={`search-date-field-${option}`}
            >
              {option === 'edited' ? 'Last edited' : 'Created'}
            </button>
          ))}
        </div>
        {(['today', 'last7', 'last30'] as const).map((preset) => (
          <button
            key={preset}
            type="button"
            onClick={() => onChange(resolveDatePreset(field, preset))}
            className="flex w-full cursor-pointer items-center rounded-sm px-2 py-1.5 text-left text-sm hover:bg-accent"
            data-testid={`search-date-${preset}`}
          >
            <span className="grow">{SEARCH_DATE_PRESET_LABELS[preset]}</span>
            {selected?.preset === preset && <Check className="size-4" />}
          </button>
        ))}
        <div className="mt-2 border-t pt-2">
          <p className="mb-1 px-1 text-xs text-muted-foreground">
            {SEARCH_DATE_PRESET_LABELS.custom}
          </p>
          <div className="flex flex-col gap-1">
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="w-8">From</span>
              <input
                type="date"
                value={from}
                onChange={(event) => {
                  setFrom(event.target.value);
                  onChange(resolveCustomRange(field, event.target.value, to));
                }}
                className="h-7 grow rounded-md border bg-transparent px-1.5 text-xs text-foreground"
                data-testid="search-date-from"
              />
            </label>
            <label className="flex items-center gap-2 px-1 text-xs text-muted-foreground">
              <span className="w-8">To</span>
              <input
                type="date"
                value={to}
                onChange={(event) => {
                  setTo(event.target.value);
                  onChange(resolveCustomRange(field, from, event.target.value));
                }}
                className="h-7 grow rounded-md border bg-transparent px-1.5 text-xs text-foreground"
                data-testid="search-date-to"
              />
            </label>
          </div>
        </div>
        {selected && (
          <button
            type="button"
            onClick={() => {
              setFrom('');
              setTo('');
              onChange(null);
            }}
            className="mt-2 w-full cursor-pointer rounded-sm px-2 py-1.5 text-left text-xs text-muted-foreground hover:bg-accent"
          >
            Any date
          </button>
        )}
      </PopoverContent>
    </Popover>
  );
};
