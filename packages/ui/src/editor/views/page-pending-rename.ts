// ABOUTME: One-shot registry of inline pages awaiting their first name, so a
// ABOUTME: freshly created /page embed opens directly in rename mode.
const pending = new Set<string>();

export const markPagePendingRename = (id: string): void => {
  pending.add(id);
};

// Returns true once per id, then forgets it, so only the initial mount renames.
export const consumePagePendingRename = (id: string): boolean => {
  if (pending.has(id)) {
    pending.delete(id);
    return true;
  }
  return false;
};
