import { Image, LetterText, Settings, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';

import { LocalWhiteboardNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { WhiteboardUpdateDialog } from '@colanode/ui/components/whiteboards/whiteboard-update-dialog';

interface WhiteboardSettingsProps {
  whiteboard: LocalWhiteboardNode;
  role: NodeRole;
}

export const WhiteboardSettings = ({
  whiteboard,
  role,
}: WhiteboardSettingsProps) => {
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteModal] = useState(false);

  const canEdit = hasNodeRole(role, 'editor');
  const canDelete = hasNodeRole(role, 'editor');

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Settings className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="mr-2 w-80">
          <DropdownMenuLabel>{whiteboard.name}</DropdownMenuLabel>
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
              collaboratorId={whiteboard.createdBy}
              date={whiteboard.createdAt}
            />
          </DropdownMenuItem>
          {whiteboard.updatedBy && whiteboard.updatedAt && (
            <Fragment>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Last updated by</DropdownMenuLabel>
              <DropdownMenuItem>
                <NodeCollaboratorAudit
                  collaboratorId={whiteboard.updatedBy}
                  date={whiteboard.updatedAt}
                />
              </DropdownMenuItem>
            </Fragment>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NodeDeleteDialog
        id={whiteboard.id}
        title="Are you sure you want delete this whiteboard?"
        description="This action cannot be undone. This whiteboard will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteModal}
      />
      <WhiteboardUpdateDialog
        whiteboard={whiteboard}
        role={role}
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
      />
    </Fragment>
  );
};
