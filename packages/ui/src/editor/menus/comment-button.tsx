import { Editor } from '@tiptap/react';
import { MessageSquarePlus } from 'lucide-react';

import { generateId, IdType } from '@colanode/core';
import { MarkButton } from '@colanode/ui/editor/menus/mark-button';

interface CommentButtonProps {
  editor: Editor;
  // Called after a fresh comment mark is applied to the selection, with the new
  // thread id, so the document editor can open the comments panel to compose the
  // first message (anchorId === threadId).
  onAddComment: (threadId: string) => void;
}

export const CommentButton = ({ editor, onAddComment }: CommentButtonProps) => {
  const isActive = editor.isActive('comment');
  return (
    <MarkButton
      isActive={isActive}
      onClick={() => {
        // Toggle off: if the selection already sits inside a comment mark,
        // remove the highlight (wires unsetComment to a real control so orphan
        // highlights whose thread has no messages can be cleared).
        if (isActive) {
          editor.chain().focus().unsetComment().run();
          return;
        }
        // Fresh comment: apply the mark and open the panel to compose the first
        // message.
        const threadId = generateId(IdType.CommentThread);
        editor.chain().focus().setComment(threadId).run();
        onAddComment(threadId);
      }}
      icon={MessageSquarePlus}
      label={isActive ? 'Remove comment' : 'Comment'}
      testId="editor-toolbar-comment"
    />
  );
};
