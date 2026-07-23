import { useNavigate } from '@tanstack/react-router';
import {
  Copy,
  FolderInput,
  Image,
  LetterText,
  Settings,
  Trash2,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import { PageMoveDialog } from '@colanode/ui/components/pages/page-move-dialog';
import { PageUpdateDialog } from '@colanode/ui/components/pages/page-update-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface PageSettingsProps {
  page: LocalPageNode;
  role: NodeRole;
}

export const PageSettings = ({ page, role }: PageSettingsProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate: duplicatePage, isPending: isDuplicating } = useMutation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
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
          <DropdownMenuLabel>{page.name}</DropdownMenuLabel>
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
            onClick={() => {
              if (!canEdit) {
                return;
              }

              setShowMoveDialog(true);
            }}
          >
            <FolderInput className="size-4" />
            Move to…
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            disabled={!canEdit || isDuplicating}
            onClick={() => {
              if (!canEdit || isDuplicating) {
                return;
              }

              duplicatePage({
                input: {
                  type: 'page.duplicate',
                  userId: workspace.userId,
                  pageId: page.id,
                },
                onSuccess(output) {
                  navigate({
                    to: '$nodeId',
                    params: {
                      nodeId: output.id,
                    },
                  });
                },
                onError(error) {
                  toast.error(error.message);
                },
              });
            }}
          >
            <Copy className="size-4" />
            Duplicate
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
              collaboratorId={page.createdBy}
              date={page.createdAt}
            />
          </DropdownMenuItem>
          {page.updatedBy && page.updatedAt && (
            <Fragment>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Last updated by</DropdownMenuLabel>
              <DropdownMenuItem>
                <NodeCollaboratorAudit
                  collaboratorId={page.updatedBy}
                  date={page.updatedAt}
                />
              </DropdownMenuItem>
            </Fragment>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <NodeDeleteDialog
        id={page.id}
        title="Are you sure you want delete this page?"
        description="This action cannot be undone. This page will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteModal}
      />
      <PageUpdateDialog
        page={page}
        role={role}
        open={showUpdateDialog}
        onOpenChange={setShowUpdateDialog}
      />
      <PageMoveDialog
        page={page}
        open={showMoveDialog}
        onOpenChange={setShowMoveDialog}
      />
    </Fragment>
  );
};
