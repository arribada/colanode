import { Copy, Image, LetterText, Settings, Trash2, Users } from 'lucide-react';
import { Fragment, useState } from 'react';

import { LocalFolderNode, LocalNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { NodeCollaboratorsDialog } from '@colanode/ui/components/collaborators/node-collaborators-dialog';
import { FolderUpdateDialog } from '@colanode/ui/components/folders/folder-update-dialog';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';

interface FolderSettingsProps {
  folder: LocalFolderNode;
  nodes: LocalNode[];
  role: NodeRole;
}

export const FolderSettings = ({
  folder,
  nodes,
  role,
}: FolderSettingsProps) => {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteModal] = useState(false);
  const [showCollaboratorsDialog, setShowCollaboratorsDialog] = useState(false);

  const canEdit = hasNodeRole(role, 'editor');
  const canDelete = hasNodeRole(role, 'editor');

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            aria-label="Folder settings"
            className="flex cursor-pointer items-center justify-center border-0 bg-transparent p-0 text-muted-foreground hover:text-foreground"
          >
            <Settings className="size-4" />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="mr-2 w-80">
          <DropdownMenuLabel>{folder.name}</DropdownMenuLabel>
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
          <DropdownMenuItem className="flex items-center gap-2" disabled>
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setShowCollaboratorsDialog(true)}
          >
            <Users className="size-4" />
            Collaborators
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
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
              collaboratorId={folder.createdBy}
              date={folder.createdAt}
            />
          </DropdownMenuItem>
          {folder.updatedBy && folder.updatedAt && (
            <Fragment>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Last updated by</DropdownMenuLabel>
              <DropdownMenuItem>
                <NodeCollaboratorAudit
                  collaboratorId={folder.updatedBy}
                  date={folder.updatedAt}
                />
              </DropdownMenuItem>
            </Fragment>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NodeDeleteDialog
        id={folder.id}
        title="Are you sure you want delete this folder?"
        description="This action cannot be undone. This folder will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteModal}
      />
      <FolderUpdateDialog
        folder={folder}
        role={role}
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
      />
      <NodeCollaboratorsDialog
        node={folder}
        nodes={nodes}
        role={role}
        open={showCollaboratorsDialog}
        onOpenChange={setShowCollaboratorsDialog}
      />
    </Fragment>
  );
};
