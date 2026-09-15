// Inline markdown for the wiki AI tools: rich-text leaves (text with marks,
// mentions) to a markdown string and back.
//
// The parser is a small CommonMark-style inline parser -- backslash escapes,
// code spans, links with the delimiter-run rules for emphasis -- because the
// regex it replaces could not nest (`**[docs](url)**` came back as literal
// asterisks) and read every `_` as emphasis (`AZURE_ACCOUNT_NAME` turned into
// italics). The serializer escapes whatever plain text would otherwise be read
// as syntax, and checks its own output: when the delimiter form of a run of
// marks would not parse back to the same leaves, it writes that block's marks
// as tags instead (<b>, <i>, <s>), which cannot be misread.
import { BlockLeaf, generateId, IdType } from '@colanode/core';

type Mark = NonNullable<BlockLeaf['marks']>[number];

export interface InlineRenderOptions {
  // Current display names for mention targets; see resolveNodeLabels.
  labels?: ReadonlyMap<string, string>;
  // The text starts a markdown line, so a leading `#`, `>`, `-`, `+` or
  // `1.` must not be read as the start of a block.
  lineStart?: boolean;
  // Inside a table row: pipes are escaped by the caller, after rendering.
  inTable?: boolean;
}

const ASCII_PUNCT = /[!-/:-@[-`{-~]/;
const WHITESPACE = /\s/u;
const ALNUM = /[\p{L}\p{N}]/u;

const NODE_HREF = /^node:([a-z0-9]{20,})(?:#[a-z0-9]{20,})?$/;
const WIKI_URL_HREF =
  /^(?:https?:\/\/[^/\s]+)?\/[a-z0-9]{20,}\/([a-z0-9]{20,})(?:#[a-z0-9]{20,})?$/;

// ---------------------------------------------------------------------------
// Marks
// ---------------------------------------------------------------------------

// Written innermost first. Emphasis sits inside links, so a bold link is
// `[**docs**](url)` and a link inside bold text still reads as one link.
const EMPHASIS_ORDER = ['italic', 'bold', 'strike'] as const;

const DELIMITER_BY_MARK: Record<string, string> = {
  italic: '*',
  bold: '**',
  strike: '~~',
};

const TAG_BY_MARK: Record<string, string> = {
  italic: 'i',
  bold: 'b',
  strike: 's',
};

const MARK_BY_TAG: Record<string, string> = {
  b: 'bold',
  strong: 'bold',
  i: 'italic',
  em: 'italic',
  s: 'strike',
  del: 'strike',
};

const linkMark = (href: string): Mark => ({
  type: 'link',
  attrs: { href, target: '_blank', rel: 'noopener noreferrer nofollow' },
});

const hasMark = (marks: readonly Mark[], type: string): boolean =>
  marks.some((mark) => mark.type === type);

// ---------------------------------------------------------------------------
// Parser
// ---------------------------------------------------------------------------

type Token =
  | { kind: 'text'; text: string; marks: Mark[] }
  | { kind: 'leaf'; leaf: BlockLeaf; marks: Mark[] }
  | {
      kind: 'delim';
      char: string;
      length: number;
      originalLength: number;
      canOpen: boolean;
      canClose: boolean;
      active: boolean;
      marks: Mark[];
    }
  | {
      kind: 'bracket';
      image: boolean;
      active: boolean;
      // Source offset just after the bracket, for the raw label.
      labelStart: number;
      marks: Mark[];
    }
  | { kind: 'tag'; name: string; mark: Mark; source: string; marks: Mark[] };

const addMark = (token: Token, mark: Mark): void => {
  if (!hasMark(token.marks, mark.type)) {
    token.marks.push(mark);
  }
};

const unescapeBackslashes = (value: string): string =>
  value.replace(/\\([!-/:-@[-`{-~])/g, '$1');

// Emphasis inside a link label or a tag is settled there: what is left open
// inside must not pair with a delimiter outside it.
const closeInnerDelimiters = (tokens: Token[], from: number): void => {
  processEmphasis(tokens, from);
  for (let k = from + 1; k < tokens.length; k++) {
    const token = tokens[k]!;
    if (token.kind === 'delim') {
      token.active = false;
    }
  }
};

// CommonMark's "process emphasis", over the delimiter tokens after `bottom`.
// Delimiters are tokens in place rather than a separate stack; a mark is
// applied by adding it to every token between the opener and the closer.
const processEmphasis = (tokens: Token[], bottom: number): void => {
  const openersBottom = new Map<string, number>();
  for (let c = bottom + 1; c < tokens.length; c++) {
    const closer = tokens[c]!;
    if (
      closer.kind !== 'delim' ||
      !closer.active ||
      !closer.canClose ||
      closer.length === 0
    ) {
      continue;
    }
    const key = `${closer.char}${closer.canOpen ? 1 : 0}${closer.originalLength % 3}`;
    const floor = Math.max(bottom, openersBottom.get(key) ?? bottom);
    let found = -1;
    for (let o = c - 1; o > floor; o--) {
      const opener = tokens[o]!;
      if (
        opener.kind !== 'delim' ||
        !opener.active ||
        opener.char !== closer.char ||
        !opener.canOpen ||
        opener.length === 0
      ) {
        continue;
      }
      if (
        closer.char !== '~' &&
        (opener.canClose || closer.canOpen) &&
        (opener.originalLength + closer.originalLength) % 3 === 0 &&
        !(opener.originalLength % 3 === 0 && closer.originalLength % 3 === 0)
      ) {
        continue;
      }
      found = o;
      break;
    }

    if (found < 0) {
      openersBottom.set(key, c - 1);
      if (!closer.canOpen) {
        closer.active = false;
      }
      continue;
    }

    const opener = tokens[found] as Extract<Token, { kind: 'delim' }>;
    const use =
      closer.char === '~'
        ? 2
        : opener.length >= 2 && closer.length >= 2
          ? 2
          : 1;
    const mark: Mark = {
      type: closer.char === '~' ? 'strike' : use === 2 ? 'bold' : 'italic',
    };
    for (let k = found + 1; k < c; k++) {
      const inner = tokens[k]!;
      addMark(inner, mark);
      if (inner.kind === 'delim') {
        inner.active = false;
      }
    }
    opener.length -= use;
    closer.length -= use;
    if (opener.length === 0) {
      opener.active = false;
    }
    if (closer.length > 0) {
      c -= 1; // the rest of this closer may close another opener
    } else {
      closer.active = false;
    }
  }
};

interface LinkDestination {
  href: string;
  end: number;
}

const parseLinkDestination = (
  src: string,
  open: number
): LinkDestination | null => {
  if (src[open] !== '(') {
    return null;
  }
  let j = open + 1;
  while (src[j] === ' ') j++;
  let href: string;
  if (src[j] === '<') {
    const close = src.indexOf('>', j + 1);
    if (close < 0) {
      return null;
    }
    const raw = src.slice(j + 1, close);
    if (/[<\n]/.test(raw)) {
      return null;
    }
    href = unescapeBackslashes(raw);
    j = close + 1;
  } else {
    const start = j;
    let depth = 0;
    while (j < src.length) {
      const ch = src[j]!;
      if (ch === '\\' && ASCII_PUNCT.test(src[j + 1] ?? '')) {
        j += 2;
        continue;
      }
      if (ch === '(') {
        depth += 1;
      } else if (ch === ')') {
        if (depth === 0) break;
        depth -= 1;
      } else if (WHITESPACE.test(ch)) {
        break;
      }
      j += 1;
    }
    href = unescapeBackslashes(src.slice(start, j));
  }
  while (src[j] === ' ') j++;
  const quote = src[j];
  if (quote === '"' || quote === "'") {
    const close = src.indexOf(quote, j + 1);
    if (close < 0) {
      return null;
    }
    j = close + 1;
    while (src[j] === ' ') j++;
  }
  if (src[j] !== ')') {
    return null;
  }
  return { href, end: j + 1 };
};

// Formatting the editor has and markdown lacks -- text colour, highlight,
// underline, a comment anchor -- travels as a few fixed tags, the attribute
// names those marks use in the editor's own HTML:
//   <span data-color="red">…</span>   <mark data-color="yellow">…</mark>
//   <u>…</u>                          <span data-comment="<thread id>">…</span>
// Only these tags, with exactly these attributes and values, are read. Any
// other tag stays literal text: nothing here ever becomes HTML.
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
const THREAD_ID = /^[a-z0-9]{20,64}$/;

const OPEN_TAG = /^<([a-z]+)(?:\s+(data-[a-z]+)="([^"<>]{0,64})")?\s*>/;
const CLOSE_TAG = /^<\/([a-z]+)\s*>/;

// Tags that close each other: </strong> ends <b>, </span> the nearest span.
const TAG_GROUP: Record<string, string> = {
  b: 'b',
  strong: 'b',
  i: 'i',
  em: 'i',
  s: 's',
  del: 's',
  u: 'u',
  span: 'span',
  mark: 'mark',
};

interface ParsedTag {
  group: string;
  mark: Mark;
  length: number;
}

const parseOpenTag = (src: string, at: number): ParsedTag | null => {
  const match = OPEN_TAG.exec(src.slice(at, at + 96));
  if (!match) {
    return null;
  }
  const [whole, name = '', attribute, value = ''] = match;
  const group = TAG_GROUP[name];
  if (!group) {
    return null;
  }
  let mark: Mark | null = null;
  if (attribute === undefined) {
    const type = name === 'u' ? 'underline' : MARK_BY_TAG[name];
    mark = type ? { type } : null;
  } else if (attribute === 'data-color' && EDITOR_COLOURS.has(value)) {
    if (name === 'span') {
      mark = { type: 'color', attrs: { color: value } };
    } else if (name === 'mark') {
      mark = { type: 'highlight', attrs: { highlight: value } };
    }
  } else if (
    attribute === 'data-comment' &&
    name === 'span' &&
    THREAD_ID.test(value)
  ) {
    mark = { type: 'comment', attrs: { threadId: value } };
  }
  return mark ? { group, mark, length: whole.length } : null;
};

// The tag group a closing tag ends, or null when it is not one of ours.
const parseCloseTag = (
  src: string,
  at: number
): { group: string; length: number } | null => {
  const match = CLOSE_TAG.exec(src.slice(at, at + 16));
  const group = match ? TAG_GROUP[match[1]!] : undefined;
  return match && group ? { group, length: match[0].length } : null;
};

// The tags a mark is written with, or null when its value is not one the
// parser would accept (the mark is then left out).
const tagsForMark = (mark: Mark): [string, string] | null => {
  const attrs = mark.attrs ?? {};
  switch (mark.type) {
    case 'underline':
      return ['<u>', '</u>'];
    case 'highlight':
      return typeof attrs.highlight === 'string' &&
        EDITOR_COLOURS.has(attrs.highlight)
        ? [`<mark data-color="${attrs.highlight}">`, '</mark>']
        : null;
    case 'color':
      return typeof attrs.color === 'string' && EDITOR_COLOURS.has(attrs.color)
        ? [`<span data-color="${attrs.color}">`, '</span>']
        : null;
    case 'comment':
      return typeof attrs.threadId === 'string' &&
        THREAD_ID.test(attrs.threadId)
        ? [`<span data-comment="${attrs.threadId}">`, '</span>']
        : null;
    default:
      return null;
  }
};

const delimiterFlags = (
  char: string,
  before: string,
  after: string
): { canOpen: boolean; canClose: boolean } => {
  const spaceBefore = before === '' || WHITESPACE.test(before);
  const spaceAfter = after === '' || WHITESPACE.test(after);
  if (char === '_') {
    // Never inside a word: snake_case_names stay text.
    return {
      canOpen: !spaceAfter && !ALNUM.test(before),
      canClose: !spaceBefore && !ALNUM.test(after),
    };
  }
  return { canOpen: !spaceAfter, canClose: !spaceBefore };
};

const MAX_CODE_SPAN_TICKS = 32;

export const parseInline = (src: string): BlockLeaf[] => {
  if (!src) {
    return [];
  }

  const tokens: Token[] = [];
  const brackets: number[] = [];
  const tags: number[] = [];
  // Backtick run lengths known to have no closer at or after an offset: a
  // failed search is never repeated, which keeps a line of unmatched
  // backticks linear.
  const noCloserFrom = new Map<number, number>();
  let buffer = '';

  const flush = () => {
    if (buffer) {
      tokens.push({ kind: 'text', text: buffer, marks: [] });
      buffer = '';
    }
  };

  const blank = (index: number) => {
    tokens[index] = { kind: 'text', text: '', marks: [] };
  };

  let i = 0;
  while (i < src.length) {
    const ch = src[i]!;

    if (ch === '\\') {
      const next = src[i + 1] ?? '';
      if (next && ASCII_PUNCT.test(next)) {
        buffer += next;
        i += 2;
        continue;
      }
      // A backslash ending a line is a hard line break (CommonMark), and so
      // is one ending the block: a literal backslash is always written `\\`.
      if (next === '\n' || next === '') {
        flush();
        tokens.push({ kind: 'leaf', leaf: { type: 'hardBreak' }, marks: [] });
        i += next === '\n' ? 2 : 1;
        continue;
      }
      buffer += ch;
      i += 1;
      continue;
    }

    if (ch === '`') {
      let run = 1;
      while (src[i + run] === '`') run++;
      let close = -1;
      if (
        run <= MAX_CODE_SPAN_TICKS &&
        (noCloserFrom.get(run) ?? Infinity) > i
      ) {
        let from = i + run;
        while (from < src.length) {
          const at = src.indexOf('`', from);
          if (at < 0) break;
          let length = 1;
          while (src[at + length] === '`') length++;
          if (length === run) {
            close = at;
            break;
          }
          from = at + length;
        }
        if (close < 0) {
          noCloserFrom.set(run, i);
        }
      }
      if (close < 0) {
        buffer += '`'.repeat(run);
        i += run;
        continue;
      }
      let code = src.slice(i + run, close).replace(/\n/g, ' ');
      if (
        code.length > 2 &&
        code.startsWith(' ') &&
        code.endsWith(' ') &&
        /[^ ]/.test(code)
      ) {
        code = code.slice(1, -1);
      }
      flush();
      if (code) {
        tokens.push({ kind: 'text', text: code, marks: [{ type: 'code' }] });
      }
      i = close + run;
      continue;
    }

    if (ch === '*' || ch === '_' || ch === '~') {
      let run = 1;
      while (src[i + run] === ch) run++;
      // Strikethrough is exactly two tildes; a lone ~ is text.
      if (ch === '~' && run !== 2) {
        buffer += ch.repeat(run);
        i += run;
        continue;
      }
      const flags = delimiterFlags(ch, src[i - 1] ?? '', src[i + run] ?? '');
      flush();
      tokens.push({
        kind: 'delim',
        char: ch,
        length: run,
        originalLength: run,
        canOpen: flags.canOpen,
        canClose: flags.canClose,
        active: true,
        marks: [],
      });
      i += run;
      continue;
    }

    if (ch === '[' || (ch === '!' && src[i + 1] === '[')) {
      flush();
      const image = ch === '!';
      brackets.push(tokens.length);
      tokens.push({
        kind: 'bracket',
        image,
        active: true,
        labelStart: i + (image ? 2 : 1),
        marks: [],
      });
      i += image ? 2 : 1;
      continue;
    }

    if (ch === ']') {
      flush();
      const openerIndex = brackets.pop();
      const opener =
        openerIndex === undefined
          ? undefined
          : (tokens[openerIndex] as Extract<Token, { kind: 'bracket' }>);
      const destination =
        opener && opener.active ? parseLinkDestination(src, i + 1) : null;
      if (!opener || openerIndex === undefined || !destination) {
        if (opener && openerIndex !== undefined) {
          tokens[openerIndex] = {
            kind: 'text',
            text: opener.image ? '![' : '[',
            marks: [],
          };
        }
        buffer += ']';
        i += 1;
        continue;
      }

      closeInnerDelimiters(tokens, openerIndex);
      const label = src.slice(opener.labelStart, i);
      const plainLabel = unescapeBackslashes(label).trim();
      const href = destination.href;
      const nodeTarget = NODE_HREF.exec(href)?.[1];
      const wikiTarget = WIKI_URL_HREF.exec(href)?.[1];
      // A wiki URL becomes a mention only without a label of its own; a
      // node: link always does, and its label is only there for the reader.
      const target =
        !opener.image &&
        (nodeTarget ??
          (wikiTarget && (plainLabel === '' || plainLabel === href)
            ? wikiTarget
            : undefined));

      if (target) {
        for (let k = openerIndex + 1; k < tokens.length; k++) blank(k);
        tokens[openerIndex] = {
          kind: 'leaf',
          leaf: {
            type: 'mention',
            attrs: { id: generateId(IdType.Mention), target },
          },
          marks: [],
        };
      } else {
        const mark = linkMark(href);
        let labelled = false;
        for (let k = openerIndex + 1; k < tokens.length; k++) {
          const token = tokens[k]!;
          addMark(token, mark);
          if (
            (token.kind === 'text' && token.text) ||
            token.kind === 'leaf' ||
            (token.kind === 'delim' && token.length > 0)
          ) {
            labelled = true;
          }
        }
        blank(openerIndex);
        if (!labelled) {
          // An image with no alt text, or a link with an empty label, shows
          // its address rather than nothing.
          tokens.push({ kind: 'text', text: href, marks: [mark] });
        }
        // Links do not nest.
        if (!opener.image) {
          for (const index of brackets) {
            const earlier = tokens[index];
            if (earlier?.kind === 'bracket' && !earlier.image) {
              earlier.active = false;
            }
          }
        }
      }
      i = destination.end;
      continue;
    }

    if (ch === '<') {
      // <br> is a line break wherever it is written; inside a table row it is
      // the only way to write one.
      const lineBreak = /^<br\s*\/?>/.exec(src.slice(i, i + 8));
      if (lineBreak) {
        flush();
        tokens.push({ kind: 'leaf', leaf: { type: 'hardBreak' }, marks: [] });
        i += lineBreak[0].length;
        continue;
      }
      const open = parseOpenTag(src, i);
      if (open) {
        flush();
        tags.push(tokens.length);
        tokens.push({
          kind: 'tag',
          name: open.group,
          mark: open.mark,
          source: src.slice(i, i + open.length),
          marks: [],
        });
        i += open.length;
        continue;
      }
      const close = parseCloseTag(src, i);
      if (close) {
        let at = -1;
        for (let t = tags.length - 1; t >= 0; t--) {
          const tag = tokens[tags[t]!];
          if (tag?.kind === 'tag' && tag.name === close.group) {
            at = t;
            break;
          }
        }
        if (at >= 0) {
          flush();
          const openIndex = tags[at]!;
          const tag = tokens[openIndex] as Extract<Token, { kind: 'tag' }>;
          closeInnerDelimiters(tokens, openIndex);
          for (let k = openIndex + 1; k < tokens.length; k++) {
            addMark(tokens[k]!, tag.mark);
          }
          blank(openIndex);
          tags.splice(at);
          i += close.length;
          continue;
        }
      }
      buffer += ch;
      i += 1;
      continue;
    }

    buffer += ch;
    i += 1;
  }
  flush();
  processEmphasis(tokens, -1);

  const leaves: BlockLeaf[] = [];
  const pushText = (text: string, marks: Mark[]) => {
    if (!text) {
      return;
    }
    const previous = leaves[leaves.length - 1];
    if (
      previous &&
      previous.type === 'text' &&
      sameMarks(previous.marks ?? [], marks)
    ) {
      previous.text = (previous.text ?? '') + text;
      return;
    }
    leaves.push(
      marks.length > 0 ? { type: 'text', text, marks } : { type: 'text', text }
    );
  };

  for (const token of tokens) {
    switch (token.kind) {
      case 'text':
        pushText(token.text, token.marks);
        break;
      case 'delim':
        pushText(token.char.repeat(token.length), token.marks);
        break;
      case 'bracket':
        pushText(token.image ? '![' : '[', token.marks);
        break;
      case 'tag':
        pushText(token.source, token.marks);
        break;
      case 'leaf':
        leaves.push(
          token.marks.length > 0
            ? { ...token.leaf, marks: token.marks }
            : token.leaf
        );
        break;
    }
  }
  return leaves;
};

// ---------------------------------------------------------------------------
// Serializer
// ---------------------------------------------------------------------------

const markKey = (mark: Mark): string => {
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

const sameMarks = (a: readonly Mark[], b: readonly Mark[]): boolean =>
  a.map(markKey).sort().join('+') === b.map(markKey).sort().join('+');

// The marks this module writes; anything else is dropped on the way out and
// must not make the delimiter form look wrong.
const WRITTEN_MARKS = new Set([
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

// Neighbouring text leaves with the same marks are one run to a reader. The
// editor often stores them split; written apart, `*a**b*` fuses delimiters.
const mergeLeaves = (leaves: readonly BlockLeaf[]): BlockLeaf[] => {
  const out: BlockLeaf[] = [];
  for (const leaf of leaves) {
    if (leaf.type === 'text' && !leaf.text) {
      continue;
    }
    const previous = out[out.length - 1];
    if (
      leaf.type === 'text' &&
      previous?.type === 'text' &&
      sameMarks(previous.marks ?? [], leaf.marks ?? [])
    ) {
      out[out.length - 1] = {
        ...previous,
        text: (previous.text ?? '') + (leaf.text ?? ''),
      };
      continue;
    }
    out.push(leaf);
  }
  return out;
};

// What a reader can tell apart: mention ids are regenerated, a link's
// target/rel are fixed, and bold or italic on the spaces at either end of a
// run of text shows nothing.
const comparableLeaves = (leaves: readonly BlockLeaf[]): string => {
  const out: { t: string; x?: string; m: string }[] = [];
  const push = (t: string, x: string | undefined, marks: readonly Mark[]) => {
    const m = marks
      .filter((mark) => WRITTEN_MARKS.has(mark.type))
      .map(markKey)
      .sort()
      .join('+');
    const previous = out[out.length - 1];
    if (t === 'text' && previous && previous.t === 'text' && previous.m === m) {
      previous.x += x ?? '';
      return;
    }
    out.push({ t, x, m });
  };
  for (const leaf of mergeLeaves(leaves)) {
    const marks = leaf.marks ?? [];
    if (leaf.type !== 'text') {
      push(
        leaf.type,
        leaf.type === 'mention' ? String(leaf.attrs?.target ?? '') : '',
        marks
      );
      continue;
    }
    const text = leaf.text ?? '';
    if (!text) continue;
    if (hasMark(marks, 'code')) {
      push('text', text, marks);
      continue;
    }
    const lead = /^\s*/.exec(text)![0];
    const trail = text.length > lead.length ? /\s*$/.exec(text)![0] : '';
    const edge = marks.filter((m) => m.type !== 'bold' && m.type !== 'italic');
    push('text', lead, edge);
    push('text', text.slice(lead.length, text.length - trail.length), marks);
    push('text', trail, edge);
  }
  return JSON.stringify(out.filter((item) => item.t !== 'text' || item.x));
};

// Backslash-escapes what would otherwise be read as markdown. `lineStart`:
// the text begins a line, where `#`, `>`, `-`, `+` and `1.` start a block.
export const escapeMarkdownText = (
  text: string,
  lineStart: boolean,
  inTable = false
): string => {
  let out = '';
  for (let i = 0; i < text.length; i++) {
    const ch = text[i]!;
    const before = text[i - 1] ?? '';
    const after = text[i + 1] ?? '';
    switch (ch) {
      case '\\':
      case '*':
      case '`':
      case '[':
      case ']':
      case '~':
        out += '\\' + ch;
        break;
      case '|':
        out += inTable ? ch : '\\' + ch;
        break;
      case '_':
        out += ALNUM.test(before) && ALNUM.test(after) ? ch : '\\' + ch;
        break;
      case '<':
        out += after === '' || /[A-Za-z/!]/.test(after) ? '\\' + ch : ch;
        break;
      default:
        out += ch;
    }
  }

  if (lineStart) {
    const lead = /^\s*/.exec(out)![0].length;
    const rest = out.slice(lead);
    const ordered = /^(\d+)([.)])(\s|$)/.exec(rest);
    if (/^[#>+-]/.test(rest)) {
      out = out.slice(0, lead) + '\\' + rest;
    } else if (ordered) {
      out =
        out.slice(0, lead) +
        ordered[1] +
        '\\' +
        rest.slice((ordered[1] ?? '').length);
    }
  }
  return out;
};

const codeSpan = (code: string): string => {
  let longest = 0;
  for (const run of code.match(/`+/g) ?? []) {
    longest = Math.max(longest, run.length);
  }
  const ticks = '`'.repeat(longest + 1);
  const pad =
    code.startsWith('`') ||
    code.endsWith('`') ||
    (code.startsWith(' ') && code.endsWith(' ') && /[^ ]/.test(code))
      ? ' '
      : '';
  return ticks + pad + code + pad + ticks;
};

const writeHref = (href: string): string => {
  const escaped = href.replace(/\\(?=[!-/:-@[-`{-~])/g, '\\\\');
  if (escaped === '' || /[\s()<>]/.test(escaped)) {
    return '<' + escaped.replace(/[<>\n]/g, (c) => encodeURIComponent(c)) + '>';
  }
  return escaped;
};

const escapeLabel = (label: string): string =>
  escapeMarkdownText(label.replace(/\s+/g, ' '), false);

type RenderMode = 'markdown' | 'tags';

const renderLeaves = (
  leaves: readonly BlockLeaf[],
  options: InlineRenderOptions,
  mode: RenderMode
): string => {
  let out = '';
  // Still at the start of a line: nothing but whitespace written since the
  // block began (when the block starts a line) or since the last hard break.
  const atLineStart = () => {
    const newline = out.lastIndexOf('\n');
    return newline < 0
      ? Boolean(options.lineStart) && out.trim() === ''
      : out.slice(newline + 1).trim() === '';
  };

  const startsWithBracket = (leaf: BlockLeaf | undefined): boolean =>
    leaf !== undefined &&
    (leaf.type === 'mention' ||
      (leaf.type === 'text' && hasMark(leaf.marks ?? [], 'link')));

  for (let index = 0; index < leaves.length; index++) {
    const leaf = leaves[index]!;
    const marks = leaf.marks ?? [];
    let lead = '';
    let core = '';
    let trail = '';

    if (leaf.type === 'hardBreak') {
      // A backslash ending the line, as CommonMark writes it. A table row
      // cannot span lines, so a cell uses <br>.
      out += options.inTable ? '<br>' : '\\\n';
      continue;
    }

    if (leaf.type === 'mention') {
      const target = (leaf.attrs ?? {}).target;
      if (typeof target !== 'string' || target.length === 0) {
        continue;
      }
      const label = options.labels?.get(target) ?? '';
      core = `[${escapeLabel(label)}](node:${target})`;
    } else if (leaf.type === 'text') {
      const text = leaf.text ?? '';
      if (!text) {
        continue;
      }
      if (hasMark(marks, 'code')) {
        core = codeSpan(text);
      } else {
        const startOfLine = atLineStart();
        let escaped = escapeMarkdownText(text, startOfLine, options.inTable);
        // `!` right before a link would turn it into an image.
        if (escaped.endsWith('!') && startsWithBracket(leaves[index + 1])) {
          escaped = escaped.slice(0, -1) + '\\!';
        }
        if (
          mode === 'markdown' &&
          EMPHASIS_ORDER.some((t) => hasMark(marks, t))
        ) {
          // A delimiter next to a space does not open or close, so the spaces
          // at the ends of a bold run are written outside it -- except at the
          // start of a line, where the parser would trim them: there they stay
          // in, and the block falls back to tags if that no longer reads back.
          lead = startOfLine ? '' : /^\s*/.exec(escaped)![0];
          trail = escaped.length > lead.length ? /\s*$/.exec(escaped)![0] : '';
          core = escaped.slice(lead.length, escaped.length - trail.length);
        } else {
          core = escaped;
        }
      }
    } else {
      continue;
    }

    if (core) {
      for (const type of EMPHASIS_ORDER) {
        if (!hasMark(marks, type)) continue;
        if (mode === 'markdown') {
          const delimiter = DELIMITER_BY_MARK[type]!;
          core = delimiter + core + delimiter;
        } else {
          const tag = TAG_BY_MARK[type]!;
          core = `<${tag}>${core}</${tag}>`;
        }
      }
    }

    // Tags wrap everything written so far, spaces included: a colour, a
    // highlight or an underline shows on a space too.
    const wrap = (type: string) => {
      const mark = marks.find((m) => m.type === type);
      const tags = mark ? tagsForMark(mark) : null;
      if (tags && lead + core + trail) {
        core = tags[0] + lead + core + trail + tags[1];
        lead = '';
        trail = '';
      }
    };
    wrap('underline');
    wrap('highlight');
    wrap('color');

    const link =
      leaf.type === 'text' ? marks.find((m) => m.type === 'link') : undefined;
    const href = link?.attrs?.href;
    if (typeof href === 'string') {
      core = `[${lead}${core}${trail}](${writeHref(href)})`;
      lead = '';
      trail = '';
    }
    wrap('comment');

    out += lead + core + trail;
  }
  return out;
};

// A newline stored inside a text leaf shows as a line break in the editor.
// Written raw it would end the markdown line, and with it the paragraph, so
// it is written as the hard break it looks like.
const splitNewlines = (leaves: readonly BlockLeaf[]): BlockLeaf[] =>
  leaves.flatMap((leaf) => {
    if (leaf.type !== 'text' || !leaf.text || !leaf.text.includes('\n')) {
      return [leaf];
    }
    return leaf.text.split('\n').flatMap((part, index) => {
      const pieces: BlockLeaf[] = index > 0 ? [{ type: 'hardBreak' }] : [];
      if (part) {
        pieces.push({ ...leaf, text: part });
      }
      return pieces;
    });
  });

// One block's leaves as inline markdown. Delimiters (`**`, `*`, `~~`) are
// used when they read back to exactly the same leaves, tags otherwise.
export const renderInline = (
  leaves: readonly BlockLeaf[] | null | undefined,
  options: InlineRenderOptions = {}
): string => {
  const list = mergeLeaves(splitNewlines(leaves ?? []));
  if (list.length === 0) {
    return '';
  }
  const markdown = renderLeaves(list, options, 'markdown');
  const emphasised = list.some((leaf) =>
    EMPHASIS_ORDER.some((type) => hasMark(leaf.marks ?? [], type))
  );
  if (!emphasised) {
    return markdown;
  }
  if (comparableLeaves(parseInline(markdown)) === comparableLeaves(list)) {
    return markdown;
  }
  return renderLeaves(list, options, 'tags');
};
