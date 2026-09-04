import { LocalRecordNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { useDatabase } from '@colanode/ui/contexts/database';
import { RecordContext } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const RecordProvider = ({
  record,
  role,
  children,
}: {
  record: LocalRecordNode;
  role: NodeRole;
  children: React.ReactNode;
}) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  // Per-record lock (lockMode) freezes values/name/avatar for everyone but the
  // record creator or a node admin -- mirroring the document editability rule.
  const isPrivileged =
    record.createdBy === workspace.userId || hasNodeRole(role, 'admin');
  const lockMode = record.lockMode ?? 'open';

  const canEdit =
    !database.isLocked &&
    (record.createdBy === workspace.userId || hasNodeRole(role, 'editor')) &&
    (isPrivileged || lockMode === 'open');

  return (
    <RecordContext.Provider
      value={{
        id: record.id,
        name: record.name,
        avatar: record.avatar,
        fields: record.fields,
        createdBy: record.createdBy,
        createdAt: record.createdAt,
        updatedBy: record.updatedBy,
        updatedAt: record.updatedAt,
        databaseId: record.databaseId,
        localRevision: record.localRevision,
        canEdit,
      }}
    >
      {children}
    </RecordContext.Provider>
  );
};
