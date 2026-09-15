// ABOUTME: Decides what an edit to the in-page title saves: a cleaned name, or
// ABOUTME: nothing at all when the edit is empty or changes nothing.

/**
 * The name to save for an edited page title, or null when nothing should be
 * written. An unchanged title is not a write, and a blanked-out one would leave
 * the page nameless in the sidebar, the breadcrumb and every mention of it.
 */
export const resolveTitleEdit = (
  draft: string,
  current: string | null | undefined
): string | null => {
  const next = draft.replace(/\s+/g, ' ').trim();
  if (next.length === 0) {
    return null;
  }

  return next === (current ?? '').trim() ? null : next;
};
