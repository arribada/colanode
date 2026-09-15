// ABOUTME: Finds the nodes of a space that already carry a given name, for the
// ABOUTME: "a page with this title already exists" hint. It never blocks a name.

export type NamedNode = {
  id: string;
  type: string;
  name: string | null;
};

/**
 * The form two names are compared in: case, surrounding spaces and runs of
 * spaces do not make "Requirements" and "requirements " different pages to a
 * reader scanning a search result.
 */
export const normalizeNodeName = (name: string | null | undefined): string =>
  (name ?? '').replace(/\s+/g, ' ').trim().toLocaleLowerCase();

export const pickSameNameNodes = (
  name: string,
  candidates: NamedNode[],
  excludeId: string | undefined,
  limit: number
): NamedNode[] => {
  const wanted = normalizeNodeName(name);
  if (wanted.length === 0) {
    return [];
  }

  return candidates
    .filter(
      (candidate) =>
        candidate.id !== excludeId &&
        normalizeNodeName(candidate.name) === wanted
    )
    .slice(0, Math.max(0, limit));
};
