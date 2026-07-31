import { createContext, useContext } from 'react';

import {
  DatabaseAutomation,
  DatabaseNameFieldAttributes,
  FieldAttributes,
  NodeRole,
} from '@colanode/core';

interface DatabaseContext {
  id: string;
  name: string;
  nameField: DatabaseNameFieldAttributes | null | undefined;
  fields: FieldAttributes[];
  automations: DatabaseAutomation[];
  canEdit: boolean;
  isLocked: boolean;
  canCreateRecord: boolean;
  role: NodeRole;
  rootId: string;
  toggleLock: () => void;
}

export const DatabaseContext = createContext<DatabaseContext>(
  {} as DatabaseContext
);

export const useDatabase = () => useContext(DatabaseContext);
