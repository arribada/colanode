import { useNavigate } from '@tanstack/react-router';
import {
  Baseline,
  ClipboardCopy,
  Copy,
  FileDown,
  FileStack,
  FolderInput,
  History,
  Image,
  LetterText,
  ListTree,
  Lock,
  MoveHorizontal,
  Play,
  Printer,
  Settings,
  Share2,
  Trash2,
  Type,
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
import { PageShareDialog } from '@colanode/ui/components/pages/page-share-dialog';
import { PageUpdateDialog } from '@colanode/ui/components/pages/page-update-dialog';
import { PagePresentOverlay } from '@colanode/ui/components/pages/page-present-overlay';
import {
  DropdownMenu,
  DropdownMenuCheckboxItem,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import {
  downloadTextFile,
  getDocumentExporter,
  safeFileName,
} from '@colanode/ui/lib/document-export';
import { PrintExportDialog } from '@colanode/ui/components/documents/print/print-export-dialog';

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
  const [showShareDialog, setShowShareDialog] = useState(false);
  const [showPrintDialog, setShowPrintDialog] = useState(false);
  const [showPresentOverlay, setShowPresentOverlay] = useState(false);

  const canEdit = hasNodeRole(role, 'editor');
  const canDelete = hasNodeRole(role, 'editor');
  const canSaveAsTemplate = canEdit && !page.isTemplate;

  // Lock: only the page creator or a node admin ("privileged") may change it
  // (re-checked server-side in page.canUpdateAttributes). Reading options
  // (font / small text / TOC) are plain page attributes gated at editor level,
  // exactly like the existing width toggle. All null/absent => the defaults,
  // so pages created before this change are unaffected.
  const isPrivileged =
    page.createdBy === workspace.userId || hasNodeRole(role, 'admin');
  const lockMode = page.lockMode ?? 'open';
  const font = page.font ?? 'default';
  const smallText = page.smallText ?? false;
  const showToc = page.showToc ?? false;

  const setPageAttrs = (
    changes: Partial<
      Pick<
        LocalPageNode,
        'lockMode' | 'lockedBy' | 'font' | 'smallText' | 'showToc'
      >
    >
  ) => {
    const nodes = workspace.collections.nodes;
    if (!nodes.has(page.id)) {
      return;
    }
    nodes.update(page.id, (draft) => {
      if (draft.type !== 'page') {
        return;
      }
      Object.assign(draft, changes);
    });
  };

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
            onClick={() => setShowShareDialog(true)}
          >
            <Share2 className="size-4" />
            Share to web
          </DropdownMenuItem>
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
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!isPrivileged} className="gap-2">
              <Lock className="size-4" />
              <span>Lock page</span>
              <span className="ml-auto text-xs text-muted-foreground">
                {lockMode === 'open'
                  ? 'Off'
                  : lockMode === 'suggest'
                    ? 'Suggestions'
                    : 'Locked'}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={lockMode}
                onValueChange={(value) => {
                  if (!isPrivileged) {
                    return;
                  }
                  const mode = value as 'open' | 'suggest' | 'locked';
                  setPageAttrs({
                    lockMode: mode,
                    lockedBy: mode === 'open' ? null : workspace.userId,
                  });
                }}
              >
                <DropdownMenuRadioItem value="open">
                  Unlocked — anyone can edit
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="suggest">
                  Suggestions only — others propose edits
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="locked">
                  Locked — only owner &amp; admins
                </DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuSub>
            <DropdownMenuSubTrigger disabled={!canEdit} className="gap-2">
              <Type className="size-4" />
              <span>Font</span>
              <span className="ml-auto text-xs capitalize text-muted-foreground">
                {font}
              </span>
            </DropdownMenuSubTrigger>
            <DropdownMenuSubContent>
              <DropdownMenuRadioGroup
                value={font}
                onValueChange={(value) => {
                  if (!canEdit) {
                    return;
                  }
                  setPageAttrs({ font: value as 'default' | 'serif' | 'mono' });
                }}
              >
                <DropdownMenuRadioItem value="default">
                  Default
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="serif">
                  Serif
                </DropdownMenuRadioItem>
                <DropdownMenuRadioItem value="mono">Mono</DropdownMenuRadioItem>
              </DropdownMenuRadioGroup>
            </DropdownMenuSubContent>
          </DropdownMenuSub>
          <DropdownMenuCheckboxItem
            checked={smallText}
            disabled={!canEdit}
            onCheckedChange={(checked) => {
              if (!canEdit) {
                return;
              }
              setPageAttrs({ smallText: checked === true });
            }}
          >
            Small text
          </DropdownMenuCheckboxItem>
          <DropdownMenuCheckboxItem
            checked={showToc}
            disabled={!canEdit}
            onCheckedChange={(checked) => {
              if (!canEdit) {
                return;
              }
              setPageAttrs({ showToc: checked === true });
            }}
          >
            Table of contents
          </DropdownMenuCheckboxItem>
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
            onClick={() => setShowPrintDialog(true)}
          >
            <Printer className="size-4" />
            Print / PDF
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={async () => {
              const exporter = getDocumentExporter(page.id);
              if (!exporter) {
                toast.error('Open the page to copy its contents');
                return;
              }
              try {
                await navigator.clipboard.writeText(exporter.getMarkdown());
                toast.success('Page contents copied');
              } catch {
                toast.error('Could not copy to clipboard');
              }
            }}
          >
            <ClipboardCopy className="size-4" />
            Copy contents
          </DropdownMenuItem>
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => setShowPresentOverlay(true)}
          >
            <Play className="size-4" />
            Present
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
      <PageShareDialog
        page={page}
        open={showShareDialog}
        onOpenChange={setShowShareDialog}
      />
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
      <PrintExportDialog
        page={page}
        open={showPrintDialog}
        onOpenChange={setShowPrintDialog}
      />
      {showPresentOverlay && (
        <PagePresentOverlay
          pageId={page.id}
          name={page.name}
          onClose={() => setShowPresentOverlay(false)}
        />
      )}
    </Fragment>
  );
};
