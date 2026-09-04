import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import {
  MoreHorizontal,
  Pencil,
  Plus,
  SquareArrowOutUpRight,
  Trash2,
  Upload,
} from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { CopyLinkAction } from '@colanode/ui/components/nodes/node-copy-link-action';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import { Button } from '@colanode/ui/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { openFileDialog } from '@colanode/ui/lib/files';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';
import { cn } from '@colanode/ui/lib/utils';

interface PageChildrenProps {
  nodeId: string;
  rootId: string;
  canEdit: boolean;
}

// A page is a container in its own right (Notion-style): this lists its
// navigable children — sub-pages, databases, folders, whiteboards and files —
// directly inside the page, and (when the viewer can edit) offers a subtle bar
// to create a child page or upload files without going to the sidebar. Any page
// can therefore become a "folder" just by adding children, which is why there
// is no separate folder type to create anymore.
export const PageChildren = ({ nodeId, rootId, canEdit }: PageChildrenProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const [renamingId, setRenamingId] = useState<string | null>(null);
  const [renameDraft, setRenameDraft] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<{
    id: string;
    label: string;
  } | null>(null);

  const childrenQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.parentId, nodeId))
        .where(({ nodes }) =>
          inArray(nodes.type, [
            'page',
            'database',
            'folder',
            'whiteboard',
            'file',
          ])
        )
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId, nodeId]
  );

  const children = childrenQuery.data ?? [];

  const startRename = (id: string, currentName: string) => {
    setRenameDraft(currentName);
    setRenamingId(id);
  };

  const commitRename = (id: string) => {
    const finalName = renameDraft.trim();
    if (finalName.length > 0) {
      workspace.collections.nodes.update(id, (draft) => {
        // Every listed child type carries a `name`; set it generically.
        (draft as { name?: string }).name = finalName;
      });
    }
    setRenamingId(null);
  };

  const handleCreatePage = () => {
    const childId = generateId(IdType.Page);
    const child: LocalPageNode = {
      id: childId,
      type: 'page',
      name: '',
      avatar: null,
      parentId: nodeId,
      rootId,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    try {
      workspace.collections.nodes.insert(child);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create page'
      );
      return;
    }

    navigate({ to: '$nodeId', params: { nodeId: childId } });
  };

  const handleUpload = async () => {
    const result = await openFileDialog();
    if (result.type === 'success') {
      result.files.forEach((tempFile) => {
        window.colanode
          .executeMutation({
            type: 'file.create',
            userId: workspace.userId,
            tempFileId: tempFile.id,
            parentId: nodeId,
          })
          .then((mutation) => {
            if (!mutation.success) {
              toast.error(mutation.error.message);
            }
          });
      });
    } else if (result.type === 'error') {
      toast.error(result.error);
    }
  };

  // Nothing to show and nothing the viewer can add: keep leaf pages unchanged.
  if (children.length === 0 && !canEdit) {
    return null;
  }

  return (
    <div className="mt-8 border-t pt-2" data-testid="page-children">
      {children.length > 0 && (
        <>
          <p className="px-1.5 py-1 text-sm text-muted-foreground">
            Sub-pages ({children.length})
          </p>
          <div className="flex flex-col gap-0.5 pt-1">
            {children.map((child) => {
              const { name, avatar, label } = getMentionNodeDisplay(child);
              const isRenaming = renamingId === child.id;
              return (
                <div
                  key={child.id}
                  className={cn(
                    'group/child flex flex-row items-center gap-2 rounded-md p-1.5',
                    !isRenaming && 'hover:bg-accent'
                  )}
                  data-testid={`page-child-${child.id}`}
                >
                  <Avatar
                    size="small"
                    id={child.id}
                    name={name}
                    avatar={avatar}
                  />
                  {isRenaming ? (
                    <input
                      // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the field the moment Rename is picked
                      autoFocus
                      value={renameDraft}
                      onChange={(event) => setRenameDraft(event.target.value)}
                      onKeyDown={(event) => {
                        if (event.key === 'Enter') {
                          event.preventDefault();
                          commitRename(child.id);
                        } else if (event.key === 'Escape') {
                          event.preventDefault();
                          setRenamingId(null);
                        }
                      }}
                      onBlur={() => commitRename(child.id)}
                      className="flex-1 bg-transparent text-sm outline-none"
                    />
                  ) : (
                    <Link
                      from="/workspace/$userId"
                      to="$nodeId"
                      params={{ nodeId: child.id }}
                      className="flex min-w-0 flex-1 flex-row items-center gap-2"
                    >
                      <span className="flex-1 truncate text-sm">{name}</span>
                    </Link>
                  )}
                  <span className="text-xs text-muted-foreground">{label}</span>
                  {canEdit && !isRenaming && (
                    <DropdownMenu>
                      <DropdownMenuTrigger asChild>
                        <button
                          type="button"
                          aria-label="Actions"
                          data-testid={`page-child-menu-${child.id}`}
                          className="flex size-6 items-center justify-center rounded-sm text-muted-foreground opacity-0 hover:bg-background hover:text-foreground group-hover/child:opacity-100 data-[state=open]:opacity-100"
                        >
                          <MoreHorizontal className="size-4" />
                        </button>
                      </DropdownMenuTrigger>
                      <DropdownMenuContent align="end">
                        <DropdownMenuItem asChild>
                          <Link
                            from="/workspace/$userId"
                            to="$nodeId"
                            params={{ nodeId: child.id }}
                            className="flex items-center gap-2 cursor-pointer"
                          >
                            <SquareArrowOutUpRight className="size-4" />
                            Open
                          </Link>
                        </DropdownMenuItem>
                        <DropdownMenuItem
                          onSelect={() => startRename(child.id, name)}
                        >
                          <Pencil className="size-4" />
                          Rename
                        </DropdownMenuItem>
                        <CopyLinkAction
                          nodeId={child.id}
                          item={DropdownMenuItem}
                        />
                        <DropdownMenuSeparator />
                        <DropdownMenuItem
                          className="text-destructive focus:text-destructive"
                          onSelect={() =>
                            setDeleteTarget({ id: child.id, label })
                          }
                        >
                          <Trash2 className="size-4" />
                          Delete
                        </DropdownMenuItem>
                      </DropdownMenuContent>
                    </DropdownMenu>
                  )}
                </div>
              );
            })}
          </div>
        </>
      )}
      {canEdit && (
        <div className="flex flex-row gap-1 pt-1">
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleCreatePage}
          >
            <Plus className="mr-1.5 size-4" /> New page
          </Button>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            onClick={handleUpload}
          >
            <Upload className="mr-1.5 size-4" /> Upload
          </Button>
        </div>
      )}
      {deleteTarget && (
        <NodeDeleteDialog
          id={deleteTarget.id}
          title={`Delete this ${deleteTarget.label.toLowerCase()}?`}
          description="This action cannot be undone. It will no longer be accessible by you or others you've shared it with."
          open={deleteTarget != null}
          onOpenChange={(open) => {
            if (!open) {
              setDeleteTarget(null);
            }
          }}
        />
      )}
    </div>
  );
};
