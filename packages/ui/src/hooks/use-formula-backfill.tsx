// ABOUTME: One-time, idempotent backfill of materialised formula values for a
// ABOUTME: database's pre-existing records, so formula sort/filter cover them too.
import { useEffect } from 'react';

import {
  computeRecordFormulaValues,
  mapNodeAttributes,
} from '@colanode/client/lib';
import { LocalDatabaseNode } from '@colanode/client/types';
import { FieldValue } from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

// Records edited after the materialisation feature shipped store their formula
// values on write, but records created before it have none -- so they sort and
// filter as empty. On the first time an editor opens a database that has formula
// fields, recompute every record's formula values and persist the ones that
// actually changed (so nothing is written needlessly). A per-database local flag
// keeps it to a single pass per client; because it only writes changed records,
// a second client opening the same database (after the first has backfilled)
// finds the values already correct and writes nothing.

const scalarEquals = (
  a: FieldValue | undefined,
  b: FieldValue | undefined
): boolean => {
  if (a === undefined || b === undefined) {
    return a === b;
  }
  if (a.type !== b.type) {
    return false;
  }
  return JSON.stringify(a.value) === JSON.stringify(b.value);
};

// Yield to the event loop after this many writes so a large database doesn't
// flood the sync queue in one synchronous burst.
const BACKFILL_YIELD_EVERY = 25;

// Guards a redundant re-scan while the persistent `done` flag is still loading
// (useMetadata can't distinguish "loading" from "unset"): once a database has
// been attempted this session, don't attempt it again.
const backfilledThisSession = new Set<string>();

export const useFormulaBackfill = (
  database: LocalDatabaseNode,
  enabled: boolean
) => {
  const workspace = useWorkspace();
  const [done, setDone] = useMetadata<boolean>(
    workspace.userId,
    `formula.backfill.${database.id}`
  );

  useEffect(() => {
    if (!enabled || done || backfilledThisSession.has(database.id)) {
      return;
    }

    const fields = Object.values(database.fields ?? {});
    const formulaFields = fields.filter((field) => field.type === 'formula');
    if (formulaFields.length === 0) {
      setDone(true);
      return;
    }

    let cancelled = false;

    const run = async () => {
      const nodes = await window.colanode.executeQuery({
        type: 'node.list',
        userId: workspace.userId,
        filters: [
          { field: ['type'], operator: 'eq', value: 'record' },
          { field: ['databaseId'], operator: 'eq', value: database.id },
        ],
        sorts: [],
      });

      let written = 0;
      for (const node of nodes) {
        if (cancelled) {
          return;
        }
        if (node.type !== 'record') {
          continue;
        }

        const computed = computeRecordFormulaValues(node, fields);
        const changed = formulaFields.some(
          (field) => !scalarEquals(node.fields[field.id], computed[field.id])
        );
        if (!changed) {
          continue;
        }

        const updated = { ...node, fields: { ...node.fields } };
        for (const field of formulaFields) {
          const next = computed[field.id];
          if (next) {
            updated.fields[field.id] = next;
          } else if (updated.fields[field.id]) {
            delete updated.fields[field.id];
          }
        }
        // Persist through the direct mutation funnel, NOT
        // collections.nodes.update -- that throws UpdateKeyNotFoundError for a
        // record not in the on-demand collection (any row past the view's first
        // page, or hidden by an active filter).
        await window.colanode.executeMutation({
          type: 'node.update',
          userId: workspace.userId,
          nodeId: node.id,
          attributes: mapNodeAttributes(updated),
        });

        written += 1;
        if (written % BACKFILL_YIELD_EVERY === 0) {
          await new Promise((resolve) => setTimeout(resolve, 50));
        }
      }

      if (!cancelled) {
        setDone(true);
      }
    };

    backfilledThisSession.add(database.id);
    void run().catch(() => {
      // Best-effort: on failure leave the flag unset so a later open retries.
    });

    return () => {
      cancelled = true;
    };
    // setDone is stable; re-running only when the database or flag changes is
    // intended.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [database.id, enabled, done]);
};
