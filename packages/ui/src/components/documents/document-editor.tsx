import '@colanode/ui/styles/editor.css';

import {
  EditorContent,
  FocusPosition,
  JSONContent,
  useEditor,
} from '@tiptap/react';
import { debounce, isEqual } from 'lodash-es';
import { Fragment, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';

import {
  restoreRelativeSelection,
  getRelativeSelection,
  mapContentsToBlocks,
  buildEditorContent,
} from '@colanode/client/lib';
import {
  LocalNode,
  DocumentState,
  DocumentUpdate,
} from '@colanode/client/types';
import { RichTextContent, richTextContentSchema } from '@colanode/core';
import { encodeState, YDoc } from '@colanode/crdt';
import { PresenceAvatars } from '@colanode/ui/components/presence/presence-avatars';
import { usePageComments } from '@colanode/ui/contexts/page-comments';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  BlockquoteCommand,
  BulletListCommand,
  CalloutCommand,
  BookmarkCommand,
  EmbedCommand,
  ColumnsCommand,
  TableOfContentsCommand,
  CodeBlockCommand,
  DividerCommand,
  FileCommand,
  FolderCommand,
  Heading1Command,
  Heading2Command,
  Heading3Command,
  MathBlockCommand,
  MathInlineCommand,
  OrderedListCommand,
  PageCommand,
  ParagraphCommand,
  TableCommand,
  TodoCommand,
  ToggleCommand,
  DatabaseCommand,
  DatabaseInlineCommand,
  DatabaseLinkCommand,
} from '@colanode/ui/editor/commands';
import {
  BlockquoteNode,
  BoldMark,
  BulletListNode,
  CodeBlockNode,
  CodeMark,
  ColorMark,
  CommentMark,
  CommanderExtension,
  DeleteControlExtension,
  DividerNode,
  DocumentNode,
  DropcursorExtension,
  FileNode,
  FolderNode,
  Heading1Node,
  Heading2Node,
  Heading3Node,
  HighlightMark,
  IdExtension,
  ItalicMark,
  LinkMark,
  ListItemNode,
  ListKeymapExtension,
  MathBlockNode,
  MathInlineNode,
  MentionExtension,
  OrderedListNode,
  PageNode,
  ParagraphNode,
  PlaceholderExtension,
  PlaneIssueLinkExtension,
  StrikethroughMark,
  TabKeymapExtension,
  TableNode,
  TableRowNode,
  TableHeaderNode,
  TableCellNode,
  TaskItemNode,
  TaskListNode,
  TextNode,
  ToggleContentNode,
  ToggleNode,
  ToggleSummaryNode,
  CalloutNode,
  BookmarkNode,
  EmbedNode,
  ColumnsNode,
  ColumnNode,
  TableOfContentsNode,
  TrailingNode,
  UnderlineMark,
  DatabaseNode,
  AutoJoiner,
  HardBreakNode,
  ParserExtension,
  Markdown,
  PresenceExtension,
  setRemoteCarets,
  type RemoteCaret,
} from '@colanode/ui/editor/extensions';
import { ToolbarMenu, ActionMenu } from '@colanode/ui/editor/menus';
import {
  usePresences,
  usePresencePublisher,
} from '@colanode/ui/hooks/use-presence';

interface DocumentEditorProps {
  node: LocalNode;
  state: DocumentState | null | undefined;
  updates: DocumentUpdate[];
  canEdit: boolean;
  autoFocus?: FocusPosition;
}

const buildYDoc = (
  state: DocumentState | null | undefined,
  updates: DocumentUpdate[]
) => {
  const ydoc = new YDoc(state?.state);
  for (const update of updates) {
    ydoc.applyUpdate(update.data);
  }
  return ydoc;
};

interface UndoRedoParams {
  editor: ReturnType<typeof useEditor>;
  ydoc: YDoc;
  nodeId: string;
  userId: string;
  // Commit any debounced (not-yet-persisted) editor edit into the YDoc so the
  // undo/redo below operate on the real latest state, not a 500ms-stale copy.
  flushPendingSave: () => Promise<unknown> | unknown;
}

const performUndo = async ({
  editor,
  ydoc,
  nodeId,
  userId,
  flushPendingSave,
}: UndoRedoParams) => {
  await flushPendingSave();

  const beforeContent = ydoc.getObject<RichTextContent>();
  const update = ydoc.undo();

  if (!update) {
    return;
  }

  const afterContent = ydoc.getObject<RichTextContent>();

  if (isEqual(beforeContent, afterContent)) {
    return;
  }

  const editorContent = buildEditorContent(nodeId, afterContent);
  editor.chain().setContent(editorContent).run();

  const result = await window.colanode.executeMutation({
    type: 'document.update',
    userId,
    documentId: nodeId,
    update: encodeState(update),
  });

  if (!result.success) {
    toast.error(result.error.message);
  }
};

const performRedo = async ({
  editor,
  ydoc,
  nodeId,
  userId,
  flushPendingSave,
}: UndoRedoParams) => {
  await flushPendingSave();

  const beforeContent = ydoc.getObject<RichTextContent>();
  const update = ydoc.redo();

  if (!update) {
    return;
  }

  const afterContent = ydoc.getObject<RichTextContent>();

  if (isEqual(beforeContent, afterContent)) {
    return;
  }

  const editorContent = buildEditorContent(nodeId, afterContent);
  editor.chain().setContent(editorContent).run();

  const result = await window.colanode.executeMutation({
    type: 'document.update',
    userId,
    documentId: nodeId,
    update: encodeState(update),
  });

  if (!result.success) {
    toast.error(result.error.message);
  }
};

export const DocumentEditor = ({
  node,
  state,
  updates,
  canEdit,
  autoFocus,
}: DocumentEditorProps) => {
  const workspace = useWorkspace();
  const { openComments } = usePageComments();
  // Inline comments only make sense on page documents (comments are `message`
  // nodes parented to the page). Record documents opt out.
  const isPage = node.type === 'page';

  const presences = usePresences(node.id);
  const { publish: publishPresence } = usePresencePublisher({
    nodeId: node.id,
    rootId: node.rootId,
    kind: 'doc',
  });

  const hasPendingChanges = useRef(false);
  const revisionRef = useRef(state?.revision ?? 0);
  const ydocRef = useRef<YDoc>(buildYDoc(state, updates));
  const editorRef = useRef<ReturnType<typeof useEditor>>(null);
  const [viewReady, setViewReady] = useState(false);

  const debouncedSave = useMemo(
    () =>
      debounce(async (content: JSONContent) => {
        const beforeContent = ydocRef.current.getObject<RichTextContent>();
        const beforeBlocks = beforeContent?.blocks;
        const indexMap = new Map<string, string>();
        if (beforeBlocks) {
          for (const [key, value] of Object.entries(beforeBlocks)) {
            indexMap.set(key, value.index);
          }
        }

        const afterBlocks = mapContentsToBlocks(
          node.id,
          content.content ?? [],
          indexMap
        );

        const afterContent: RichTextContent = {
          type: 'rich_text',
          blocks: afterBlocks,
        };

        const update = ydocRef.current.update(
          richTextContentSchema,
          afterContent
        );

        hasPendingChanges.current = false;

        if (!update) {
          return;
        }

        const result = await window.colanode.executeMutation({
          type: 'document.update',
          userId: workspace.userId,
          documentId: node.id,
          update: encodeState(update),
        });

        if (!result.success) {
          toast.error(result.error.message);
        }
      }, 500),
    [node.id]
  );

  const editor = useEditor(
    {
      extensions: [
        IdExtension,
        // Must precede ParserExtension: its handlePaste only fires when the
        // ENTIRE clipboard payload is a bare Plane issue URL, and needs
        // first refusal before the generic markdown/text paste handling
        // below swallows it as plain text.
        PlaneIssueLinkExtension,
        // Same rationale as PlaneIssueLinkExtension: EmbedNode registers a
        // handlePaste that turns a bare Google Drive/Docs/Slides/Sheets/
        // YouTube URL into an embed block, and must precede ParserExtension.
        EmbedNode,
        ParserExtension,
        Markdown,
        DocumentNode,
        PageNode,
        FolderNode,
        FileNode.configure({
          context: {
            userId: workspace.userId,
            accountId: workspace.accountId,
            workspaceId: workspace.workspaceId,
            documentId: node.id,
            rootId: node.rootId,
          },
        }),
        TextNode,
        ParagraphNode,
        HardBreakNode,
        Heading1Node,
        Heading2Node,
        Heading3Node,
        BlockquoteNode,
        BulletListNode,
        CodeBlockNode,
        TabKeymapExtension,
        ListItemNode,
        ListKeymapExtension,
        OrderedListNode,
        PlaceholderExtension.configure({
          message: "Write something or '/' for commands",
        }),
        TaskListNode,
        TaskItemNode,
        TableNode,
        TableRowNode,
        TableCellNode,
        TableHeaderNode,
        ToggleNode,
        ToggleSummaryNode,
        ToggleContentNode,
        CalloutNode,
        TableOfContentsNode,
        BookmarkNode,
        ColumnsNode,
        ColumnNode,
        DividerNode,
        MathBlockNode,
        MathInlineNode,
        TrailingNode,
        PresenceExtension,
        LinkMark,
        DeleteControlExtension,
        DropcursorExtension,
        DatabaseNode,
        AutoJoiner,
        MentionExtension.configure({
          context: {
            userId: workspace.userId,
            documentId: node.id,
            accountId: workspace.accountId,
            workspaceId: workspace.workspaceId,
            rootId: node.rootId,
          },
        }),
        CommanderExtension.configure({
          commands: [
            ParagraphCommand,
            PageCommand,
            BlockquoteCommand,
            Heading1Command,
            Heading2Command,
            Heading3Command,
            BulletListCommand,
            CodeBlockCommand,
            OrderedListCommand,
            TableCommand,
            DatabaseInlineCommand,
            DatabaseCommand,
            DatabaseLinkCommand,
            DividerCommand,
            MathBlockCommand,
            MathInlineCommand,
            TodoCommand,
            ToggleCommand,
            CalloutCommand,
            TableOfContentsCommand,
            BookmarkCommand,
            EmbedCommand,
            ColumnsCommand,
            FileCommand,
            FolderCommand,
          ],
          context: {
            userId: workspace.userId,
            documentId: node.id,
            accountId: workspace.accountId,
            workspaceId: workspace.workspaceId,
            rootId: node.rootId,
          },
        }),
        BoldMark,
        ItalicMark,
        UnderlineMark,
        StrikethroughMark,
        CodeMark,
        ColorMark,
        HighlightMark,
        CommentMark.configure({
          onCommentClick: isPage
            ? (threadId: string) => openComments(node.id, threadId)
            : null,
        }),
      ],
      editorProps: {
        attributes: {
          class:
            'prose-lg prose-stone dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full text-foreground',
          spellCheck: 'false',
        },
        handleKeyDown: (_, event) => {
          if (!editorRef.current) {
            return false;
          }

          // metaKey = Cmd (macOS); ctrlKey = Ctrl (Windows/Linux). The old code
          // only checked metaKey, so Ctrl+Z/Ctrl+Y did nothing on Windows/Linux.
          const mod = event.metaKey || event.ctrlKey;
          const flushPendingSave = () => debouncedSave.flush();

          if (event.key === 'z' && mod && !event.shiftKey) {
            event.preventDefault();
            performUndo({
              editor: editorRef.current,
              ydoc: ydocRef.current,
              nodeId: node.id,
              userId: workspace.userId,
              flushPendingSave,
            });
            return true;
          }
          if (event.key === 'z' && mod && event.shiftKey) {
            event.preventDefault();
            performRedo({
              editor: editorRef.current,
              ydoc: ydocRef.current,
              nodeId: node.id,
              userId: workspace.userId,
              flushPendingSave,
            });
            return true;
          }
          if (event.key === 'y' && mod) {
            event.preventDefault();
            performRedo({
              editor: editorRef.current,
              ydoc: ydocRef.current,
              nodeId: node.id,
              userId: workspace.userId,
              flushPendingSave,
            });
            return true;
          }

          return false;
        },
      },
      content: buildEditorContent(
        node.id,
        ydocRef.current.getObject<RichTextContent>()
      ),
      editable: canEdit,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      autofocus: autoFocus,
      onUpdate: async ({ editor, transaction }) => {
        if (transaction.docChanged) {
          hasPendingChanges.current = true;
          debouncedSave(editor.getJSON());
        }
      },
    },
    [node.id]
  );

  useEffect(() => {
    if (!editor) {
      return;
    }

    if (!state) {
      return;
    }

    if (hasPendingChanges.current) {
      return;
    }

    if (revisionRef.current === state?.revision) {
      return;
    }

    const beforeContent = ydocRef.current.getObject<RichTextContent>();

    ydocRef.current.applyUpdate(state.state);
    for (const update of updates) {
      ydocRef.current.applyUpdate(update.data);
    }

    const afterContent = ydocRef.current.getObject<RichTextContent>();

    if (isEqual(afterContent, beforeContent)) {
      return;
    }

    const editorContent = buildEditorContent(node.id, afterContent);
    revisionRef.current = state.revision;

    const relativeSelection = getRelativeSelection(editor);
    editor.chain().setContent(editorContent).run();

    if (relativeSelection != null) {
      restoreRelativeSelection(editor, relativeSelection);
    }
  }, [state, updates, editor]);

  // Keep editorRef updated so handleKeyDown can access the current editor
  editorRef.current = editor;

  // Publish the local caret/selection (throttled inside the publisher).
  useEffect(() => {
    if (!editor) {
      return;
    }

    const publishSelection = () => {
      const { from, to } = editor.state.selection;
      publishPresence({ anchor: from, head: to });
    };

    editor.on('selectionUpdate', publishSelection);
    editor.on('focus', publishSelection);
    publishSelection();

    return () => {
      editor.off('selectionUpdate', publishSelection);
      editor.off('focus', publishSelection);
    };
  }, [editor, publishPresence]);

  // Render remote collaborators' carets/selections.
  useEffect(() => {
    if (!editor) {
      return;
    }

    const carets: RemoteCaret[] = presences
      .filter((p) => p.kind === 'doc' && typeof p.payload.head === 'number')
      .map((p) => ({
        key: `${p.userId}:${p.deviceId}`,
        name: p.name,
        color: p.color,
        anchor: p.payload.anchor ?? (p.payload.head as number),
        head: p.payload.head as number,
      }));

    setRemoteCarets(editor, carets);
  }, [editor, presences]);

  // @tiptap/react v3 attaches the ProseMirror view asynchronously (after
  // EditorContent mounts), so editor.view throws "editor view is not available"
  // if the toolbar/action menus render first. Only render them once the view is
  // truly ready to avoid an intermittent crash.
  useEffect(() => {
    setViewReady(false);
    if (!editor) {
      return;
    }
    let raf = 0;
    const check = () => {
      let ready = false;
      try {
        ready = Boolean(editor.view?.dom);
      } catch {
        ready = false;
      }
      if (ready) {
        setViewReady(true);
      } else {
        raf = requestAnimationFrame(check);
      }
    };
    check();
    return () => cancelAnimationFrame(raf);
  }, [editor]);

  return (
    <div className="relative">
      {presences.length > 0 && (
        <div className="absolute right-2 top-2 z-10">
          <PresenceAvatars presences={presences} />
        </div>
      )}
      {editor && viewReady && canEdit && (
        <Fragment>
          <ToolbarMenu
            editor={editor}
            onAddComment={
              isPage
                ? (threadId) => openComments(node.id, threadId)
                : undefined
            }
          />
          <ActionMenu editor={editor} />
        </Fragment>
      )}
      <EditorContent editor={editor} />
    </div>
  );
};
