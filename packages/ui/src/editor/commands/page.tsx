import { FileText } from 'lucide-react';

import { EditorCommand, LocalPageNode } from '@colanode/client/types';
import { generateId, IdType } from '@colanode/core';
import { collections } from '@colanode/ui/collections';
import { markPagePendingRename } from '@colanode/ui/editor/views/page-pending-rename';

export const PageCommand: EditorCommand = {
  key: 'page',
  name: 'Page',
  description: 'Insert a nested page',
  keywords: ['page'],
  icon: FileText,
  group: 'pages',
  disabled: false,
  async handler({ editor, range, context }) {
    if (context == null) {
      return;
    }

    const { userId, documentId, rootId } = context;
    const pageId = generateId(IdType.Page);
    const nodes = collections.workspace(userId).nodes;

    const page: LocalPageNode = {
      id: pageId,
      type: 'page',
      name: '',
      avatar: null,
      parentId: documentId,
      rootId: rootId,
      createdAt: new Date().toISOString(),
      createdBy: userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    nodes.insert(page);
    markPagePendingRename(page.id);

    editor.chain().focus().deleteRange(range).run();
    editor
      .chain()
      .focus()
      .insertContent({
        type: 'page',
        attrs: {
          id: page.id,
        },
      })
      .run();
  },
};
