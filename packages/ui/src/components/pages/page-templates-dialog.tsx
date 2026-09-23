// ABOUTME: Manage a space's page templates — list them, rename one, open it to
// ABOUTME: correct it, or delete it. The counterpart of the database one.
import { useNavigate } from '@tanstack/react-router';
import { Check, FileStack, SquarePen, Trash2, X } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { mapNodeAttributes } from '@colanode/client/lib';
import { LocalPageNode, LocalSpaceNode } from '@colanode/client/types';
import { NodeRole, hasNodeRole } from '@colanode/core';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { cn } from '@colanode/ui/lib/utils';

interface PageTemplatesDialogProps {
  space: LocalSpaceNode;
  role: NodeRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PageTemplatesDialog = ({
  space,
  role,
  open,
  onOpenChange,
}: PageTemplatesDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { mutate } = useMutation();
  const canEdit = hasNodeRole(role, 'editor');
  const [renaming, setRenaming] = useState<string | null>(null);
  const [draftName, setDraftName] = useState('');

  const templatesQuery = useLiveQuery(
    {
      type: 'page.template.list',
      userId: workspace.userId,
      spaceId: space.id,
    },
    { enabled: open }
  );
  const templates = templatesQuery.data ?? [];

  const openTemplate = (nodeId: string) => {
    onOpenChange(false);
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: { userId: workspace.userId, nodeId },
    });
  };

  const rename = (template: LocalPageNode) => {
    const name = draftName.trim();
    setRenaming(null);
    if (!canEdit || name.length === 0 || name === template.name) {
      return;
    }

    // A template is kept out of the browsing collection, so it is usually not
    // there to update in place. The rename goes through node.update with the
    // whole attribute set, which is what a move does too: node.update replaces
    // the attributes rather than merging into them, so dropping any of them
    // would be a silent delete.
    mutate({
      input: {
        type: 'node.update',
        userId: workspace.userId,
        nodeId: template.id,
        attributes: { ...mapNodeAttributes(template), name },
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const deleteTemplate = (templateId: string) => {
    if (!canEdit) {
      return;
    }

    mutate({
      input: {
        type: 'node.delete',
        userId: workspace.userId,
        nodeId: templateId,
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Page templates</DialogTitle>
          <DialogDescription>
            The templates of &quot;{space.name}&quot;, offered under &quot;New
            from template&quot;. A template is a copy of a page and everything
            under it, made with &quot;Save as template&quot; from a page&apos;s
            menu. Correcting one here changes what the next copy starts from,
            and leaves the pages already made from it alone.
          </DialogDescription>
        </DialogHeader>

        <div className="flex max-h-96 flex-col gap-1 overflow-y-auto">
          {templates.length === 0 && (
            <p className="px-2 py-6 text-center text-sm text-muted-foreground">
              No page templates in this space yet. Open a page, then &ldquo;Save
              as template&rdquo; in its menu.
            </p>
          )}

          {templates.map((template) => (
            <div
              key={template.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border border-transparent p-2 text-sm',
                renaming !== template.id && 'hover:bg-accent'
              )}
            >
              <span className="flex size-5 shrink-0 items-center justify-center">
                <FileStack className="size-4 text-muted-foreground" />
              </span>
              {renaming === template.id ? (
                <>
                  <Input
                    autoFocus
                    value={draftName}
                    onChange={(event) => setDraftName(event.target.value)}
                    onKeyDown={(event) => {
                      if (event.key === 'Enter') {
                        rename(template);
                      } else if (event.key === 'Escape') {
                        setRenaming(null);
                      }
                    }}
                    className="h-7 flex-1 text-sm"
                  />
                  <button
                    type="button"
                    aria-label="Save name"
                    onClick={() => rename(template)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <Check className="size-4" />
                  </button>
                  <button
                    type="button"
                    aria-label="Cancel rename"
                    onClick={() => setRenaming(null)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <X className="size-4" />
                  </button>
                </>
              ) : (
                <>
                  <button
                    type="button"
                    onClick={() => openTemplate(template.id)}
                    className="flex-1 truncate text-left"
                  >
                    {template.name || 'Untitled template'}
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="Rename template"
                      onClick={() => {
                        setDraftName(template.name ?? '');
                        setRenaming(template.id);
                      }}
                      className="shrink-0 text-xs text-muted-foreground hover:text-foreground"
                    >
                      Rename
                    </button>
                  )}
                  <button
                    type="button"
                    aria-label="Edit template"
                    onClick={() => openTemplate(template.id)}
                    className="shrink-0 text-muted-foreground hover:text-foreground"
                  >
                    <SquarePen className="size-4" />
                  </button>
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="Delete template"
                      onClick={() => deleteTemplate(template.id)}
                      className="shrink-0 text-muted-foreground hover:text-red-600"
                    >
                      <Trash2 className="size-4" />
                    </button>
                  )}
                </>
              )}
            </div>
          ))}
        </div>
      </DialogContent>
    </Dialog>
  );
};
