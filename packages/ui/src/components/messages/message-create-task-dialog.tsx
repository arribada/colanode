import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { useEffect, useState } from 'react';
import { toast } from 'sonner';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import {
  CollaboratorFieldAttributes,
  extractBlockTexts,
  extractNodeRole,
  FieldValue,
  generateId,
  hasNodeRole,
  IdType,
  SelectFieldAttributes,
  TextFieldAttributes,
} from '@colanode/core';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SelectOptionBadge } from '@colanode/ui/components/databases/fields/select-option-badge';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { Label } from '@colanode/ui/components/ui/label';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Separator } from '@colanode/ui/components/ui/separator';
import { UserSearch } from '@colanode/ui/components/users/user-search';
import { useConversation } from '@colanode/ui/contexts/conversation';
import { useMessage } from '@colanode/ui/contexts/message';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface MessageCreateTaskDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const MessageCreateTaskDialog = ({
  open,
  onOpenChange,
}: MessageCreateTaskDialogProps) => {
  const workspace = useWorkspace();
  const message = useMessage();
  const conversation = useConversation();
  const { mutate, isPending } = useMutation();

  const [taskDatabaseId, setTaskDatabaseId] = useMetadata<string>(
    workspace.userId,
    `task.database.${conversation.id}`
  );

  const rawText = extractBlockTexts(message.id, message.content ?? null) ?? '';

  const [name, setName] = useState('');
  const [selectedStatusOptionId, setSelectedStatusOptionId] = useState<
    string | null
  >(null);
  const [selectedAssigneeId, setSelectedAssigneeId] = useState<string | null>(
    null
  );
  const [assigneePickerOpen, setAssigneePickerOpen] = useState(false);
  const [messageFieldId, setMessageFieldId] = useState<string | null>(null);

  // Query all database nodes
  const databaseListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'database'))
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId]
  );

  // Query all space nodes for role derivation
  const spaceListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'space')),
    [workspace.userId]
  );

  const spaces = spaceListQuery.data ?? [];

  // Filter databases where user has collaborator+ role (record.canCreate requires it).
  // shortcut: role is derived from the space node only, not the full ancestor chain.
  // A user granted collaborator on an intermediate folder/database (but not the space)
  // won't see that database here — they simply can't create a task into it via this
  // dialog (no orphan record, the server would still enforce canCreate). Upgrade path:
  // walk each database's parentId chain from collections and pass it to extractNodeRole.
  const allowedDatabases = (databaseListQuery.data ?? [])
    .map((node) => node as LocalDatabaseNode)
    .filter((db) => {
      const space = spaces.find((s) => s.id === db.rootId);
      if (!space) return false;
      const role = extractNodeRole(space, workspace.userId);
      return role !== null && hasNodeRole(role, 'collaborator');
    });

  const selectedDatabase = taskDatabaseId
    ? allowedDatabases.find((db) => db.id === taskDatabaseId) ?? null
    : null;

  // Derive status field (first select field by index)
  const statusField: SelectFieldAttributes | null = selectedDatabase
    ? (Object.values(selectedDatabase.fields)
        .filter((f) => f.type === 'select')
        .sort((a, b) => a.index.localeCompare(b.index))[0] as
        | SelectFieldAttributes
        | undefined) ?? null
    : null;

  // Derive assignee field (first collaborator field by index)
  const assigneeField: CollaboratorFieldAttributes | null = selectedDatabase
    ? (Object.values(selectedDatabase.fields)
        .filter((f) => f.type === 'collaborator')
        .sort((a, b) => a.index.localeCompare(b.index))[0] as
        | CollaboratorFieldAttributes
        | undefined) ?? null
    : null;

  // Text fields the message body can be written into (user picks the column).
  const textFields: TextFieldAttributes[] = selectedDatabase
    ? (Object.values(selectedDatabase.fields)
        .filter((f) => f.type === 'text')
        .sort((a, b) => a.index.localeCompare(b.index)) as TextFieldAttributes[])
    : [];

  const defaultMessageFieldId = textFields[0]?.id ?? null;

  // Default the message target to the first text field whenever the database
  // (and therefore its text fields) changes; the user's manual choice sticks.
  useEffect(() => {
    setMessageFieldId(defaultMessageFieldId);
  }, [taskDatabaseId, defaultMessageFieldId]);

  const selectedMessageField = messageFieldId
    ? textFields.find((f) => f.id === messageFieldId) ?? null
    : null;

  const statusOptions = statusField
    ? Object.values(statusField.options ?? {}).sort((a, b) =>
        a.index.localeCompare(b.index)
      )
    : [];

  const selectedStatusOption = selectedStatusOptionId
    ? (statusField?.options ?? {})[selectedStatusOptionId]
    : null;

  // Query assignee user data for display
  const assigneeIds: string[] = selectedAssigneeId ? [selectedAssigneeId] : [];
  const assigneeQuery = useLiveQuery(
    (q) =>
      q
        .from({ users: workspace.collections.users })
        .where(({ users }) => inArray(users.id, assigneeIds))
        .select(({ users }) => ({
          id: users.id,
          name: users.name,
          avatar: users.avatar,
        })),
    [workspace.userId, selectedAssigneeId]
  );
  const assigneeUser = assigneeQuery.data?.[0] ?? null;

  const handleDatabaseSelect = (db: LocalDatabaseNode) => {
    setTaskDatabaseId(db.id);
    setSelectedStatusOptionId(null);
    setSelectedAssigneeId(null);
  };

  const handleCreate = () => {
    if (!selectedDatabase) return;

    const recordId = generateId(IdType.Record);
    const fields: Record<string, FieldValue> = {};

    if (statusField && selectedStatusOptionId) {
      fields[statusField.id] = { type: 'string', value: selectedStatusOptionId };
    }
    if (assigneeField && selectedAssigneeId) {
      fields[assigneeField.id] = {
        type: 'string_array',
        value: [selectedAssigneeId],
      };
    }
    if (messageFieldId && rawText) {
      fields[messageFieldId] = { type: 'text', value: rawText };
    }

    const record: LocalRecordNode = {
      id: recordId,
      type: 'record',
      parentId: selectedDatabase.id,
      rootId: selectedDatabase.rootId,
      databaseId: selectedDatabase.id,
      name,
      fields,
      sourceMessageId: message.id,
      avatar: null,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    workspace.collections.nodes.insert(record);

    mutate({
      input: {
        type: 'message.task.set',
        userId: workspace.userId,
        messageId: message.id,
        taskId: recordId,
      },
      onSuccess: (output) => {
        // The mediator reports success when the handler does not throw, but the
        // backlink itself can still fail (author-only canUpdateAttributes →
        // unauthorized/not_found/failed). The record already exists either way,
        // so surface the failure instead of silently closing.
        if (!output.success) {
          toast.error('Task created, but linking failed');
        }
        onOpenChange(false);
      },
      onError: () => {
        toast.error('Task created, but linking failed');
        onOpenChange(false);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="w-full max-w-md">
        <DialogHeader>
          <DialogTitle>Create task from message</DialogTitle>
        </DialogHeader>

        <div className="flex flex-col gap-4 py-2">
          {/* Database picker */}
          <div className="flex flex-col gap-1.5">
            <Label>Database</Label>
            {allowedDatabases.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No databases available. You need collaborator access to a
                database to create tasks.
              </p>
            ) : (
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                  >
                    {selectedDatabase ? (
                      <>
                        <Avatar
                          id={selectedDatabase.id}
                          name={selectedDatabase.name}
                          avatar={selectedDatabase.avatar}
                          className="size-4"
                        />
                        <span>{selectedDatabase.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Select database...
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-1">
                  <div className="flex flex-col gap-0.5">
                    {allowedDatabases.map((db) => (
                      <button
                        key={db.id}
                        type="button"
                        aria-pressed={db.id === taskDatabaseId}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => handleDatabaseSelect(db)}
                      >
                        <Avatar
                          id={db.id}
                          name={db.name}
                          avatar={db.avatar}
                          className="size-4"
                        />
                        <span>{db.name}</span>
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            )}
          </div>

          {/* Task name */}
          <div className="flex flex-col gap-1.5">
            <div className="flex items-center justify-between">
              <Label htmlFor="task-name">Name</Label>
              {rawText && (
                <button
                  type="button"
                  className="text-xs text-muted-foreground hover:text-foreground"
                  onClick={() => setName(rawText.slice(0, 120))}
                >
                  Use message text
                </button>
              )}
            </div>
            <Input
              id="task-name"
              // eslint-disable-next-line jsx-a11y/no-autofocus -- intentional: primary field in "Create task from message" dialog, focus expected on open
              autoFocus
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="Task name..."
            />
          </div>

          {/* Where the message body goes (text-field picker) */}
          {selectedDatabase && textFields.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Add message to</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                  >
                    {selectedMessageField ? (
                      <span>{selectedMessageField.name}</span>
                    ) : (
                      <span className="text-muted-foreground">
                        Don&apos;t add the message
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1">
                  <div className="flex flex-col gap-0.5">
                    <button
                      type="button"
                      aria-pressed={messageFieldId === null}
                      className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm text-muted-foreground hover:bg-accent"
                      onClick={() => setMessageFieldId(null)}
                    >
                      Don&apos;t add the message
                    </button>
                    {textFields.map((field) => (
                      <button
                        key={field.id}
                        type="button"
                        aria-pressed={field.id === messageFieldId}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => setMessageFieldId(field.id)}
                      >
                        {field.name}
                      </button>
                    ))}
                  </div>
                </PopoverContent>
              </Popover>
            </div>
          )}

          {/* Status picker (optional - only if DB has a select field) */}
          {statusField && statusOptions.length > 0 && (
            <div className="flex flex-col gap-1.5">
              <Label>Status</Label>
              <Popover>
                <PopoverTrigger asChild>
                  <button
                    type="button"
                    className="flex w-full items-center gap-2 rounded-md border border-input bg-background px-3 py-2 text-sm hover:bg-accent"
                  >
                    {selectedStatusOption ? (
                      <SelectOptionBadge
                        name={selectedStatusOption.name}
                        color={selectedStatusOption.color}
                      />
                    ) : (
                      <span className="text-muted-foreground">
                        Select status...
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-64 p-1">
                  <div className="flex flex-col gap-0.5">
                    {statusOptions.map((option) => (
                      <button
                        key={option.id}
                        type="button"
                        aria-pressed={option.id === selectedStatusOptionId}
                        className="flex w-full items-center gap-2 rounded-md px-2 py-1.5 text-sm hover:bg-accent"
                        onClick={() => {
                          setSelectedStatusOptionId(
                            selectedStatusOptionId === option.id
                              ? null
                              : option.id
                          );
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

          {/* Assignee picker (optional - only if DB has a collaborator field) */}
          {assigneeField && (
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
                    {assigneeUser ? (
                      <>
                        <Avatar
                          id={assigneeUser.id}
                          name={assigneeUser.name}
                          avatar={assigneeUser.avatar}
                          className="size-4"
                        />
                        <span>{assigneeUser.name}</span>
                      </>
                    ) : (
                      <span className="text-muted-foreground">
                        Select assignee...
                      </span>
                    )}
                  </button>
                </PopoverTrigger>
                <PopoverContent className="w-80 p-0">
                  {assigneeUser && (
                    <>
                      <div className="flex items-center gap-2 p-2">
                        <Avatar
                          id={assigneeUser.id}
                          name={assigneeUser.name}
                          avatar={assigneeUser.avatar}
                          className="size-6"
                        />
                        <span className="text-sm">{assigneeUser.name}</span>
                        <button
                          type="button"
                          className="ml-auto text-xs text-muted-foreground hover:text-foreground"
                          onClick={() => setSelectedAssigneeId(null)}
                        >
                          Remove
                        </button>
                      </div>
                      <Separator />
                    </>
                  )}
                  <UserSearch
                    exclude={selectedAssigneeId ? [selectedAssigneeId] : []}
                    onSelect={(user) => {
                      setSelectedAssigneeId(user.id);
                      setAssigneePickerOpen(false);
                    }}
                  />
                </PopoverContent>
              </Popover>
            </div>
          )}
        </div>

        <DialogFooter>
          <button
            type="button"
            className="rounded-md border border-input bg-background px-4 py-2 text-sm hover:bg-accent"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </button>
          <button
            type="button"
            className="rounded-md bg-primary px-4 py-2 text-sm text-primary-foreground hover:bg-primary/90 disabled:opacity-50"
            disabled={!selectedDatabase || !name.trim() || isPending}
            onClick={handleCreate}
          >
            Create task
          </button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
