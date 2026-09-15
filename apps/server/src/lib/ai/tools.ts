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
  isNodeTrashed,
  isSoftDeletableNodeType,
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
  parseInline,
  renderInline,
} from '@colanode/server/lib/ai/markdown-inline';
import { lostOnRoundTrip } from '@colanode/server/lib/ai/markdown-loss';
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
const SEARCHABLE_NODE_TYPES = [
  'page',
  'folder',
  'database',
  'record',
  'channel',
  'space',
  'whiteboard',
] as const satisfies readonly NodeType[];

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

// Read access to `alias`.id for the user: a live collaboration on the node or
// any of its ancestors. The same rule extractNodeRole applies to the tree,
// written as EXISTS so a node with several collaborations cannot be listed
// twice.
const nodeAccessCondition = (userId: string, alias = 'n') =>
  sql<SqlBool>`exists (
    select 1
    from node_paths access_path
    join collaborations access_collab
      on access_collab.node_id = access_path.ancestor_id
    where access_path.descendant_id = ${sql.ref(`${alias}.id`)}
      and access_collab.collaborator_id = ${userId}
      and access_collab.deleted_at is null
  )`;

const NODE_ID_PATTERN = /^[a-z0-9]{20,}$/;

// The ancestors of `n`, from its space down to its parent, as a JSON array of
// { id, name, type }. An ancestor the user could not open on its own keeps an
// empty name: sitting under it does not make its title the user's to read.
const nodePathSelect = (userId: string) =>
  sql<NodePathEntry[] | null>`(
    select coalesce(
      json_agg(
        json_build_object(
          'id', a.id,
          'name', case when ${nodeAccessCondition(userId, 'a')}
            then coalesce(a.attributes->>'name', '') else '' end,
          'type', a.type
        )
        order by p.level desc
      ),
      '[]'::json
    )
    from node_paths p
    join nodes a on a.id = p.ancestor_id
    where p.descendant_id = n.id and p.level > 0
  )`;

// Neither trashed nor a template: what the wiki's browsing views show.
const visibleNodeCondition = (alias = 'n') =>
  sql<SqlBool>`(
    coalesce(${sql.ref(`${alias}.attributes`)}->>'deletedAt', '') = ''
    and coalesce(${sql.ref(`${alias}.attributes`)}->>'isTemplate', 'false') <> 'true'
  )`;

const nodeName = (row: SelectNode): string => {
  const name = (row.attributes as { name?: unknown }).name;
  return typeof name === 'string' ? name : '';
};

// ---------------------------------------------------------------------------
// Sibling order
// ---------------------------------------------------------------------------

// Every node type the sidebar draws (packages/ui sidebar-tree-provider).
const SIDEBAR_NODE_TYPES = new Set<string>([
  'space',
  'channel',
  'chat',
  'page',
  'database',
  'database_view',
  'folder',
  'whiteboard',
]);

export interface SiblingRow {
  id: string;
  index?: string | null;
}

// The order the sidebar shows a group of siblings in, replicated exactly from
// SidebarTreeProvider: sort by id, hand each sibling a sequential default
// fractional key, let a node's own `index` (written when it was dragged)
// override that key, then sort by the effective key. Array.sort is stable, so
// equal keys keep id order there as here.
export const orderSiblings = <T extends SiblingRow>(rows: readonly T[]): T[] => {
  const siblings = [...rows].sort((a, b) => compareString(a.id, b.id));
  const keyById = new Map<string, string>();
  let lastDefault: string | null = null;
  for (const sibling of siblings) {
    lastDefault = generateFractionalIndex(lastDefault, null);
    const custom =
      typeof sibling.index === 'string' && sibling.index.length > 0
        ? sibling.index
        : null;
    keyById.set(sibling.id, custom ?? lastDefault);
  }
  return siblings.sort((a, b) =>
    compareString(keyById.get(a.id) ?? a.id, keyById.get(b.id) ?? b.id)
  );
};

// Display labels for mention targets and embedded nodes: the node's current
// name when the caller can read the node, `@name` for a workspace user. A
// target the caller cannot see gets no entry at all -- a label is a read.
export const resolveNodeLabels = async (
  ctx: WikiToolContext,
  ids: readonly string[]
): Promise<Map<string, string>> => {
  const unique = [...new Set(ids)].filter((id) => NODE_ID_PATTERN.test(id));
  const labels = new Map<string, string>();
  if (unique.length === 0) {
    return labels;
  }

  const result = await sql<{ id: string; label: string | null }>`
    select n.id, n.attributes->>'name' as label
    from nodes n
    where n.id in (${sql.join(unique)})
      and n.workspace_id = ${ctx.workspaceId}
      and ${nodeAccessCondition(ctx.userId)}
    union all
    select u.id, '@' || coalesce(nullif(u.custom_name, ''), u.name) as label
    from users u
    where u.id in (${sql.join(unique)})
      and u.workspace_id = ${ctx.workspaceId}
  `.execute(database);

  for (const row of result.rows) {
    labels.set(row.id, row.label ?? '');
  }
  return labels;
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

export interface MarkdownRenderOptions {
  // Current display names for mention targets, from resolveNodeLabels. A
  // target without an entry is written with an empty label.
  labels?: ReadonlyMap<string, string>;
  // Read-only hints for embedded blocks, keyed by block id: `_name`,
  // `_filter`. Written into the fenced JSON for the reader; the parser drops
  // every `_` key.
  embedHints?: ReadonlyMap<string, Record<string, string>>;
}

// ---------------------------------------------------------------------------
// Embedded atom blocks
// ---------------------------------------------------------------------------

type EmbedAttrCheck = (value: unknown) => boolean;

const isNullableString: EmbedAttrCheck = (value) =>
  value === null || typeof value === 'string';

const isRegion: EmbedAttrCheck = (value) => {
  if (value === null) {
    return true;
  }
  if (!value || typeof value !== 'object' || Array.isArray(value)) {
    return false;
  }
  const region = value as Record<string, unknown>;
  return ['x', 'y', 'zoom'].every(
    (key) => typeof region[key] === 'number' && Number.isFinite(region[key])
  );
};

interface EmbedBlockSpec {
  fence: string;
  // The block's own id IS the embedded node's id (database, whiteboard, page).
  nodeType: NodeType | null;
  attrs: Record<string, EmbedAttrCheck>;
}

// Atom blocks with no text of their own. Markdown carries each as a fenced
// JSON object, e.g.
//   ```colanode-database
//   {"id":"…","inline":true,"filterFieldId":"…","filterValue":"…","_name":"🧭 ADR"}
//   ```
// Only these attributes are read back: the editor extensions' own (packages/ui
// editor/extensions/{database,whiteboard-embed,page,embed}.tsx).
const EMBED_BLOCKS: Record<string, EmbedBlockSpec> = {
  database: {
    fence: 'colanode-database',
    nodeType: 'database',
    attrs: {
      inline: (value) => typeof value === 'boolean',
      filterFieldId: isNullableString,
      filterValue: isNullableString,
    },
  },
  whiteboardEmbed: {
    fence: 'colanode-whiteboard',
    nodeType: 'whiteboard',
    attrs: {
      height: (value) => typeof value === 'number' && Number.isFinite(value),
      region: isRegion,
    },
  },
  page: {
    fence: 'colanode-page',
    nodeType: 'page',
    attrs: {},
  },
  embed: {
    fence: 'colanode-embed',
    nodeType: null,
    attrs: {
      // Only web addresses: an embed is an iframe.
      url: (value) => typeof value === 'string' && /^https?:\/\//i.test(value),
      provider: (value) =>
        typeof value === 'string' && /^[a-z0-9-]*$/.test(value),
    },
  },
};

const embedSpecByFence = new Map(
  Object.entries(EMBED_BLOCKS).map(([type, spec]) => [spec.fence, { type, spec }])
);

const embedJson = (
  block: Block,
  spec: EmbedBlockSpec,
  options: MarkdownRenderOptions
): string => {
  const out: Record<string, unknown> = {};
  if (spec.nodeType) {
    out.id = block.id;
  }
  const attrs = (block.attrs ?? {}) as Record<string, unknown>;
  for (const [key, check] of Object.entries(spec.attrs)) {
    if (attrs[key] !== undefined && check(attrs[key])) {
      out[key] = attrs[key];
    }
  }
  for (const [key, value] of Object.entries(
    options.embedHints?.get(block.id) ?? {}
  )) {
    out[key.startsWith('_') ? key : `_${key}`] = value;
  }
  return JSON.stringify(out);
};

interface ParsedEmbed {
  type: string;
  id: string | null;
  attrs: Record<string, unknown> | null;
}

// null when the fence is not one of ours or its body is not a JSON object --
// the caller then keeps it as an ordinary code block. A recognisable embed
// with a bad id or attribute is an error the caller should hear about.
const parseEmbedFence = (info: string, body: string): ParsedEmbed | null => {
  const entry = embedSpecByFence.get(info);
  if (!entry) {
    return null;
  }

  let json: unknown;
  try {
    json = JSON.parse(body);
  } catch {
    return null;
  }
  if (!json || typeof json !== 'object' || Array.isArray(json)) {
    return null;
  }
  const value = json as Record<string, unknown>;

  let id: string | null = null;
  if (entry.spec.nodeType) {
    if (typeof value.id !== 'string' || !NODE_ID_PATTERN.test(value.id)) {
      throw new WikiToolError(
        `An embedded ${entry.type} needs the id of the ${entry.spec.nodeType} it shows.`
      );
    }
    id = value.id;
  }

  const attrs: Record<string, unknown> = {};
  for (const [key, check] of Object.entries(entry.spec.attrs)) {
    if (value[key] === undefined) {
      continue;
    }
    if (!check(value[key])) {
      throw new WikiToolError(
        `The embedded ${entry.type} has an invalid "${key}".`
      );
    }
    attrs[key] = value[key];
  }

  return {
    type: entry.type,
    id,
    attrs: Object.keys(attrs).length > 0 ? attrs : null,
  };
};

// Node ids a set of blocks embeds, with the node type each block expects.
export const embeddedNodeIds = (
  blocks: Record<string, Block>
): { id: string; type: string; nodeType: NodeType }[] =>
  Object.values(blocks).flatMap((block) => {
    const nodeType = EMBED_BLOCKS[block.type]?.nodeType;
    return nodeType ? [{ id: block.id, type: block.type, nodeType }] : [];
  });

// A mention carries no text of its own: it is written as [label](node:<id>),
// the label resolved from the target for the reader only -- the parser
// ignores it, so a renamed page or a label the model rewords never changes
// the link. Marks, escaping and links are markdown-inline's.
const leafTextOf = (
  block: Block,
  options: MarkdownRenderOptions = {},
  lineStart = false
): string =>
  renderInline(block.content, { labels: options.labels, lineStart });

// A code block's text is literal: no escaping, no marks.
const rawTextOf = (block: Block): string =>
  (block.content ?? []).map((leaf) => leaf.text ?? '').join('');

// Every node or user a document mentions, once each.
export const collectMentionTargets = (
  content: RichTextContent | null | undefined
): string[] => {
  const targets = new Set<string>();
  const blocks = content && content.blocks ? Object.values(content.blocks) : [];
  for (const block of blocks) {
    for (const leaf of block.content ?? []) {
      const target = leaf.type === 'mention' ? (leaf.attrs ?? {}).target : null;
      if (typeof target === 'string' && target.length > 0) {
        targets.add(target);
      }
    }
  }
  return [...targets];
};

const attrString = (block: Block, key: string): string => {
  const value = (block.attrs ?? {})[key];
  return typeof value === 'string' ? value : '';
};

// The callout palette of the editor (packages/ui callout extension).
const CALLOUT_PALETTE = new Set([
  'default',
  'gray',
  'blue',
  'green',
  'yellow',
  'orange',
  'red',
  'purple',
  'pink',
]);

// The colours a GitHub alert keyword carries on its own. Every other colour,
// and an icon, travel as metadata inside the brackets:
// `> [!NOTE|color=gray|icon=<emoji id>]`.
const CALLOUT_KEYWORD_BY_COLOUR: Record<string, string> = {
  blue: 'NOTE',
  green: 'TIP',
  purple: 'IMPORTANT',
  orange: 'WARNING',
  red: 'CAUTION',
};

const CALLOUT_META_VALUE = /^[^|\]\s]+$/;

// Every callout used to come out as `> [!NOTE]` with its colour as trailing
// text, which the parser read back as a blue callout plus a stray paragraph
// saying "red" -- so a replace edit repainted and polluted every red callout
// of the page. The header is now lossless for the whole palette.
const calloutHeader = (block: Block): string => {
  const colour = attrString(block, 'color') || 'default';
  const icon = attrString(block, 'icon');
  const keyword = CALLOUT_KEYWORD_BY_COLOUR[colour];
  const meta: string[] = [];
  if (!keyword && CALLOUT_META_VALUE.test(colour)) {
    meta.push(`color=${colour}`);
  }
  if (icon && CALLOUT_META_VALUE.test(icon)) {
    meta.push(`icon=${icon}`);
  }
  return `> [!${keyword ?? 'NOTE'}${meta.map((item) => `|${item}`).join('')}]`;
};

// What a replace edit would delete from this page, named -- empty when a
// replace keeps everything. A replace writes the whole page from markdown,
// so whatever markdown cannot carry is lost without the model ever having
// seen it. The old check knew a list of block types, and after embeds and
// files learnt to travel as markdown it never fired: a table's column
// widths, a colour, a quote inside a table cell went without a word.
// markdown-loss.ts looks for what is known not to survive and compares the
// page with the page as it would come back.
//
// `markdown`: the page as get_page already wrote it, to not write it twice.
// Labels and hints in it change nothing: the parser ignores both.
export const lossyOnReplace = (
  documentId: string,
  content: RichTextContent | null | undefined,
  markdown?: string
): string[] => {
  if (!content || Object.keys(content.blocks ?? {}).length === 0) {
    return [];
  }
  let roundTripped: Record<string, Block>;
  try {
    roundTripped = markdownToBlocks(
      documentId,
      markdown ?? richTextToMarkdown(documentId, content)
    );
  } catch {
    // A stored page the parser refuses (nesting too deep, say) cannot be
    // replaced without loss either.
    return ['content that does not survive the conversion to markdown'];
  }
  return lostOnRoundTrip(documentId, content, roundTripped);
};

// A fence one backtick longer than the longest backtick run inside the code,
// and never shorter than three. A plain ``` fence was closed early by a
// ``` line inside the code -- a code block documenting markdown, say -- and
// everything after it spilled out as paragraphs.
const codeFence = (code: string): string => {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  return '`'.repeat(Math.max(3, longest + 1));
};

// Blocks that read on into the lines written after them: a callout or quote
// takes the next `>` line, a table the next line with a pipe, a list the next
// item marker. Something written right after one needs a blank line between.
const RUNS_ON_BLOCK_TYPES = new Set([
  'table',
  'callout',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
]);

// Converts a page/record rich-text document into plain markdown for the model.
export const richTextToMarkdown = (
  documentId: string,
  content: RichTextContent | null | undefined,
  options: MarkdownRenderOptions = {}
): string => {
  const leafText = (block: Block, lineStart = false): string =>
    leafTextOf(block, options, lineStart);
  const blocks = content && content.blocks ? Object.values(content.blocks) : [];
  if (blocks.length === 0) {
    return '';
  }

  const childrenOf = (parentId: string): Block[] =>
    blocks
      .filter((block) => block.parentId === parentId)
      .sort((a, b) => compareString(a.index, b.index));

  // A cell holds paragraphs and images. A cell of one paragraph is written as
  // its text. Anything more is written as <p>…</p> and ![](file:…) segments:
  // the paragraphs used to be joined into one, and the images dropped. A
  // pipe would break the row, in code as much as in text, so every pipe is
  // escaped once the cell is written (the parser unescapes them first).
  const cellText = (cell: Block): string => {
    const inside = childrenOf(cell.id);
    const inline = (child: Block) =>
      renderInline(child.content, { labels: options.labels, inTable: true });
    const only = inside[0];
    const text =
      inside.length === 1 && only?.type === 'paragraph'
        ? inline(only)
        : inside
            .map((child) =>
              child.type === 'file'
                ? `![](file:${child.id})`
                : child.type === 'paragraph'
                  ? `<p>${inline(child)}</p>`
                  : ''
            )
            .join('');
    return text.replace(/\|/g, '\\|').trim();
  };

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

  // `spacing` blank: a blank line between sibling blocks. Without one a callout, a
  // quote, a table or a list runs on into whatever is written after it: two
  // callouts came back as one, a line with a pipe after a table as one more
  // row, two lists as one. The items of a list stay on consecutive lines.
  //
  // Lines come back unindented. A container quotes or indents every line of
  // its children -- every line: a code block or a paragraph with hard breaks
  // is one entry but several lines, and a line that loses its `>` or its
  // indentation ends the quote or the list item it belonged to.
  //
  // `number`: the number of the next item, inside an ordered list.
  const walk = (
    parentId: string,
    spacing: 'blank' | 'tight' | 'item',
    number: number | null = null
  ): string[] => {
    const lines: string[] = [];
    let previousType: string | null = null;

    const eachLine = (entries: string[]): string[] =>
      entries.flatMap((entry) => entry.split('\n'));

    const quoted = (containerId: string): string[] =>
      eachLine(walk(containerId, 'blank')).map((line) =>
        line ? '> ' + line : '>'
      );

    // An item's children follow its marker, and every further line sits
    // under the text after the marker: a code block keeps exactly its own
    // indentation, a second paragraph or a nested list stays in the item.
    const item = (itemId: string, marker: string): string[] => {
      const inner = eachLine(walk(itemId, 'item'));
      if (inner.length === 0) {
        return [marker.trimEnd()];
      }
      const pad = ' '.repeat(marker.length);
      return inner.map((line, index) =>
        index === 0 ? marker + line : line ? pad + line : ''
      );
    };

    for (const block of childrenOf(parentId)) {
      const own: string[] = [];
      // A heading's text follows its hashes; anything else starts a line,
      // where a leading `#`, `>`, `-` or `1.` would be read as a block.
      const text =
        block.type === 'codeBlock'
          ? rawTextOf(block)
          : leafText(block, !block.type.startsWith('heading'));
      switch (block.type) {
        case 'heading1':
          own.push('# ' + text);
          break;
        case 'heading2':
          own.push('## ' + text);
          break;
        case 'heading3':
          own.push('### ' + text);
          break;
        case 'heading4':
          own.push('#### ' + text);
          break;
        case 'heading5':
          own.push('##### ' + text);
          break;
        case 'paragraph':
          // An empty paragraph is spacing somebody put there. Between blocks
          // that are already a blank line apart, a blank line cannot say so.
          own.push(text.trim() === '' ? EMPTY_PARAGRAPH : text);
          break;
        case 'codeBlock': {
          // The language was dropped on the way out, so a round-trip turned
          // every annotated block into plaintext.
          const language = attrString(block, 'language');
          const fence = codeFence(text);
          own.push(fence + (language === 'plaintext' ? '' : language), text, fence);
          break;
        }
        case 'mermaid': {
          // Fenced as ```mermaid, which the parser turns back into a real
          // diagram rather than a code block.
          const source = attrString(block, 'source');
          const fence = codeFence(source);
          own.push(fence + 'mermaid', source, fence);
          break;
        }
        case 'callout':
          own.push(calloutHeader(block), ...quoted(block.id));
          break;
        case 'file':
          // A file block carries no attrs: the BLOCK's own id is the file
          // node id. An image renders inline, anything else as a file card.
          own.push('![](file:' + block.id + ')');
          break;
        case 'database':
        case 'whiteboardEmbed':
        case 'page':
        case 'embed': {
          // These used to come out as nothing at all, and a page holding one
          // could not be edited in replace mode.
          const spec = EMBED_BLOCKS[block.type]!;
          const json = embedJson(block, spec, options);
          const fence = codeFence(json);
          own.push(fence + spec.fence, json, fence);
          break;
        }
        case 'table':
          own.push(...tableLines(block, ''));
          break;
        case 'tableRow':
        case 'tableHeader':
        case 'tableCell':
          // Consumed by the 'table' case above.
          break;
        case 'horizontalRule':
          own.push('---');
          break;
        case 'blockquote':
          own.push(...quoted(block.id));
          break;
        case 'bulletList':
        case 'taskList':
          own.push(...walk(block.id, 'tight'));
          break;
        case 'orderedList': {
          // "11." after a note that interrupted the list: the numbering
          // restarted at 1 on every edit.
          const start = (block.attrs ?? {}).start;
          own.push(
            ...walk(
              block.id,
              'tight',
              typeof start === 'number' && Number.isInteger(start) && start >= 0
                ? start
                : 1
            )
          );
          break;
        }
        case 'listItem':
          own.push(...item(block.id, number === null ? '- ' : `${number}. `));
          if (number !== null) {
            number += 1;
          }
          break;
        case 'taskItem':
          own.push(
            ...item(
              block.id,
              `- [${block.attrs && block.attrs.checked ? 'x' : ' '}] `
            )
          );
          break;
        default:
          if (text) {
            own.push(text);
          } else {
            own.push(...walk(block.id, 'tight'));
          }
      }

      if (own.length > 0) {
        // Inside an item only a block that reads on into what follows needs
        // the blank line; the item goes on across it.
        const blank =
          lines.length > 0 &&
          (spacing === 'blank' ||
            (spacing === 'item' &&
              previousType !== null &&
              RUNS_ON_BLOCK_TYPES.has(previousType)));
        if (blank) {
          lines.push('');
        }
        lines.push(...own);
        previousType = block.type;
      }
    }

    return lines;
  };

  return walk(documentId, 'blank').join('\n');
};

// An odd number of trailing backslashes: the last one is not escaped.
const endsWithHardBreak = (line: string): boolean =>
  ((/\\+$/.exec(line)?.[0].length ?? 0) & 1) === 1;

// How an empty paragraph is written. Blank lines separate blocks, so a blank
// line cannot also stand for a paragraph with nothing in it. Written as text,
// the same characters are escaped and never read as this.
const EMPTY_PARAGRAPH = '<p></p>';

const paragraphContent = (text: string): BlockLeaf[] =>
  text.trim() === EMPTY_PARAGRAPH ? [] : parseInline(text);

type CellSegment = { fileId: string } | { text: string };

// The inverse of cellText in richTextToMarkdown: a cell written as <p>…</p>
// and ![](file:…) segments, and nothing else, becomes those blocks. Any
// other cell is one paragraph (null).
const cellSegments = (text: string): CellSegment[] | null => {
  const segments: CellSegment[] = [];
  // Backtick run lengths with no closing run further on: not searched again,
  // so a cell full of stray backticks stays linear.
  const unclosed = new Set<number>();
  let at = 0;
  while (at < text.length) {
    if (/\s/.test(text[at] ?? '')) {
      at += 1;
      continue;
    }
    const image = /^!\[[^\]]*\]\(file:([0-9a-z]{20,})\)/.exec(
      text.slice(at, at + 256)
    );
    if (image) {
      segments.push({ fileId: image[1] ?? '' });
      at += image[0].length;
      continue;
    }
    if (!text.startsWith('<p>', at)) {
      return null;
    }
    // The </p> that ends this paragraph: not escaped, and not inside code,
    // which is not escaped.
    let close = -1;
    for (let k = at + 3; k < text.length && close < 0; k++) {
      const ch = text[k];
      if (ch === '\\') {
        k += 1;
        continue;
      }
      if (ch === '`') {
        let run = 1;
        while (text[k + run] === '`') run += 1;
        let end = -1;
        if (!unclosed.has(run)) {
          const ticks = /`+/g;
          ticks.lastIndex = k + run;
          for (let m = ticks.exec(text); m; m = ticks.exec(text)) {
            if (m[0].length === run) {
              end = m.index;
              break;
            }
          }
          if (end < 0) {
            unclosed.add(run);
          }
        }
        k = (end < 0 ? k : end) + run - 1;
        continue;
      }
      if (text.startsWith('</p>', k)) {
        close = k;
      }
    }
    if (close < 0) {
      return null;
    }
    segments.push({ text: text.slice(at + 3, close) });
    at = close + 4;
  }
  return segments.length > 0 ? segments : null;
};

const newBlock = (type: string, parentId: string, index: string): Block => ({
  id: generateId(IdType.Block),
  type,
  parentId,
  index,
  content: LEAF_TEXT_TYPES.has(type) ? [] : undefined,
});

// Quotes, callouts and lists nest by recursion. Markdown nesting deeper than
// this is refused rather than allowed to exhaust the stack.
const MAX_BLOCK_NESTING = 32;

// A quote or callout line without its `>` and the one space after it. The
// rest keeps its indentation, which a code block inside the quote needs.
const unquote = (line: string): string => line.replace(/^\s*>[ ]?/, '');

const isQuoteLine = (line: string): boolean => /^\s*>/.test(line);

// Converts markdown/plain text into a rich-text block record whose top-level
// blocks are parented on `documentId`. `afterIndex` places the first top-level
// block after an existing block (used by edit_page append mode).
export const markdownToBlocks = (
  documentId: string,
  markdown: string,
  afterIndex: string | null = null
): Record<string, Block> => {
  const blocks: Record<string, Block> = {};
  parseBlockLines(
    markdown.replace(/\r\n/g, '\n').split('\n'),
    documentId,
    afterIndex,
    blocks,
    0
  );
  return blocks;
};

// Reads `lines` as the children of `parentId`, into `blocks`, and returns how
// many children it created. A callout or a quote reads its own lines, less
// their `>`, the same way, so anything a page holds may sit inside one. The
// old parser made each quoted line a paragraph, and a quote or callout
// written right after another one ran into it.
const parseBlockLines = (
  lines: string[],
  parentId: string,
  afterIndex: string | null,
  blocks: Record<string, Block>,
  depth: number
): number => {
  if (depth > MAX_BLOCK_NESTING) {
    throw new WikiToolError(
      `The markdown nests quotes, callouts or lists more than ${MAX_BLOCK_NESTING} levels deep.`
    );
  }

  let created = 0;
  let prevTopIndex = afterIndex;
  const nextIndex = (): string => {
    const index = generateFractionalIndex(prevTopIndex, null);
    prevTopIndex = index;
    created += 1;
    return index;
  };
  const pushTop = (type: string): Block => {
    const block = newBlock(type, parentId, nextIndex());
    blocks[block.id] = block;
    return block;
  };

  // A quote or callout holds at least a paragraph, as the editor's do.
  const parseQuoted = (container: Block, quoted: string[]): void => {
    if (parseBlockLines(quoted, container.id, null, blocks, depth + 1) === 0) {
      addParagraph(container.id, '');
    }
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
    para.content = paragraphContent(text);
    return para;
  };

  // GitHub callout keywords mapped onto the palette the callout block actually
  // stores -- the inverse of calloutHeader, plus a few common aliases.
  // Anything unknown stays neutral rather than guessing a colour.
  const CALLOUT_COLOURS: Record<string, string> = {
    note: 'blue',
    info: 'blue',
    tip: 'green',
    success: 'green',
    warning: 'orange',
    caution: 'red',
    important: 'purple',
    danger: 'red',
    error: 'red',
  };

  type ListKind = 'bullet' | 'ordered' | 'task';

  interface ListMarker {
    kind: ListKind;
    indent: number;
    // Where the item's text starts; its other lines are indented to here.
    contentIndent: number;
    content: string;
    number: number;
    checked: boolean;
  }

  const LIST_TYPE_BY_KIND: Record<ListKind, string> = {
    bullet: 'bulletList',
    ordered: 'orderedList',
    task: 'taskList',
  };

  const indentOf = (value: string): number =>
    value.length - value.trimStart().length;

  // The first line of a list item: its kind, where its text starts, and its
  // number or checkbox. The marker may stand alone -- an empty item, or one
  // whose first block is not a paragraph.
  const listMarker = (value: string): ListMarker | null => {
    const indent = indentOf(value);
    const rest = value.slice(indent);
    const task = /^[-*+]\s+\[([ xX])\](?=\s|$)/.exec(rest);
    const ordered = task ? null : /^(\d{1,9})[.)](?=\s|$)/.exec(rest);
    const bullet = task || ordered ? null : /^[-*+](?=\s|$)/.exec(rest);
    const head = task ?? ordered ?? bullet;
    if (!head) {
      return null;
    }
    const after = rest.slice(head[0].length);
    const gap = indentOf(after);
    return {
      kind: task ? 'task' : ordered ? 'ordered' : 'bullet',
      indent,
      // No space after the marker, or more than four, counts as one: the rest
      // is the item's text, as in CommonMark.
      contentIndent:
        indent + head[0].length + (gap === 0 || gap > 4 ? 1 : gap),
      content: after.trimStart(),
      number: ordered ? Number(ordered[1]) : 1,
      checked: task ? task[1] !== ' ' : false,
    };
  };

  // An item's lines, less the indentation that puts them in the item: the
  // text after the marker, then every line indented past the marker, and the
  // blank lines between them when the item goes on after them.
  const collectItemLines = (
    at: number,
    marker: ListMarker
  ): { itemLines: string[]; next: number } => {
    const itemLines = [marker.content];
    let next = at + 1;
    while (next < lines.length) {
      const line = lines[next] ?? '';
      if (line.trim() === '') {
        let after = next;
        while (after < lines.length && (lines[after] ?? '').trim() === '') {
          after += 1;
        }
        if (
          after >= lines.length ||
          indentOf(lines[after] ?? '') <= marker.indent
        ) {
          break;
        }
        for (; next < after; next += 1) {
          itemLines.push('');
        }
        continue;
      }
      const width = indentOf(line);
      if (width <= marker.indent) {
        break;
      }
      itemLines.push(line.slice(Math.min(width, marker.contentIndent)));
      next += 1;
    }
    return { itemLines, next };
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

  // A line ending in an unescaped backslash is a hard line break: its text
  // goes on on the next line, whatever that line looks like -- the
  // serializer escapes a block marker there. The old parser read every line
  // as a paragraph of its own and deleted the break.
  const takeHardBreakLines = (
    first: string,
    at: number
  ): { text: string; next: number } => {
    const parts = [first];
    let next = at + 1;
    while (
      endsWithHardBreak(parts[parts.length - 1] ?? '') &&
      next < lines.length &&
      (lines[next] ?? '').trim() !== ''
    ) {
      parts.push((lines[next] ?? '').trim());
      next += 1;
    }
    return { text: parts.join('\n'), next };
  };

  let i = 0;
  while (i < lines.length) {
    const line = (lines[i] ?? '').replace(/\s+$/, '');
    const trimmed = line.trim();

    const fenceOpen = /^(`{3,})([^`]*)$/.exec(trimmed);
    if (fenceOpen) {
      const fenceLength = (fenceOpen[1] ?? '').length;
      const info = (fenceOpen[2] ?? '').trim().toLowerCase();
      // Only a line of backticks at least as long as the opening fence closes
      // it, as in CommonMark; any line starting with ``` used to.
      const closes = (value: string): boolean => {
        const candidate = value.trim();
        return /^`+$/.test(candidate) && candidate.length >= fenceLength;
      };
      i += 1;
      const codeLines: string[] = [];
      while (i < lines.length && !closes(lines[i] ?? '')) {
        codeLines.push(lines[i] ?? '');
        i += 1;
      }
      i += 1; // skip closing fence
      if (info.startsWith('colanode-')) {
        const embed = parseEmbedFence(info, codeLines.join('\n'));
        if (embed) {
          if (embed.id && blocks[embed.id]) {
            throw new WikiToolError(
              `The ${embed.type} ${embed.id} is embedded twice; a page can show it once.`
            );
          }
          const id = embed.id ?? generateId(IdType.Block);
          blocks[id] = {
            id,
            type: embed.type,
            parentId,
            index: nextIndex(),
            ...(embed.attrs ? { attrs: embed.attrs } : {}),
          };
          continue;
        }
      }
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
      i += 1;
      continue;
    }

    // A GFM table is a row followed by a delimiter row. Without this branch
    // every line landed as a paragraph of literal pipes.
    if (trimmed.includes('|') && !listMarker(line) && isTableDelimiter(lines[i + 1] ?? '')) {
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
          const text = cells[c] ?? '';
          const segments = cellSegments(text);
          if (!segments) {
            addParagraph(cell.id, text);
            continue;
          }
          let inside: string | null = null;
          for (const segment of segments) {
            const index = generateFractionalIndex(inside, null);
            inside = index;
            if ('fileId' in segment) {
              blocks[segment.fileId] = {
                id: segment.fileId,
                type: 'file',
                parentId: cell.id,
                index,
              };
            } else {
              const paragraph = newBlock('paragraph', cell.id, index);
              paragraph.content = paragraphContent(segment.text);
              blocks[paragraph.id] = paragraph;
            }
          }
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
      blocks[image[1]] = {
        id: image[1],
        type: 'file',
        parentId,
        index: nextIndex(),
      };
      i += 1;
      continue;
    }

    // A heading with no text yet is written `## `; trimmed to `##`, it used
    // to come back as a paragraph reading "##".
    const heading = /^(#{1,6})(?:\s+(.*))?$/.exec(trimmed);
    if (heading) {
      const level = Math.min(5, (heading[1] ?? '#').length);
      const type = `heading${level}`;
      const block = pushTop(type);
      const { text, next } = takeHardBreakLines(heading[2] ?? '', i);
      block.content = parseInline(text);
      i = next;
      continue;
    }

    if (/^(-{3,}|\*{3,}|_{3,})$/.test(trimmed)) {
      pushTop('horizontalRule');
      i += 1;
      continue;
    }

    const callout =
      /^>\s*\[!([A-Za-z]+)((?:\|[a-z]+=[^|\]\s]+)*)\]\s*(.*)$/.exec(trimmed);
    if (callout) {
      const block = pushTop('callout');
      const attrs: Record<string, unknown> = {
        color: CALLOUT_COLOURS[(callout[1] ?? '').toLowerCase()] ?? 'default',
      };
      // Metadata outranks the keyword: `[!NOTE|color=gray]` is gray.
      for (const pair of (callout[2] ?? '').split('|').slice(1)) {
        const separator = pair.indexOf('=');
        const key = pair.slice(0, separator);
        const value = pair.slice(separator + 1);
        if (key === 'color' && CALLOUT_PALETTE.has(value)) {
          attrs.color = value;
        } else if (key === 'icon') {
          attrs.icon = value;
        }
      }
      block.attrs = attrs;
      const quoted: string[] = [];
      const firstLine = (callout[3] ?? '').trim();
      if (firstLine) {
        quoted.push(firstLine);
      }
      i += 1;
      while (i < lines.length && isQuoteLine(lines[i] ?? '')) {
        quoted.push(unquote(lines[i] ?? ''));
        i += 1;
      }
      parseQuoted(block, quoted);
      continue;
    }

    if (isQuoteLine(line)) {
      const block = pushTop('blockquote');
      const quoted: string[] = [];
      while (i < lines.length && isQuoteLine(lines[i] ?? '')) {
        quoted.push(unquote(lines[i] ?? ''));
        i += 1;
      }
      parseQuoted(block, quoted);
      continue;
    }

    // A list item is its marker line and every line indented past the
    // marker; those lines, less that indentation, are parsed like a page of
    // their own. The old parser kept only the marker line, so an item's
    // second paragraph broke out of the list and a code block in an item
    // came back with the item's indentation added to every line of code.
    const marker = listMarker(line);
    if (marker) {
      const list = pushTop(LIST_TYPE_BY_KIND[marker.kind]);
      if (marker.kind === 'ordered' && marker.number !== 1) {
        list.attrs = { start: marker.number };
      }
      let current: ListMarker | null = marker;
      let itemAfter: string | null = null;
      while (current) {
        const item = newBlock(
          current.kind === 'task' ? 'taskItem' : 'listItem',
          list.id,
          generateFractionalIndex(itemAfter, null)
        );
        blocks[item.id] = item;
        itemAfter = item.index;
        if (current.kind === 'task') {
          item.attrs = { checked: current.checked };
        }
        const { itemLines, next } = collectItemLines(i, current);
        if (parseBlockLines(itemLines, item.id, null, blocks, depth + 1) === 0) {
          addParagraph(item.id, '');
        }
        i = next;
        const following =
          i < lines.length
            ? listMarker((lines[i] ?? '').replace(/\s+$/, ''))
            : null;
        current =
          following &&
          following.kind === marker.kind &&
          following.indent <= marker.indent
            ? following
            : null;
      }
      continue;
    }

    const paragraph = pushTop('paragraph');
    const { text, next } = takeHardBreakLines(trimmed, i);
    paragraph.content = paragraphContent(text);
    i = next;
  }

  return created;
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

export interface SearchPageItem {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  rootId: string;
  // Ancestors from the space down to the parent; an ancestor the caller
  // could not open on its own keeps an empty name.
  path: NodePathEntry[];
}

export interface SearchPagesResult {
  items: SearchPageItem[];
  truncated: boolean;
  nextCursor: string | null;
}

export interface TrashItem {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  rootId: string;
  path: NodePathEntry[];
  deletedAt: string;
  deletedBy: { id: string; name: string } | null;
  // The nearest ancestor that is itself in the trash. Restoring this node
  // restores that ancestor too, or the node would stay out of sight.
  trashedAncestorId: string | null;
}

export interface ListTrashResult {
  items: TrashItem[];
  nextCursor: string | null;
}

export interface RestoreNodeResult {
  id: string;
  // Every node taken out of the trash, outermost first.
  restored: string[];
}

export interface BoardElementSummary {
  id: string;
  type: string;
  text?: string;
  shape?: string;
  badge?: string;
  frameId?: string;
  groupId?: string;
  mindmapParentId?: string;
  geometry?: { x: number; y: number; w: number; h: number; rotation?: number };
  nodeCard?: { nodeId: string; name: string; accessible: boolean };
  image?: { fileId: string };
}

export interface BoardConnectorSummary {
  id: string;
  fromId?: string;
  toId?: string;
  label?: string;
  kind?: string;
  arrowStart: boolean;
  arrowEnd: boolean;
}

export interface BoardFrameSummary {
  id: string;
  text: string;
  childIds: string[];
}

export interface BoardSceneSummary {
  // Everything the caller would see on the board, connectors and frames
  // included.
  elementCount: number;
  elements: BoardElementSummary[];
  connectors: BoardConnectorSummary[];
  frames: BoardFrameSummary[];
}

export interface GetWhiteboardResult extends BoardSceneSummary {
  id: string;
  name: string;
  type: string;
}

export interface NodePathEntry {
  id: string;
  name: string;
  type: string;
}

export interface GetPageResult {
  id: string;
  name: string;
  type: string;
  parentId: string | null;
  rootId: string;
  // Ancestors from the space down to the parent. An ancestor the caller could
  // not open on its own keeps an empty name.
  path: NodePathEntry[];
  // Children per node type, trashed ones and templates left out; list_children
  // lists them.
  childCounts: Record<string, number>;
  content: string;
  // What a replace edit of this page would delete, named: things markdown
  // does not carry, such as table column widths. Empty when a replace keeps
  // everything; otherwise edit_page refuses a replace unless given force.
  lossyOnReplace: string[];
}

export interface ChildSummary {
  id: string;
  type: string;
  name: string;
  parentId: string | null;
  index: string | null;
  hasChildren: boolean;
}

export interface ListChildrenResult {
  parent: { id: string; type: string; name: string } | null;
  items: ChildSummary[];
  nextCursor: string | null;
  total: number;
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

export const SEARCH_PAGES_DEFAULT_LIMIT = 25;
export const SEARCH_PAGES_MAX_LIMIT = 100;

// ILIKE treats % and _ as wildcards: searching "100%" matched every name.
const escapeLike = (value: string): string =>
  value.replace(/[\\%_]/g, (match) => `\\${match}`);

const encodeSearchCursor = (sortName: string, id: string): string =>
  Buffer.from(JSON.stringify([sortName, id]), 'utf8').toString('base64url');

const decodeSearchCursor = (cursor: string): [string, string] => {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      NODE_ID_PATTERN.test(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // Not a cursor of ours; refused below.
  }
  throw new WikiToolError('That cursor was not returned by search_pages.');
};

export const searchPages = async (
  ctx: WikiToolContext,
  input: {
    query: string;
    types?: string[];
    rootId?: string;
    parentId?: string;
    scope?: 'children' | 'descendants';
    includeTrashed?: boolean;
    limit?: number;
    cursor?: string;
  }
): Promise<SearchPagesResult> => {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? SEARCH_PAGES_DEFAULT_LIMIT)),
    SEARCH_PAGES_MAX_LIMIT
  );
  const types = (
    input.types && input.types.length > 0 ? input.types : SEARCHABLE_NODE_TYPES
  ) as NodeType[];
  const like = `%${escapeLike(input.query ?? '')}%`;
  const cursor = input.cursor ? decodeSearchCursor(input.cursor) : null;
  const parentId = input.parentId;
  const sortName = sql<string>`lower(coalesce(n.attributes->>'name', ''))`;

  // Access, trash and scope are all EXISTS: the old join on collaborations
  // returned a node once per collaborator of its space, and 25 rows with no
  // ORDER BY were whichever the planner met first.
  const rows = await database
    .selectFrom('nodes as n')
    .select([
      'n.id as id',
      'n.type as type',
      'n.parent_id as parentId',
      'n.root_id as rootId',
      sql<string | null>`n.attributes->>'name'`.as('name'),
      sortName.as('sortName'),
      nodePathSelect(ctx.userId).as('path'),
    ])
    .where('n.workspace_id', '=', ctx.workspaceId)
    .where('n.type', 'in', types)
    .where(
      sql<SqlBool>`coalesce(n.attributes->>'name', '') ilike ${like} escape '\\'`
    )
    .where(nodeAccessCondition(ctx.userId))
    .where(
      sql<SqlBool>`coalesce(n.attributes->>'isTemplate', 'false') <> 'true'`
    )
    .$if(!input.includeTrashed, (qb) =>
      // A page inside a trashed folder carries no deletedAt of its own.
      qb.where(sql<SqlBool>`not exists (
        select 1
        from node_paths trash_path
        join nodes trash_node on trash_node.id = trash_path.ancestor_id
        where trash_path.descendant_id = n.id
          and coalesce(trash_node.attributes->>'deletedAt', '') <> ''
      )`)
    )
    .$if(!!input.rootId, (qb) => qb.where('n.root_id', '=', input.rootId!))
    .$if(!!parentId && input.scope === 'children', (qb) =>
      qb.where('n.parent_id', '=', parentId!)
    )
    .$if(!!parentId && input.scope !== 'children', (qb) =>
      qb.where(sql<SqlBool>`exists (
        select 1 from node_paths scope_path
        where scope_path.ancestor_id = ${parentId!}
          and scope_path.descendant_id = n.id
          and scope_path.level > 0
      )`)
    )
    .$if(cursor !== null, (qb) =>
      qb.where(
        sql<SqlBool>`(${sortName}, n.id) > (${cursor![0]}, ${cursor![1]})`
      )
    )
    .orderBy(sortName)
    .orderBy('n.id')
    .limit(limit + 1)
    .execute();

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  const truncated = rows.length > limit;
  return {
    items: page.map((row) => ({
      id: row.id,
      name: row.name ?? '',
      type: row.type,
      parentId: row.parentId,
      rootId: row.rootId,
      path: row.path ?? [],
    })),
    truncated,
    nextCursor: truncated && last ? encodeSearchCursor(last.sortName, last.id) : null,
  };
};

// `_name` and, for a filtered database view, a readable `_filter` for every
// embedded node the caller can read. Nothing is added for the others: their
// names are not the caller's to see.
const buildEmbedHints = async (
  content: RichTextContent | null,
  embedded: { id: string; type: string }[],
  labels: ReadonlyMap<string, string>
): Promise<Map<string, Record<string, string>>> => {
  const hints = new Map<string, Record<string, string>>();
  const blocks = content?.blocks ?? {};
  const accessible = embedded.filter((embed) => labels.has(embed.id));

  const filteredDatabaseIds = accessible
    .filter(
      (embed) =>
        embed.type === 'database' &&
        typeof blocks[embed.id]?.attrs?.filterFieldId === 'string'
    )
    .map((embed) => embed.id);
  const databases =
    filteredDatabaseIds.length > 0
      ? await database
          .selectFrom('nodes')
          .select(['id', 'attributes'])
          .where('id', 'in', filteredDatabaseIds)
          .where('type', '=', 'database')
          .execute()
      : [];
  const fieldsByDatabase = new Map(
    databases.map((row) => [
      row.id,
      (row.attributes as DatabaseAttributes).fields ?? {},
    ])
  );

  for (const embed of accessible) {
    const hint: Record<string, string> = {
      _name: labels.get(embed.id) ?? '',
    };
    const attrs = (blocks[embed.id]?.attrs ?? {}) as Record<string, unknown>;
    if (embed.type === 'database' && typeof attrs.filterFieldId === 'string') {
      const field = fieldsByDatabase.get(embed.id)?.[attrs.filterFieldId];
      const value = attrs.filterValue;
      const optionName =
        field &&
        (field.type === 'select' || field.type === 'multi_select') &&
        typeof value === 'string'
          ? field.options?.[value]?.name
          : undefined;
      hint._filter = `${field?.name ?? attrs.filterFieldId} = ${
        optionName ?? (typeof value === 'string' ? value : '(empty)')
      }`;
    }
    hints.set(embed.id, hint);
  }

  return hints;
};

// The settings an embed block carries (EMBED_BLOCKS), as they would be
// written: equal when a model kept the fence it was given.
const sameEmbedAttrs = (type: string, a: Block, b: Block): boolean => {
  const keys = Object.keys(EMBED_BLOCKS[type]?.attrs ?? {});
  const settings = (block: Block) =>
    JSON.stringify(keys.map((key) => (block.attrs ?? {})[key] ?? null));
  return settings(a) === settings(b);
};

// Writing a block that embeds a node shows that node to everyone who can read
// the page, so the caller must be able to read it -- and it must be the kind
// of node the block draws.
//
// An embed the page already has, kept exactly as it is -- same block type,
// same settings -- needs no read access: a page showing something the caller
// cannot see stays editable. Anything else about it is a change and is
// checked like a new embed; the exemption used to cover any id the page
// already embedded, so a caller could re-filter a database view it cannot
// read, or turn that database into a page block. A kept embed's node is still
// checked to be of the block's kind, without naming what kind it really is.
const assertEmbeddableNodes = async (
  ctx: WikiToolContext,
  blocks: Record<string, Block>,
  existing: Readonly<Record<string, Block>>
): Promise<void> => {
  for (const embed of embeddedNodeIds(blocks)) {
    const before = existing[embed.id];
    const kept =
      before !== undefined &&
      before.type === embed.type &&
      sameEmbedAttrs(embed.type, before, blocks[embed.id]!);
    if (!kept) {
      const { node } = await requireAccessibleNode(embed.id, ctx);
      if (node.type !== embed.nodeType) {
        throw new WikiToolError(
          `Node ${embed.id} is a ${node.type}; a ${embed.type} block can only show a ${embed.nodeType}.`
        );
      }
      continue;
    }
    const node = await fetchNode(embed.id);
    if (!node || node.workspace_id !== ctx.workspaceId || node.type !== embed.nodeType) {
      throw new WikiToolError(
        `Node ${embed.id} cannot be shown by a ${embed.type} block.`
      );
    }
  }
};

export const LIST_CHILDREN_DEFAULT_LIMIT = 100;
export const LIST_CHILDREN_MAX_LIMIT = 500;

export const listChildren = async (
  ctx: WikiToolContext,
  input: { nodeId?: string; types?: string[]; limit?: number; cursor?: string }
): Promise<ListChildrenResult> => {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? LIST_CHILDREN_DEFAULT_LIMIT)),
    LIST_CHILDREN_MAX_LIMIT
  );

  let parent: ListChildrenResult['parent'] = null;
  let query = database
    .selectFrom('nodes as n')
    .select([
      'n.id as id',
      'n.type as type',
      'n.parent_id as parentId',
      sql<string | null>`n.attributes->>'name'`.as('name'),
      sql<string | null>`n.attributes->>'index'`.as('index'),
      sql<boolean>`exists (
        select 1 from nodes child
        where child.parent_id = n.id and ${visibleNodeCondition('child')}
      )`.as('hasChildren'),
    ])
    .where('n.workspace_id', '=', ctx.workspaceId)
    .where(visibleNodeCondition());

  if (input.nodeId) {
    // Children are readable by whoever can read the parent: a role only ever
    // widens further down the tree.
    const { node } = await requireAccessibleNode(input.nodeId, ctx);
    parent = { id: node.id, type: node.type, name: nodeName(node) };
    query = query.where('n.parent_id', '=', node.id);
  } else {
    query = query
      .where('n.type', '=', 'space')
      .where(nodeAccessCondition(ctx.userId));
  }

  const rows = await query.execute();

  // The sidebar orders the node types it draws; anything else (records,
  // files, messages) follows, ordered by the same rule among itself.
  const ordered = [
    ...orderSiblings(rows.filter((row) => SIDEBAR_NODE_TYPES.has(row.type))),
    ...orderSiblings(rows.filter((row) => !SIDEBAR_NODE_TYPES.has(row.type))),
  ];
  const wanted =
    input.types && input.types.length > 0 ? new Set(input.types) : null;
  const filtered = wanted
    ? ordered.filter((row) => wanted.has(row.type))
    : ordered;

  let start = 0;
  if (input.cursor) {
    const at = filtered.findIndex((row) => row.id === input.cursor);
    if (at < 0) {
      throw new WikiToolError(
        'The cursor is no longer a child here (it was moved or trashed); list again without it.'
      );
    }
    start = at + 1;
  }

  const page = filtered.slice(start, start + limit);
  const last = page[page.length - 1];
  return {
    parent,
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name ?? '',
      parentId: row.parentId,
      index: row.index,
      hasChildren: Boolean(row.hasChildren),
    })),
    nextCursor: start + limit < filtered.length && last ? last.id : null,
    total: filtered.length,
  };
};

export const getPage = async (
  ctx: WikiToolContext,
  input: { id: string }
): Promise<GetPageResult> => {
  const { tree, node } = await requireAccessibleNode(input.id, ctx);
  const model = getNodeModel(node.type);
  const name = model.extractText(node.id, node.attributes)?.name ?? '';

  const document = await database
    .selectFrom('documents')
    .selectAll()
    .where('id', '=', input.id)
    .executeTakeFirst();

  const richText = document ? (document.content as RichTextContent) : null;
  const embedded = richText ? embeddedNodeIds(richText.blocks ?? {}) : [];
  const labels = await resolveNodeLabels(ctx, [
    ...collectMentionTargets(richText),
    ...embedded.map((embed) => embed.id),
  ]);
  const embedHints = await buildEmbedHints(richText, embedded, labels);
  const content = richText
    ? richTextToMarkdown(input.id, richText, { labels, embedHints })
    : '';

  const mappedTree = tree.map(mapNode);
  const path = tree.slice(0, -1).map((ancestor, i) => ({
    id: ancestor.id,
    type: ancestor.type,
    name: extractNodeRole(mappedTree.slice(0, i + 1), ctx.userId)
      ? nodeName(ancestor)
      : '',
  }));

  const childRows = await database
    .selectFrom('nodes as n')
    .select(['n.type as type', sql<string>`count(*)`.as('count')])
    .where('n.parent_id', '=', node.id)
    .where(visibleNodeCondition())
    .groupBy('n.type')
    .execute();
  const childCounts = Object.fromEntries(
    childRows.map((row) => [row.type, Number(row.count)])
  );

  return {
    id: node.id,
    name,
    type: node.type,
    parentId: node.parent_id,
    rootId: node.root_id,
    path,
    childCounts,
    content,
    lossyOnReplace: lossyOnReplace(input.id, richText, content),
  };
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

  // Checked before the page exists, so a refused embed leaves nothing behind.
  if (input.content && input.content.trim().length > 0) {
    await assertEmbeddableNodes(
      ctx,
      markdownToBlocks('pending', input.content),
      {}
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
  input: {
    id: string;
    content: string;
    mode: 'replace' | 'append';
    force?: boolean;
  }
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

  const current = await database
    .selectFrom('documents')
    .select('content')
    .where('id', '=', input.id)
    .executeTakeFirst();
  const alreadyEmbedded = new Set(
    embeddedNodeIds(
      (current?.content as RichTextContent | undefined)?.blocks ?? {}
    ).map((embed) => embed.id)
  );
  const incoming = markdownToBlocks(input.id, input.content);
  if (mode === 'append') {
    // Appending a node the page already shows would silently move it.
    const repeated = embeddedNodeIds(incoming).find((embed) =>
      alreadyEmbedded.has(embed.id)
    );
    if (repeated) {
      throw new WikiToolError(
        `The ${repeated.type} ${repeated.id} is already on this page.`
      );
    }
    await assertEmbeddableNodes(ctx, incoming, {});
  } else {
    await assertEmbeddableNodes(
      ctx,
      incoming,
      (current?.content as RichTextContent | undefined)?.blocks ?? {}
    );
  }

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

      // A replace writes the whole page from markdown, and get_page could not
      // show what markdown does not carry: the model is rewriting a page it
      // never saw in full. Checked against the page as it is now, inside the
      // update, and refused unless the caller has said with `force` that
      // losing what get_page listed in lossyOnReplace is intended.
      const lost = lossyOnReplace(input.id, current as RichTextContent);
      if (lost.length > 0 && !input.force) {
        throw new WikiToolError(
          `A replace would delete what markdown cannot carry on this page: ${lost.join('; ')}. ` +
            `Use mode 'append' to add to the end, edit the page in the wiki, ` +
            `or pass force: true to replace it and lose that.`
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

// ---------------------------------------------------------------------------
// Trash
// ---------------------------------------------------------------------------

// Same list as softDeletableNodeTypes in @colanode/core, as a tuple for zod.
const TRASHABLE_NODE_TYPES = [
  'page',
  'folder',
  'database',
  'record',
  'file',
  'whiteboard',
] as const satisfies readonly NodeType[];

const isTrashed = (row: SelectNode): boolean =>
  isNodeTrashed(row.attributes as { deletedAt?: string | null });

// Moving to the trash and back is one attribute change -- deletedAt/deletedBy
// set or cleared -- synced like any other node update. updateNode checks no
// permission, so the node model's own rule is applied here first, exactly as
// the server does for a client's update.
const assertCanSetTrashState = (
  user: WorkspaceUser,
  tree: SelectNode[],
  trashed: boolean
): void => {
  const node = tree[tree.length - 1]!;
  const model = getNodeModel(node.type);
  const attributes = {
    ...(node.attributes as NodeAttributes),
    deletedAt: trashed ? new Date().toISOString() : null,
    deletedBy: trashed ? user.id : null,
  } as NodeAttributes;
  const allowed = model.canUpdateAttributes({
    user: {
      id: user.id,
      role: user.role,
      workspaceId: user.workspaceId,
      accountId: user.accountId,
    },
    node: mapNode(node),
    tree: tree.map(mapNode),
    attributes,
  });
  if (!allowed) {
    throw new WikiToolError(
      trashed
        ? `You do not have permission to move node ${node.id} to the trash.`
        : `You do not have permission to restore node ${node.id}.`
    );
  }
};

const writeTrashState = (
  ctx: WikiToolContext,
  nodeId: string,
  trashed: boolean
): Promise<boolean> =>
  updateNode({
    nodeId,
    userId: ctx.userId,
    workspaceId: ctx.workspaceId,
    updater: (attributes) => {
      const state = attributes as {
        deletedAt?: string | null;
        deletedBy?: string | null;
      };
      state.deletedAt = trashed ? new Date().toISOString() : null;
      state.deletedBy = trashed ? ctx.userId : null;
      return attributes;
    },
  });

// Whether the caller can open a node, for deciding what may be said about
// something they reach only indirectly.
const canAccessNode = async (
  nodeId: string,
  ctx: WikiToolContext
): Promise<boolean> => {
  try {
    await requireAccessibleNode(nodeId, ctx);
    return true;
  } catch (error) {
    if (error instanceof WikiToolError) {
      return false;
    }
    throw error;
  }
};

export const trashNode = async (
  ctx: WikiToolContext,
  input: { id: string }
): Promise<{ id: string; trashed: boolean; type: string }> => {
  const { tree, node } = await requireAccessibleNode(input.id, ctx);
  if (!isSoftDeletableNodeType(node.type)) {
    throw new WikiToolError(`Node type '${node.type}' cannot be trashed.`);
  }
  // The permission comes first: "already in the trash" told someone who may
  // only view what another person had just deleted.
  const user = await fetchWorkspaceUser(ctx);
  assertCanSetTrashState(user, tree, true);
  if (isTrashed(node)) {
    return { id: input.id, trashed: true, type: node.type };
  }

  if (!(await writeTrashState(ctx, node.id, true))) {
    throw new WikiToolError(`Could not move node ${input.id} to the trash.`);
  }

  return { id: input.id, trashed: true, type: node.type };
};

export const restoreNode = async (
  ctx: WikiToolContext,
  input: { id: string }
): Promise<RestoreNodeResult> => {
  if (!(await fetchNode(input.id))) {
    // "Delete forever" removes the row and leaves a tombstone. That is said
    // only to someone who can open the space it was deleted from: to anyone
    // else it confirmed a deletion they could never have seen. For them the
    // node is not found, like an id that never existed.
    const tombstone = await database
      .selectFrom('node_tombstones')
      .select(['id', 'root_id'])
      .where('id', '=', input.id)
      .where('workspace_id', '=', ctx.workspaceId)
      .executeTakeFirst();
    const canOpenSpace = tombstone
      ? await canAccessNode(tombstone.root_id, ctx)
      : false;
    throw new WikiToolError(
      canOpenSpace
        ? `Node ${input.id} was permanently deleted and cannot be restored.`
        : `Node ${input.id} was not found.`
    );
  }

  const { tree } = await requireAccessibleNode(input.id, ctx);

  // Like the client's restore: the node and every trashed ancestor, since a
  // node restored inside a folder still in the trash stays out of sight.
  const trashedDepths = tree
    .map((row, depth) => (isTrashed(row) ? depth : -1))
    .filter((depth) => depth >= 0);
  if (trashedDepths.length === 0) {
    throw new WikiToolError(`Node ${input.id} is not in the trash.`);
  }

  // Every permission first, so a refusal part-way leaves nothing restored.
  const user = await fetchWorkspaceUser(ctx);
  for (const depth of trashedDepths) {
    assertCanSetTrashState(user, tree.slice(0, depth + 1), false);
  }

  const restored: string[] = [];
  for (const depth of trashedDepths) {
    const target = tree[depth]!;
    if (!(await writeTrashState(ctx, target.id, false))) {
      throw new WikiToolError(
        `Could not restore node ${target.id}` +
          (restored.length > 0
            ? `; already restored: ${restored.join(', ')}.`
            : '; nothing was restored.')
      );
    }
    restored.push(target.id);
  }

  return { id: input.id, restored };
};

// ---------------------------------------------------------------------------
// Whiteboards
// ---------------------------------------------------------------------------

const readText = (value: unknown): string | undefined =>
  typeof value === 'string' && value.length > 0 ? value : undefined;

const readNumber = (value: unknown): number | undefined =>
  typeof value === 'number' && Number.isFinite(value) ? value : undefined;

const readObject = (value: unknown): Record<string, unknown> =>
  value && typeof value === 'object' && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};

// The node ids a board's node cards point at, for resolveNodeLabels.
export const boardNodeCardIds = (scene: unknown): string[] =>
  Object.values(readObject(scene)).flatMap((value) => {
    const element = readObject(value);
    const nodeId = readText(element.nodeId);
    return element.type === 'nodeCard' && nodeId ? [nodeId] : [];
  });

// A board scene (whiteboard.ts boardElementSchema) read for a model: what each
// element says and how elements relate, without the styling. Read leniently --
// one malformed element, or a type a newer client added, must not hide the
// rest of the board. Private elements of other people are left out: the
// canvas does not draw them for anyone but their author.
export const summariseBoardScene = (
  scene: unknown,
  labels: ReadonlyMap<string, string>,
  options: {
    userId: string;
    includeGeometry?: boolean;
    includeHidden?: boolean;
  }
): BoardSceneSummary => {
  const visible: { id: string; z: string; raw: Record<string, unknown> }[] =
    [];
  for (const [key, value] of Object.entries(readObject(scene))) {
    const raw = readObject(value);
    if (!readText(raw.type)) {
      continue;
    }
    const privateBy = readText(raw.privateBy);
    if (privateBy && privateBy !== options.userId) {
      continue;
    }
    if (raw.hidden === true && !options.includeHidden) {
      continue;
    }
    visible.push({
      id: readText(raw.id) ?? key,
      z: typeof raw.z === 'string' ? raw.z : '',
      raw,
    });
  }
  // Paint order: z is a fractional index, back to front.
  visible.sort((a, b) => compareString(a.z, b.z) || compareString(a.id, b.id));

  const elements: BoardElementSummary[] = [];
  const connectors: BoardConnectorSummary[] = [];
  const frames: BoardFrameSummary[] = [];

  for (const { id, raw } of visible) {
    const type = raw.type as string;

    if (type === 'connector') {
      const connector = readObject(raw.connector);
      const startType = readText(connector.arrowStartType);
      const endType = readText(connector.arrowEndType);
      connectors.push({
        id,
        ...(readText(connector.fromId) ? { fromId: connector.fromId as string } : {}),
        ...(readText(connector.toId) ? { toId: connector.toId as string } : {}),
        ...(readText(connector.label) ? { label: connector.label as string } : {}),
        ...(readText(connector.kind) ? { kind: connector.kind as string } : {}),
        // As the canvas draws them: a head type outranks the older booleans,
        // and without either a line has no start head and an end head.
        arrowStart: startType ? startType !== 'none' : connector.arrowStart === true,
        arrowEnd: endType ? endType !== 'none' : connector.arrowEnd !== false,
      });
      continue;
    }

    if (type === 'frame') {
      frames.push({ id, text: readText(raw.text) ?? '', childIds: [] });
      continue;
    }

    const summary: BoardElementSummary = { id, type };
    for (const key of ['text', 'shape', 'badge', 'frameId', 'groupId'] as const) {
      const value = readText(raw[key]);
      if (value) {
        summary[key] = value;
      }
    }
    const mindmapParentId = readText(readObject(raw.mindmap).parentId);
    if (mindmapParentId) {
      summary.mindmapParentId = mindmapParentId;
    }

    if (options.includeGeometry) {
      const [x, y, w, h] = [raw.x, raw.y, raw.w, raw.h].map(readNumber);
      if (x !== undefined && y !== undefined && w !== undefined && h !== undefined) {
        const rotation = readNumber(raw.rotation);
        summary.geometry = {
          x,
          y,
          w,
          h,
          ...(rotation !== undefined ? { rotation } : {}),
        };
      }
    }

    const nodeId = type === 'nodeCard' ? readText(raw.nodeId) : undefined;
    if (nodeId) {
      // The stored name is what the card itself shows once its target is out
      // of reach, so it is no more than the board already tells its readers.
      const label = labels.get(nodeId);
      summary.nodeCard = {
        nodeId,
        name: label ?? readText(raw.nodeName) ?? '',
        accessible: label !== undefined,
      };
    }

    const fileId = type === 'image' ? readText(raw.fileId) : undefined;
    if (fileId) {
      summary.image = { fileId };
    }

    elements.push(summary);
  }

  for (const frame of frames) {
    frame.childIds = elements
      .filter((element) => element.frameId === frame.id)
      .map((element) => element.id);
  }

  return { elementCount: visible.length, elements, connectors, frames };
};

export const getWhiteboard = async (
  ctx: WikiToolContext,
  input: { id: string; includeGeometry?: boolean; includeHidden?: boolean }
): Promise<GetWhiteboardResult> => {
  const { node } = await requireAccessibleNode(input.id, ctx);
  const attributes = node.attributes as { scene?: unknown; boardScene?: unknown };

  // A page or folder can open as a board too; it keeps its scene apart.
  const scene =
    node.type === 'whiteboard'
      ? attributes.scene
      : node.type === 'page' || node.type === 'folder'
        ? attributes.boardScene
        : undefined;
  if (node.type !== 'whiteboard' && scene === undefined) {
    throw new WikiToolError(`Node ${input.id} is a ${node.type} with no board.`);
  }

  const labels = await resolveNodeLabels(ctx, boardNodeCardIds(scene));
  return {
    id: node.id,
    name: nodeName(node),
    type: node.type,
    ...summariseBoardScene(scene, labels, {
      userId: ctx.userId,
      includeGeometry: input.includeGeometry,
      includeHidden: input.includeHidden,
    }),
  };
};

export const LIST_TRASH_DEFAULT_LIMIT = 50;
export const LIST_TRASH_MAX_LIMIT = 200;

const encodeTrashCursor = (deletedAt: string, id: string): string =>
  Buffer.from(JSON.stringify([deletedAt, id]), 'utf8').toString('base64url');

const decodeTrashCursor = (cursor: string): [string, string] => {
  try {
    const value: unknown = JSON.parse(
      Buffer.from(cursor, 'base64url').toString('utf8')
    );
    if (
      Array.isArray(value) &&
      value.length === 2 &&
      typeof value[0] === 'string' &&
      typeof value[1] === 'string' &&
      NODE_ID_PATTERN.test(value[1])
    ) {
      return [value[0], value[1]];
    }
  } catch {
    // Not a cursor of ours; refused below.
  }
  throw new WikiToolError('That cursor was not returned by list_trash.');
};

export const listTrash = async (
  ctx: WikiToolContext,
  input: { rootId?: string; types?: string[]; limit?: number; cursor?: string }
): Promise<ListTrashResult> => {
  const limit = Math.min(
    Math.max(1, Math.floor(input.limit ?? LIST_TRASH_DEFAULT_LIMIT)),
    LIST_TRASH_MAX_LIMIT
  );
  const types = (
    input.types && input.types.length > 0 ? input.types : TRASHABLE_NODE_TYPES
  ) as NodeType[];
  const cursor = input.cursor ? decodeTrashCursor(input.cursor) : null;
  const deletedAt = sql<string>`n.attributes->>'deletedAt'`;

  const rows = await database
    .selectFrom('nodes as n')
    .select([
      'n.id as id',
      'n.type as type',
      'n.parent_id as parentId',
      'n.root_id as rootId',
      sql<string | null>`n.attributes->>'name'`.as('name'),
      deletedAt.as('deletedAt'),
      sql<string | null>`n.attributes->>'deletedBy'`.as('deletedById'),
      sql<string | null>`(
        select coalesce(nullif(u.custom_name, ''), u.name)
        from users u
        where u.id = n.attributes->>'deletedBy'
          and u.workspace_id = n.workspace_id
      )`.as('deletedByName'),
      nodePathSelect(ctx.userId).as('path'),
      sql<string | null>`(
        select trash_path.ancestor_id
        from node_paths trash_path
        join nodes trash_node on trash_node.id = trash_path.ancestor_id
        where trash_path.descendant_id = n.id
          and trash_path.level > 0
          and coalesce(trash_node.attributes->>'deletedAt', '') <> ''
        order by trash_path.level asc
        limit 1
      )`.as('trashedAncestorId'),
    ])
    .where('n.workspace_id', '=', ctx.workspaceId)
    .where('n.type', 'in', types)
    .where(sql<SqlBool>`coalesce(n.attributes->>'deletedAt', '') <> ''`)
    .where(nodeAccessCondition(ctx.userId))
    .$if(!!input.rootId, (qb) => qb.where('n.root_id', '=', input.rootId!))
    .$if(cursor !== null, (qb) =>
      qb.where(
        sql<SqlBool>`(${deletedAt}, n.id) < (${cursor![0]}, ${cursor![1]})`
      )
    )
    .orderBy(deletedAt, 'desc')
    .orderBy('n.id', 'desc')
    .limit(limit + 1)
    .execute();

  const page = rows.slice(0, limit);
  const last = page[page.length - 1];
  return {
    items: page.map((row) => ({
      id: row.id,
      type: row.type,
      name: row.name ?? '',
      parentId: row.parentId,
      rootId: row.rootId,
      path: row.path ?? [],
      deletedAt: row.deletedAt,
      deletedBy: row.deletedById
        ? { id: row.deletedById, name: row.deletedByName ?? '' }
        : null,
      trashedAncestorId: row.trashedAncestorId,
    })),
    nextCursor:
      rows.length > limit && last
        ? encodeTrashCursor(last.deletedAt, last.id)
        : null,
  };
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
  // Every database the caller can open: a collaboration on the database or
  // on anything above it, the rule every other tool applies. Joining the
  // space's collaborations left out a database shared with someone directly.
  const rows = await database
    .selectFrom('nodes as n')
    .where('n.workspace_id', '=', ctx.workspaceId)
    .where('n.type', '=', 'database')
    .where(nodeAccessCondition(ctx.userId))
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

// Sizes past which input is refused before any work is done. Nothing capped
// them: a 200,000-character search query ran 8.5 s of ILIKE on production.
// Each sits far above real use -- the largest page is 83,000 characters of
// markdown.
const MAX_QUERY_LENGTH = 500;
const MAX_NAME_LENGTH = 500;
const MAX_MARKDOWN_LENGTH = 2_000_000;
const MAX_URL_LENGTH = 2048;
// Base64 of the largest image upload_image takes, with room for a data: URL
// prefix.
const MAX_IMAGE_DATA_LENGTH = Math.ceil((MAX_IMAGE_BYTES * 4) / 3) + 256;

const nameInput = (description: string) =>
  z
    .string()
    .max(MAX_NAME_LENGTH, `A name is at most ${MAX_NAME_LENGTH} characters.`)
    .describe(description);

const markdownInput = (description: string) =>
  z
    .string()
    .max(
      MAX_MARKDOWN_LENGTH,
      "At most 2 MB of markdown at once: write a longer page in parts with mode 'append'."
    )
    .describe(description);

const searchPagesInput = z.object({
  query: z
    .string()
    .max(
      MAX_QUERY_LENGTH,
      `A search query is at most ${MAX_QUERY_LENGTH} characters.`
    )
    .describe(
      'Text to find in names, case-insensitive; % and _ match themselves. An empty query matches every name.'
    ),
  types: z
    .array(z.enum(SEARCHABLE_NODE_TYPES))
    .optional()
    .describe(
      'Only these node types. Default: pages, folders, databases, records, channels, spaces and whiteboards.'
    ),
  rootId: z
    .string()
    .regex(NODE_ID_PATTERN)
    .optional()
    .describe('Only nodes in this space (the space id).'),
  parentId: z
    .string()
    .regex(NODE_ID_PATTERN)
    .optional()
    .describe('Only nodes below this node.'),
  scope: z
    .enum(['children', 'descendants'])
    .optional()
    .describe(
      "With parentId: 'children' for its direct children only, 'descendants' (the default) for its whole subtree."
    ),
  includeTrashed: z
    .boolean()
    .optional()
    .describe(
      'Also match nodes in the trash or under a trashed node. Default false.'
    ),
  limit: z
    .number()
    .int()
    .min(1)
    .max(SEARCH_PAGES_MAX_LIMIT)
    .optional()
    .describe(
      `Results per page, default ${SEARCH_PAGES_DEFAULT_LIMIT}, at most ${SEARCH_PAGES_MAX_LIMIT}.`
    ),
  cursor: z
    .string()
    .max(2000)
    .optional()
    .describe('The nextCursor of the previous page, to read the page after it.'),
});
const getPageInput = z.object({
  id: z.string().describe('The node id of the page/record to read.'),
});

const LISTABLE_NODE_TYPES = [
  'space',
  'channel',
  'chat',
  'page',
  'database',
  'database_view',
  'folder',
  'whiteboard',
  'record',
  'file',
  'message',
] as const satisfies readonly NodeType[];

const listChildrenInput = z.object({
  nodeId: z
    .string()
    .regex(NODE_ID_PATTERN)
    .optional()
    .describe('The node whose children to list. Omit it to list your spaces.'),
  types: z
    .array(z.enum(LISTABLE_NODE_TYPES))
    .optional()
    .describe('Only children of these node types, e.g. ["page", "database"].'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LIST_CHILDREN_MAX_LIMIT)
    .optional()
    .describe(
      `Children per page, default ${LIST_CHILDREN_DEFAULT_LIMIT}, at most ${LIST_CHILDREN_MAX_LIMIT}.`
    ),
  cursor: z
    .string()
    .regex(NODE_ID_PATTERN)
    .optional()
    .describe('The nextCursor of the previous page, to read the page after it.'),
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
  name: nameInput('File name, e.g. "power-chain.png".'),
  url: z
    .string()
    .max(MAX_URL_LENGTH, `A URL is at most ${MAX_URL_LENGTH} characters.`)
    .optional()
    .describe(
      'Public http(s) URL to fetch. Private and reserved addresses are refused, and redirects are not followed.'
    ),
  data: z
    .string()
    .max(
      MAX_IMAGE_DATA_LENGTH,
      'This is more base64 data than the largest image upload_image accepts.'
    )
    .optional()
    .describe('Base64 image data, with or without a data: URL prefix.'),
});

const createPageInput = z.object({
  parentId: z
    .string()
    .describe('The id of the parent node (space, folder or page).'),
  name: nameInput('Title of the new page.'),
  content: markdownInput('Initial page body, in markdown.').optional(),
});
const editPageInput = z.object({
  id: z.string().describe('The node id of the page to edit.'),
  content: markdownInput('Markdown content.'),
  mode: z
    .enum(['replace', 'append'])
    .describe("'replace' overwrites the document; 'append' adds to the end."),
  force: z
    .boolean()
    .optional()
    .describe(
      "With mode 'replace': replace even though get_page listed something in lossyOnReplace, which is then deleted. Default false."
    ),
});
const renameNodeInput = z.object({
  id: z
    .string()
    .describe('The node id of the page, folder, database or whiteboard to rename.'),
  name: nameInput('The new name/title.'),
});
const trashNodeInput = z.object({
  id: z.string().describe('The node id of the page/folder/database/whiteboard to move to trash.'),
});
const listTrashInput = z.object({
  rootId: z
    .string()
    .regex(NODE_ID_PATTERN)
    .optional()
    .describe('Only the trash of this space (the space id).'),
  types: z
    .array(z.enum(TRASHABLE_NODE_TYPES))
    .optional()
    .describe('Only these node types.'),
  limit: z
    .number()
    .int()
    .min(1)
    .max(LIST_TRASH_MAX_LIMIT)
    .optional()
    .describe(
      `Nodes per page, default ${LIST_TRASH_DEFAULT_LIMIT}, at most ${LIST_TRASH_MAX_LIMIT}.`
    ),
  cursor: z
    .string()
    .max(2000)
    .optional()
    .describe('The nextCursor of the previous page, to read the page after it.'),
});
const restoreNodeInput = z.object({
  id: z.string().describe('The id of the trashed node to restore.'),
});
const getWhiteboardInput = z.object({
  id: z
    .string()
    .describe(
      'The id of a whiteboard, or of a page or folder that has a board view.'
    ),
  includeGeometry: z
    .boolean()
    .optional()
    .describe(
      "Also return each element's position and size (x, y, w, h, rotation). Default false."
    ),
  includeHidden: z
    .boolean()
    .optional()
    .describe('Also return elements hidden on the board. Default false.'),
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
    .max(
      MAX_QUERY_LENGTH,
      `A filter is at most ${MAX_QUERY_LENGTH} characters.`
    )
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
      'Search names across the workspace -- pages, folders, databases, records, channels, spaces and whiteboards -- ordered by name, optionally within one space or below one node. Trashed nodes and templates are left out unless includeTrashed. Returns { items: [{ id, name, type, parentId, rootId, path: [{ id, name, type }] }], truncated, nextCursor }.',
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
      'Read a page or record by id and return its title and body as markdown text, where it sits (parentId, rootId, and path from the space down to the parent) and how many children of each type it has. Embedded database views, whiteboards, sub-pages and web embeds appear as ```colanode-database / colanode-whiteboard / colanode-page / colanode-embed fences holding one JSON object; keep them when rewriting the page, and ignore their read-only "_" keys (_name, _filter). What markdown has no syntax for is written as tags: <span data-color="red">, <mark data-color="yellow">, <u>, <span data-comment="…"> (a comment anchor), <p></p> (an empty paragraph), <br> (a line break in a table cell, or several paragraphs as <p>…</p>); elsewhere a line ending in a backslash is a line break. lossyOnReplace names what a replace edit would delete from this page, such as table column widths; edit_page refuses that replace unless given force. Returns { id, name, type, parentId, rootId, path: [{ id, name, type }], childCounts, content, lossyOnReplace }.',
    inputSchema: getPageInput,
    run: getPage,
    action: (input, result) => ({
      type: 'get_page',
      nodeId: input.id,
      summary: `Read "${result.name}"`,
    }),
  }),
  defineTool({
    name: 'list_children',
    description:
      'List the children of a node in the order the sidebar shows them -- pages, folders, databases, views, whiteboards, then records, files and messages -- or, with nodeId omitted, the spaces you can open. Trashed nodes and templates are left out. Returns { parent, items: [{ id, type, name, parentId, index, hasChildren }], nextCursor, total }.',
    inputSchema: listChildrenInput,
    run: listChildren,
    action: (input) => ({
      type: 'list_children',
      nodeId: input.nodeId ?? null,
      summary: input.nodeId ? 'Listed the children of a node' : 'Listed spaces',
    }),
  }),
  defineTool({
    name: 'get_whiteboard',
    description:
      "Read a whiteboard, or the board view of a page or folder, back to front: elements with their text, shape, badge, frame, group, mind-map parent, node cards (with the linked node's current name when you can read it) and images; connectors with their ends, label, kind and arrow heads; frames with the elements inside them. Read-only; other people's private elements are left out. Returns { id, name, type, elementCount, elements, connectors, frames }.",
    inputSchema: getWhiteboardInput,
    run: getWhiteboard,
    action: (input, result) => ({
      type: 'get_whiteboard',
      nodeId: input.id,
      summary: `Read the board "${result.name}"`,
    }),
  }),
  defineTool({
    name: 'create_page',
    description:
      'Create a new page under a parent node (space, folder or page), with optional initial markdown content. Returns { id, name }.',
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
      "Edit a page's document. mode 'replace' overwrites the whole body; mode 'append' adds the content to the end. Content is markdown, with the tags get_page writes for colour, highlight, underline, comment anchors and empty paragraphs; a colanode-* fence from get_page keeps its embedded block, and a new one may embed any database, whiteboard or page you can read. A replace is refused while get_page lists something in lossyOnReplace, because it would delete that: append instead, or pass force: true to replace anyway. Returns { id, mode }.",
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
      "Move a page, folder, database, record, file or whiteboard to the trash (soft delete; restore_node brings it back). Returns { id, trashed, type }.",
    inputSchema: trashNodeInput,
    run: trashNode,
    action: (input) => ({
      type: 'trash_node',
      nodeId: input.id,
      summary: 'Moved to trash',
    }),
  }),
  defineTool({
    name: 'list_trash',
    description:
      'List what is in the trash, newest first. A node inside a trashed folder or page names that ancestor in trashedAncestorId. Returns { items: [{ id, type, name, parentId, rootId, path, deletedAt, deletedBy: { id, name }, trashedAncestorId }], nextCursor }.',
    inputSchema: listTrashInput,
    run: listTrash,
    action: () => ({
      type: 'list_trash',
      nodeId: null,
      summary: 'Listed the trash',
    }),
  }),
  defineTool({
    name: 'restore_node',
    description:
      'Take a node out of the trash, together with any trashed ancestor it sits in, so it is visible again. Refuses a node that is not in the trash or was permanently deleted. Returns { id, restored: [ids, outermost first] }.',
    inputSchema: restoreNodeInput,
    run: restoreNode,
    action: (input, result) => ({
      type: 'restore_node',
      nodeId: input.id,
      summary: `Restored ${result.restored.length} node(s) from the trash`,
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
      'List the databases in the workspace with their fields. Returns [{ id, name, fields: [{ id, name, type }] }].',
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
      'Update fields on an existing record. fields maps field name (or id) to new value. Returns { id, name, applied, skipped }.',
    inputSchema: updateRecordInput,
    run: updateRecord,
    action: (input, result) => ({
      type: 'update_record',
      nodeId: result.id,
      summary: `Updated record "${result.name}"`,
    }),
  }),
];
