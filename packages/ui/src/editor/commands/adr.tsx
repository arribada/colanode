// ABOUTME: Slash-menu command "Create ADR": creates a record in the 🧭 ADR
// ABOUTME: database, links it inline as a mention, and seeds an ADR template doc.
import { JSONContent } from '@tiptap/core';
import { Compass } from 'lucide-react';
import { toast } from 'sonner';

import { mapContentsToBlocks } from '@colanode/client/lib';
import {
  EditorCommand,
  LocalDatabaseNode,
  LocalRecordNode,
} from '@colanode/client/types';
import {
  FieldValue,
  generateId,
  IdType,
  richTextContentSchema,
  SelectFieldAttributes,
} from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';
import { collections } from '@colanode/ui/collections';
import {
  ADR_DATABASE_ID,
  ADR_STATUS_FIELD_ID,
  resolveAdrOpenStatusOptionId,
  resolveAdrStatusField,
} from '@colanode/ui/lib/adr';

const paragraph = (text: string): JSONContent => ({
  type: 'paragraph',
  content: text.length > 0 ? [{ type: 'text', text }] : [],
});

const heading = (text: string): JSONContent => ({
  type: 'heading3',
  content: [{ type: 'text', text }],
});

const listItem = (text: string): JSONContent => ({
  type: 'listItem',
  content: [paragraph(text)],
});

// The ADR document template, mirroring a real ADR (status / context / options /
// decision / consequences / next step).
const buildAdrTemplateContent = (): JSONContent[] => [
  heading('Status'),
  paragraph(
    'Open — keep the Status field on this record in sync as the decision evolves.'
  ),
  heading('Context'),
  paragraph('What is the situation, and why does a decision need to be made now?'),
  heading('Options'),
  {
    type: 'bulletList',
    content: [
      listItem('Option A — describe it, with its trade-offs.'),
      listItem('Option B — describe it, with its trade-offs.'),
    ],
  },
  heading('Decision'),
  paragraph('What was decided, and by whom?'),
  heading('Consequences'),
  paragraph('What becomes easier or harder as a result of this decision?'),
  heading('Next step'),
  paragraph('The immediate next action, and who owns it.'),
];

// The Owner select option whose name matches the current user's display name.
const resolveOwnerOptionId = (
  ownerField: SelectFieldAttributes,
  userName: string
): string | null => {
  const name = userName.trim().toLowerCase();
  if (name.length === 0) {
    return null;
  }
  const option =
    Object.values(ownerField.options ?? {}).find(
      (candidate) => candidate.name.trim().toLowerCase() === name
    ) ?? null;
  return option?.id ?? null;
};

export const CreateAdrCommand: EditorCommand = {
  key: 'adr',
  name: 'Create ADR',
  description: 'Create an Architecture Decision Record and link it here',
  keywords: ['adr', 'decision', 'architecture'],
  icon: Compass,
  group: 'other',
  disabled: false,
  async handler({ editor, range, context }) {
    if (context == null) {
      return;
    }

    const { userId } = context;

    // 1. Resolve the ADR database (by id first, then by name) with its live
    // fields, so field/option ids never have to be trusted blindly.
    const databaseNodes = await window.colanode.executeQuery({
      type: 'node.list',
      userId,
      filters: [{ field: ['type'], operator: 'in', value: ['database'] }],
      sorts: [],
    });
    const databases = databaseNodes.map((node) => node as LocalDatabaseNode);
    const adrDb =
      databases.find((db) => db.id === ADR_DATABASE_ID) ??
      databases.find((db) => (db.name ?? '').toLowerCase().includes('adr')) ??
      null;

    if (!adrDb) {
      toast.error('The ADR database could not be found.');
      return;
    }

    // 2. Build the record fields: Status -> "Open"; Owner -> the current user's
    // matching option when their display name matches an Owner option.
    const recordFields: Record<string, FieldValue> = {};

    const statusField = resolveAdrStatusField(adrDb);
    recordFields[statusField?.id ?? ADR_STATUS_FIELD_ID] = {
      type: 'string',
      value: resolveAdrOpenStatusOptionId(adrDb),
    };

    const ownerField =
      Object.values(adrDb.fields ?? {}).find(
        (field): field is SelectFieldAttributes =>
          field.type === 'select' && field.name.toLowerCase().includes('owner')
      ) ?? null;

    if (ownerField) {
      const users = await window.colanode.executeQuery({
        type: 'user.list',
        userId,
      });
      const currentUser = users.find((user) => user.id === userId) ?? null;
      const ownerOptionId = currentUser
        ? resolveOwnerOptionId(ownerField, currentUser.name)
        : null;
      if (ownerOptionId) {
        recordFields[ownerField.id] = { type: 'string', value: ownerOptionId };
      }
    }

    // 3. Create the record node (mirrors wiki-task-button's record shape).
    const recordId = generateId(IdType.Record);
    const record: LocalRecordNode = {
      id: recordId,
      type: 'record',
      parentId: adrDb.id,
      rootId: adrDb.rootId,
      databaseId: adrDb.id,
      name: 'New ADR',
      fields: recordFields,
      avatar: null,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    const nodes = collections.workspace(userId).nodes;
    const insertTransaction = nodes.insert(record);

    // 4. Link the new ADR inline at the cursor (the same shape the @-mention
    // flow inserts: a mention node with a fresh id targeting the record).
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent([
        {
          type: 'mention',
          attrs: {
            id: generateId(IdType.Mention),
            target: recordId,
          },
        },
        {
          type: 'text',
          text: ' ',
        },
      ])
      .run();

    // 5. Seed the record's own document with the ADR template. updateDocument
    // reads the node tree, so wait for node.create to persist first.
    try {
      await insertTransaction.isPersisted.promise;

      const blocks = mapContentsToBlocks(
        recordId,
        buildAdrTemplateContent(),
        new Map()
      );
      const ydoc = new YDoc();
      const update = ydoc.update(richTextContentSchema, {
        type: 'rich_text',
        blocks,
      });

      if (update) {
        const result = await window.colanode.executeMutation({
          type: 'document.update',
          userId,
          documentId: recordId,
          update: encodeState(update),
        });
        if (!result.success) {
          toast.error(result.error.message);
        }
      }
    } catch (error) {
      // Non-fatal: the record + inline link already exist even if seeding the
      // template fails; surface it but don't undo the creation.
      toast.error(
        error instanceof Error
          ? error.message
          : 'The ADR was created but its template could not be added.'
      );
    }
  },
};
