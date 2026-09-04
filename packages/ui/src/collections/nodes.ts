import {
  BasicIndex,
  createCollection,
  parseLoadSubsetOptions,
} from '@tanstack/react-db';

import { LocalNode } from '@colanode/client/types';
import { isNodeTrashed } from '@colanode/core';
import { applyNodeTransaction } from '@colanode/ui/lib/nodes';

export const createNodesCollection = (userId: string) => {
  return createCollection<LocalNode, string>({
    getKey(item) {
      return item.id;
    },
    defaultIndexType: BasicIndex,
    autoIndex: 'eager',
    syncMode: 'on-demand',

    sync: {
      rowUpdateMode: 'full',
      sync({ begin, write, commit, markReady }) {
        window.colanode
          .executeQuery({
            type: 'node.list',
            userId,
            filters: [
              {
                field: ['type'],
                operator: 'in',
                value: ['space', 'chat', 'database', 'channel'],
              },
            ],
            sorts: [],
          })
          .then((nodes) => {
            begin();
            for (const node of nodes) {
              write({ type: 'insert', value: node });
            }
            commit();
            markReady();
          });

        const subscriptionId = window.eventBus.subscribe((event) => {
          if (
            event.type === 'node.created' &&
            event.workspace.userId === userId
          ) {
            begin();
            write({ type: 'insert', value: event.node });
            commit();
          } else if (
            event.type === 'node.updated' &&
            event.workspace.userId === userId
          ) {
            begin();
            if (isNodeTrashed(event.node)) {
              // Soft-deleted nodes leave the browsing collection; the trash
              // view reads them via the dedicated node.trash.list query.
              // Deleting a key that was never synced is a no-op.
              write({ type: 'delete', value: event.node });
            } else {
              // With rowUpdateMode 'full' an update acts as an upsert, which
              // also covers a node coming back from the trash.
              write({ type: 'update', value: event.node });
            }
            commit();
          } else if (
            event.type === 'node.deleted' &&
            event.workspace.userId === userId
          ) {
            begin();
            write({ type: 'delete', value: event.node });
            commit();
          }
        });

        return {
          cleanup: () => window.eventBus.unsubscribe(subscriptionId),
          loadSubset: async (options) => {
            let parsedOptions;
            try {
              parsedOptions = parseLoadSubsetOptions(options);
            } catch {
              // A view filtered by a relation / multi_select field builds an
              // expression react-db's push-down parser rejects (or/length/
              // coalesce), which otherwise throws and breaks the whole view.
              // Fall back to loading a bounded set of records with no server
              // filter and let react-db apply the predicate in memory.
              parsedOptions = {
                filters: [{ field: ['type'], operator: 'in', value: ['record'] }],
                sorts: [],
                limit: 2000,
              };
            }

            const nodes = await window.colanode.executeQuery({
              type: 'node.list',
              userId,
              filters: parsedOptions.filters,
              sorts: parsedOptions.sorts,
              limit: parsedOptions.limit,
            });

            begin();
            for (const node of nodes) {
              write({ type: 'insert', value: node });
            }
            commit();
          },
        };
      },
    },
    onInsert: async ({ transaction }) => {
      await applyNodeTransaction(userId, transaction);
    },
    onUpdate: async ({ transaction }) => {
      await applyNodeTransaction(userId, transaction);
    },
    onDelete: async ({ transaction }) => {
      await applyNodeTransaction(userId, transaction);
    },
  });
};
