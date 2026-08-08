// ABOUTME: Pure decision predicates for the self-healing sync layer — the small,
// ABOUTME: correctness-critical guards (resurrection, metadata monotonicity, stale
// ABOUTME: collaboration, heal rewind) extracted so they can be unit-tested.

// Resurrection guard: refuse to re-create a node whose tombstone is NEWER than
// the incoming update AND in the same root. A cross-space move emits a tombstone
// in the OLD root while the re-homed update carries the NEW root, so differing
// roots mean relocation (allow the create), not deletion (block it).
export const shouldBlockResurrection = (
  tombstone: { revision: string; root_id: string } | null | undefined,
  update: { revision: string; rootId: string }
): boolean =>
  tombstone != null &&
  tombstone.root_id === update.rootId &&
  BigInt(tombstone.revision) > BigInt(update.revision);

// Strict numeric "a newer than b" over revision strings. Used to decide whether
// an incoming node update should advance the row's metadata (root_id, updated_
// at/by, server_revision): only a strictly newer update does; an old re-delivered
// update (e.g. from the heal) still CRDT-merges its content but must not roll
// metadata back — otherwise a pre-move update would yank a cross-space-moved node
// back to its old space.
export const isNewerRevision = (a: string, b: string): boolean =>
  BigInt(a) > BigInt(b);

// A re-delivered collaboration is stale (skip it, incl. its delete side-effects)
// when we already hold this revision OR a newer one. `>=` (not `>`) is deliberate:
// an equal revision is identical content, safely skipped. This closes the bug
// where a superseded revoke re-wiped a space whose access had been re-granted.
export const isStaleCollaboration = (
  existingRevision: string | null | undefined,
  incomingRevision: string
): boolean =>
  existingRevision != null &&
  BigInt(existingRevision) >= BigInt(incomingRevision);

// Heal rewinds the cursor by a bounded window, never below zero, so the re-pull
// re-delivers a recently-committed lower revision that the live cursor skipped.
export const computeHealCursor = (current: bigint, lookback: bigint): bigint =>
  current > lookback ? current - lookback : 0n;
