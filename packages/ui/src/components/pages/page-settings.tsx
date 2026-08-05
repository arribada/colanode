import { useNavigate } from '@tanstack/react-router';
import {
  Copy,
  FileDown,
  FileStack,
  FolderInput,
  History,
  Image,
  LetterText,
  MoveHorizontal,
  Printer,
  Settings,
  Trash2,
  Users,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { LocalNode, LocalPageNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import { NodeCollaboratorAudit } from '@colanode/ui/components/collaborators/node-collaborator-audit';
import { NodeCollaboratorsDialog } from '@colanode/ui/components/collaborators/node-collaborators-dialog';
import { DocumentHistoryDialog } from '@colanode/ui/components/documents/document-history';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
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
import {
  downloadTextFile,
  getDocumentExporter,
  safeFileName,
} from '@colanode/ui/lib/document-export';
import { printHtmlDocument } from '@colanode/ui/lib/print';

interface PageSettingsProps {
  page: LocalPageNode;
  nodes: LocalNode[];
  role: NodeRole;
}

export const PageSettings = ({ page, nodes, role }: PageSettingsProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate: duplicatePage, isPending: isDuplicating } = useMutation();
  const { mutate: saveAsTemplate, isPending: isSavingAsTemplate } =
    useMutation();
  const [showUpdateDialog, setShowUpdateDialog] = useState(false);
  const [showMoveDialog, setShowMoveDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteModal] = useState(false);
  const [showCollaboratorsDialog, setShowCollaboratorsDialog] = useState(false);
  const [showHistoryDialog, setShowHistoryDialog] = useState(false);

  const canEdit = hasNodeRole(role, 'editor');
  const canDelete = hasNodeRole(role, 'editor');
  const canSaveAsTemplate = canEdit && !page.isTemplate;

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Settings className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="mr-2 w-80">
          <DropdownMenuLabel>{page.name}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          <CopyLinkAction nodeId={page.id} item={DropdownMenuItem} />
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

              const nodes = workspace.collections.nodes;
              if (!nodes.has(page.id)) {
                return;
              }

              nodes.update(page.id, (draft) => {
                if (draft.type !== 'page') {
                  return;
                }

                draft.fullWidth = !(draft.fullWidth ?? false);
              });
            }}
          >
            <MoveHorizontal className="size-4" />
            {(page.fullWidth ?? false) ? 'Fixed width' : 'Full width'}
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
            data-testid="page-save-as-template-button"
            disabled={!canSaveAsTemplate || isSavingAsTemplate}
            onClick={() => {
              if (!canSaveAsTemplate || isSavingAsTemplate) {
                return;
              }

              saveAsTemplate({
                input: {
                  type: 'page.template.save',
                  userId: workspace.userId,
                  pageId: page.id,
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
            onClick={() => setShowCollaboratorsDialog(true)}
          >
            <Users className="size-4" />
            Collaborators
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              setShowHistoryDialog(true);
            }}
          >
            <History className="size-4" />
            Version history
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              const exporter = getDocumentExporter(page.id);
              if (!exporter) {
                toast.error('Open the page to export it');
                return;
              }
              downloadTextFile(
                exporter.getMarkdown(),
                `${safeFileName(page.name)}.md`,
                'text/markdown'
              );
            }}
          >
            <FileDown className="size-4" />
            Export as Markdown
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              const exporter = getDocumentExporter(page.id);
              const title = page.name || 'Document';
              const heading = title
                .replace(/&/g, '&amp;')
                .replace(/</g, '&lt;')
                .replace(/>/g, '&gt;');
              printHtmlDocument({
                title,
                bodyHtml:
                  `<h1>${heading}</h1>` +
                  (exporter ? exporter.getRenderedHtml() : ''),
              });
            }}
          >
            <Printer className="size-4" />
            Print / PDF
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
      <NodeCollaboratorsDialog
        node={page}
        nodes={nodes}
        role={role}
        open={showCollaboratorsDialog}
        onOpenChange={setShowCollaboratorsDialog}
      />
      <DocumentHistoryDialog
        documentId={page.id}
        name={page.name}
        canEdit={canEdit}
        open={showHistoryDialog}
        onOpenChange={setShowHistoryDialog}
      />
    </Fragment>
  );
};
