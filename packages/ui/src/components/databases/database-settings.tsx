import {
  Copy,
  FileStack,
  Image,
  LetterText,
  Settings,
  Trash2,
  Lock,
  LockOpen,
  Users,
  Download,
  Upload,
} from 'lucide-react';
import { Fragment, useCallback, useState } from 'react';

import { LocalDatabaseNode, LocalNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { NodeCollaboratorsDialog } from '@colanode/ui/components/collaborators/node-collaborators-dialog';
import { DatabaseTemplatesDialog } from '@colanode/ui/components/databases/database-templates-dialog';
import { DatabaseUpdateDialog } from '@colanode/ui/components/databases/database-update-dialog';
import { Database } from '@colanode/ui/components/databases/database';
import { useExportCsvMutation } from '@colanode/ui/components/databases/view-csv-actions';
import { ViewImportCsvDialog } from '@colanode/ui/components/databases/view-import-csv-dialog';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface DatabaseSettingsProps {
  database: LocalDatabaseNode;
  nodes: LocalNode[];
  role: NodeRole;
}

export const DatabaseSettings = ({
  database,
  nodes,
  role,
}: DatabaseSettingsProps) => {
  const workspace = useWorkspace();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteModal] = useState(false);
  const [showCollaboratorsDialog, setShowCollaboratorsDialog] = useState(false);
  const [showTemplatesDialog, setShowTemplatesDialog] = useState(false);
  const [showImportDialog, setShowImportDialog] = useState(false);

  const canEdit = hasNodeRole(role, 'editor');
  const canDelete = hasNodeRole(role, 'admin');
  const isLocked = database.locked ?? false;
  const canImport = canEdit && !isLocked;

  const { mutate: exportCsv, isPending: isExporting } = useExportCsvMutation({
    databaseId: database.id,
    fields: Object.values(database.fields),
    nameFieldName: database.nameField?.name ?? 'Name',
    fileName: database.name,
  });

  const handleLockDatabase = useCallback(() => {
    if (!canEdit) {
      return;
    }

    const nodesCollection = workspace.collections.nodes;
    if (!nodesCollection.has(database.id)) {
      return;
    }

    nodesCollection.update(database.id, (draft) => {
      if (draft.type !== 'database') {
        return;
      }

      const currentLocked = draft.locked ?? false;
      draft.locked = !currentLocked;
    });
  }, [canEdit, database.id, workspace.userId]);

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Settings className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="mr-2 w-80">
          <DropdownMenuLabel>{database.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              if (!canEdit) {
                return;
              }

              setShowUpdateDialog(true);
            }}
            disabled={!canEdit}
          >
            <LetterText className="size-4" />
            Rename
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            disabled={!canEdit}
            onClick={() => {
              if (!canEdit) {
                return;
              }

              setShowUpdateDialog(true);
            }}
          >
            <Image className="size-4" />
            Update icon
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            disabled={!canEdit}
            onClick={handleLockDatabase}
          >
            {isLocked ? (
              <LockOpen className="size-4" />
            ) : (
              <Lock className="size-4" />
            )}
            {isLocked ? 'Unlock database' : 'Lock database'}
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            disabled
          >
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setShowTemplatesDialog(true)}
          >
            <FileStack className="size-4" />
            Templates
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setShowCollaboratorsDialog(true)}
          >
            <Users className="size-4" />
            Collaborators
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            disabled={isExporting}
            onClick={() => exportCsv()}
          >
            <Download className="size-4" />
            Export CSV
          </DropdownMenuItem>
          {canImport && (
            <DropdownMenuItem
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => setShowImportDialog(true)}
            >
              <Upload className="size-4" />
              Import CSV
            </DropdownMenuItem>
          )}
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2"
            onClick={() => {
              if (!canDelete) {
                return;
              }

              setShowDeleteModal(true);
            }}
            disabled={!canDelete}
          >
            <Trash2 className="size-4" />
            Delete
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuLabel>Created by</DropdownMenuLabel>
          <DropdownMenuItem>
            <NodeCollaboratorAudit
              collaboratorId={database.createdBy}
              date={database.createdAt}
            />
          </DropdownMenuItem>
          {database.updatedBy && database.updatedAt && (
            <Fragment>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Last updated by</DropdownMenuLabel>
              <DropdownMenuItem>
                <NodeCollaboratorAudit
                  collaboratorId={database.updatedBy}
                  date={database.updatedAt}
                />
              </DropdownMenuItem>
            </Fragment>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NodeDeleteDialog
        id={database.id}
        title="Are you sure you want delete this database?"
        description="This action cannot be undone. This database will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteModal}
      />
      <DatabaseUpdateDialog
        database={database}
        role={role}
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
      />
      <NodeCollaboratorsDialog
        node={database}
        nodes={nodes}
        role={role}
        open={showCollaboratorsDialog}
        onOpenChange={setShowCollaboratorsDialog}
      />
      <DatabaseTemplatesDialog
        database={database}
        role={role}
        open={showTemplatesDialog}
        onOpenChange={setShowTemplatesDialog}
      />
      <Database database={database} role={role}>
        <ViewImportCsvDialog
          open={showImportDialog}
          onOpenChange={setShowImportDialog}
        />
      </Database>
    </Fragment>
  );
};
