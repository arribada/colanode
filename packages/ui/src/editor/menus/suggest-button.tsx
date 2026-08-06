import { Editor } from '@tiptap/react';
import { PencilLine } from 'lucide-react';

import { findBlockFromPos } from '@colanode/client/lib';
import { MarkButton } from '@colanode/ui/editor/menus/mark-button';

interface SuggestButtonProps {
  editor: Editor;
  // Called with the target top-level block id derived from the selection, so
  // the document editor can open the suggestion composer seeded with that block.
  onSuggestEdit: (blockId: string) => void;
}

export const SuggestButton = ({ editor, onSuggestEdit }: SuggestButtonProps) => {
  return (
    <MarkButton
      isActive={false}
      onClick={() => {
        // The block to replace is the top-level block (depth 1, the direct
        // child of the doc) that contains the selection. Fall back to the
        // nearest id-bearing ancestor if depth 1 has no id.
        const { $from } = editor.state.selection;
        const topLevel = $from.depth >= 1 ? $from.node(1) : null;
        const blockId =
          (topLevel?.attrs?.id as string | undefined) ??
          findBlockFromPos($from)?.nodeId;
        if (blockId) {
          onSuggestEdit(blockId);
        }
      }}
      icon={PencilLine}
      label="Suggest edit"
      testId="editor-toolbar-suggest"
    />
  );
};
