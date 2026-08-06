import { Copy, FileStack, Settings, Share2, Trash2 } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { LocalRecordNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import { PageShareDialog } from '@colanode/ui/components/pages/page-share-dialog';
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

interface RecordSettingsProps {
  record: LocalRecordNode;
  role: NodeRole;
}

export const RecordSettings = ({ record, role }: RecordSettingsProps) => {
  const workspace = useWorkspace();
  const { mutate: saveAsTemplate, isPending: isSavingAsTemplate } =
    useMutation();
  const [showDeleteDialog, setShowDeleteModal] = useState(false);
  const [showShareDialog, setShowShareDialog] = useState(false);
  const canDelete =
    record.createdBy === workspace.userId || hasNodeRole(role, 'editor');
  const canSaveAsTemplate =
    hasNodeRole(role, 'collaborator') && !record.isTemplate;

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Settings
            role="button"
            tabIndex={0}
            aria-label="Record settings"
            data-testid="record-settings-trigger"
            className="size-4 cursor-pointer text-muted-foreground hover:text-foreground"
          />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="mr-2 w-80">
          <DropdownMenuLabel>{record.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <CopyLinkAction nodeId={record.id} item={DropdownMenuItem} />
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setShowShareDialog(true)}
          >
            <Share2 className="size-4" />
            Share to web
          </DropdownMenuItem>
          <DropdownMenuItem className="flex items-center gap-2" disabled>
            <Copy className="size-4" />
            Duplicate
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            data-testid="record-save-as-template-button"
            disabled={!canSaveAsTemplate || isSavingAsTemplate}
            onClick={() => {
              if (!canSaveAsTemplate || isSavingAsTemplate) {
                return;
              }

              saveAsTemplate({
                input: {
                  type: 'record.template.save',
                  userId: workspace.userId,
                  recordId: record.id,
                },
                onSuccess() {
                  toast.success('Saved as template');
                },
                onError(error) {
                  toast.error(error.message);
                },
              });
            }}
          >
            <FileStack className="size-4" />
            Save as template
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            data-testid="record-delete-button"
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
              collaboratorId={record.createdBy}
              date={record.createdAt}
            />
          </DropdownMenuItem>
          {record.updatedBy && record.updatedAt && (
            <Fragment>
              <DropdownMenuSeparator />
              <DropdownMenuLabel>Last updated by</DropdownMenuLabel>
              <DropdownMenuItem>
                <NodeCollaboratorAudit
                  collaboratorId={record.updatedBy}
                  date={record.updatedAt}
                />
              </DropdownMenuItem>
            </Fragment>
          )}
        </DropdownMenuContent>
      </DropdownMenu>
      <PageShareDialog
        page={record}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />
      <NodeDeleteDialog
        id={record.id}
        title="Are you sure you want delete this record?"
        description="This action cannot be undone. This record will no longer be accessible by you or others you've shared it with."
        open={showDeleteDialog}
        onOpenChange={setShowDeleteModal}
      />
    </Fragment>
  );
};
