// ABOUTME: Pure, workspace-free read/suggest editor for the public share SPA —
// ABOUTME: a whitelisted TipTap subset plus a sanitizer that drops any node/mark
// ABOUTME: the public schema does not know (mention, database, file, whiteboard…).
import '@colanode/ui/styles/editor.css';

import { Editor, JSONContent } from '@tiptap/core';
import { EditorContent, useEditor } from '@tiptap/react';
import { useEffect } from 'react';

import { buildEditorContent } from '@colanode/client/lib';
import { RichTextContent } from '@colanode/core';
import {
  BlockquoteNode,
  BoldMark,
  BookmarkNode,
  BulletListNode,
  CalloutNode,
  ChartNode,
  CodeBlockNode,
  CodeMark,
  ColorMark,
  ColumnNode,
  ColumnsNode,
  DividerNode,
  DocumentNode,
  EmbedNode,
  HardBreakNode,
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
  OrderedListNode,
  ParagraphNode,
  StrikethroughMark,
  TableCellNode,
  TableHeaderNode,
  TableNode,
  TableOfContentsNode,
  TableRowNode,
  TabKeymapExtension,
  TaskItemNode,
  TaskListNode,
  TextNode,
  ToggleContentNode,
  ToggleNode,
  ToggleSummaryNode,
  UnderlineMark,
} from '@colanode/ui/editor/extensions';
import { PublicFileNode } from '@colanode/ui/editor/public/public-file-node';

// The set of node/mark types the public editor's schema actually registers.
// Anything outside this set is removed from the incoming document BEFORE it is
// handed to ProseMirror, so `Node.fromJSON` never sees an unknown type (which
// would throw and blank the whole page). Keep this in lock-step with
// `buildPublicShareExtensions` below.
const PUBLIC_ALLOWED_NODES = new Set<string>([
  'doc',
  'text',
  'paragraph',
  'hardBreak',
  'heading1',
  'heading2',
  'heading3',
  'blockquote',
  'bulletList',
  'orderedList',
  'listItem',
  'taskList',
  'taskItem',
  'codeBlock',
  'horizontalRule',
  'table',
  'tableRow',
  'tableCell',
  'tableHeader',
  'toggle',
  'toggleSummary',
  'toggleContent',
  'callout',
  'columns',
  'column',
  'chart',
  'mathBlock',
  'mathInline',
  'mermaid',
  'tableOfContents',
  'bookmark',
  'embed',
  'file',
]);

const PUBLIC_ALLOWED_MARKS = new Set<string>([
  'bold',
  'italic',
  'underline',
  'strike',
  'code',
  'color',
  'highlight',
  'link',
]);

// Recursively strip any node whose type is not in the public schema, and any
// mark the public schema does not register. Unknown block nodes (and their
// subtree) are dropped; unknown inline nodes (e.g. `mention`) are dropped in
// place, leaving the surrounding text intact.
const sanitizeNode = (node: JSONContent): JSONContent | null => {
  if (!node.type || !PUBLIC_ALLOWED_NODES.has(node.type)) {
    return null;
  }

  // Drop a bookmark whose url is not a plain web link. A public-share
  // suggestion could smuggle a `javascript:` / `data:` bookmark that would run
  // in the owner's authenticated session when the proposal is previewed; the
  // node view guards the same thing, this is the belt-and-suspenders at parse
  // time.
  if (node.type === 'bookmark') {
    const url =
      typeof node.attrs?.url === 'string' ? (node.attrs.url as string) : '';
    let safe = false;
    try {
      safe = /^https?:$/i.test(new URL(url).protocol);
    } catch {
      safe = false;
    }
    if (!safe) {
      return null;
    }
  }

  const cleaned: JSONContent = { ...node };

  if (node.marks && node.marks.length > 0) {
    const marks = node.marks.filter(
      (mark) => mark.type && PUBLIC_ALLOWED_MARKS.has(mark.type)
    );
    if (marks.length > 0) {
      cleaned.marks = marks;
    } else {
      delete cleaned.marks;
    }
  }

  if (node.content && node.content.length > 0) {
    const content = node.content
      .map((child) => sanitizeNode(child))
      .filter((child): child is JSONContent => child !== null);
    cleaned.content = content;
  }

  return cleaned;
};

export const sanitizePublicDoc = (doc: JSONContent): JSONContent => {
  const sanitized = sanitizeNode(doc);
  if (sanitized && sanitized.content && sanitized.content.length > 0) {
    return sanitized;
  }
  // Never hand ProseMirror an empty doc — it needs at least one block.
  return { type: 'doc', content: [{ type: 'paragraph' }] };
};

// The document's top-level blocks are parented to the node id (the page id),
// which is NOT itself a block. Find that id so `buildEditorContent` can locate
// the roots without the API having to echo the node id back to us.
const findRootParentId = (content: RichTextContent): string => {
  const blocks = content.blocks ?? {};
  const ids = new Set(Object.keys(blocks));
  for (const block of Object.values(blocks)) {
    if (block.parentId && !ids.has(block.parentId)) {
      return block.parentId;
    }
  }
  return 'public-share-root';
};

// Build the ProseMirror JSON the public editor should render, from the raw
// share-api `content` blocks: reconstruct via the shared block↔content mapping,
// then sanitize away anything the public schema cannot render.
export const buildPublicShareContent = (
  content: RichTextContent
): JSONContent => {
  const rootId = findRootParentId(content);
  const doc = buildEditorContent(rootId, content);
  return sanitizePublicDoc(doc);
};

// The pure extension set. Contains no NodeView that reaches for `useWorkspace`,
// `useNode`, collections, presence, mentions, AI, or the local client — so it
// runs on a page that has no account/workspace at all. `editable` only adds a
// couple of editing keymaps used in suggest mode; the schema is identical.
// `token` is only used by the read-only file node to build public image URLs.
export const buildPublicShareExtensions = (
  editable: boolean,
  token: string,
  imageKey: string | null
) => {
  const extensions = [
    IdExtension,
    PublicFileNode.configure({ token, imageKey }),
    DocumentNode,
    TextNode,
    ParagraphNode,
    HardBreakNode,
    Heading1Node,
    Heading2Node,
    Heading3Node,
    HeadingEnhancementsExtension,
    BlockquoteNode,
    BulletListNode,
    OrderedListNode,
    ListItemNode,
    TaskListNode,
    TaskItemNode,
    CodeBlockNode,
    DividerNode,
    TableNode,
    TableRowNode,
    TableCellNode,
    TableHeaderNode,
    ToggleNode,
    ToggleSummaryNode,
    ToggleContentNode,
    CalloutNode,
    ColumnsNode,
    ColumnNode,
    ChartNode,
    MathBlockNode,
    MathInlineNode,
    MermaidNode,
    TableOfContentsNode,
    BookmarkNode,
    EmbedNode,
    LinkMark,
    BoldMark,
    ItalicMark,
    UnderlineMark,
    StrikethroughMark,
    CodeMark,
    ColorMark,
    HighlightMark,
  ];

  if (editable) {
    extensions.push(TabKeymapExtension, ListKeymapExtension);
  }

  return extensions;
};

interface PublicShareEditorProps {
  token: string;
  content: RichTextContent;
  editable: boolean;
  imageKey?: string | null;
  onEditorReady?: (editor: Editor) => void;
}

export const PublicShareEditor = ({
  token,
  content,
  editable,
  imageKey = null,
  onEditorReady,
}: PublicShareEditorProps) => {
  const editor = useEditor(
    {
      extensions: buildPublicShareExtensions(editable, token, imageKey),
      content: buildPublicShareContent(content),
      editable,
      immediatelyRender: true,
      shouldRerenderOnTransaction: false,
      editorProps: {
        attributes: {
          class:
            'prose-lg prose-stone dark:prose-invert prose-headings:font-title font-default focus:outline-none max-w-full text-foreground',
          spellCheck: 'false',
        },
      },
    },
    [editable, token, imageKey]
  );

  useEffect(() => {
    if (editor) {
      onEditorReady?.(editor);
    }
  }, [editor, onEditorReady]);

  return <EditorContent editor={editor} />;
};
