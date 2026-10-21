import {
  BasicIndex,
  createCollection,
  extractSimpleComparisons,
  parseLoadSubsetOptions,
  SimpleComparison,
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
            // A node can reach a client already trashed: its create, a move
            // and the trash merged into a single server update. Inserting it
            // put a deleted page in every fresh client's sidebar, since only
            // updates were checked for the trash.
            if (isNodeTrashed(event.node)) {
              return;
            }
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
              // A later page comes with the rows already sent as its offset.
              // node.list has no cursor, so load up to the end of this page:
              // asking for just `limit` rows again returned the first page and
              // the view could not grow past what other queries had loaded.
              if (parsedOptions.limit !== undefined && options?.offset) {
                parsedOptions = {
                  ...parsedOptions,
                  limit: parsedOptions.limit + options.offset,
                };
              }
            } catch {
              // An order SQL cannot express -- records in their hand-made order,
              // by position else id -- still has plain filters: load every
              // matching row (one database's records) and let the view order
              // them. Falling straight to the bounded load below took 2000
              // records of any database, which could miss this one's.
              let filters: SimpleComparison[] | null = null;
              try {
                filters = extractSimpleComparisons(options?.where);
              } catch {
                filters = null;
              }
              if (filters && filters.length > 0) {
                parsedOptions = { filters, sorts: [], limit: undefined };
              }
            }
            if (!parsedOptions) {
              // A view filtered by a relation / multi_select field builds an
              // expression react-db's push-down parser rejects (or/length/
              // coalesce), which otherwise throws and breaks the whole view.
              // Fall back to loading a bounded set of records with no server
              // filter and let react-db apply the predicate in memory.
              parsedOptions = {
                filters: [
                  { field: ['type'], operator: 'in', value: ['record'] },
                ],
                sorts: [],
                limit: 2000,
              };
            }

            // A query that names one node by id is not browsing the tree: it
            // is a page or a record being opened. Templates are hidden from
            // every listing, which meant opening one (the block handle's
            // "Edit template", or a template manager) left the node out of the
            // collection and the screen blank. Asked for by id, it loads.
            const byId = parsedOptions.filters.some(
              (filter) =>
                Array.isArray(filter.field) &&
                filter.field.length === 1 &&
                filter.field[0] === 'id'
            );

            const nodes = await window.colanode.executeQuery({
              type: 'node.list',
              userId,
              filters: parsedOptions.filters,
              sorts: parsedOptions.sorts,
              limit: parsedOptions.limit,
              includeTemplates: byId,
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
