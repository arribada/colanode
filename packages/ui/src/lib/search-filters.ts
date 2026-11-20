// ABOUTME: The filters and order of the search dialog as the chips show them, and how
// ABOUTME: they become the node.search query: dates resolved once, when they are picked.
import { NodeSearchFilters, NodeSearchSort } from '@colanode/client/queries';
import { NodeType } from '@colanode/core';

export type SearchDatePreset = 'today' | 'last7' | 'last30' | 'custom';

export interface SearchDateFilter {
  field: 'edited' | 'created';
  preset: SearchDatePreset;
  // ISO instants, `to` exclusive. Resolved when the preset is picked, so the
  // query stays the same while the dialog is open instead of moving with the
  // clock on every render.
  from: string | null;
  to: string | null;
}

export interface SearchFilterState {
  sort: NodeSearchSort;
  titleOnly: boolean;
  types: NodeType[];
  createdBy: string[];
  within: { id: string; name: string } | null;
  date: SearchDateFilter | null;
}

export const EMPTY_SEARCH_FILTERS: SearchFilterState = {
  sort: 'relevance',
  titleOnly: false,
  types: [],
  createdBy: [],
  within: null,
  date: null,
};

export const SEARCH_SORT_LABELS: Record<NodeSearchSort, string> = {
  relevance: 'Best matches',
  edited_desc: 'Last edited: newest first',
  edited_asc: 'Last edited: oldest first',
  created_desc: 'Created: newest first',
  created_asc: 'Created: oldest first',
};

export const SEARCH_TYPE_OPTIONS: { type: NodeType; label: string }[] = [
  { type: 'page', label: 'Pages' },
  { type: 'database', label: 'Databases' },
  { type: 'record', label: 'Records' },
  { type: 'whiteboard', label: 'Whiteboards' },
  { type: 'folder', label: 'Folders' },
  { type: 'file', label: 'Files' },
  { type: 'message', label: 'Comments' },
  { type: 'space', label: 'Spaces' },
];

export const SEARCH_DATE_PRESET_LABELS: Record<SearchDatePreset, string> = {
  today: 'Today',
  last7: 'Last 7 days',
  last30: 'Last 30 days',
  custom: 'Custom range',
};

const DAY = 24 * 60 * 60 * 1000;

const localMidnight = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate());

// Calendar days, not 24 hours: a range that crosses a clock change still ends
// at midnight.
const dayAfter = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() + 1);

const dayBefore = (date: Date): Date =>
  new Date(date.getFullYear(), date.getMonth(), date.getDate() - 1);

export const resolveDatePreset = (
  field: SearchDateFilter['field'],
  preset: Exclude<SearchDatePreset, 'custom'>,
  now: Date = new Date()
): SearchDateFilter => {
  const start =
    preset === 'today'
      ? localMidnight(now)
      : new Date(now.getTime() - (preset === 'last7' ? 7 : 30) * DAY);
  return { field, preset, from: start.toISOString(), to: null };
};

// `from` and `to` are the days typed in the date boxes (YYYY-MM-DD, local),
// both included: the range runs to the midnight after `to`.
export const resolveCustomRange = (
  field: SearchDateFilter['field'],
  from: string | null,
  to: string | null
): SearchDateFilter | null => {
  const parse = (value: string | null): Date | null => {
    if (!value) {
      return null;
    }
    const [year, month, day] = value.split('-').map(Number);
    if (!year || !month || !day) {
      return null;
    }
    return new Date(year, month - 1, day);
  };
  const start = parse(from);
  const end = parse(to);
  if (!start && !end) {
    return null;
  }
  return {
    field,
    preset: 'custom',
    from: start ? start.toISOString() : null,
    to: end ? dayAfter(end).toISOString() : null,
  };
};

// The day a stored instant falls on, for a date box (YYYY-MM-DD, local).
export const toDateInputValue = (iso: string | null, endExclusive = false) => {
  if (!iso) {
    return '';
  }
  const date = endExclusive ? dayBefore(new Date(iso)) : new Date(iso);
  const pad = (value: number) => String(value).padStart(2, '0');
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}`;
};

export const toNodeSearchFilters = (
  state: SearchFilterState,
  includeChat: boolean
): NodeSearchFilters => ({
  titleOnly: state.titleOnly,
  types: state.types,
  createdBy: state.createdBy,
  withinId: state.within?.id ?? null,
  dateField: state.date?.field ?? 'edited',
  dateFrom: state.date?.from ?? null,
  dateTo: state.date?.to ?? null,
  includeChat,
});

// Filters that narrow the results; the order and "title only" do not count,
// since neither makes an empty box list anything.
export const hasNarrowingFilters = (state: SearchFilterState): boolean =>
  state.types.length > 0 ||
  state.createdBy.length > 0 ||
  state.within !== null ||
  state.date !== null;

export const isDefaultSearchFilters = (state: SearchFilterState): boolean =>
  state.sort === 'relevance' && !state.titleOnly && !hasNarrowingFilters(state);

export const dateFilterLabel = (date: SearchDateFilter): string => {
  const field = date.field === 'created' ? 'Created' : 'Edited';
  if (date.preset !== 'custom') {
    return `${field}: ${SEARCH_DATE_PRESET_LABELS[date.preset]}`;
  }
  const from = date.from ? new Date(date.from).toLocaleDateString() : '…';
  const to = date.to ? dayBefore(new Date(date.to)).toLocaleDateString() : '…';
  return `${field}: ${from} → ${to}`;
};
