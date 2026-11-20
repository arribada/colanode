// ABOUTME: Hands a "find in page" from the search dialog to the page it opens, so the
// ABOUTME: page lands on the passage that was clicked with its find bar already open.

export interface FindRequest {
  text: string;
  // Which match to land on, 0-based.
  occurrence: number;
}

const pending = new Map<string, FindRequest>();
const listeners = new Set<(nodeId: string) => void>();

// The page may already be open (same node, same tab): its find bar listens.
// Otherwise it picks the request up when it mounts.
export const requestFind = (nodeId: string, request: FindRequest) => {
  pending.set(nodeId, request);
  for (const listener of listeners) {
    listener(nodeId);
  }
};

export const takeFindRequest = (nodeId: string): FindRequest | null => {
  const request = pending.get(nodeId) ?? null;
  pending.delete(nodeId);
  return request;
};

export const onFindRequest = (listener: (nodeId: string) => void) => {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
};

// A page opened in a new tab gets its request through the address:
// #find=<text>&n=<occurrence>. Block links keep their bare #<blockId>.
export const FIND_HASH_PREFIX = '#find=';

export const findRequestHash = (request: FindRequest): string =>
  `${FIND_HASH_PREFIX}${encodeURIComponent(request.text)}&n=${request.occurrence}`;

export const parseFindRequestHash = (hash: string): FindRequest | null => {
  if (!hash.startsWith(FIND_HASH_PREFIX)) {
    return null;
  }
  const [encoded, occurrencePart] = hash
    .slice(FIND_HASH_PREFIX.length)
    .split('&n=');
  let text = '';
  try {
    text = decodeURIComponent(encoded ?? '');
  } catch {
    return null;
  }
  if (text.length === 0) {
    return null;
  }
  const occurrence = Number.parseInt(occurrencePart ?? '0', 10);
  return {
    text,
    occurrence: Number.isFinite(occurrence) && occurrence > 0 ? occurrence : 0,
  };
};
