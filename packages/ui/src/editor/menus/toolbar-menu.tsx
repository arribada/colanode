import { EditorState } from '@tiptap/pm/state';
import { Editor, isNodeSelection, useEditorState } from '@tiptap/react';
import { BubbleMenu, type BubbleMenuProps } from '@tiptap/react/menus';
import { Bold, Code, Italic, Strikethrough, Underline } from 'lucide-react';
import { useCallback, useMemo, useState } from 'react';

import { AiButton } from '@colanode/ui/editor/menus/ai-button';
import { ColorButton } from '@colanode/ui/editor/menus/color-button';
import { CommentButton } from '@colanode/ui/editor/menus/comment-button';
import { HighlightButton } from '@colanode/ui/editor/menus/highlight-button';
import { LinkButton } from '@colanode/ui/editor/menus/link-button';
import { MarkButton } from '@colanode/ui/editor/menus/mark-button';
import { WikiTaskButton } from '@colanode/ui/editor/menus/wiki-task-button';

interface ToolbarMenuProps extends Omit<BubbleMenuProps, 'children'> {
  editor: Editor;
  // Provided only for page documents: creates/opens an inline comment thread
  // for the current selection. Omitted (e.g. record documents) hides the button.
  onAddComment?: (threadId: string) => void;
  // The requesting user's id. When present the "Ask AI" button is shown; it
  // runs editor AI actions with the user's own configured AI credentials.
  userId?: string;
  // The node id of the page being edited. Forwarded to the AI button so the
  // wiki agent knows which page the request is anchored to.
  pageId?: string;
}

export const ToolbarMenu = (props: ToolbarMenuProps) => {
  const [isColorButtonOpen, setIsColorButtonOpen] = useState(false);
  const [isLinkButtonOpen, setIsLinkButtonOpen] = useState(false);
  const [isHighlightButtonOpen, setIsHighlightButtonOpen] = useState(false);

  const state = useEditorState({
    editor: props.editor,
    selector: ({ editor }) => {
      if (!editor) {
        return null;
      }

      return {
        isEditable: editor.isEditable,
        isBoldActive: editor.isActive('bold'),
        isItalicActive: editor.isActive('italic'),
        isUnderlineActive: editor.isActive('underline'),
        isStrikeActive: editor.isActive('strike'),
        isCodeActive: editor.isActive('code'),
      };
    },
  });

  const shouldShow = useCallback(
    ({ state, editor }: { state: EditorState; editor: Editor }) => {
      const { selection } = state;
      const { empty } = selection;

      if (empty) {
        return false;
      }

      if (isNodeSelection(selection)) {
        return false;
      }

      if (
        editor.isActive('page') ||
        editor.isActive('database') ||
        editor.isActive('folder') ||
        editor.isActive('file') ||
        editor.isActive('tempFile')
      ) {
        return false;
      }

      return true;
    },
    []
  );

  const options = useMemo(
    () => ({
      // 'fixed', not 'absolute': the bubble is shown through the native Popover
      // API, so it lives in the top layer, where an absolutely positioned element
      // resolves against the initial containing block rather than an offsetParent.
      // Coordinates computed for an offsetParent then land the toolbar — and the
      // AI menu hanging off it — in the top-left corner of the window.
      strategy: 'fixed' as const,
      placement: 'top' as const,
      offset: 8,
      onHide: () => {
        setIsColorButtonOpen(false);
        setIsLinkButtonOpen(false);
        setIsHighlightButtonOpen(false);
      },
    }),
    []
  );

  if (props.editor == null) {
    return null;
  }

  return (
    <BubbleMenu
      editor={props.editor}
      shouldShow={shouldShow}
      options={options}
      data-testid="editor-toolbar-menu"
      className="flex flex-row flex-wrap items-center gap-1 rounded border border-border bg-muted p-0.5 shadow-xl max-w-[95vw]"
    >
      {props.userId && (
        <>
          <AiButton
            editor={props.editor}
            userId={props.userId}
            pageId={props.pageId}
          />
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        </>
      )}
      {props.pageId && (
        <>
          <WikiTaskButton editor={props.editor} pageId={props.pageId} />
          <span className="mx-0.5 h-5 w-px bg-border" aria-hidden="true" />
        </>
      )}
      <LinkButton
        editor={props.editor}
        isOpen={isLinkButtonOpen}
        setIsOpen={(isOpen) => {
          setIsColorButtonOpen(false);
          setIsHighlightButtonOpen(false);
          setIsLinkButtonOpen(isOpen);
        }}
      />
      <MarkButton
        isActive={state?.isBoldActive ?? false}
        onClick={() => props.editor?.chain().focus().toggleBold().run()}
        icon={Bold}
        label="Bold"
        testId="editor-toolbar-bold"
      />
      <MarkButton
        isActive={state?.isItalicActive ?? false}
        onClick={() => props.editor?.chain().focus().toggleItalic().run()}
        icon={Italic}
        label="Italic"
        testId="editor-toolbar-italic"
      />
      <MarkButton
        isActive={state?.isUnderlineActive ?? false}
        onClick={() => props.editor?.chain().focus().toggleUnderline().run()}
        icon={Underline}
        label="Underline"
        testId="editor-toolbar-underline"
      />
      <MarkButton
        isActive={state?.isStrikeActive ?? false}
        onClick={() => props.editor?.chain().focus().toggleStrike().run()}
        icon={Strikethrough}
        label="Strikethrough"
        testId="editor-toolbar-strikethrough"
      />
      <MarkButton
        isActive={state?.isCodeActive ?? false}
        onClick={() => props.editor?.chain().focus().toggleCode().run()}
        icon={Code}
        label="Code"
        testId="editor-toolbar-code"
      />
      <ColorButton
        editor={props.editor}
        isOpen={isColorButtonOpen}
        setIsOpen={(isOpen) => {
          setIsColorButtonOpen(isOpen);
          setIsLinkButtonOpen(false);
          setIsHighlightButtonOpen(false);
        }}
      />
      <HighlightButton
        editor={props.editor}
        isOpen={isHighlightButtonOpen}
        setIsOpen={(isOpen) => {
          setIsHighlightButtonOpen(isOpen);
          setIsColorButtonOpen(false);
          setIsLinkButtonOpen(false);
        }}
      />
      {props.onAddComment && (
        <CommentButton
          editor={props.editor}
          onAddComment={props.onAddComment}
        />
      )}
    </BubbleMenu>
  );
};
