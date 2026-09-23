import { ParsedOrderBy, SimpleComparison } from '@tanstack/db';

import { LocalNode } from '@colanode/client/types/nodes';

export type NodeListQueryInput = {
  type: 'node.list';
  userId: string;
  filters: Array<SimpleComparison>;
  sorts: Array<ParsedOrderBy>;
  limit?: number;
  // Browsing queries must never surface templates, so they are filtered out by
  // default. Asking for one BY ID is not browsing: it is what opening a
  // template to correct it looks like, and without this the node never reaches
  // the shared collection and the page renders empty.
  includeTemplates?: boolean;
};

declare module '@colanode/client/queries' {
  interface QueryMap {
    'node.list': {
      input: NodeListQueryInput;
      output: LocalNode[];
    };
  }
}
