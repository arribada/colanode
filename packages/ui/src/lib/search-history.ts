// ABOUTME: The last searches a person opened a result from, kept in this browser per
// ABOUTME: workspace so the empty search box can offer them again.

const MAX_SEARCHES = 6;

const storageKey = (userId: string) => `colanode.search.recent.${userId}`;

export const readRecentSearches = (userId: string): string[] => {
  try {
    const raw = window.localStorage.getItem(storageKey(userId));
    const value: unknown = raw ? JSON.parse(raw) : [];
    return Array.isArray(value)
      ? value.filter((item): item is string => typeof item === 'string')
      : [];
  } catch {
    // Private windows and blocked storage: no history, nothing breaks.
    return [];
  }
};

export const rememberSearch = (userId: string, query: string): string[] => {
  const trimmed = query.trim();
  if (trimmed.length === 0) {
    return readRecentSearches(userId);
  }
  const next = [
    trimmed,
    ...readRecentSearches(userId).filter(
      (item) => item.toLowerCase() !== trimmed.toLowerCase()
    ),
  ].slice(0, MAX_SEARCHES);
  try {
    window.localStorage.setItem(storageKey(userId), JSON.stringify(next));
  } catch {
    // Same as above: the search still opens its result.
  }
  return next;
};

export const forgetSearches = (userId: string) => {
  try {
    window.localStorage.removeItem(storageKey(userId));
  } catch {
    // Nothing to forget where nothing could be kept.
  }
};
