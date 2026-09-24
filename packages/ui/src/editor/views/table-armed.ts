// ABOUTME: Remembers which tables the pointer has visited, so a cell only
// ABOUTME: mounts its context menu once somebody could actually open it.

// A Radix menu root attaches two document listeners on EVERY keydown for as
// long as it is mounted, and only a pointer event clears them. One context
// menu per table cell meant a page of tables registered a couple of thousand
// listeners per keystroke and accumulated them while you typed. A cell whose
// table has never been pointed at cannot have its context menu opened, so it
// does not need one.
//
// Arming is per TABLE, not per cell, and it never reverses. A cell changes
// shape at most once, when its table is first entered, which always happens
// before the caret can be put in it: a remount while you are typing in a cell
// would drop the caret.
const armed = new WeakSet<HTMLElement>();
const listeners = new Set<() => void>();
let version = 0;

export const TABLE_HOST_ATTRIBUTE = 'data-table-host';

export const armTable = (element: HTMLElement | null | undefined): void => {
  if (!element || armed.has(element)) {
    return;
  }

  armed.add(element);
  version += 1;
  for (const listener of listeners) {
    listener();
  }
};

export const isTableArmed = (element: HTMLElement | null): boolean =>
  element !== null && armed.has(element);

export const subscribeTableArmed = (listener: () => void): (() => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

export const getTableArmedVersion = (): number => version;

// The table node view this element sits in, or null outside a table.
export const tableHostOf = (
  element: HTMLElement | null | undefined
): HTMLElement | null =>
  (element?.closest(`[${TABLE_HOST_ATTRIBUTE}]`) as HTMLElement | null) ?? null;
