// Wiki AI tool layer — factored, reusable, and bound to the acting workspace
// user. Every tool takes a WikiToolContext ({ userId, workspaceId }) and
// enforces that the target node belongs to that workspace and that the user
// can access it (via the same collaboration/role model the rest of the server
// uses). The tools operate through the existing node/document/record server
// primitives (createNode, updateNode, createDocument, updateDocument, ...) so
// they inherit the CRDT + permission semantics of a normal client mutation.
//
// This module has NO dependency on the `ai` package: it exposes plain async
// functions plus a declarative `wikiToolDefinitions` manifest (name +
// description + zod inputSchema + run + action). The agentic endpoint wraps
// each definition with the `ai` package's tool(); a future MCP HTTP server can
// import the very same functions/definitions unchanged.
import { sql, SqlBool } from 'kysely';
import { z } from 'zod/v4';

import {
  Block,
  BlockLeaf,
  CanCreateNodeContext,
  CanUpdateAttributesContext,
  CanUpdateDocumentContext,
  compareString,
  DatabaseAttributes,
  extractNodeRole,
  FieldAttributes,
  FileAttributes,
  FileStatus,
  FieldValue,
  generateFractionalIndex,
  generateId,
  getNodeModel,
  hasNodeRole,
  IdType,
  NodeAttributes,
  NodeRole,
  NodeType,
  PageAttributes,
  RecordAttributes,
  RichTextContent,
  WorkspaceRole,
} from '@colanode/core';
import { database } from '@colanode/server/data/database';
import { SelectNode } from '@colanode/server/data/schema';
import {
  loadImageFromBase64,
  loadImageFromUrl,
  MAX_IMAGE_BYTES,
} from '@colanode/server/lib/ai/wiki-image';
import {
  createDocument,
  updateDocument,
} from '@colanode/server/lib/documents';
import {
  isSvgMimeType,
  sanitizeSvg,
} from '@colanode/server/lib/files/svg-safety';
import {
  createNode,
  fetchNode,
  fetchNodeTree,
  mapNode,
  updateNode,
} from '@colanode/server/lib/nodes';
import { fetchAllRecords, searchRecords } from '@colanode/server/lib/records';
import { storage } from '@colanode/server/lib/storage';

// ---------------------------------------------------------------------------
// Context + errors
// ---------------------------------------------------------------------------

export interface WikiToolContext {
  userId: string;
  workspaceId: string;
}

// Expected (recoverable) tool failures — permission denied, node not found,
// bad input. The agent surfaces these back to the model as a tool result so it
// can adapt, rather than aborting the whole run.
export class WikiToolError extends Error {}

// Node types the wiki tools consider "pages/entries" for search.
const SEARCHABLE_NODE_TYPES: NodeType[] = [
  'page',
  'folder',
  'database',
  'record',
  'channel',
  'space',
];

// ---------------------------------------------------------------------------
// Access helpers
// ---------------------------------------------------------------------------

interface AccessibleNode {
  tree: SelectNode[];
  node: SelectNode;
  role: NodeRole;
}

// Loads the full ancestor→node tree, asserts the node exists inside the given
// workspace, and resolves the acting user's node role (null → no access).
const requireAccessibleNode = async (
  nodeId: string,
  ctx: WikiToolContext
): Promise<AccessibleNode> => {
  const tree = await fetchNodeTree(nodeId);
  if (tree.length === 0) {
    throw new WikiToolError(`Node ${nodeId} was not found.`);
  }

  const node = tree[tree.length - 1];
  if (!node || node.id !== nodeId) {
    throw new WikiToolError(`Node ${nodeId} was not found.`);
  }

  if (node.workspace_id !== ctx.workspaceId) {
    throw new WikiToolError(`Node ${nodeId} is not in this workspace.`);
  }

  const role = extractNodeRole(tree.map(mapNode), ctx.userId);
  if (!role) {
    throw new WikiToolError(`You do not have access to node ${nodeId}.`);
  }

  return { tree, node, role };
};

interface WorkspaceUser {
  id: string;
  role: WorkspaceRole;
  accountId: string;
  workspaceId: string;
}

const fetchWorkspaceUser = async (
  ctx: WikiToolContext
): Promise<WorkspaceUser> => {
  const user = await database
    .selectFrom('users')
    .select(['id', 'role', 'account_id'])
    .where('id', '=', ctx.userId)
    .where('workspace_id', '=', ctx.workspaceId)
    .executeTakeFirst();

  if (!user) {
    throw new WikiToolError('The acting user was not found in this workspace.');
  }

  return {
    id: user.id,
    role: user.role,
    accountId: user.account_id,
    workspaceId: ctx.workspaceId,
  };
};

// ---------------------------------------------------------------------------
// Markdown <-> rich-text block conversion
// ---------------------------------------------------------------------------

const LEAF_TEXT_TYPES = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'codeBlock',
]);

const applyLeafMarks = (leaf: BlockLeaf): string => {
  // A mention carries no text of its own -- its label is resolved from the
  // target node when it renders. Without a case here it fell straight through
  // the empty-text guard below and came back as nothing, so a replace-mode
  // edit DELETED every internal link on the page it rewrote.
  if (leaf.type === 'mention') {
    const target = (leaf.attrs ?? {}).target;
    return typeof target === 'string' && target.length > 0
      ? `[](node:${target})`
      : '';
  }

  let text = leaf.text ?? '';
  if (!text) {
    return '';
  }

  const marks = leaf.marks ?? [];
  const has = (type: string) => marks.some((mark) => mark.type === type);
  const link = marks.find((mark) => mark.type === 'link');

  if (has('code')) text = '`' + text + '`';
  if (has('bold')) text = '**' + text + '**';
  if (has('italic')) text = '*' + text + '*';
  if (has('strike')) text = '~~' + text + '~~';
  if (link && link.attrs && typeof link.attrs.href === 'string') {
    text = `[${text}](${link.attrs.href})`;
  }

  return text;
};

const leafText = (block: Block): string =>
  (block.content ?? []).map(applyLeafMarks).join('');

const attrString = (block: Block, key: string): string => {
  const value = (block.attrs ?? {})[key];
  return typeof value === 'string' ? value : '';
};

// Block types markdown cannot carry. A replace-mode edit round-trips the whole
// document through markdown, so these would be silently deleted -- 215 of the
// wiki's 935 documents hold at least one. edit_page refuses instead of eating
// them, because the model cannot even SEE them in what get_page returned.
const UNREPRESENTABLE_BLOCK_TYPES = new Set([
  'database',
  'whiteboardEmbed',
  'planeEmbed',
  'planeIssueLink',
  'embed',
  'bookmark',
  'chart',
  'columns',
  'column',
  'tableOfContents',
  'referenceList',
  'toggle',
  'toggleSummary',
  'toggleContent',
  'page',
  'folder',
  'mathBlock',
  'mathInline',
  'poll',
]);

export const unrepresentableBlockTypes = (
  content: RichTextContent | null | undefined
): string[] => {
  const blocks = content && content.blocks ? Object.values(content.blocks) : [];
  const found = new Set<string>();
  for (const block of blocks) {
    if (UNREPRESENTABLE_BLOCK_TYPES.has(block.type)) {
      found.add(block.type);
    }
  }
  return [...found].sort();
};

// Converts a page/record rich-text document into plain markdown for the model.
export const richTextToMarkdown = (
  documentId: string,
  content: RichTextContent | null | undefined
): string => {
  const blocks = content && content.blocks ? Object.values(content.blocks) : [];
  if (blocks.length === 0) {
    return '';
  }

  const childrenOf = (parentId: string): Block[] =>
    blocks
      .filter((block) => block.parentId === parentId)
      .sort((a, b) => compareString(a.index, b.index));

  // A cell holds paragraphs; a pipe inside one would break the row.
  const cellText = (cell: Block): string =>
    childrenOf(cell.id)
      .map((child) => leafText(child))
      .join(' ')
      .replace(/\|/g, '\\|')
      .trim();

  const tableLines = (table: Block, indent: string): string[] => {
    const rows = childrenOf(table.id).filter((row) => row.type === 'tableRow');
    if (rows.length === 0) {
      return [];
    }
    const matrix = rows.map((row) =>
      childrenOf(row.id)
        .filter((c) => c.type === 'tableHeader' || c.type === 'tableCell')
        .map((c) => cellText(c))
    );
    const width = Math.max(...matrix.map((row) => row.length));
    const pad = (row: string[]): string[] => {
      const copy = [...row];
      while (copy.length < width) {
        copy.push('');
      }
      return copy;
    };
    const out: string[] = [];
    out.push(indent + '| ' + pad(matrix[0] ?? []).join(' | ') + ' |');
    out.push(
      indent +
        '| ' +
        Array.from({ length: width }, () => '---').join(' | ') +
        ' |'
    );
    for (const row of matrix.slice(1)) {
      out.push(indent + '| ' + pad(row).join(' | ') + ' |');
    }
    return out;
  };

  const walk = (parentId: string, indent: string, ordered: boolean): string[] => {
    const lines: string[] = [];
    let counter = 1;

    for (const block of childrenOf(parentId)) {
      const text = leafText(block);
      switch (block.type) {
        case 'heading1':
          lines.push(indent + '# ' + text);
          break;
        case 'heading2':
          lines.push(indent + '## ' + text);
          break;
        case 'heading3':
          lines.push(indent + '### ' + text);
          break;
        case 'heading4':
          lines.push(indent + '#### ' + text);
          break;
        case 'heading5':
          lines.push(indent + '##### ' + text);
          break;
        case 'paragraph':
          lines.push(indent + text);
          break;
        case 'codeBlock': {
          // The language was dropped on the way out, so a round-trip turned
          // every annotated block into plaintext.
          const language = attrString(block, 'language');
          lines.push(indent + '```' + (language === 'plaintext' ? '' : language));
          lines.push(indent + text);
          lines.push(indent + '```');
          break;
        }
        case 'mermaid': {
          // Fenced as ```mermaid, which the parser turns back into a real
          // diagram rather than a code block.
          lines.push(indent + '```mermaid');
          for (const sourceLine of attrString(block, 'source').split('\n')) {
            lines.push(sourceLine);
          }
          lines.push(indent + '```');
          break;
        }
        case 'callout': {
          const colour = attrString(block, 'color');
          lines.push(
            indent + '> [!NOTE]' + (colour && colour !== 'default' ? ' ' + colour : '')
          );
          for (const line of walk(block.id, '', false)) {
            lines.push(indent + '> ' + line);
          }
          break;
        }
        case 'file':
          // A file block carries no attrs: the BLOCK's own id is the file
          // node id. An image renders inline, anything else as a file card.
          lines.push(indent + '![](file:' + block.id + ')');
          break;
        case 'table':
          lines.push(...tableLines(block, indent));
          break;
        case 'tableRow':
        case 'tableHeader':
        case 'tableCell':
          // Consumed by the 'table' case above.
          break;
        case 'horizontalRule':
          lines.push(indent + '---');
          break;
        case 'blockquote':
          for (const line of walk(block.id, '', false)) {
            lines.push(indent + '> ' + line);
          }
          break;
        case 'bulletList':
          lines.push(...walk(block.id, indent, false));
          break;
        case 'orderedList':
          lines.push(...walk(block.id, indent, true));
          break;
        case 'taskList':
          lines.push(...walk(block.id, indent, false));
          break;
        case 'listItem': {
          const inner = walk(block.id, indent + '  ', false);
          const first = inner.shift() ?? indent + '  ';
          const marker = ordered ? `${counter}. ` : '- ';
          lines.push(indent + marker + first.trimStart());
          lines.push(...inner);
          counter += 1;
          break;
        }
        case 'taskItem': {
          const checked = block.attrs && block.attrs.checked ? 'x' : ' ';
          const inner = walk(block.id, indent + '  ', false);
          const first = inner.shift() ?? '';
          lines.push(indent + `- [${checked}] ` + first.trimStart());
          lines.push(...inner);
          break;
        }
        default:
          if (text) {
            lines.push(indent + text);
          } else {
            lines.push(...walk(block.id, indent, false));
          }
      }
    }

    return lines;
  };

  return walk(documentId, '', false).join('\n');
};

const inlinePatterns: { re: RegExp; make: (match: RegExpExecArray) => BlockLeaf }[] =
  [
    {
      // An image that is not one of ours cannot be displayed — the wiki has no
      // image node, only file nodes. Render it as a link rather than leaving a
      // stray '!' in the text, which is what used to happen.
      re: /^!\[([^\]]*)\]\(([^)\s]+)\)/,
      make: (m) => ({
        type: 'text',
        text: m[1] || m[2],
        marks: [
          {
            type: 'link',
            attrs: {
              href: m[2],
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
            },
          },
        ],
      }),
    },
    {
      // An internal wiki link becomes a real mention rather than a link mark.
      // Mentions are what the backlink index and the knowledge graph are built
      // from, and they render the target's CURRENT title instead of a copy
      // frozen at the moment somebody wrote the link.
      //
      // Three spellings are accepted: node:<id>, the /{workspace}/{node} path,
      // and the full URL that "Copy link" puts on the clipboard -- each with an
      // optional #block fragment. Ids are long lowercase alphanumerics, which
      // is what keeps an ordinary external link from matching here.
      re: /^\[([^\]]*)\]\((?:node:([a-z0-9]{20,})|(?:https?:\/\/[^/)\s]+)?\/[a-z0-9]{20,}\/([a-z0-9]{20,}))(?:#[a-z0-9]{20,})?\)/,
      make: (m) => ({
        type: 'mention',
        attrs: {
          id: generateId(IdType.Mention),
          target: (m[2] ?? m[3]) as string,
        },
      }),
    },
    {
      re: /^\[([^\]]+)\]\(([^)\s]+)\)/,
      make: (m) => ({
        type: 'text',
        text: m[1],
        marks: [
          {
            type: 'link',
            attrs: {
              href: m[2],
              target: '_blank',
              rel: 'noopener noreferrer nofollow',
            },
          },
        ],
      }),
    },
    {
      re: /^\*\*([^*]+)\*\*/,
      make: (m) => ({ type: 'text', text: m[1], marks: [{ type: 'bold' }] }),
    },
    {
      re: /^__([^_]+)__/,
      make: (m) => ({ type: 'text', text: m[1], marks: [{ type: 'bold' }] }),
    },
    {
      re: /^~~([^~]+)~~/,
      make: (m) => ({ type: 'text', text: m[1], marks: [{ type: 'strike' }] }),
    },
    {
      re: /^\*([^*]+)\*/,
      make: (m) => ({ type: 'text', text: m[1], marks: [{ type: 'italic' }] }),
    },
    {
      re: /^_([^_]+)_/,
      make: (m) => ({ type: 'text', text: m[1], marks: [{ type: 'italic' }] }),
    },
    {
      re: /^`([^`]+)`/,
      make: (m) => ({ type: 'text', text: m[1], marks: [{ type: 'code' }] }),
    },
  ];

const parseInline = (text: string): BlockLeaf[] => {
  if (!text) {
    return [];
  }

  const leaves: BlockLeaf[] = [];
  let rest = text;
  let plain = '';

  const flushPlain = () => {
    if (plain) {
      leaves.push({ type: 'text', text: plain });
      plain = '';
    }
  };

  while (rest.length) {
    let matched = false;
    for (const pattern of inlinePatterns) {
      const match = pattern.re.exec(rest);
      if (match) {
        flushPlain();
        leaves.push(pattern.make(match));
        rest = rest.slice((match[0] ?? '').length);
        matched = true;
        break;
      }
    }
    if (!matched) {
      plain += rest.charAt(0);
      rest = rest.slice(1);
    }
  }

  flushPlain();
  return leaves;
};

const newBlock = (type: string, parentId: string, index: string): Block => ({
  id: generateId(IdType.Block),
  type,
  parentId,
  index,
  content: LEAF_TEXT_TYPES.has(type) ? [] : undefined,
});

// Converts markdown/plain text into a rich-text block record whose top-level
// blocks are parented on `documentId`. `afterIndex` places the first top-level
// block after an existing block (used by edit_page append mode).
export const markdownToBlocks = (
  documentId: string,
  markdown: string,
  afterIndex: string | null = null
): Record<string, Block> => {
  const blocks: Record<string, Block> = {};
  const lines = markdown.replace(/\r\n/g, '\n').split('\n');

  let prevTopIndex = afterIndex;
  const pushTop = (type: string): Block => {
    const index = generateFractionalIndex(prevTopIndex, null);
    prevTopIndex = index;
    const block = newBlock(type, documentId, index);
    blocks[block.id] = block;
    return block;
  };

  const addChild = (
    parentId: string,
    type: string,
    after: string | null
  ): Block => {
    const block = newBlock(type, parentId, generateFractionalIndex(after, null));
    blocks[block.id] = block;
    return block;
  };

  const addParagraph = (parentId: string, text: string): Block => {
    const para = addChild(parentId, 'paragraph', null);
    para.content = parseInline(text);
    return para;
  };

  // GitHub callout keywords mapped onto the palette the callout block actually
  // stores. Anything unknown stays neutral rather than guessing a colour.
  const CALLOUT_COLOURS: Record<string, string> = {
    note: 'blue',
    info: 'blue',
    tip: 'green',
    success: 'green',
    warning: 'orange',
    caution: 'orange',
    important: 'purple',
    danger: 'red',
    error: 'red',
  };

  // One entry per open list level, so indentation can nest instead of being
  // flattened. The old parser read `trimmed` only, which made every sub-list a
  // sibling of its parent.
  type ListLevel = {
    indent: number;
    list: Block;
    kind: 'bullet' | 'ordered' | 'task';
    lastItemIndex: string | null;
    lastItem: Block | null;
    lastItemChildIndex: string | null;
  };
  let stack: ListLevel[] = [];
  const resetLists = () => {
    stack = [];
  };

  const isTableDelimiter = (value: string): boolean => {
    const line = value.trim();
    // A delimiter MUST contain a pipe. Without this check the pattern also
    // matches a bare '---', so any paragraph that happened to contain a pipe
    // and was followed by a horizontal rule was swallowed as a one-row table —
    // which is exactly what a real page with 57 tables turned into 58.
    if (!line.includes('|')) {
      return false;
    }
    return /^\|?\s*:?-{3,}:?\s*(\|\s*:?-{3,}:?\s*)*\|?$/.test(line);
  };

  const splitRow = (value: string): string[] => {
    let row = value.trim();
    if (row.startsWith('|')) {
      row = row.slice(1);
    }
    if (row.endsWith('|')) {
      row = row.slice(0, -1);
    }
    return row.split(/(?<!\\)\|/).map((cell) => cell.trim().replace(/\\\|/g, '|'));
  };

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? '').replace(/\s+$/, '');
    const trimmed = line.trim();
    const indentWidth = line.length - line.trimStart().length;

    if (trimmed.startsWith('```')) {
      resetLists();
      const info = trimmed.slice(3).trim().toLowerCase();
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !(lines[i] ?? '').trim().startsWith('```')) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // skip closing fence
      if (info === 'mermaid') {
        // A real diagram, not a code block: editable afterwards and themed.
        const block = pushTop('mermaid');
        block.attrs = { source: codeLines.join('\n') };
      } else {
        const block = pushTop('codeBlock');
        block.content = [{ type: 'text', text: codeLines.join('\n') }];
        block.attrs = { language: info || 'plaintext' };
      }
      continue;
    }

    if (trimmed === '') {
      resetLists();
      i += 1;
      continue;
    }

    // A GFM table is a row followed by a delimiter row. Without this branch
    // every line landed as a paragraph of literal pipes.
    if (trimmed.includes('|') && isTableDelimiter(lines[i + 1] ?? '')) {
      resetLists();
      const header = splitRow(trimmed);
      i += 2;
      const bodyRows: string[][] = [];
      while (i < lines.length) {
        const candidate = (lines[i] ?? '').trim();
        if (candidate === '' || !candidate.includes('|')) {
          break;
        }
        bodyRows.push(splitRow(candidate));
        i += 1;
      }

      const table = pushTop('table');
      table.attrs = { colorRules: [] };
      let rowAfter: string | null = null;
      const emitRow = (cells: string[], cellType: string) => {
        const row = addChild(table.id, 'tableRow', rowAfter);
        rowAfter = row.index;
        let cellAfter: string | null = null;
        const width = Math.max(header.length, cells.length);
        for (let c = 0; c < width; c++) {
          const cell = addChild(row.id, cellType, cellAfter);
          cellAfter = cell.index;
          cell.attrs = { colspan: 1, rowspan: 1 };
          addParagraph(cell.id, cells[c] ?? '');
        }
      };
      emitRow(header, 'tableHeader');
      for (const row of bodyRows) {
        emitRow(row, 'tableCell');
      }
      continue;
    }

    // The editor has five heading levels; a sixth hash lands on the fifth
    // instead of rendering its hashes as text.
    // An uploaded image is placed by writing ![caption](file:<id>) on its own
    // line. The block's id must BE the file node id — file blocks carry no
    // attrs at all, which is the one detail that makes this work.
    const image = /^!\[[^\]]*\]\(file:([0-9a-z]{20,})\)$/.exec(trimmed);
    if (image && image[1]) {
      resetLists();
      const index = generateFractionalIndex(prevTopIndex, null);
      prevTopIndex = index;
      blocks[image[1]] = {
        id: image[1],
        type: 'file',
        parentId: documentId,
        index,
      };
      i += 1;
      continue;
    }

    const heading = /^(#{1,6})\s+(.*)$/.exec(trimmed);
    if (heading) {
      resetLists();
      const level = Math.min(5, (heading[1] ?? '#').length);
      const type = `heading${level}`;
      const block = pushTop(type);
      block.content = parseInline(heading[2] ?? '');
      i += 1;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      resetLists();
      pushTop('horizontalRule');
      i += 1;
      continue;
    }

    const callout = /^>\s*\[!([A-Za-z]+)\]\s*(.*)$/.exec(trimmed);
    if (callout) {
      resetLists();
      const block = pushTop('callout');
      block.attrs = {
        color: CALLOUT_COLOURS[(callout[1] ?? '').toLowerCase()] ?? 'default',
      };
      let after: string | null = null;
      const firstLine = (callout[2] ?? '').trim();
      if (firstLine) {
        const para = addChild(block.id, 'paragraph', after);
        para.content = parseInline(firstLine);
        after = para.index;
      }
      i += 1;
      while (i < lines.length && /^>\s?/.test((lines[i] ?? '').trim())) {
        const inner = (lines[i] ?? '').trim().replace(/^>\s?/, '');
        const para = addChild(block.id, 'paragraph', after);
        para.content = parseInline(inner);
        after = para.index;
        i += 1;
      }
      continue;
    }

    const quote = /^>\s?(.*)$/.exec(trimmed);
    if (quote) {
      resetLists();
      const block = pushTop('blockquote');
      let after: string | null = null;
      let current: RegExpExecArray | null = quote;
      while (current) {
        const para = addChild(block.id, 'paragraph', after);
        para.content = parseInline(current[1] ?? '');
        after = para.index;
        i += 1;
        current =
          i < lines.length
            ? /^>\s?(.*)$/.exec((lines[i] ?? '').trim())
            : null;
      }
      continue;
    }

    const task = /^[-*+]\s+\[([ xX])\]\s+(.*)$/.exec(trimmed);
    const ordered = /^(\d+)[.)]\s+(.*)$/.exec(trimmed);
    const bullet = /^[-*+]\s+(.*)$/.exec(trimmed);

    if (task || ordered || bullet) {
      const kind: 'bullet' | 'ordered' | 'task' = task
        ? 'task'
        : ordered
          ? 'ordered'
          : 'bullet';
      const text = task
        ? (task[2] ?? '')
        : ordered
          ? (ordered[2] ?? '')
          : (bullet?.[1] ?? '');
      const listType =
        kind === 'ordered'
          ? 'orderedList'
          : kind === 'task'
            ? 'taskList'
            : 'bulletList';

      while (stack.length > 1 && indentWidth < (stack[stack.length - 1]?.indent ?? 0)) {
        stack.pop();
      }

      let level = stack[stack.length - 1];
      const openLevel = (parent: ListLevel | undefined) => {
        const parentItem = parent?.lastItem ?? null;
        const list = parentItem
          ? addChild(parentItem.id, listType, parent?.lastItemChildIndex ?? null)
          : pushTop(listType);
        if (parentItem && parent) {
          parent.lastItemChildIndex = list.index;
        }
        const created: ListLevel = {
          indent: indentWidth,
          list,
          kind,
          lastItemIndex: null,
          lastItem: null,
          lastItemChildIndex: null,
        };
        stack.push(created);
        return created;
      };

      if (!level) {
        level = openLevel(undefined);
      } else if (indentWidth > level.indent && level.lastItem) {
        level = openLevel(level);
      } else if (level.kind !== kind) {
        stack.pop();
        level = openLevel(stack[stack.length - 1]);
      }

      const itemType = kind === 'task' ? 'taskItem' : 'listItem';
      const item = addChild(level.list.id, itemType, level.lastItemIndex);
      if (kind === 'task') {
        item.attrs = { checked: task ? task[1]?.toLowerCase() === 'x' : false };
      }
      level.lastItemIndex = item.index;
      level.lastItem = item;
      const para = addParagraph(item.id, text);
      level.lastItemChildIndex = para.index;

      i += 1;
      continue;
    }

    resetLists();
    const paragraph = pushTop('paragraph');
    paragraph.content = parseInline(trimmed);
    i += 1;
  }

  return blocks;
};

const maxTopLevelIndex = (
  documentId: string,
  content: RichTextContent | null | undefined
): string | null => {
  const blocks = content && content.blocks ? Object.values(content.blocks) : [];
  const top = blocks
    .filter((block) => block.parentId === documentId)
    .sort((a, b) => compareString(a.index, b.index));
  const last = top[top.length - 1];
  return last ? last.index : null;
};

// ---------------------------------------------------------------------------
// Field-value helpers (records)
// ---------------------------------------------------------------------------

const findField = (
  attributes: DatabaseAttributes,
  key: string
): FieldAttributes | null => {
  const fields = attributes.fields ?? {};
  const direct = fields[key];
  if (direct) {
    return direct;
  }
  const lower = key.toLowerCase();
  for (const field of Object.values(fields)) {
    if (field.name.toLowerCase() === lower) {
      return field;
    }
  }
  return null;
};

const resolveOptionId = (
  field: FieldAttributes,
  value: string
): string | null => {
  if (field.type !== 'select' && field.type !== 'multi_select') {
    return null;
  }
  const options = field.options ?? {};
  if (options[value]) {
    return value;
  }
  const lower = value.toLowerCase();
  for (const option of Object.values(options)) {
    if (option.name.toLowerCase() === lower) {
      return option.id;
    }
  }
  return null;
};

// Converts a JS value provided by the model into the typed FieldValue for the
// given field. Returns null for unsupported/uncomputable fields (relation,
// file, collaborator, formula, rollup, created_*/updated_*) or invalid values.
const toFieldValue = (
  field: FieldAttributes,
  value: unknown
): FieldValue | null => {
  switch (field.type) {
    case 'text':
      return { type: 'text', value: String(value) };
    case 'email':
    case 'phone':
    case 'url':
    case 'date':
      return { type: 'string', value: String(value) };
    case 'number': {
      const num = typeof value === 'number' ? value : Number(value);
      return Number.isNaN(num) ? null : { type: 'number', value: num };
    }
    case 'boolean':
      return { type: 'boolean', value: Boolean(value) };
    case 'select': {
      const optionId = resolveOptionId(field, String(value));
      return optionId ? { type: 'string', value: optionId } : null;
    }
    case 'multi_select': {
      const raw = Array.isArray(value) ? value : [value];
      const ids = raw
        .map((entry) => resolveOptionId(field, String(entry)))
        .filter((id): id is string => id !== null);
      return { type: 'string_array', value: ids };
    }
    default:
      return null;
  }
};

interface AppliedFields {
  fields: Record<string, FieldValue>;
  name: string | null;
  applied: string[];
  skipped: string[];
}

const applyFieldInput = (
  attributes: DatabaseAttributes,
  input: Record<string, unknown>
): AppliedFields => {
  const fields: Record<string, FieldValue> = {};
  let name: string | null = null;
  const applied: string[] = [];
  const skipped: string[] = [];

  for (const [key, value] of Object.entries(input)) {
    const field = findField(attributes, key);
    if (!field) {
      const lower = key.toLowerCase();
      if (lower === 'name' || lower === 'title') {
        name = String(value);
        applied.push(key);
      } else {
        skipped.push(key);
      }
      continue;
    }

    const fieldValue = toFieldValue(field, value);
    if (fieldValue) {
      fields[field.id] = fieldValue;
      applied.push(field.name);
    } else {
      skipped.push(field.name);
    }
  }

  return { fields, name, applied, skipped };
};

const readableFieldValue = (
  field: FieldAttributes | undefined,
  value: FieldValue
): unknown => {
  if (value.type === 'string_array') {
    if (field && field.type === 'multi_select' && field.options) {
      return value.value.map(
        (id) => field.options?.[id]?.name ?? id
      );
    }
    return value.value;
  }
  if (value.type === 'string') {
    if (field && field.type === 'select' && field.options) {
      return field.options[value.value]?.name ?? value.value;
    }
    return value.value;
  }
  return value.value;
};

// ---------------------------------------------------------------------------
// Tool result types
// ---------------------------------------------------------------------------

export interface SearchPageResult {
  id: string;
  name: string;
  type: string;
}

export interface GetPageResult {
  id: string;
  name: string;
  type: string;
  content: string;
}

export interface CreatePageResult {
  id: string;
  name: string;
}

export interface EditPageResult {
  id: string;
  mode: 'replace' | 'append';
}

export interface DatabaseFieldSummary {
  id: string;
  name: string;
  type: string;
}

export interface ListDatabaseResult {
  id: string;
  name: string;
  fields: DatabaseFieldSummary[];
}

export interface DatabaseRecordResult {
  id: string;
  name: string;
  fields: Record<string, unknown>;
}

export interface QueryDatabaseResult {
  items: DatabaseRecordResult[];
  nextCursor: string | null;
}

export interface MutateRecordResult {
  id: string;
  name: string;
  applied: string[];
  skipped: string[];
}

// ---------------------------------------------------------------------------
// Tool functions
// ---------------------------------------------------------------------------

export const searchPages = async (
  ctx: WikiToolContext,
  input: { query: string }
): Promise<SearchPageResult[]> => {
  const like = `%${input.query ?? ''}%`;
  const rows = await database
    .selectFrom('nodes as n')
    .innerJoin('collaborations as c', 'c.node_id', 'n.root_id')
    .where('n.workspace_id', '=', ctx.workspaceId)
    .where('c.collaborator_id', '=', ctx.userId)
    .where('c.deleted_at', 'is', null)
    .where('n.type', 'in', SEARCHABLE_NODE_TYPES)
    .where(sql<SqlBool>`n.attributes->>'name' ILIKE ${like}`)
    .select([
      'n.id as id',
      'n.type as type',
      sql<string | null>`n.attributes->>'name'`.as('name'),
    ])
    .limit(25)
    .execute();

  return rows.map((row) => ({
    id: row.id,
    name: row.name ?? '',
    type: row.type,
  }));
};

export const getPage = async (
  ctx: WikiToolContext,
  input: { id: string }
): Promise<GetPageResult> => {
  const { node } = await requireAccessibleNode(input.id, ctx);
  const model = getNodeModel(node.type);
  const name = model.extractText(node.id, node.attributes)?.name ?? '';

  const document = await database
    .selectFrom('documents')
    .selectAll()
    .where('id', '=', input.id)
    .executeTakeFirst();

  const content = document
    ? richTextToMarkdown(input.id, document.content as RichTextContent)
    : '';

  return { id: node.id, name, type: node.type, content };
};

export const createPage = async (
  ctx: WikiToolContext,
  input: { parentId: string; name: string; content?: string }
): Promise<CreatePageResult> => {
  const { tree } = await requireAccessibleNode(input.parentId, ctx);
  const user = await fetchWorkspaceUser(ctx);

  const attributes: PageAttributes = {
    type: 'page',
    name: input.name,
    parentId: input.parentId,
  };

  const model = getNodeModel('page');
  const canCreateContext: CanCreateNodeContext = {
    user: {
      id: user.id,
      role: user.role,
      workspaceId: user.workspaceId,
      accountId: user.accountId,
    },
    tree: tree.map(mapNode),
    attributes,
  };

  if (!model.canCreate(canCreateContext)) {
    throw new WikiToolError(
      'You do not have permission to create a page here.'
    );
  }

  const pageId = generateId(IdType.Page);
  const rootId = tree[0]?.id ?? pageId;

  const created = await createNode({
    nodeId: pageId,
    rootId,
    attributes,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  if (!created) {
    throw new WikiToolError('Failed to create the page.');
  }

  if (input.content && input.content.trim().length > 0) {
    const blocks = markdownToBlocks(pageId, input.content);
    const document = await createDocument({
      nodeId: pageId,
      content: { type: 'rich_text', blocks },
      userId: ctx.userId,
      workspaceId: ctx.workspaceId,
    });
    if (!document) {
      throw new WikiToolError(
        'The page was created but its content could not be saved.'
      );
    }
  }

  return { id: pageId, name: input.name };
};

export const editPage = async (
  ctx: WikiToolContext,
  input: { id: string; content: string; mode: 'replace' | 'append' }
): Promise<EditPageResult> => {
  const { tree, node } = await requireAccessibleNode(input.id, ctx);
  const model = getNodeModel(node.type);

  if (!model.documentSchema) {
    throw new WikiToolError(`Node ${input.id} does not support a document.`);
  }

  const user = await fetchWorkspaceUser(ctx);
  const canUpdateContext: CanUpdateDocumentContext = {
    user: {
      id: user.id,
      role: user.role,
      workspaceId: user.workspaceId,
      accountId: user.accountId,
    },
    node: mapNode(node),
    tree: tree.map(mapNode),
  };

  if (!model.canUpdateDocument(canUpdateContext)) {
    throw new WikiToolError('You do not have permission to edit this page.');
  }

  const mode = input.mode ?? 'replace';

  const updated = await updateDocument({
    documentId: input.id,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (current) => {
      if (mode === 'append') {
        const richText = current as RichTextContent;
        const existing =
          richText && richText.blocks ? richText.blocks : {};
        const afterIndex = maxTopLevelIndex(input.id, richText);
        const newBlocks = markdownToBlocks(input.id, input.content, afterIndex);
        return {
          type: 'rich_text',
          blocks: { ...existing, ...newBlocks },
        };
      }

      // A replace round-trips the whole document through markdown. get_page
      // already dropped these on the way out, so the model is rewriting a page
      // it never saw in full -- refusing is the only honest outcome.
      const lost = unrepresentableBlockTypes(current as RichTextContent);
      if (lost.length > 0) {
        throw new WikiToolError(
          `This page contains blocks markdown cannot carry (${lost.join(', ')}), ` +
            `and a replace would delete them. Use mode 'append' to add to the end, ` +
            `or edit the page in the wiki.`
        );
      }

      return {
        type: 'rich_text',
        blocks: markdownToBlocks(input.id, input.content),
      };
    },
  });

  if (!updated) {
    throw new WikiToolError('Failed to update the page.');
  }

  return { id: input.id, mode };
};

export const renameNode = async (
  ctx: WikiToolContext,
  input: { id: string; name: string }
): Promise<{ id: string; name: string; type: string }> => {
  const name = input.name.trim();
  if (name.length === 0) {
    throw new WikiToolError('The new name must not be empty.');
  }

  const { node, role } = await requireAccessibleNode(input.id, ctx);
  if (!hasNodeRole(role, 'editor')) {
    throw new WikiToolError('You need editor access to rename this node.');
  }

  const updated = await updateNode({
    nodeId: input.id,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      if (!('name' in attributes)) {
        return null;
      }
      attributes.name = name;
      return attributes;
    },
  });

  if (!updated) {
    throw new WikiToolError(
      `Could not rename node ${input.id} (permission denied or it has no name).`
    );
  }

  return { id: input.id, name, type: node.type };
};

export const trashNode = async (
  ctx: WikiToolContext,
  input: { id: string }
): Promise<{ id: string; trashed: boolean; type: string }> => {
  const { node, role } = await requireAccessibleNode(input.id, ctx);
  if (!hasNodeRole(role, 'editor')) {
    throw new WikiToolError('You need editor access to trash this node.');
  }

  const SOFT_DELETABLE = new Set([
    'page', 'folder', 'database', 'record', 'file', 'whiteboard',
  ]);
  if (!SOFT_DELETABLE.has(node.type)) {
    throw new WikiToolError(`Node type '${node.type}' cannot be trashed.`);
  }

  const updated = await updateNode({
    nodeId: input.id,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      const a = attributes as {
        deletedAt?: string | null;
        deletedBy?: string | null;
      };
      a.deletedAt = new Date().toISOString();
      a.deletedBy = ctx.userId;
      return attributes;
    },
  });

  if (!updated) {
    throw new WikiToolError(
      `Could not trash node ${input.id} (permission denied or the type is not trashable).`
    );
  }

  return { id: input.id, trashed: true, type: node.type };
};

export const moveNode = async (
  ctx: WikiToolContext,
  input: { id: string; parentId: string }
): Promise<{ id: string; parentId: string; type: string }> => {
  const { node, role } = await requireAccessibleNode(input.id, ctx);
  if (!hasNodeRole(role, 'editor')) {
    throw new WikiToolError('You need editor access to move this node.');
  }
  // The destination must be in this workspace, and the caller must be able to
  // write there: a move adds a child to it.
  const { role: parentRole } = await requireAccessibleNode(
    input.parentId,
    ctx
  );
  if (!hasNodeRole(parentRole, 'editor')) {
    throw new WikiToolError(
      'You need editor access to the destination to move a node there.'
    );
  }

  // Cycle guard: never move a node into itself or its own descendant.
  if (input.parentId === input.id) {
    throw new WikiToolError('A node cannot be moved into itself.');
  }
  const descendant = await database
    .selectFrom('node_paths')
    .select('descendant_id')
    .where('ancestor_id', '=', input.id)
    .where('descendant_id', '=', input.parentId)
    .executeTakeFirst();
  if (descendant) {
    throw new WikiToolError('A node cannot be moved into its own descendant.');
  }

  const updated = await updateNode({
    nodeId: input.id,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      if (!('parentId' in attributes)) {
        return null;
      }
      attributes.parentId = input.parentId;
      return attributes;
    },
  });

  // A cross-space move is carried out by updateNode itself: it re-homes the
  // subtree inside the same transaction, before the move is recorded. Doing it
  // here, afterwards, gave the old updates newer revisions than the move and
  // left the subtree's documents and tombstones behind.
  if (!updated) {
    throw new WikiToolError(
      `Could not move node ${input.id} (permission denied or the type cannot be re-parented).`
    );
  }

  return { id: input.id, parentId: input.parentId, type: node.type };
};

export const listDatabases = async (
  ctx: WikiToolContext,
  _input: Record<string, never>
): Promise<ListDatabaseResult[]> => {
  const rows = await database
    .selectFrom('nodes as n')
    .innerJoin('collaborations as c', 'c.node_id', 'n.root_id')
    .where('n.workspace_id', '=', ctx.workspaceId)
    .where('c.collaborator_id', '=', ctx.userId)
    .where('c.deleted_at', 'is', null)
    .where('n.type', '=', 'database')
    .selectAll('n')
    .execute();

  return rows.map((row) => {
    const attributes = row.attributes as DatabaseAttributes;
    const fields = Object.values(attributes.fields ?? {}).map((field) => ({
      id: field.id,
      name: field.name,
      type: field.type,
    }));
    return { id: row.id, name: attributes.name, fields };
  });
};

export const QUERY_DATABASE_DEFAULT_LIMIT = 50;
export const QUERY_DATABASE_MAX_LIMIT = 200;

export const queryDatabase = async (
  ctx: WikiToolContext,
  input: {
    databaseId: string;
    filter?: string;
    limit?: number;
    cursor?: string;
  }
): Promise<QueryDatabaseResult> => {
  const { node } = await requireAccessibleNode(input.databaseId, ctx);
  if (node.type !== 'database') {
    throw new WikiToolError(`Node ${input.databaseId} is not a database.`);
  }

  const dbAttributes = node.attributes as DatabaseAttributes;
  const fieldById = dbAttributes.fields ?? {};
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? QUERY_DATABASE_DEFAULT_LIMIT)),
    QUERY_DATABASE_MAX_LIMIT
  );

  // One row more than the page tells whether another page exists, without a
  // count query. The old slice(0, 50) silently cut every larger database.
  const options = {
    limit: limit + 1,
    afterId: input.cursor,
    visibleOnly: true,
  };
  const records =
    input.filter && input.filter.trim().length > 0
      ? await searchRecords(input.databaseId, ctx.workspaceId, ctx.userId, {
          ...options,
          searchQuery: input.filter,
        })
      : await fetchAllRecords(
          input.databaseId,
          ctx.workspaceId,
          ctx.userId,
          options
        );

  const page = records.slice(0, limit);
  const items = page.map((record) => {
    const attributes = record.attributes as RecordAttributes;
    const readable: Record<string, unknown> = {};
    for (const [fieldId, value] of Object.entries(attributes.fields ?? {})) {
      const field = fieldById[fieldId];
      const label = field?.name ?? fieldId;
      readable[label] = readableFieldValue(field, value);
    }
    return { id: record.id, name: attributes.name, fields: readable };
  });

  const last = page[page.length - 1];
  return {
    items,
    nextCursor: records.length > limit && last ? last.id : null,
  };
};

export const createRecord = async (
  ctx: WikiToolContext,
  input: { databaseId: string; fields: Record<string, unknown> }
): Promise<MutateRecordResult> => {
  const { tree, node } = await requireAccessibleNode(input.databaseId, ctx);
  if (node.type !== 'database') {
    throw new WikiToolError(`Node ${input.databaseId} is not a database.`);
  }

  const dbAttributes = node.attributes as DatabaseAttributes;
  const applied = applyFieldInput(dbAttributes, input.fields ?? {});
  const name = applied.name ?? 'Untitled';

  const attributes: RecordAttributes = {
    type: 'record',
    parentId: input.databaseId,
    databaseId: input.databaseId,
    name,
    fields: applied.fields,
  };

  const user = await fetchWorkspaceUser(ctx);
  const model = getNodeModel('record');
  const canCreateContext: CanCreateNodeContext = {
    user: {
      id: user.id,
      role: user.role,
      workspaceId: user.workspaceId,
      accountId: user.accountId,
    },
    tree: tree.map(mapNode),
    attributes,
  };

  if (!model.canCreate(canCreateContext)) {
    throw new WikiToolError(
      'You do not have permission to create a record in this database.'
    );
  }

  const recordId = generateId(IdType.Record);
  const rootId = tree[0]?.id ?? recordId;

  const created = await createNode({
    nodeId: recordId,
    rootId,
    attributes,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  if (!created) {
    throw new WikiToolError('Failed to create the record.');
  }

  return {
    id: recordId,
    name,
    applied: applied.applied,
    skipped: applied.skipped,
  };
};

export const updateRecord = async (
  ctx: WikiToolContext,
  input: { recordId: string; fields: Record<string, unknown> }
): Promise<MutateRecordResult> => {
  const { tree, node } = await requireAccessibleNode(input.recordId, ctx);
  if (node.type !== 'record') {
    throw new WikiToolError(`Node ${input.recordId} is not a record.`);
  }

  const recordAttributes = node.attributes as RecordAttributes;
  const databaseNode = await fetchNode(recordAttributes.databaseId);
  if (!databaseNode || databaseNode.type !== 'database') {
    throw new WikiToolError('The parent database could not be found.');
  }
  const dbAttributes = databaseNode.attributes as DatabaseAttributes;
  const applied = applyFieldInput(dbAttributes, input.fields ?? {});

  const user = await fetchWorkspaceUser(ctx);
  const model = getNodeModel('record');
  const canUpdateContext: CanUpdateAttributesContext = {
    user: {
      id: user.id,
      role: user.role,
      workspaceId: user.workspaceId,
      accountId: user.accountId,
    },
    node: mapNode(node),
    tree: tree.map(mapNode),
    attributes: node.attributes as NodeAttributes,
  };

  if (!model.canUpdateAttributes(canUpdateContext)) {
    throw new WikiToolError('You do not have permission to edit this record.');
  }

  const updated = await updateNode({
    nodeId: input.recordId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      if (attributes.type !== 'record') {
        return null;
      }
      const nextFields = { ...attributes.fields, ...applied.fields };
      return {
        ...attributes,
        name: applied.name ?? attributes.name,
        fields: nextFields,
      };
    },
  });

  if (!updated) {
    throw new WikiToolError('Failed to update the record.');
  }

  const finalName = applied.name ?? recordAttributes.name;
  return {
    id: input.recordId,
    name: finalName,
    applied: applied.applied,
    skipped: applied.skipped,
  };
};

// ---------------------------------------------------------------------------
// Declarative tool manifest (consumed by the agent + a future MCP server)
// ---------------------------------------------------------------------------

export interface WikiAction {
  type: string;
  nodeId: string | null;
  summary: string;
}

export interface WikiToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodType<unknown>;
  run: (ctx: WikiToolContext, input: unknown) => Promise<unknown>;
  action: (input: unknown, result: unknown) => WikiAction | null;
}

const defineTool = <I, R>(config: {
  name: string;
  description: string;
  inputSchema: z.ZodType<I>;
  run: (ctx: WikiToolContext, input: I) => Promise<R>;
  action: (input: I, result: R) => WikiAction | null;
}): WikiToolDefinition => ({
  name: config.name,
  description: config.description,
  inputSchema: config.inputSchema as unknown as z.ZodType<unknown>,
  run: (ctx, input) => config.run(ctx, config.inputSchema.parse(input)),
  action: (input, result) =>
    config.action(config.inputSchema.parse(input), result as R),
});

const searchPagesInput = z.object({
  query: z.string().describe('Text to match against page/entry names.'),
});
const getPageInput = z.object({
  id: z.string().describe('The node id of the page/record to read.'),
});
export const uploadImage = async (
  ctx: WikiToolContext,
  input: { pageId: string; name: string; url?: string; data?: string }
): Promise<{ fileId: string; name: string; size: number; markdown: string }> => {
  const { tree } = await requireAccessibleNode(input.pageId, ctx);
  const user = await fetchWorkspaceUser(ctx);

  if (!input.url && !input.data) {
    throw new WikiToolError('Provide either `url` or `data` (base64).');
  }

  let loaded;
  try {
    loaded = input.data
      ? loadImageFromBase64(input.data)
      : await loadImageFromUrl(input.url ?? '');
  } catch (error) {
    throw new WikiToolError(
      error instanceof Error ? error.message : 'Could not load the image.'
    );
  }

  // An SVG can carry script. Only a cleaned copy is ever stored, so the file a
  // page displays is inert whoever opens it, and however.
  if (isSvgMimeType(loaded.mimeType)) {
    try {
      loaded = {
        ...loaded,
        buffer: Buffer.from(sanitizeSvg(loaded.buffer.toString('utf8')), 'utf8'),
      };
    } catch {
      throw new WikiToolError(
        'This SVG could not be made safe, so it was not uploaded.'
      );
    }
  }

  const fileId = generateId(IdType.File);
  const version = generateId(IdType.Version);
  const given = input.name.trim();
  const name =
    given.length > 0
      ? given.toLowerCase().endsWith(loaded.extension)
        ? given
        : given + loaded.extension
      : `image${loaded.extension}`;

  const attributes: FileAttributes = {
    type: 'file',
    subtype: 'image',
    parentId: input.pageId,
    name,
    originalName: name,
    mimeType: loaded.mimeType,
    extension: loaded.extension,
    size: loaded.buffer.length,
    version,
    status: FileStatus.Ready,
  };

  const model = getNodeModel('file');
  const canCreateContext: CanCreateNodeContext = {
    user: {
      id: user.id,
      role: user.role,
      workspaceId: user.workspaceId,
      accountId: user.accountId,
    },
    tree: tree.map(mapNode),
    attributes,
  };

  if (!model.canCreate(canCreateContext)) {
    throw new WikiToolError(
      'You do not have permission to add a file to this page.'
    );
  }

  // Written straight to storage: tus exists for resumable uploads from a
  // browser, and we are already inside the server.
  const storagePath = `files/${ctx.workspaceId}/${fileId}_${version}${loaded.extension}`;
  const rootId = tree[0]?.id ?? input.pageId;
  await storage.upload(
    storagePath,
    loaded.buffer,
    loaded.mimeType,
    BigInt(loaded.buffer.length)
  );

  const created = await createNode({
    nodeId: fileId,
    rootId,
    attributes,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
  });

  if (!created) {
    throw new WikiToolError('Failed to register the image.');
  }

  // Bypassing tus also bypassed the uploads row it writes, and the download
  // route serves a file only through that row: every image stored here
  // answered 400, and the page sat on "Loading image…" until the client gave
  // up. Record the upload exactly as a completed browser upload would.
  const uploadedAt = new Date();
  await database
    .insertInto('uploads')
    .values({
      file_id: fileId,
      upload_id: generateId(IdType.Upload),
      workspace_id: ctx.workspaceId,
      root_id: rootId,
      mime_type: loaded.mimeType,
      size: loaded.buffer.length,
      path: storagePath,
      version_id: version,
      created_at: uploadedAt,
      created_by: user.id,
      uploaded_at: uploadedAt,
    })
    .execute();

  return {
    fileId,
    name,
    size: loaded.buffer.length,
    markdown: `![${name}](file:${fileId})`,
  };
};

const uploadImageInput = z.object({
  pageId: z
    .string()
    .describe('Id of the page the image belongs to. It becomes its parent.'),
  name: z.string().describe('File name, e.g. "power-chain.png".'),
  url: z
    .string()
    .optional()
    .describe(
      'Public http(s) URL to fetch. Private and reserved addresses are refused, and redirects are not followed.'
    ),
  data: z
    .string()
    .optional()
    .describe('Base64 image data, with or without a data: URL prefix.'),
});

const createPageInput = z.object({
  parentId: z
    .string()
    .describe('The id of the parent node (space, folder or page).'),
  name: z.string().describe('Title of the new page.'),
  content: z
    .string()
    .optional()
    .describe('Initial page body, in markdown.'),
});
const editPageInput = z.object({
  id: z.string().describe('The node id of the page to edit.'),
  content: z.string().describe('Markdown content.'),
  mode: z
    .enum(['replace', 'append'])
    .describe("'replace' overwrites the document; 'append' adds to the end."),
});
const renameNodeInput = z.object({
  id: z
    .string()
    .describe('The node id of the page, folder, database or whiteboard to rename.'),
  name: z.string().describe('The new name/title.'),
});
const trashNodeInput = z.object({
  id: z.string().describe('The node id of the page/folder/database/whiteboard to move to trash.'),
});
const moveNodeInput = z.object({
  id: z.string().describe('The node id to move.'),
  parentId: z
    .string()
    .describe('The id of the new parent node (space, folder or page) to move it under.'),
});
const listDatabasesInput = z.object({});
const queryDatabaseInput = z.object({
  databaseId: z.string().describe('The id of the database to query.'),
  filter: z
    .string()
    .optional()
    .describe('Optional free-text search across record names and field values.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(QUERY_DATABASE_MAX_LIMIT)
    .optional()
    .describe(
      `Records per page, default ${QUERY_DATABASE_DEFAULT_LIMIT}, at most ${QUERY_DATABASE_MAX_LIMIT}.`
    ),
  cursor: z
    .string()
    .regex(/^[a-z0-9]{20,}$/)
    .optional()
    .describe('The nextCursor of the previous page, to read the page after it.'),
});
const createRecordInput = z.object({
  databaseId: z.string().describe('The id of the database.'),
  fields: z
    .record(z.string(), z.unknown())
    .describe(
      'Field name (or id) to value. Use "name"/"title" for the record title.'
    ),
});
const updateRecordInput = z.object({
  recordId: z.string().describe('The id of the record to update.'),
  fields: z
    .record(z.string(), z.unknown())
    .describe('Field name (or id) to new value.'),
});

export const wikiToolDefinitions: WikiToolDefinition[] = [
  defineTool({
    name: 'search_pages',
    description:
      'Search the workspace for pages, folders, databases, records and channels whose name matches the query. Returns { id, name, type }.',
    inputSchema: searchPagesInput,
    run: searchPages,
    action: (input) => ({
      type: 'search_pages',
      nodeId: null,
      summary: `Searched for "${input.query}"`,
    }),
  }),
  defineTool({
    name: 'get_page',
    description:
      'Read a page or record by id and return its title and body as markdown text.',
    inputSchema: getPageInput,
    run: getPage,
    action: (input, result) => ({
      type: 'get_page',
      nodeId: input.id,
      summary: `Read "${result.name}"`,
    }),
  }),
  defineTool({
    name: 'create_page',
    description:
      'Create a new page under a parent node (space, folder or page), with optional initial markdown content. Returns { id }.',
    inputSchema: createPageInput,
    run: createPage,
    action: (input, result) => ({
      type: 'create_page',
      nodeId: result.id,
      summary: `Created page "${input.name}"`,
    }),
  }),
  defineTool({
    name: 'edit_page',
    description:
      "Edit a page's document. mode 'replace' overwrites the whole body; mode 'append' adds the content to the end. Content is markdown.",
    inputSchema: editPageInput,
    run: editPage,
    action: (input) => ({
      type: 'edit_page',
      nodeId: input.id,
      summary:
        input.mode === 'append'
          ? 'Appended content to the page'
          : 'Replaced the page content',
    }),
  }),
  defineTool({
    name: 'upload_image',
    description:
      `Upload an image into the wiki and get the markdown that displays it. Give a public https url OR base64 data (max ${MAX_IMAGE_BYTES / 1024 / 1024}MB, png/jpeg/gif/webp/avif/svg; an SVG is cleaned of scripts before it is stored). Returns { fileId, markdown }; write that markdown on its own line through create_page or edit_page to place the image. For a diagram prefer a \`\`\`mermaid block instead: it stays editable.`,
    inputSchema: uploadImageInput,
    run: uploadImage,
    action: (input, result) => ({
      type: 'upload_image',
      nodeId: result.fileId,
      summary: `Uploaded image "${input.name}"`,
    }),
  }),
  defineTool({
    name: 'rename_node',
    description:
      "Rename a page, folder, database or whiteboard. Changes only the node's title/name, not its content. Returns { id, name, type }.",
    inputSchema: renameNodeInput,
    run: renameNode,
    action: (input, result) => ({
      type: 'rename_node',
      nodeId: input.id,
      summary: `Renamed to "${result.name}"`,
    }),
  }),
  defineTool({
    name: 'trash_node',
    description:
      "Move a page, folder, database or whiteboard to the trash (soft delete — recoverable). Returns { id, trashed, type }.",
    inputSchema: trashNodeInput,
    run: trashNode,
    action: (input) => ({
      type: 'trash_node',
      nodeId: input.id,
      summary: 'Moved to trash',
    }),
  }),
  defineTool({
    name: 'move_node',
    description:
      "Move a node under a new parent (re-file it in the tree). Changes only its parent, keeping the node id (so links to it are preserved). Returns { id, parentId, type }.",
    inputSchema: moveNodeInput,
    run: moveNode,
    action: (input) => ({
      type: 'move_node',
      nodeId: input.id,
      summary: 'Moved to a new parent',
    }),
  }),
  defineTool({
    name: 'list_databases',
    description:
      'List the databases in the workspace with their fields (id, name, type).',
    inputSchema: listDatabasesInput,
    run: listDatabases,
    action: () => ({
      type: 'list_databases',
      nodeId: null,
      summary: 'Listed databases',
    }),
  }),
  defineTool({
    name: 'query_database',
    description:
      'Return one page of records from a database, ordered by id, optionally filtered by a free-text search across record names and field values; trashed records and templates are left out. Returns { items: [{ id, name, fields }], nextCursor }.',
    inputSchema: queryDatabaseInput,
    run: queryDatabase,
    action: (input) => ({
      type: 'query_database',
      nodeId: input.databaseId,
      summary: 'Queried a database',
    }),
  }),
  defineTool({
    name: 'create_record',
    description:
      'Create a record in a database. fields maps field name (or id) to value; use "name"/"title" for the record title. Returns { id, applied, skipped }.',
    inputSchema: createRecordInput,
    run: createRecord,
    action: (input, result) => ({
      type: 'create_record',
      nodeId: result.id,
      summary: `Created record "${result.name}"`,
    }),
  }),
  defineTool({
    name: 'update_record',
    description:
      'Update fields on an existing record. fields maps field name (or id) to new value.',
    inputSchema: updateRecordInput,
    run: updateRecord,
    action: (input, result) => ({
      type: 'update_record',
      nodeId: result.id,
      summary: `Updated record "${result.name}"`,
    }),
  }),
];
