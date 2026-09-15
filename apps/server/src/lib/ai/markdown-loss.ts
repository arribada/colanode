// What a replace edit would lose from a page: the page goes out as markdown
// and comes back as blocks, and some of what the editor stores has no
// markdown form. edit_page refuses a replace that would drop any of it, and
// get_page names it up front, so a model can append instead or leave the
// page alone.
//
// Two checks. Named constructs known not to survive -- a block, mark or
// attribute the conversion does not carry -- are looked for directly in the
// stored content. Then the page as it would come back is compared with the
// page as stored, with the differences a reader cannot see ignored, so
// anything else the conversion gets wrong is refused too rather than
// silently deleted.
import {
  Block,
  BlockLeaf,
  compareString,
  RichTextContent,
} from '@colanode/core';

// The block types markdown carries (lib/ai/tools.ts richTextToMarkdown).
const CARRIED_BLOCK_TYPES = new Set([
  'paragraph',
  'heading1',
  'heading2',
  'heading3',
  'heading4',
  'heading5',
  'codeBlock',
  'mermaid',
  'callout',
  'blockquote',
  'bulletList',
  'orderedList',
  'taskList',
  'listItem',
  'taskItem',
  'table',
  'tableRow',
  'tableHeader',
  'tableCell',
  'horizontalRule',
  'file',
  'database',
  'whiteboardEmbed',
  'page',
  'embed',
]);

const EMBED_TYPES = new Set(['database', 'whiteboardEmbed', 'page', 'embed']);

const CARRIED_MARKS = new Set([
  'bold',
  'italic',
  'strike',
  'code',
  'link',
  'underline',
  'highlight',
  'color',
  'comment',
]);

const CARRIED_LEAVES = new Set(['text', 'mention', 'hardBreak']);

const EDITOR_COLOURS = new Set([
  'default',
  'gray',
  'orange',
  'yellow',
  'green',
  'blue',
  'purple',
  'pink',
  'red',
]);

// Attributes written with any value, per block type.
const CARRIED_ATTRS: Record<string, ReadonlySet<string>> = {
  codeBlock: new Set(['language']),
  callout: new Set(['color', 'icon']),
  orderedList: new Set(['start']),
  taskItem: new Set(['checked']),
  mermaid: new Set(['source']),
  database: new Set(['inline', 'filterFieldId', 'filterValue']),
  whiteboardEmbed: new Set(['height', 'region']),
  embed: new Set(['url', 'provider']),
};

const isEmptyArray = (value: unknown): boolean =>
  Array.isArray(value) && value.length === 0;

// Attributes that are not written, and the values that mean "nothing set",
// which lose nothing. Anything else set on them is named by its label.
const UNCARRIED_ATTRS: Record<
  string,
  { label: string; neutral: (value: unknown) => boolean }
> = {
  textAlign: {
    label: 'text alignment',
    neutral: (v) => v === 'left',
  },
  collapsed: {
    label: 'collapsed headings',
    neutral: (v) => v === false,
  },
  colorRules: {
    label: 'table colour rules',
    neutral: isEmptyArray,
  },
  colspan: { label: 'merged table cells', neutral: (v) => v === 1 },
  rowspan: { label: 'merged table cells', neutral: (v) => v === 1 },
  colwidth: { label: 'table column widths', neutral: () => false },
  align: { label: 'table cell alignment', neutral: () => false },
  valign: { label: 'table cell alignment', neutral: (v) => v === 'middle' },
  backgroundColor: {
    label: 'table cell colours',
    neutral: (v) => v === 'default',
  },
  borderStyle: { label: 'table cell borders', neutral: (v) => v === 'default' },
  borderColor: { label: 'table cell borders', neutral: (v) => v === 'default' },
  numberFormat: {
    label: 'table cell number formats',
    neutral: (v) => v === 'none',
  },
  aggregate: { label: 'table totals', neutral: (v) => v === 'none' },
  variant: { label: 'divider styles', neutral: (v) => v === 'line' },
  width: { label: 'image sizes', neutral: () => false },
};

const CALLOUT_META_VALUE = /^[^|\]\s]+$/;
const THREAD_ID = /^[a-z0-9]{20,64}$/;

const byIndex = (a: Block, b: Block): number =>
  compareString(a.index, b.index) || compareString(a.id, b.id);

const childrenIndex = (blocks: readonly Block[]): Map<string, Block[]> => {
  const children = new Map<string, Block[]>();
  for (const block of blocks) {
    const list = children.get(block.parentId) ?? [];
    list.push(block);
    children.set(block.parentId, list);
  }
  for (const list of children.values()) {
    list.sort(byIndex);
  }
  return children;
};

// ---------------------------------------------------------------------------
// Named constructs
// ---------------------------------------------------------------------------

const namedLosses = (
  documentId: string,
  content: RichTextContent | null | undefined
): Set<string> => {
  const found = new Set<string>();
  const blocks = Object.values(content?.blocks ?? {});
  const children = childrenIndex(blocks);
  const reachable = new Set<string>();
  const visit = (parentId: string, depth: number) => {
    if (depth > 64) {
      return;
    }
    for (const child of children.get(parentId) ?? []) {
      if (!reachable.has(child.id)) {
        reachable.add(child.id);
        visit(child.id, depth + 1);
      }
    }
  };
  visit(documentId, 0);

  for (const block of blocks) {
    if (!reachable.has(block.id)) {
      continue;
    }
    if (!CARRIED_BLOCK_TYPES.has(block.type)) {
      found.add(`${block.type} blocks`);
      continue;
    }
    if (
      EMBED_TYPES.has(block.type) &&
      (children.get(block.id)?.length ?? 0) > 0
    ) {
      found.add(`${block.type} blocks with content inside`);
    }

    for (const [key, value] of Object.entries(block.attrs ?? {})) {
      if (value === null || value === undefined) {
        continue;
      }
      if (CARRIED_ATTRS[block.type]?.has(key)) {
        if (
          block.type === 'callout' &&
          key === 'icon' &&
          typeof value === 'string' &&
          !CALLOUT_META_VALUE.test(value)
        ) {
          found.add('callout icons');
        }
        if (
          block.type === 'orderedList' &&
          key === 'start' &&
          !(typeof value === 'number' && Number.isInteger(value) && value >= 0)
        ) {
          found.add('list numbering');
        }
        continue;
      }
      const uncarried = UNCARRIED_ATTRS[key];
      if (uncarried) {
        if (!uncarried.neutral(value)) {
          found.add(uncarried.label);
        }
      } else {
        found.add(`${block.type} settings (${key})`);
      }
    }

    for (const leaf of block.content ?? []) {
      if (!CARRIED_LEAVES.has(leaf.type)) {
        found.add(`${leaf.type} content`);
      }
      for (const mark of leaf.marks ?? []) {
        if (!CARRIED_MARKS.has(mark.type)) {
          found.add(`${mark.type} formatting`);
          continue;
        }
        const attrs = mark.attrs ?? {};
        if (
          (mark.type === 'color' && !EDITOR_COLOURS.has(String(attrs.color))) ||
          (mark.type === 'highlight' &&
            !EDITOR_COLOURS.has(String(attrs.highlight)))
        ) {
          found.add('colours outside the editor palette');
        }
        if (
          mark.type === 'comment' &&
          !THREAD_ID.test(String(attrs.threadId))
        ) {
          found.add('comment anchors');
        }
      }
    }

    if (block.type === 'table') {
      const rows = (children.get(block.id) ?? []).filter(
        (row) => row.type === 'tableRow'
      );
      if (rows.length === 0) {
        found.add('empty tables');
      }
      const widths = new Set<number>();
      rows.forEach((row, rowIndex) => {
        const cells = children.get(row.id) ?? [];
        widths.add(cells.length);
        for (const cell of cells) {
          const header = cell.type === 'tableHeader';
          if (header !== (rowIndex === 0)) {
            found.add('table header cells outside the first row');
          }
          const inside = children.get(cell.id) ?? [];
          if (
            inside.some(
              (child) => child.type !== 'paragraph' && child.type !== 'file'
            )
          ) {
            found.add('blocks other than text and images inside table cells');
          }
        }
      });
      if (widths.size > 1) {
        found.add('table rows of different lengths');
      }
    }
  }
  return found;
};

// ---------------------------------------------------------------------------
// Everything else: stored page against the page as it comes back
// ---------------------------------------------------------------------------

const markKey = (mark: NonNullable<BlockLeaf['marks']>[number]): string => {
  const attrs = mark.attrs ?? {};
  switch (mark.type) {
    case 'link':
      return `link=${String(attrs.href ?? '')}`;
    case 'color':
      return `color=${String(attrs.color ?? '')}`;
    case 'highlight':
      return `highlight=${String(attrs.highlight ?? '')}`;
    case 'comment':
      return `comment=${String(attrs.threadId ?? '')}`;
    default:
      return mark.type;
  }
};

// A block's leaves as a reader sees them: runs of text with their marks,
// mentions by target, line breaks. Whitespace is compared collapsed, and not
// at all where a line starts or ends, and bold or italic on a space shows
// nothing -- the conversion normalises all of that.
const comparableText = (block: Block): string => {
  if (block.type === 'codeBlock') {
    return (block.content ?? []).map((leaf) => leaf.text ?? '').join('');
  }
  const parts: { kind: string; text: string; marks: string }[] = [];
  const push = (kind: string, text: string, marks: string) => {
    const previous = parts[parts.length - 1];
    if (
      kind === 'text' &&
      previous?.kind === 'text' &&
      previous.marks === marks
    ) {
      previous.text += text;
    } else {
      parts.push({ kind, text, marks });
    }
  };
  for (const leaf of block.content ?? []) {
    const marks = (leaf.marks ?? []).map(markKey).sort();
    if (leaf.type === 'mention') {
      push('mention', String(leaf.attrs?.target ?? ''), marks.join('+'));
      continue;
    }
    if (leaf.type === 'hardBreak') {
      push('break', '', '');
      continue;
    }
    const text = leaf.text ?? '';
    const code = marks.includes('code');
    text.split(code ? /(?!)/ : '\n').forEach((piece, index) => {
      if (index > 0) {
        push('break', '', '');
      }
      // Spaces lose bold and italic; their other marks still show.
      for (const run of piece.split(/(\s+)/)) {
        if (!run) continue;
        const spaces = !code && /^\s+$/.test(run);
        const kept = spaces
          ? marks.filter((mark) => mark !== 'bold' && mark !== 'italic')
          : marks;
        push('text', run, kept.join('+'));
      }
    });
  }
  // Collapse whitespace, and drop it next to a line boundary.
  const out: string[] = [];
  parts.forEach((part, index) => {
    if (part.kind !== 'text') {
      out.push(`<${part.kind}:${part.text}:${part.marks}>`);
      return;
    }
    let text = part.marks.split('+').includes('code')
      ? part.text
      : part.text.replace(/\s+/g, ' ');
    const before = parts[index - 1];
    const after = parts[index + 1];
    if (!before || before.kind === 'break') text = text.replace(/^ /, '');
    if (!after || after.kind === 'break') text = text.replace(/ $/, '');
    if (text) {
      out.push(`${JSON.stringify(text)}:${part.marks}`);
    }
  });
  return out.join('');
};

const comparableTree = (
  documentId: string,
  blocks: readonly Block[]
): string => {
  const children = childrenIndex(blocks);
  const write = (parentId: string, depth: number): string =>
    depth > 64
      ? ''
      : (children.get(parentId) ?? [])
          .map((block) => {
            // A file or an embedded node is its block's id. Any other block
            // id, a web embed's included, is new after every replace and
            // tells a reader nothing.
            const id = ['file', 'database', 'whiteboardEmbed', 'page'].includes(
              block.type
            )
              ? `#${block.id}`
              : '';
            const attrs = Object.entries(block.attrs ?? {})
              .filter(
                ([key, value]) =>
                  CARRIED_ATTRS[block.type]?.has(key) &&
                  value !== null &&
                  value !== undefined &&
                  !(
                    block.type === 'orderedList' &&
                    key === 'start' &&
                    value === 1
                  ) &&
                  !(
                    block.type === 'taskItem' &&
                    key === 'checked' &&
                    value === false
                  ) &&
                  !(
                    block.type === 'callout' &&
                    key === 'color' &&
                    value === 'default'
                  ) &&
                  !(
                    block.type === 'codeBlock' &&
                    key === 'language' &&
                    value === 'plaintext'
                  )
              )
              .sort(([a], [b]) => compareString(a, b));
            return `(${block.type}${id}${attrs.length ? JSON.stringify(attrs) : ''}|${comparableText(block)}|${write(block.id, depth + 1)})`;
          })
          .join('');
  return write(documentId, 0);
};

// The constructs a replace would lose, named, sorted; empty when none.
// `roundTripped` is the page as markdown and back:
// markdownToBlocks(id, richTextToMarkdown(id, content)).
export const lostOnRoundTrip = (
  documentId: string,
  content: RichTextContent | null | undefined,
  roundTripped: Record<string, Block>
): string[] => {
  const found = namedLosses(documentId, content);
  if (
    found.size === 0 &&
    comparableTree(documentId, Object.values(content?.blocks ?? {})) !==
      comparableTree(documentId, Object.values(roundTripped))
  ) {
    found.add('content that does not survive the conversion to markdown');
  }
  return [...found].sort();
};
