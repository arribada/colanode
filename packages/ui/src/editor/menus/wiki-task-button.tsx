// ABOUTME: Selection-toolbar button that turns the selected text into a Wiki
// ABOUTME: Task record (selection -> description) and opens it in the record view
// ABOUTME: (like "Add record") so the user fills the title/action + assignee.
import { eq, useLiveQuery } from '@tanstack/react-db';
import { useNavigate } from '@tanstack/react-router';
import { Editor } from '@tiptap/core';
import { ListTodo } from 'lucide-react';
import { useMemo } from 'react';
import { toast } from 'sonner';

import { LocalDatabaseNode, LocalRecordNode } from '@colanode/client/types';
import {
  FieldValue,
  generateId,
  IdType,
  SelectFieldAttributes,
  SelectOptionAttributes,
} from '@colanode/core';
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
  const navigate = useNavigate({ from: '/workspace/$userId/$nodeId' });

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

  // Resolved and genuinely absent (vs still loading), so the button doesn't flash.
  const dbMissing = databaseListQuery.data != null && tasksDb == null;

  const fields = useMemo(() => Object.values(tasksDb?.fields ?? {}), [tasksDb]);

  const statusField = useMemo<SelectFieldAttributes | null>(
    () =>
      fields.find(
        (field): field is SelectFieldAttributes =>
          field.type === 'select' &&
          field.name.toLowerCase().includes('status')
      ) ?? null,
    [fields]
  );

  // The "what is needed" detail text field holds the selected passage.
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

  const openStatusOption = useMemo<SelectOptionAttributes | null>(() => {
    if (!statusField) {
      return null;
    }
    const options = sortByIndex(statusField.options);
    return (
      options.find((option) =>
        /^(open|to\s*-?\s*do|todo)$/i.test(option.name.trim())
      ) ??
      options.find((option) => /open|to\s*do|todo/i.test(option.name)) ??
      options[0] ??
      null
    );
  }, [statusField]);

  const createTask = () => {
    if (!tasksDb) {
      toast.error('The Wiki Tasks database could not be found.');
      return;
    }
    // Snapshot the selection before navigating away moves focus off the editor.
    const { from, to } = editor.state.selection;
    const selectedText = editor.state.doc
      .textBetween(from, to, '\n', ' ')
      .trim();

    const recordFields: Record<string, FieldValue> = {};
    // The selected passage becomes the task's DESCRIPTION ("what is needed"); the
    // title/action is left empty for the user to write in the record view.
    if (needField && selectedText.length > 0) {
      recordFields[needField.id] = { type: 'text', value: selectedText };
    }
    if (statusField && openStatusOption) {
      recordFields[statusField.id] = {
        type: 'string',
        value: openStatusOption.id,
      };
    }
    if (pageField) {
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

    const recordId = generateId(IdType.Record);
    const record: LocalRecordNode = {
      id: recordId,
      type: 'record',
      parentId: tasksDb.id,
      rootId: tasksDb.rootId,
      databaseId: tasksDb.id,
      name: '',
      fields: recordFields,
      avatar: null,
      createdAt: new Date().toISOString(),
      createdBy: workspace.userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    try {
      workspace.collections.nodes.insert(record);
    } catch (error) {
      toast.error(
        error instanceof Error ? error.message : 'Could not create the task'
      );
      return;
    }

    // Open the new task like "Add record": the record view (fields + document)
    // in a modal, so the user fills the title/action and picks the assignee.
    navigate({ to: 'modal/$modalNodeId', params: { modalNodeId: recordId } });
  };

  return (
    <button
      type="button"
      title="Create a task from the selection"
      aria-label="Create task"
      disabled={dbMissing}
      onClick={createTask}
      className="flex h-9 sm:h-8 items-center justify-center gap-1 rounded-md px-2 cursor-pointer hover:bg-input disabled:cursor-not-allowed disabled:opacity-40"
    >
      <ListTodo className="size-4" />
      <span className="text-sm font-medium">Task</span>
    </button>
  );
};
