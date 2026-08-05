// ABOUTME: Manage a database's record templates — list them, pick the default
// ABOUTME: used by "New record", create a blank template, open or delete one.
import { useNavigate } from '@tanstack/react-router';
import { Check, FileStack, Plus, SquarePen, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import { IdType, NodeRole, generateId, hasNodeRole } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { cn } from '@colanode/ui/lib/utils';

interface DatabaseTemplatesDialogProps {
  database: LocalDatabaseNode;
  role: NodeRole;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

// Templates manager for a database. The "default" template is stored on the
// database node (`defaultTemplateId`); when set, the plain "New record" action
// clones it instead of inserting a blank record (see view.tsx createRecord).
export const DatabaseTemplatesDialog = ({
  database,
  role,
  open,
  onOpenChange,
}: DatabaseTemplatesDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate();
  const { mutate } = useMutation();
  const canEdit = hasNodeRole(role, 'editor');

  const templatesQuery = useLiveQuery({
    type: 'record.template.list',
    userId: workspace.userId,
    databaseId: database.id,
  });
  const templates = templatesQuery.data ?? [];
  const defaultTemplateId = database.defaultTemplateId ?? null;

  const setDefault = (templateId: string | null) => {
    if (!canEdit) {
      return;
    }

    const nodes = workspace.collections.nodes;
    if (!nodes.has(database.id)) {
      return;
    }

    nodes.update(database.id, (draft) => {
      if (draft.type !== 'database') {
        return;
      }

      draft.defaultTemplateId = templateId;
    });
  };

  const openRecord = (nodeId: string) => {
    onOpenChange(false);
    navigate({
      to: '/workspace/$userId/$nodeId',
      params: { userId: workspace.userId, nodeId },
    });
  };

  const createBlankTemplate = () => {
    if (!canEdit) {
      return;
    }

    const recordId = generateId(IdType.Record);
    const record: LocalRecordNode = {
      id: recordId,
      type: 'record',
      parentId: database.id,
      rootId: database.rootId,
      databaseId: database.id,
      name: '',
      fields: {},
      isTemplate: true,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    workspace.collections.nodes.insert(record);
    openRecord(recordId);
  };

  const deleteTemplate = (templateId: string) => {
    if (!canEdit) {
      return;
    }

    if (defaultTemplateId === templateId) {
      setDefault(null);
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
          <DialogTitle>Templates</DialogTitle>
          <DialogDescription>
            Pick the template used by default when you add a record, or create a
            new one. A template pre-fills a record&apos;s fields and its content.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-1">
          <button
            type="button"
            disabled={!canEdit}
            onClick={() => setDefault(null)}
            className={cn(
              'flex w-full items-center gap-2 rounded-md border p-2 text-left text-sm',
              defaultTemplateId === null
                ? 'border-primary bg-accent'
                : 'border-transparent hover:bg-accent'
            )}
          >
            <span className="flex size-5 items-center justify-center">
              {defaultTemplateId === null && <Check className="size-4" />}
            </span>
            <span className="flex-1">
              <span className="font-medium">Blank record</span>
              <span className="block text-xs text-muted-foreground">
                No template — start from an empty record.
              </span>
            </span>
          </button>

          {templates.map((template) => (
            <div
              key={template.id}
              className={cn(
                'flex w-full items-center gap-2 rounded-md border p-2 text-sm',
                defaultTemplateId === template.id
                  ? 'border-primary bg-accent'
                  : 'border-transparent hover:bg-accent'
              )}
            >
              <button
                type="button"
                disabled={!canEdit}
                onClick={() => setDefault(template.id)}
                className="flex flex-1 items-center gap-2 overflow-hidden text-left"
              >
                <span className="flex size-5 shrink-0 items-center justify-center">
                  {defaultTemplateId === template.id ? (
                    <Check className="size-4" />
                  ) : (
                    <FileStack className="size-4 text-muted-foreground" />
                  )}
                </span>
                <span className="flex-1 truncate">
                  {template.name || 'Untitled template'}
                  {defaultTemplateId === template.id && (
                    <span className="ml-2 rounded bg-primary/10 px-1.5 py-0.5 text-xs text-primary">
                      Default
                    </span>
                  )}
                </span>
              </button>
              <button
                type="button"
                aria-label="Edit template"
                onClick={() => openRecord(template.id)}
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
            </div>
          ))}

          {templates.length === 0 && (
            <p className="px-2 py-4 text-center text-sm text-muted-foreground">
              No templates yet. Create one below, or open a record and choose
              &ldquo;Save as template&rdquo;.
            </p>
          )}
        </div>

        {canEdit && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="w-full"
            onClick={createBlankTemplate}
          >
            <Plus className="size-4" />
            New blank template
          </Button>
        )}
      </DialogContent>
    </Dialog>
  );
};
