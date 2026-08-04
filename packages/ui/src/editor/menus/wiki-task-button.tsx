// ABOUTME: Selection-toolbar button that turns the selected text into a Wiki
// ABOUTME: Task record (linked to the current page, assigned to a technical leader).
import { eq, useLiveQuery } from '@tanstack/react-db';
import { Editor } from '@tiptap/core';
import { ListTodo } from 'lucide-react';
import { useMemo, useState } from 'react';
import { toast } from 'sonner';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import {
  FieldValue,
  generateId,
  IdType,
  SelectFieldAttributes,
  SelectOptionAttributes,
} from '@colanode/core';
import { SelectOptionBadge } from '@colanode/ui/components/databases/fields/select-option-badge';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Label } from '@colanode/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface WikiTaskButtonProps {
  editor: Editor;
  // The node id of the page being edited; stored on the new task so it links
  // back to the page the selection came from.
  pageId: string;
}

// The shared "Wiki Tasks" registry. Resolved at runtime (by id, then by name)
// so a recreated registry with a fresh id still works.
const WIKI_TASKS_DB_ID = '01kypqr1dc2dw5wbydtfave3emdb';

const sortByIndex = (
  options: Record<string, SelectOptionAttributes> | undefined
): SelectOptionAttributes[] =>
  Object.values(options ?? {}).sort((a, b) => a.index.localeCompare(b.index));

export const WikiTaskButton = ({ editor, pageId }: WikiTaskButtonProps) => {
  const workspace = useWorkspace();

  const [isOpen, setIsOpen] = useState(false);
  const [isCreating, setIsCreating] = useState(false);
  const [title, setTitle] = useState('');
  const [assigneeOptionId, setAssigneeOptionId] = useState<string | null>(null);
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [priorityOptionId, setPriorityOptionId] = useState<string | null>(null);
  const [priorityPickerOpen, setPriorityPickerOpen] = useState(false);

  // Every database node; the Wiki Tasks registry is picked out of it below.
  const databaseListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'database')),
    [workspace.userId]
  );

  const tasksDb = useMemo<LocalDatabaseNode | null>(() => {
    const databases = (databaseListQuery.data ?? []).map(
      (node) => node as LocalDatabaseNode
    );
    return (
      databases.find((db) => db.id === WIKI_TASKS_DB_ID) ??
      databases.find((db) =>
        (db.name ?? '').toLowerCase().includes('wiki tasks')
      ) ??
      null
    );
  }, [databaseListQuery.data]);

  // The registry query has resolved and there is genuinely no Wiki Tasks
  // database; distinct from "still loading" so the button doesn't flash.
  const dbMissing = databaseListQuery.data != null && tasksDb == null;

  const fields = useMemo(
    () => Object.values(tasksDb?.fields ?? {}),
    [tasksDb]
  );

  // Assignee = the first select field whose name reads like a leader/owner.
  // Resolved exactly the way the home "Your wiki tasks" section resolves it, so
  // whatever field the home matches on is the field this button writes into.
  const leaderField = useMemo<SelectFieldAttributes | null>(
    () =>
      fields.find(
        (field): field is SelectFieldAttributes =>
          field.type === 'select' &&
          (field.name.toLowerCase().includes('lead') ||
            field.name.toLowerCase().includes('owner') ||
            field.name.toLowerCase().includes('responsa'))
      ) ?? null,
    [fields]
  );

  const statusField = useMemo<SelectFieldAttributes | null>(
    () =>
      fields.find(
        (field): field is SelectFieldAttributes =>
          field.type === 'select' &&
          field.name.toLowerCase().includes('status')
      ) ?? null,
    [fields]
  );

  const priorityField = useMemo<SelectFieldAttributes | null>(
    () =>
      fields.find(
        (field): field is SelectFieldAttributes =>
          field.type === 'select' &&
          field.name.toLowerCase().includes('priorit')
      ) ?? null,
    [fields]
  );

  // The "what is needed" detail text field.
  const needField = useMemo(
    () =>
      fields.find(
        (field) =>
          field.type === 'text' && field.name.toLowerCase().includes('need')
      ) ??
      fields.find((field) => field.type === 'text') ??
      null,
    [fields]
  );

  // The url field that deep-links back to the source page.
  const pageField = useMemo(
    () =>
      fields.find(
        (field) =>
          field.type === 'url' &&
          (field.name.toLowerCase().includes('page') ||
            field.name.toLowerCase().includes('wiki'))
      ) ??
      fields.find((field) => field.type === 'url') ??
      null,
    [fields]
  );

  // The initial/open status option: match "Open"/"To do" by name, else fall
  // back to the lowest-index option (the first column of the board).
  const openStatusOption = useMemo<SelectOptionAttributes | null>(() => {
    if (!statusField) {
      return null;
    }
    const options = sortByIndex(statusField.options);
    if (options.length === 0) {
      return null;
    }
    return (
      options.find((option) =>
        /^(open|to\s*-?\s*do|todo)$/i.test(option.name.trim())
      ) ??
      options.find((option) => /open|to\s*do|todo/i.test(option.name)) ??
      options[0] ??
      null
    );
  }, [statusField]);

  const assigneeOptions = useMemo(
    () => (leaderField ? sortByIndex(leaderField.options) : []),
    [leaderField]
  );
  const priorityOptions = useMemo(
    () => (priorityField ? sortByIndex(priorityField.options) : []),
    [priorityField]
  );

  const selectedAssignee = assigneeOptionId
    ? (leaderField?.options ?? {})[assigneeOptionId] ?? null
    : null;
  const selectedPriority = priorityOptionId
    ? (priorityField?.options ?? {})[priorityOptionId] ?? null
    : null;

  const openDialog = () => {
    if (!tasksDb) {
      toast.error('The Wiki Tasks database could not be found.');
      return;
    }
    // Snapshot the selection now: opening the dialog moves focus off the editor,
    // which clears the ProseMirror selection.
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc.textBetween(from, to, '\n', ' ');
    setTitle(selectedText.trim());
    setAssigneeOptionId(null);
    setPriorityOptionId(null);
    setIsOpen(true);
  };

  const handleCreate = () => {
    if (!tasksDb) {
      toast.error('The Wiki Tasks database could not be found.');
      return;
    }
    const trimmed = title.trim();
    if (trimmed.length === 0) {
      return;
    }

    setIsCreating(true);
    try {
      const recordFields: Record<string, FieldValue> = {};

      if (needField) {
        recordFields[needField.id] = { type: 'text', value: trimmed };
      }
      if (statusField && openStatusOption) {
        recordFields[statusField.id] = {
          type: 'string',
          value: openStatusOption.id,
        };
      }
      if (leaderField && assigneeOptionId) {
        recordFields[leaderField.id] = {
          type: 'string',
          value: assigneeOptionId,
        };
      }
      if (priorityField && priorityOptionId) {
        recordFields[priorityField.id] = {
          type: 'string',
          value: priorityOptionId,
        };
      }
      if (pageField) {
        // Same deep-link shape as "Copy link": {origin}/{workspaceId}/{nodeId},
        // falling back to the canonical origin when running under Electron.
        const origin =
          typeof window !== 'undefined' &&
          (window.location.protocol === 'http:' ||
            window.location.protocol === 'https:')
            ? window.location.origin
            : 'https://docs.arribada.org';
        recordFields[pageField.id] = {
          type: 'string',
          value: `${origin}/${workspace.workspaceId}/${pageId}`,
        };
      }

      const record: LocalRecordNode = {
        id: generateId(IdType.Record),
        type: 'record',
        parentId: tasksDb.id,
        rootId: tasksDb.rootId,
        databaseId: tasksDb.id,
        name: trimmed,
        fields: recordFields,
        avatar: null,
        createdAt: new Date().toISOString(),
        createdBy: workspace.userId,
        updatedAt: null,
        updatedBy: null,
        localRevision: '0',
        serverRevision: '0',
      };

      workspace.collections.nodes.insert(record);
      toast.success('Task created');
      setIsOpen(false);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create the task'
      );
    } finally {
      setIsCreating(false);
    }
  };

  return (
    <>
      <button
        type="button"
        aria-label="Create task"
        title={
          dbMissing ? 'Wiki Tasks database not found' : 'Create task'
        }
        data-testid="editor-toolbar-wiki-task"
        disabled={dbMissing}
        className="flex h-9 w-9 sm:h-8 sm:w-8 items-center justify-center rounded-md cursor-pointer hover:bg-input disabled:cursor-not-allowed disabled:opacity-50"
        onClick={openDialog}
      >
        <ListTodo className="size-4" />
      </button>

      <Dialog
        open={isOpen}
        onOpenChange={(open) => {
          if (!isCreating) {
            setIsOpen(open);
          }
        }}
      >
        <DialogContent className="w-full max-w-md">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <ListTodo className="size-4 text-primary" />
              Create task
            </DialogTitle>
            <DialogDescription>
              Create a Wiki Task from the selection, linked to this page.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4 py-1">
            <div className="flex flex-col gap-1.5">
              <Label htmlFor="wiki-task-title">What is needed</Label>
              <Textarea
                id="wiki-task-title"
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                placeholder="Describe what needs defining…"
                className="min-h-24"
                autoFocus
              />
            </div>

            {assigneeOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Assignee</Label>
                <Popover
                  open={assigneePickerOpen}
                  onOpenChange={setAssigneePickerOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                    >
                      {selectedAssignee ? (
                        <SelectOptionBadge
                          name={selectedAssignee.name}
                          color={selectedAssignee.color}
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          Unassigned
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-1">
                    <div className="flex max-h-64 flex-col gap-0.5 overflow-auto">
                      <button
                        type="button"
                        aria-pressed={assigneeOptionId === null}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                        onClick={() => {
                          setAssigneeOptionId(null);
                          setAssigneePickerOpen(false);
                        }}
                      >
                        Unassigned
                      </button>
                      {assigneeOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={option.id === assigneeOptionId}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            setAssigneeOptionId(option.id);
                            setAssigneePickerOpen(false);
                          }}
                        >
                          <SelectOptionBadge
                            name={option.name}
                            color={option.color}
                          />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}

            {priorityOptions.length > 0 && (
              <div className="flex flex-col gap-1.5">
                <Label>Priority</Label>
                <Popover
                  open={priorityPickerOpen}
                  onOpenChange={setPriorityPickerOpen}
                >
                  <PopoverTrigger asChild>
                    <button
                      type="button"
                      className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                    >
                      {selectedPriority ? (
                        <SelectOptionBadge
                          name={selectedPriority.name}
                          color={selectedPriority.color}
                        />
                      ) : (
                        <span className="text-muted-foreground">
                          No priority
                        </span>
                      )}
                    </button>
                  </PopoverTrigger>
                  <PopoverContent className="w-72 p-1">
                    <div className="flex max-h-64 flex-col gap-0.5 overflow-auto">
                      <button
                        type="button"
                        aria-pressed={priorityOptionId === null}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                        onClick={() => {
                          setPriorityOptionId(null);
                          setPriorityPickerOpen(false);
                        }}
                      >
                        No priority
                      </button>
                      {priorityOptions.map((option) => (
                        <button
                          key={option.id}
                          type="button"
                          aria-pressed={option.id === priorityOptionId}
                          className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                          onClick={() => {
                            setPriorityOptionId(option.id);
                            setPriorityPickerOpen(false);
                          }}
                        >
                          <SelectOptionBadge
                            name={option.name}
                            color={option.color}
                          />
                        </button>
                      ))}
                    </div>
                  </PopoverContent>
                </Popover>
              </div>
            )}
          </div>

          <DialogFooter>
            <Button
              type="button"
              variant="outline"
              onClick={() => setIsOpen(false)}
              disabled={isCreating}
            >
              Cancel
            </Button>
            <Button
              type="button"
              onClick={handleCreate}
              disabled={isCreating || !tasksDb || title.trim().length === 0}
            >
              {isCreating && <Spinner className="mr-2 size-4" />}
              Create task
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </>
  );
};
