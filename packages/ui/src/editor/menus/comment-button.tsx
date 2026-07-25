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
  return (
    <MarkButton
      isActive={editor.isActive('comment')}
      onClick={() => {
        // If the selection already sits inside a comment, reuse its thread so
        // clicking "Comment" again re-opens the existing conversation.
        const existing = editor.getAttributes('comment')?.threadId as
          | string
          | undefined;
        const threadId = existing ?? generateId(IdType.CommentThread);
        if (!existing) {
          editor.chain().focus().setComment(threadId).run();
        }
        onAddComment(threadId);
      }}
      icon={MessageSquarePlus}
      label="Comment"
      testId="editor-toolbar-comment"
    />
  );
};
