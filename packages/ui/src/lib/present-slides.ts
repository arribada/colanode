// ABOUTME: Cuts a page's top-level blocks into slides for the presentation
// ABOUTME: overlay, either at its headings or by how much fits on a screen.
import { type JSONContent } from '@tiptap/core';

export type SlideMode = 'section' | 'size';

export interface Slide {
  id: string;
  title: string | null;
  // True when the slide carries on from the one before, so the header can say
  // so instead of repeating the heading as if it were a new section.
  continued: boolean;
  nodes: JSONContent[];
}

// Roughly how many lines of text fit comfortably on one slide at the size the
// overlay renders. Deliberately generous: a slide that is a little short reads
// far better than one that scrolls.
export const DEFAULT_SLIDE_BUDGET = 16;

// About how many characters of prose fit on a rendered line.
const CHARS_PER_LINE = 80;

// The editor has one node type per level (heading1 ... heading5); pasted or
// imported content can also carry TipTap's own `heading` with a level attr.
const NUMBERED_HEADING = /^heading([1-6])$/;

export const headingLevel = (node: JSONContent): number | null => {
  if (!node.type) {
    return null;
  }

  const numbered = NUMBERED_HEADING.exec(node.type);
  if (numbered) {
    return Number(numbered[1]);
  }

  if (node.type === 'heading') {
    const level = Number(node.attrs?.level);
    return Number.isFinite(level) && level > 0 ? level : 1;
  }

  return null;
};

export const textOf = (node: JSONContent): string => {
  if (typeof node.text === 'string') {
    return node.text;
  }

  if (!Array.isArray(node.content)) {
    return '';
  }

  return node.content.map(textOf).join('');
};

// How much room a block asks for, counted in lines. Only the order of
// magnitude matters: it decides where a long section is cut in two.
export const weigh = (node: JSONContent): number => {
  const type = node.type ?? '';
  const lines = (text: string) =>
    Math.max(1, Math.ceil(text.length / CHARS_PER_LINE));

  if (headingLevel(node) !== null) {
    return lines(textOf(node)) + 1;
  }

  switch (type) {
    case 'paragraph':
      return lines(textOf(node));
    case 'blockquote':
    case 'callout':
      return lines(textOf(node)) + 1;
    case 'codeBlock':
      return Math.max(2, textOf(node).split('\n').length);
    case 'image':
    case 'file':
    case 'video':
    case 'mermaid':
    case 'whiteboard':
      return 8;
    case 'table':
      return Math.max(3, (node.content?.length ?? 1) + 1);
    case 'bulletList':
    case 'orderedList':
    case 'taskList':
      return (node.content ?? []).reduce(
        (total, item) => total + lines(textOf(item)),
        0
      );
    case 'divider':
    case 'horizontalRule':
      return 1;
    default:
      return Array.isArray(node.content) ? Math.max(1, lines(textOf(node))) : 2;
  }
};

// The heading level the page is cut at: the shallowest one that actually
// appears more than once, so a page with a single title and many sub-headings
// is cut at the sub-headings rather than left as one slide.
export const splitLevelOf = (nodes: JSONContent[]): number | null => {
  const counts = new Map<number, number>();
  for (const node of nodes) {
    const level = headingLevel(node);
    if (level !== null) {
      counts.set(level, (counts.get(level) ?? 0) + 1);
    }
  }

  if (counts.size === 0) {
    return null;
  }

  const levels = [...counts.keys()].sort((a, b) => a - b);
  let cumulative = 0;
  for (const level of levels) {
    cumulative += counts.get(level) ?? 0;
    if (cumulative >= 2) {
      return level;
    }
  }

  return levels[levels.length - 1] ?? null;
};

export const buildSlides = (
  nodes: JSONContent[],
  mode: SlideMode,
  budget: number = DEFAULT_SLIDE_BUDGET
): Slide[] => {
  const blocks = nodes.filter((node) => node.type);
  if (blocks.length === 0) {
    return [];
  }

  const splitLevel = mode === 'section' ? splitLevelOf(blocks) : null;
  const slides: Slide[] = [];
  let current: JSONContent[] = [];
  let currentWeight = 0;
  let title: string | null = null;
  let continued = false;

  const flush = () => {
    if (current.length === 0) {
      return;
    }
    slides.push({
      id: String(current[0]?.attrs?.id ?? `slide-${slides.length}`),
      title,
      continued,
      nodes: current,
    });
    current = [];
    currentWeight = 0;
  };

  for (const block of blocks) {
    const level = headingLevel(block);
    const startsSection =
      splitLevel !== null && level !== null && level <= splitLevel;

    if (startsSection && current.length > 0) {
      flush();
      continued = false;
    }

    const cost = weigh(block);
    // One block bigger than a whole slide gets its own: splitting inside a
    // table or a code block would change what it says.
    if (currentWeight > 0 && currentWeight + cost > budget) {
      flush();
      continued = true;
    }

    if (startsSection) {
      title = textOf(block).trim() || null;
      continued = false;
    }

    current.push(block);
    currentWeight += cost;
  }

  flush();
  return slides;
};
