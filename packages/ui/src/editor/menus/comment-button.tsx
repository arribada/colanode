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
        // Already inside a comment: RE-OPEN that thread's panel. Never
        // unsetComment here -- removing the mark would orphan any messages
        // anchored to the thread (they filter out of the page panel and become
        // unreachable). Clearing empty threads needs proper lifecycle handling.
        if (isActive) {
          const existing = editor.getAttributes('comment').threadId;
          if (typeof existing === 'string' && existing.length > 0) {
            onAddComment(existing);
          }
          return;
        }
        // Fresh comment: apply the mark and open the panel to compose the first
        // message.
        const threadId = generateId(IdType.CommentThread);
        editor.chain().focus().setComment(threadId).run();
        onAddComment(threadId);
      }}
      icon={MessageSquarePlus}
      label="Comment"
      testId="editor-toolbar-comment"
    />
  );
};
