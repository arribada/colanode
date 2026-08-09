import '@colanode/ui/styles/editor.css';

import { Lock } from 'lucide-react';

import { cn } from '@colanode/ui/lib/utils';
import { DocumentToc } from '@colanode/ui/components/documents/document-toc';
import { DocumentReadingProgress } from '@colanode/ui/components/documents/document-reading-progress';

import {
  EditorContent,
  FocusPosition,
  JSONContent,
  useEditor,
} from '@tiptap/react';
import { useRouter } from '@tanstack/react-router';
import { debounce, isEqual } from 'lodash-es';
import {
  Fragment,
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
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
import { registerDocumentExporter } from '@colanode/ui/lib/document-export';
import { usePageComments } from '@colanode/ui/contexts/page-comments';
import { usePageSuggestions } from '@colanode/ui/contexts/page-suggestions';
import { useLayout } from '@colanode/ui/contexts/layout';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordNodeView } from '@colanode/ui/hooks/use-node-views';
import {
  AiCommand,
  BlockquoteCommand,
  BulletListCommand,
  CalloutCommand,
  BookmarkCommand,
  EmbedCommand,
  PlaneCommand,
  ColumnsCommand,
  ChartCommand,
  GithubCommand,
  TableOfContentsCommand,
  CodeBlockCommand,
  DividerCommand,
  FileCommand,
  FolderCommand,
  Heading1Command,
  Heading2Command,
  Heading3Command,
  NumberHeadingsCommand,
  CreateAdrCommand,
  MathBlockCommand,
  MathInlineCommand,
  MermaidCommand,
  OrderedListCommand,
  PageCommand,
  ParagraphCommand,
  TableCommand,
  TodoCommand,
  ToggleCommand,
  DatabaseCommand,
  DatabaseInlineCommand,
  DatabaseLinkCommand,
  WhiteboardCommand,
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
  HeadingEnhancementsExtension,
  HighlightMark,
  IdExtension,
  ItalicMark,
  LinkMark,
  ListItemNode,
  ListKeymapExtension,
  MathBlockNode,
  MathInlineNode,
  MermaidNode,
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
  PlaneEmbedNode,
  ColumnsNode,
  ColumnNode,
  ColumnsDragExtension,
  ColumnsResizeExtension,
  ChartNode,
  TableOfContentsNode,
  TrailingNode,
  UnderlineMark,
  DatabaseNode,
  WhiteboardEmbedNode,
  AutoJoiner,
  HardBreakNode,
  ParserExtension,
  Markdown,
  PresenceExtension,
  setRemoteCarets,
  type RemoteCaret,
} from '@colanode/ui/editor/extensions';
import { ToolbarMenu, ActionMenu } from '@colanode/ui/editor/menus';
import { AiSlashPrompt } from '@colanode/ui/editor/ai/ai-prompt';
import {
  usePresences,
  usePresencePublisher,
} from '@colanode/ui/hooks/use-presence';

interface DocumentEditorProps {
  node: LocalNode;
  state: DocumentState | null | undefined;
  updates: DocumentUpdate[];
  // Whether this user may edit the document DIRECTLY. The page container has
  // already folded the page lock into this (privileged users keep true even
  // on a locked page; non-privileged users get false in suggest/locked mode).
  canEdit: boolean;
  // Page in 'suggest' lock mode + a non-privileged editor: the editor is
  // read-only (canEdit=false) but the Suggest affordance must stay available.
  canSuggest?: boolean;
  // The page's lock mode, only for rendering the banner. Absent/null = open.
  lockMode?: 'open' | 'suggest' | 'locked' | null;
  autoFocus?: FocusPosition;
}

// Slugify a page name or an imported markdown-link target so they can be
// matched. GitHub-wiki links store the page title with spaces turned into '-'
// (e.g. '05 ‐ Boards' -> '05-‐-Boards.md'); normalise dashes + punctuation
// on both sides so the comparison is stable.
const slugifyLinkTarget = (value: string): string => {
  let decoded = value;
  try {
    decoded = decodeURIComponent(value);
  } catch {
    // keep the raw value if it isn't valid percent-encoding
  }
  return decoded
    .toLowerCase()
    .replace(/\.md$/, '')
    .replace(/[\u2010\u2011\u2012\u2013\u2014]/g, '-')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
};

// Resolved imported-markdown-link slugs, keyed by `${rootId}::${slug}`.
const markdownLinkCache = new Map<string, string | null>();

const resolveMarkdownLink = async (
  base: string,
  userId: string,
  rootId: string,
  parentId: string | null
): Promise<string | null> => {
  const slug = slugifyLinkTarget(base);
  if (!slug) {
    return null;
  }
  const key = `${rootId}::${slug}`;
  const cached = markdownLinkCache.get(key);
  if (cached !== undefined) {
    return cached;
  }
  let nodeId: string | null = null;
  try {
    const pages = await window.colanode.executeQuery({
      type: 'node.list',
      userId,
      filters: [{ field: ['type'], operator: 'eq', value: 'page' }],
      sorts: [],
    });
    const matches = pages.filter(
      (page) =>
        slugifyLinkTarget(
          (page as { name?: string | null }).name ?? ''
        ) === slug
    );
    const chosen =
      matches.find((page) => page.parentId === parentId) ??
      matches.find((page) => page.rootId === rootId) ??
      matches[0] ??
      null;
    nodeId = chosen?.id ?? null;
  } catch {
    nodeId = null;
  }
  markdownLinkCache.set(key, nodeId);
  return nodeId;
};

const buildYDoc = (
  state: DocumentState | null | undefined,
  updates: DocumentUpdate[]
) => {
  // A corrupt stored state/update must never throw here: buildYDoc runs in a
  // useRef initializer (during render), so a throw would trip the route
  // boundary into a latched "Node error". Apply each piece defensively and
  // skip any that fail, so the document still opens (minus the bad update).
  const ydoc = new YDoc();
  if (state?.state) {
    try {
      ydoc.applyUpdate(state.state);
    } catch {
      // skip a corrupt base state
    }
  }
  for (const update of updates) {
    try {
      ydoc.applyUpdate(update.data);
    } catch {
      // skip a corrupt update
    }
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
  canSuggest,
  lockMode,
  autoFocus,
}: DocumentEditorProps) => {
  const workspace = useWorkspace();
  const { openComments } = usePageComments();
  const { openSuggest } = usePageSuggestions();
  // Inline comments only make sense on page documents (comments are `message`
  // nodes parented to the page). Record documents opt out.
  const isPage = node.type === 'page';
  // Page-only reading options (font / small text / TOC) and lock state. All
  // null/absent => the historical default, so existing pages are unaffected.
  const pageNode = node.type === 'page' ? node : null;
  const font = pageNode?.font ?? 'default';
  const smallText = pageNode?.smallText ?? false;
  const showToc = pageNode?.showToc ?? false;
  const canSuggestEdits = (canSuggest ?? false) && isPage;
  const effectiveLockMode = (isPage ? lockMode : null) ?? 'open';
  const lockBannerText =
    !isPage || effectiveLockMode === 'open'
      ? null
      : canEdit
        ? effectiveLockMode === 'suggest'
          ? 'Locked — others can only suggest edits.'
          : 'Locked — only the owner and workspace admins can edit.'
        : canSuggestEdits
          ? 'This page is locked. You can suggest edits, but not edit directly.'
          : 'This page is read-only.';

  const presences = usePresences(node.id);
  // Record ONE historical view of this page/record on open (throttled inside
  // the hook so re-renders/navigation do not spam the endpoint).
  useRecordNodeView(workspace.userId, node.id);
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
  const [wordCount, setWordCount] = useState(0);

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

  const router = useRouter();
  const layout = useLayout();
  const linkNavRef = useRef({
    router,
    layout,
    userId: workspace.userId,
    rootId: node.rootId,
    parentId: node.parentId,
  });
  linkNavRef.current = {
    router,
    layout,
    userId: workspace.userId,
    rootId: node.rootId,
    parentId: node.parentId,
  };

  const navigateToNode = useCallback(
    (nodeId: string, mode: 'same' | 'newtab' | 'modal', anchor: string) => {
      const {
        router: appRouter,
        layout: appLayout,
        userId,
      } = linkNavRef.current;
      const path = `/workspace/${userId}/${nodeId}${anchor}`;
      if (mode === 'newtab') {
        if (appLayout?.openInNewTab) {
          appLayout.openInNewTab(path);
        } else {
          window.open(path, '_blank', 'noopener,noreferrer');
        }
        return;
      }
      if (mode === 'modal') {
        appRouter.history.push(`${window.location.pathname}/modal/${nodeId}`);
        return;
      }
      appRouter.history.push(path);
    },
    []
  );

  // Route clicks on plain <a> links inside the editor. A real node link
  // navigates in place (Ctrl/Cmd or middle-click = new tab, Shift = modal); an
  // imported markdown link (05-Boards.md) is resolved to its page by slug;
  // external links and in-page anchors keep the browser default.
  const handleLinkClick = useCallback(
    (href: string, mode: 'same' | 'newtab' | 'modal'): boolean => {
      if (href.startsWith('#')) {
        return false;
      }
      let url: URL;
      try {
        url = new URL(href, window.location.href);
      } catch {
        return false;
      }
      if (url.origin !== window.location.origin) {
        window.open(url.href, '_blank', 'noopener,noreferrer');
        return true;
      }
      const segments = url.pathname.split('/').filter(Boolean);
      const isNodeRoute =
        segments[0] === 'workspace' &&
        segments.length >= 3 &&
        /^[0-9a-z]{18,}$/i.test(segments[2] ?? '');
      if (isNodeRoute) {
        navigateToNode(segments[2]!, mode, url.hash);
        return true;
      }
      // Internal but not a node route -> an imported markdown link. Resolve
      // the slug to a real page and navigate; fall back to a new tab if it
      // can't be resolved.
      const { userId, rootId, parentId } = linkNavRef.current;
      const base = url.pathname.split('/').pop() ?? '';
      const anchor = url.hash;
      void resolveMarkdownLink(base, userId, rootId, parentId).then(
        (nodeId) => {
          if (nodeId) {
            navigateToNode(nodeId, mode, anchor);
          } else {
            window.open(url.href, '_blank', 'noopener,noreferrer');
          }
        }
      );
      return true;
    },
    [navigateToNode]
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
        PlaneEmbedNode,
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
        HeadingEnhancementsExtension,
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
        ColumnsDragExtension,
        ColumnsResizeExtension,
        ChartNode,
        DividerNode,
        MathBlockNode,
        MathInlineNode,
        MermaidNode,
        TrailingNode,
        PresenceExtension,
        LinkMark.configure({ onLinkClick: handleLinkClick }),
        DeleteControlExtension,
        DropcursorExtension,
        DatabaseNode,
        WhiteboardEmbedNode.configure({
          context: {
            userId: workspace.userId,
            documentId: node.id,
            accountId: workspace.accountId,
            workspaceId: workspace.workspaceId,
            rootId: node.rootId,
          },
        }),
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
            AiCommand,
            ParagraphCommand,
            PageCommand,
            BlockquoteCommand,
            Heading1Command,
            Heading2Command,
            Heading3Command,
            NumberHeadingsCommand,
            CreateAdrCommand,
            BulletListCommand,
            CodeBlockCommand,
            OrderedListCommand,
            TableCommand,
            DatabaseInlineCommand,
            WhiteboardCommand,
            DatabaseCommand,
            DatabaseLinkCommand,
            DividerCommand,
            MathBlockCommand,
            MathInlineCommand,
            MermaidCommand,
            TodoCommand,
            ToggleCommand,
            CalloutCommand,
            TableOfContentsCommand,
            BookmarkCommand,
            EmbedCommand,
            PlaneCommand,
            ColumnsCommand,
            ChartCommand,
            GithubCommand,
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

    // A corrupt update arriving via sync must not throw into this effect and
    // flip an open, healthy page into a latched "Node error" -- skip bad ones.
    try {
      ydocRef.current.applyUpdate(state.state);
    } catch {
      // skip a corrupt base state
    }
    for (const update of updates) {
      try {
        ydocRef.current.applyUpdate(update.data);
      } catch {
        // skip a corrupt update
      }
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

  // Expose Markdown / rendered-HTML export of the live document to the page
  // ⋯ menu (a different subtree), and keep a live word count for the footer.
  useEffect(() => {
    if (!editor) {
      return;
    }
    const unregister = registerDocumentExporter(node.id, {
      getMarkdown: () => editor.getMarkdown(),
      getRenderedHtml: () => {
        try {
          return editor.view.dom.innerHTML;
        } catch {
          return editor.getHTML();
        }
      },
    });

    const recount = () => {
      const text = editor.getText().trim();
      setWordCount(text.length === 0 ? 0 : text.split(/\s+/).length);
    };
    recount();
    editor.on('update', recount);

    return () => {
      editor.off('update', recount);
      unregister();
    };
  }, [editor, node.id]);

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
      {editor && viewReady && (canEdit || canSuggestEdits) && (
        <Fragment>
          <ToolbarMenu
            editor={editor}
            userId={workspace.userId}
            pageId={node.id}
            onAddComment={
              isPage
                ? (threadId) => openComments(node.id, threadId)
                : undefined
            }
            onSuggestEdit={
              isPage ? (blockId) => openSuggest(node.id, blockId) : undefined
            }
          />
          {canEdit && (
            <Fragment>
              <ActionMenu
                editor={editor}
                userId={workspace.userId}
                pageId={node.id}
                onAddComment={
                  isPage
                    ? (threadId) => openComments(node.id, threadId)
                    : undefined
                }
                onSuggestEdit={
                  isPage
                    ? (blockId) => openSuggest(node.id, blockId)
                    : undefined
                }
              />
              <AiSlashPrompt />
            </Fragment>
          )}
        </Fragment>
      )}
      {lockBannerText && (
        <div className="mb-3 flex items-center gap-2 rounded-md border border-border/60 bg-muted/40 px-3 py-2 text-xs text-muted-foreground">
          <Lock className="size-3.5 shrink-0" />
          <span>{lockBannerText}</span>
        </div>
      )}
      {isPage && showToc && editor && viewReady && (
        <DocumentToc editor={editor} />
      )}
      {isPage && editor && viewReady && (
        <DocumentReadingProgress editor={editor} />
      )}
      <div
        className={cn(
          font === 'serif' && 'editor-font-serif',
          font === 'mono' && 'editor-font-mono',
          smallText && 'editor-small-text'
        )}
      >
        <EditorContent editor={editor} />
      </div>
      {isPage && wordCount > 0 && (
        <div className="mt-6 select-none border-t border-border/60 pt-2 text-xs text-muted-foreground">
          {wordCount} word{wordCount === 1 ? '' : 's'} · ~
          {Math.max(1, Math.ceil(wordCount / 200))} min read
        </div>
      )}
    </div>
  );
};
