import { LocalRecordNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { Document } from '@colanode/ui/components/documents/document';
import { DocumentBacklinks } from '@colanode/ui/components/documents/document-backlinks';
import { NodeCoverBanner } from '@colanode/ui/components/nodes/node-cover';
import { RecordAttributes } from '@colanode/ui/components/records/record-attributes';
import { RecordDatabase } from '@colanode/ui/components/records/record-database';
import { RecordProvider } from '@colanode/ui/components/records/record-provider';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface RecordContainerProps {
  record: LocalRecordNode;
  role: NodeRole;
}

export const RecordContainer = ({ record, role }: RecordContainerProps) => {
  const workspace = useWorkspace();

  const canEdit =
    record.createdBy === workspace.userId || hasNodeRole(role, 'editor');

  // Same lock model as pages: privileged (creator/admin) always edit; others
  // are read-only in 'suggest'/'locked' (and may propose edits in 'suggest').
  const lockMode = record.lockMode ?? 'open';
  const isPrivileged =
    record.createdBy === workspace.userId || hasNodeRole(role, 'admin');
  const canEditDocument = canEdit && (isPrivileged || lockMode === 'open');
  const canSuggest = canEdit && !canEditDocument && lockMode === 'suggest';

  return (
    <div className="group/cover">
      <NodeCoverBanner
        cover={record.cover}
        canEdit={canEdit}
        onChange={(cover) => {
          const nodes = workspace.collections.nodes;
          if (!nodes.has(record.id)) {
            return;
          }

          nodes.update(record.id, (draft) => {
            if (draft.type !== 'record') {
              return;
            }

            draft.cover = cover;
          });
        }}
      />
      <RecordDatabase id={record.databaseId} role={role}>
        <RecordProvider record={record} role={role}>
          <RecordAttributes />
        </RecordProvider>
        <Separator className="my-4 w-full" />
        <Document
          node={record}
          canEdit={canEditDocument}
          canSuggest={canSuggest}
          lockMode={lockMode}
        />
        <DocumentBacklinks nodeId={record.id} />
      </RecordDatabase>
    </div>
  );
};
