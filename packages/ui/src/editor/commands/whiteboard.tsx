import { Presentation } from 'lucide-react';

import { EditorCommand, LocalWhiteboardNode } from '@colanode/client/types';
import { IdType, generateId } from '@colanode/core';
import { collections } from '@colanode/ui/collections';

export const WhiteboardCommand: EditorCommand = {
  key: 'whiteboard',
  name: 'Whiteboard (embed)',
  description: 'Create a whiteboard and embed it in the current document',
  keywords: ['whiteboard', 'board', 'canvas', 'draw', 'diagram', 'sketch'],
  icon: Presentation,
  disabled: false,
  async handler({ editor, range, context }) {
    if (context == null) {
      return;
    }

    const { userId, documentId, rootId } = context;
    const nodes = collections.workspace(userId).nodes;
    const whiteboardId = generateId(IdType.Whiteboard);

    const whiteboard: LocalWhiteboardNode = {
      id: whiteboardId,
      type: 'whiteboard',
      name: 'Whiteboard',
      parentId: documentId,
      rootId: rootId,
      scene: {},
      createdAt: new Date().toISOString(),
      createdBy: userId,
      updatedAt: null,
      updatedBy: null,
      localRevision: '0',
      serverRevision: '0',
    };

    nodes.insert(whiteboard);

    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'whiteboardEmbed',
        attrs: {
          id: whiteboard.id,
          height: 480,
        },
      })
      .run();
  },
};
