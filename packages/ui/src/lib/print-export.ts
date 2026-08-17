// ABOUTME: Pure-ish helpers that assemble a multi-page PDF export — chapter
// ABOUTME: ordering, mention extraction, TOC building and final HTML assembly.
import { LocalNode } from '@colanode/client/types';

export interface PrintChapter {
  id: string;
  title: string;
  html: string;
  depth: number; // 0 = the root page, 1 = its child, …
}

export interface PrintOptions {
  subpages: boolean;
  appendix: boolean;
  toc: boolean;
  cover: boolean;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Strip editor-only controls that must never appear on paper — notably the
// toggle chevron button, which is inert once printed — and force every toggle
// open so its content prints instead of staying collapsed.
const sanitizeForExport = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('[data-toggle-button]').forEach((el) => el.remove());
  doc
    .querySelectorAll('[data-type="toggle"]')
    .forEach((el) => el.setAttribute('data-open', 'true'));
  return doc.body.innerHTML;
};

// Depth-first list of a page and its page descendants, in sidebar order
// (by node id, matching how children are ordered elsewhere).
export const collectPageTree = (
  rootId: string,
  allPages: LocalNode[]
): { id: string; depth: number }[] => {
  const byParent = new Map<string, LocalNode[]>();
  for (const node of allPages) {
    const parent = node.parentId ?? '';
    const list = byParent.get(parent) ?? [];
    list.push(node);
    byParent.set(parent, list);
  }
  for (const list of byParent.values()) {
    list.sort((a, b) => (a.id < b.id ? -1 : a.id > b.id ? 1 : 0));
  }

  const out: { id: string; depth: number }[] = [];
  const visit = (id: string, depth: number) => {
    out.push({ id, depth });
    for (const child of byParent.get(id) ?? []) {
      visit(child.id, depth + 1);
    }
  };
  visit(rootId, 0);
  return out;
};

// Pull the referenced node ids out of rendered document HTML — mentions are
// serialized as <mention target="…">.
export const extractMentionTargets = (html: string): string[] => {
  const ids = new Set<string>();
  const doc = new DOMParser().parseFromString(html, 'text/html');
  doc.querySelectorAll('mention[target]').forEach((el) => {
    const target = el.getAttribute('target');
    if (target) {
      ids.add(target);
    }
  });
  return [...ids];
};

// Give every heading in the html a stable id (for single-page TOC anchors) and
// return the heading outline. Mutates + returns the html.
const injectHeadingIds = (
  html: string,
  prefix: string
): { html: string; headings: { id: string; text: string; level: number }[] } => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: { id: string; text: string; level: number }[] = [];
  doc.querySelectorAll('h1, h2, h3').forEach((el, i) => {
    const id = `${prefix}-h${i}`;
    el.setAttribute('id', id);
    headings.push({
      id,
      text: el.textContent ?? '',
      level: Number(el.tagName.substring(1)),
    });
  });
  return { html: doc.body.innerHTML, headings };
};

const chapterNumber = (index: number): string => `${index + 1}`;

// Build the table of contents. Multi-chapter → a chapter list; single page →
// that page's heading outline.
const buildToc = (
  chapters: PrintChapter[],
  singleHeadings: { id: string; text: string; level: number }[],
  appendix: PrintChapter[]
): string => {
  const rows: string[] = [];
  if (chapters.length > 1) {
    chapters.forEach((c, i) => {
      rows.push(
        `<li class="toc-row" style="margin-left:${c.depth * 16}px"><a href="#chap-${c.id}">${chapterNumber(i)}. ${escapeHtml(c.title)}</a></li>`
      );
    });
  } else {
    singleHeadings.forEach((h) => {
      rows.push(
        `<li class="toc-row" style="margin-left:${(h.level - 1) * 16}px"><a href="#${h.id}">${escapeHtml(h.text)}</a></li>`
      );
    });
  }
  appendix.forEach((a, i) => {
    rows.push(
      `<li class="toc-row toc-appendix"><a href="#app-${a.id}">${String.fromCharCode(65 + i)}. ${escapeHtml(a.title)} <span class="toc-tag">(appendix)</span></a></li>`
    );
  });
  if (rows.length === 0) {
    return '';
  }
  return `<nav class="toc"><h2>Contents</h2><ul>${rows.join('')}</ul></nav>`;
};

export const assemblePrintHtml = (params: {
  documentTitle: string;
  date: string;
  author: string;
  version: string;
  chapters: PrintChapter[];
  appendix: PrintChapter[];
  options: PrintOptions;
}): string => {
  const { documentTitle, date, author, version, chapters, appendix, options } =
    params;

  // Single page: inject heading ids so the TOC can anchor to them.
  let singleHeadings: { id: string; text: string; level: number }[] = [];
  const preparedChapters = chapters.map((c, i) => {
    if (chapters.length === 1 && options.toc) {
      const injected = injectHeadingIds(c.html, `c${i}`);
      singleHeadings = injected.headings;
      return { ...c, html: injected.html };
    }
    return c;
  });

  const parts: string[] = [];

  if (options.cover) {
    parts.push(
      `<section class="cover"><div class="cover-inner">` +
        `<h1 class="cover-title">${escapeHtml(documentTitle)}</h1>` +
        (version
          ? `<p class="cover-meta cover-version">${escapeHtml(version)}</p>`
          : '') +
        (date ? `<p class="cover-meta">${escapeHtml(date)}</p>` : '') +
        (author ? `<p class="cover-meta">${escapeHtml(author)}</p>` : '') +
        `</div></section>`
    );
  }

  if (options.toc) {
    const toc = buildToc(preparedChapters, singleHeadings, appendix);
    if (toc) {
      parts.push(toc);
    }
  }

  preparedChapters.forEach((c, i) => {
    const isChapter = preparedChapters.length > 1;
    const heading = isChapter
      ? `<h1 class="chapter-title">${chapterNumber(i)}. ${escapeHtml(c.title)}</h1>`
      : `<h1 class="doc-title">${escapeHtml(c.title)}</h1>`;
    const cls = i === 0 ? 'chapter chapter-first' : 'chapter';
    parts.push(
      `<section class="${cls}" id="chap-${c.id}">${heading}${sanitizeForExport(c.html)}</section>`
    );
  });

  if (appendix.length > 0) {
    const inner = appendix
      .map(
        (a, i) =>
          `<section class="appendix-item" id="app-${a.id}"><h2 class="appendix-title">${String.fromCharCode(65 + i)}. ${escapeHtml(a.title)}</h2>${sanitizeForExport(a.html)}</section>`
      )
      .join('');
    parts.push(
      `<section class="appendix"><h1 class="appendix-heading">Appendix</h1>${inner}</section>`
    );
  }

  return parts.join('\n');
};

// Print CSS additions layered on top of the base print stylesheet: cover, TOC,
// chapter page breaks, repeated table headers, and landscape pages for the
// wide tables/embeds tagged with .print-landscape.
export const PRINT_EXPORT_CSS = `
  @page { size: A4 portrait; margin: 16mm; }
  @page landscapePage { size: A4 landscape; margin: 12mm; }

  .cover { display: flex; align-items: center; justify-content: center; min-height: 86vh; break-after: page; text-align: center; }
  .cover-title { font-size: 30px; margin: 0 0 12px; }
  .cover-meta { color: #6b7280; margin: 2px 0; }

  .toc { break-after: page; }
  .toc h2 { font-size: 18px; margin: 0 0 10px; }
  .toc ul { list-style: none; padding: 0; margin: 0; }
  .toc-row { padding: 3px 0; border-bottom: 1px dotted #e5e7eb; }
  .toc-row a { color: #111827; text-decoration: none; }
  .toc-appendix { margin-top: 6px; }
  .toc-tag { color: #9ca3af; font-size: 0.85em; }

  .chapter { break-before: page; }
  .chapter-first { break-before: auto; }
  .chapter-title { font-size: 22px; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; }
  .appendix { break-before: page; }
  .appendix-heading { font-size: 22px; }
  .appendix-item { break-before: page; }

  /* Long tables / database embeds: repeat headers, keep rows whole, wrap text,
     and let the full content print instead of being clipped by scroll boxes. */
  table { break-inside: auto; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  td, th { overflow-wrap: anywhere; word-break: break-word; }
  [class*="overflow-"], [style*="overflow"] { overflow: visible !important; max-height: none !important; }

  /* Wide tables/embeds get their own landscape page. */
  .print-landscape { page: landscapePage; break-before: page; break-after: page; }
  .print-landscape table { font-size: 12px; }
`;
