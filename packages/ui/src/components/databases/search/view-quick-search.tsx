// ABOUTME: Magnifier in a database view's toolbar that opens into a text box; the
// ABOUTME: words typed there narrow the view to the records that contain them.
import { Search, X } from 'lucide-react';
import { useRef, useState } from 'react';

import { useDatabaseView } from '@colanode/ui/contexts/database-view';

export const ViewQuickSearch = () => {
  const view = useDatabaseView();
  const inputRef = useRef<HTMLInputElement>(null);
  const [isOpen, setIsOpen] = useState(false);
  // A search typed in another view of the same database is still applied, so
  // its box has to show it.
  const expanded = isOpen || view.searchText.length > 0;

  const close = () => {
    view.setSearchText('');
    setIsOpen(false);
  };

  if (!expanded) {
    return (
      <button
        type="button"
        className="flex cursor-pointer items-center rounded-md p-1.5 hover:bg-accent"
        onClick={() => {
          setIsOpen(true);
          requestAnimationFrame(() => inputRef.current?.focus());
        }}
        aria-label="Search"
        title="Search"
        data-testid="view-search-button"
      >
        <Search className="size-4" />
      </button>
    );
  }

  return (
    <div
      className="mx-0.5 flex h-7 flex-row items-center gap-1 rounded-md border px-1.5 focus-within:border-ring"
      data-testid="view-search"
    >
      <Search className="size-3.5 shrink-0 text-muted-foreground" />
      <input
        ref={inputRef}
        value={view.searchText}
        onChange={(event) => view.setSearchText(event.target.value)}
        onKeyDown={(event) => {
          if (event.key === 'Escape') {
            // Escape also clears a table's cell range and closes a peek;
            // here it only closes the search.
            event.stopPropagation();
            close();
          }
        }}
        onBlur={() => {
          if (view.searchText.trim() === '') {
            close();
          }
        }}
        placeholder="Search…"
        aria-label="Search records"
        spellCheck={false}
        className="w-28 bg-transparent text-sm outline-none placeholder:text-muted-foreground sm:w-40"
        data-testid="view-search-input"
      />
      {view.searchText.length > 0 && (
        <button
          type="button"
          // Keep the focus in the box, so clearing does not also collapse it.
          onMouseDown={(event) => event.preventDefault()}
          onClick={() => {
            setIsOpen(true);
            view.setSearchText('');
            inputRef.current?.focus();
          }}
          className="flex shrink-0 items-center rounded p-0.5 text-muted-foreground hover:bg-accent hover:text-foreground"
          aria-label="Clear search"
          data-testid="view-search-clear"
        >
          <X className="size-3.5" />
        </button>
      )}
    </div>
  );
};
