// ABOUTME: Pure-ish helpers that assemble a multi-page PDF export — chapter
// ABOUTME: ordering, mention extraction, TOC building and final HTML assembly.
import { LocalNode } from '@colanode/client/types';
import {
  RevisionRow,
  ruleStyleFromClasses,
} from '@colanode/ui/lib/print-layout';

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

// What the page shows as its cover: an image, or a colour / gradient preset
// given by its class.
export interface PrintCover {
  imageUrl?: string | null;
  className?: string | null;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Turn the live editor's HTML into something fit for paper. The editor that is
// open on screen is editable, so what it hands over still carries its controls:
// pickers, grips, chevrons and resize handles, none of which mean anything once
// printed and all of which print as stray buttons.
const sanitizeForExport = (html: string): string => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const body = doc.body;

  // Toggle blocks: the chevron is inert on paper, and the content must print.
  body.querySelectorAll('[data-toggle-button]').forEach((el) => el.remove());
  body
    .querySelectorAll('[data-type="toggle"]')
    .forEach((el) => el.setAttribute('data-open', 'true'));

  // Collapsible headings: drop the fold chevron (it pushed the title sideways),
  // and print a section even if it was collapsed on screen -- collapsing hides
  // the top-level blocks that follow the heading with a class.
  body.querySelectorAll('[data-heading-collapse]').forEach((el) => el.remove());
  Array.from(body.children).forEach((el) => el.classList.remove('hidden'));

  // Callouts: keep the icon, drop the icon and colour pickers wrapped around it.
  body.querySelectorAll('[data-type="callout"]').forEach((callout) => {
    callout
      .querySelectorAll('[aria-label="Change callout color"]')
      .forEach((el) => el.remove());
    const pickers = callout.querySelectorAll(
      '[aria-label="Change callout icon"]'
    );
    pickers.forEach((picker) => {
      const icon = doc.createElement('span');
      icon.className = 'print-callout-icon';
      while (picker.firstChild) {
        icon.appendChild(picker.firstChild);
      }
      picker.replaceWith(icon);
    });
    if (pickers.length === 0) {
      callout
        .querySelector(':scope > [contenteditable="false"] > div')
        ?.classList.add('print-callout-icon');
    }
  });

  // Dividers: keep the rule, drop the style picker, remember which rule it is.
  body.querySelectorAll('[data-type="divider"]').forEach((divider) => {
    const line = divider.firstElementChild;
    Array.from(divider.children).forEach((child) => {
      if (child !== line) {
        child.remove();
      }
    });
    line?.setAttribute(
      'data-print-rule',
      ruleStyleFromClasses(line.getAttribute('class') ?? '')
    );
  });

  // Images: remember the width the author chose, drop the resize handles, and
  // turn an editable caption field back into its text.
  body.querySelectorAll('img').forEach((img) => {
    const frame = img.parentElement as HTMLElement | null;
    const width = frame ? Number.parseFloat(frame.style.width) : Number.NaN;
    if (Number.isFinite(width) && width > 0) {
      img.setAttribute('data-print-width', String(Math.round(width)));
    }
  });
  body
    .querySelectorAll('[class*="cn-img-resize-handle"]')
    .forEach((el) => el.remove());
  // The caption is edited in a field, and a field prints as an empty box. It
  // is replaced by its text: `data-caption` for the text box the editor uses
  // now, the value attribute for a document exported from an older client.
  body
    .querySelectorAll('figcaption input, figcaption textarea')
    .forEach((field) => {
      const text = doc.createElement('span');
      text.className = 'italic';
      text.textContent =
        field.getAttribute('data-caption') ?? field.getAttribute('value') ?? '';
      field.replaceWith(text);
    });

  // Tables: the widths set for the screen column never suit a page. The print
  // layout pass sizes them against the real printable width instead.
  body.querySelectorAll('table').forEach((table) => {
    table.style.removeProperty('min-width');
    table.style.removeProperty('width');
  });
  body
    .querySelectorAll('col')
    .forEach((col) => col.style.removeProperty('width'));

  // Nothing interactive belongs on paper: row and column grips, copy buttons,
  // embed toolbars. Last, so the callout icon has already left its button.
  body.querySelectorAll('button').forEach((el) => el.remove());

  return body.innerHTML;
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
): {
  html: string;
  headings: { id: string; text: string; level: number }[];
} => {
  const doc = new DOMParser().parseFromString(html, 'text/html');
  const headings: { id: string; text: string; level: number }[] = [];
  doc.querySelectorAll('h1, h2, h3, h4, h5').forEach((el, i) => {
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
// that page's heading outline. It carries no document title: the cover has it.
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
  return `<nav class="toc"><h2 class="section-heading">Contents</h2><ul>${rows.join('')}</ul></nav>`;
};

// The page between the cover and the contents: what this document is, where it
// lives, and every version it went through. It replaces the title and link the
// browser used to stamp on top of every page.
const buildDocumentControl = (params: {
  documentTitle: string;
  version: string;
  date: string;
  documentLink: string;
  revisions: RevisionRow[];
}): string => {
  const { documentTitle, version, date, documentLink, revisions } = params;
  const info = [
    ['Document', escapeHtml(documentTitle)],
    ['Current version', escapeHtml(version)],
    [
      'Link',
      documentLink
        ? `<a href="${escapeHtml(documentLink)}">${escapeHtml(documentLink)}</a>`
        : '',
    ],
    ['Exported', escapeHtml(date)],
  ]
    .filter(([, value]) => value)
    .map(([label, value]) => `<tr><th>${label}</th><td>${value}</td></tr>`)
    .join('');

  const rows = revisions
    .map(
      (r) =>
        `<tr><td class="rev-version">${escapeHtml(r.version)}</td><td class="rev-date">${escapeHtml(r.date)}</td><td>${escapeHtml(r.author)}</td><td>${escapeHtml(r.changes)}</td></tr>`
    )
    .join('');

  return (
    `<section class="doc-control">` +
    `<h2 class="section-heading">Document control</h2>` +
    `<table class="doc-info"><tbody>${info}</tbody></table>` +
    `<h3 class="section-subheading">Revision history</h3>` +
    `<table class="revision-table"><thead><tr><th>Version</th><th>Date</th><th>Author</th><th>Changes</th></tr></thead><tbody>${rows}</tbody></table>` +
    `</section>`
  );
};

export const assemblePrintHtml = (params: {
  documentTitle: string;
  date: string;
  author: string;
  version: string;
  cover?: PrintCover | null;
  documentLink?: string;
  revisions?: RevisionRow[];
  chapters: PrintChapter[];
  appendix: PrintChapter[];
  options: PrintOptions;
}): string => {
  const {
    documentTitle,
    date,
    author,
    version,
    cover,
    documentLink,
    revisions,
    chapters,
    appendix,
    options,
  } = params;

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

  // The cover is the one place the page's cover image and its title appear.
  if (options.cover) {
    const visual = cover?.imageUrl
      ? `<div class="cover-visual"><img src="${escapeHtml(cover.imageUrl)}" alt=""></div>`
      : cover?.className
        ? `<div class="cover-visual ${escapeHtml(cover.className)}"></div>`
        : '';
    const meta = [date, author].filter(Boolean).map(escapeHtml).join(' · ');
    parts.push(
      `<section class="cover${visual ? ' cover-with-visual' : ''}">` +
        visual +
        `<div class="cover-body">` +
        `<h1 class="cover-title">${escapeHtml(documentTitle)}</h1>` +
        `<div class="cover-rule"></div>` +
        (version ? `<p class="cover-version">${escapeHtml(version)}</p>` : '') +
        (meta ? `<p class="cover-meta">${meta}</p>` : '') +
        `</div></section>`
    );
  }

  if (revisions && revisions.length > 0) {
    parts.push(
      buildDocumentControl({
        documentTitle,
        version: version || revisions[0]?.version || '',
        date,
        documentLink: documentLink ?? '',
        revisions,
      })
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
    // A single page's title is already on the cover; repeat it only when there
    // is no cover to carry it.
    const heading = isChapter
      ? `<h1 class="chapter-title">${chapterNumber(i)}. ${escapeHtml(c.title)}</h1>`
      : options.cover
        ? ''
        : `<h1 class="doc-title">${escapeHtml(c.title)}</h1>`;
    const cls = i === 0 ? 'chapter chapter-first' : 'chapter';
    parts.push(
      `<section class="${cls}" id="chap-${c.id}">${heading}<div class="print-body">${sanitizeForExport(c.html)}</div></section>`
    );
  });

  if (appendix.length > 0) {
    const inner = appendix
      .map(
        (a, i) =>
          `<section class="appendix-item" id="app-${a.id}"><h2 class="appendix-title">${String.fromCharCode(65 + i)}. ${escapeHtml(a.title)}</h2><div class="print-body">${sanitizeForExport(a.html)}</div></section>`
      )
      .join('');
    parts.push(
      `<section class="appendix"><h1 class="appendix-heading">Appendix</h1>${inner}</section>`
    );
  }

  return parts.join('\n');
};

const PAGE_NUMBER = `content: counter(page) " / " counter(pages); font: 9pt ui-sans-serif, system-ui, sans-serif; color: #6b7280;`;

// Print CSS layered on top of the base print stylesheet and the app's own.
//
// The vertical space used to be written as page PADDING, with the margins at
// zero, to deny Chrome the room it needs to draw its own header and footer
// (the date, the title, the URL). Chrome does not implement padding on @page,
// so what that actually produced was no top space at all: the text started at
// the very edge of the paper. The margin is real now, on all four sides, and
// the page number keeps its margin box. If Chrome's own header and footer
// appear, untick "Headers and footers" in its print dialog.
export const PRINT_EXPORT_CSS = `
  @page { size: A4 portrait; margin: 16mm;
    @right-bottom { ${PAGE_NUMBER} padding-bottom: 6mm; } }
  @page :first { @right-bottom { content: none; } }
  /* Same 16 mm as portrait: a page that turns must not move the text block. */
  @page landscapePage { size: A4 landscape; margin: 16mm;
    @right-bottom { ${PAGE_NUMBER} padding-bottom: 6mm; } }

  /* Backgrounds are part of the design (callouts, covers, table headers):
     print them even with the dialog's "Background graphics" unticked. */
  * { -webkit-print-color-adjust: exact; print-color-adjust: exact; }
  html, body { height: auto !important; min-height: 0 !important; overflow: visible !important; background: #ffffff !important; }
  .print-root { max-width: none; margin: 0; padding: 0; }
  @media screen { .print-root { width: 178mm; } }

  .section-heading { font-size: 20px; font-weight: 700; color: #0f172a; margin: 0 0 12px; }
  .section-subheading { font-size: 12px; font-weight: 600; color: #475569; text-transform: uppercase; letter-spacing: 0.06em; margin: 22px 0 8px; }

  /* Cover: the page's cover image and its title, and nowhere else. */
  .cover { break-after: page; min-height: 262mm; display: flex; flex-direction: column; justify-content: center; }
  .cover-with-visual { justify-content: flex-start; }
  .cover-visual { height: 92mm; border-radius: 12px; overflow: hidden; margin-bottom: 22mm; }
  .cover-visual img { display: block; width: 100%; height: 100%; max-width: none; object-fit: cover; }
  .cover-title { font-size: 34px; font-weight: 700; line-height: 1.15; color: #0f172a; margin: 0; }
  .cover-rule { width: 64px; height: 4px; border-radius: 2px; background: #5ebd6a; margin: 16px 0 18px; }
  .cover-version { display: inline-block; font-size: 13px; font-weight: 600; color: #1e3a8a; background: #e0e7ff; border-radius: 999px; padding: 2px 12px; margin: 0 0 10px; }
  .cover-meta { font-size: 14px; color: #475569; margin: 2px 0; }

  /* Document control: identity, link and revision history, on a page of
     their own and centred on it. */
  .doc-control { break-after: page; min-height: 262mm; display: flex; flex-direction: column; justify-content: center; }
  .doc-control .section-heading, .doc-control .section-subheading { text-align: center; }
  table.doc-info, table.revision-table { width: 100%; border-collapse: separate; border-spacing: 0; font-size: 12px; border: 1px solid #e2e8f0; border-radius: 8px; overflow: hidden; }
  table.doc-info th, table.doc-info td, table.revision-table th, table.revision-table td { border: 0; border-bottom: 1px solid #e2e8f0; padding: 7px 10px; vertical-align: top; }
  table.doc-info tr:last-child th, table.doc-info tr:last-child td, table.revision-table tr:last-child td { border-bottom: 0; }
  table.doc-info th { width: 36mm; background: #f8fafc; color: #475569; font-weight: 600; }
  table.doc-info a { word-break: break-all; }
  table.revision-table thead th { background: #0a1929; color: #ffffff; font-weight: 600; }
  table.revision-table tbody tr:nth-child(even) td { background: #f8fafc; }
  table.revision-table td.rev-version { font-weight: 600; color: #1e3a8a; white-space: nowrap; }
  table.revision-table td.rev-date { white-space: nowrap; }

  .toc { break-after: page; }
  .toc ul { list-style: none; padding: 0; margin: 0; }
  .toc-row { padding: 2px 0; font-size: 12px; border-bottom: 1px dotted #e5e7eb; }
  /* A long contents ran onto a second page and left both half empty. Past the
     point where it no longer fits, it runs in two columns instead. */
  .toc-dense ul { columns: 2; column-gap: 10mm; }
  .toc-dense .toc-row { break-inside: avoid; }
  .toc-dense .toc-row { padding: 1px 0; font-size: 11px; }
  .toc-row a { color: #111827; text-decoration: none; }
  .toc-appendix { margin-top: 6px; }
  .toc-tag { color: #9ca3af; font-size: 0.85em; }

  .chapter { break-before: page; }
  .chapter-first { break-before: auto; }
  .doc-title { font-size: 28px; font-weight: 700; margin: 0 0 12px; }
  .chapter-title { font-size: 22px; font-weight: 700; border-bottom: 2px solid #e5e7eb; padding-bottom: 4px; margin: 0 0 12px; }
  .appendix { break-before: page; }
  .appendix-heading { font-size: 22px; font-weight: 700; }
  .appendix-item { break-before: page; }

  /* Dividers: one clean, continuous rule across the column, in its style. */
  hr { border: 0; border-top: 1px solid #cbd5e1; margin: 14px 0; }
  .print-body [data-type="divider"] { margin: 14px 0 !important; }
  .print-body [data-print-rule] { display: block; width: 100%; height: 0 !important; margin: 0 auto; background: none !important; border: 0; border-top: 1px solid #cbd5e1; border-radius: 0; }
  .print-body [data-print-rule="thick"] { border-top-width: 3px; border-top-color: #94a3b8; }
  .print-body [data-print-rule="dashed"] { border-top-width: 2px; border-top-style: dashed; }
  .print-body [data-print-rule="dotted"] { border-top-width: 2px; border-top-style: dotted; }

  /* Callouts: the tinted box, its outline and its icon, never split. */
  .print-body [data-type="callout"] { border: 1px solid rgba(15, 23, 42, 0.08); break-inside: avoid; }
  .print-callout-icon { display: flex; width: 24px; height: 24px; align-items: center; justify-content: center; flex-shrink: 0; }

  /* Headings keep their text with what follows. */
  .print-body h1, .print-body h2, .print-body h3, .print-body h4, .print-body h5 { break-after: avoid; }
  /* What actually keeps a heading with what it introduces: adding and removing
     the rule above changed nothing on a measured export, because the block that
     moves is a picture or a table, and neither is an ordinary block sibling of
     the heading. The layout pass puts the two in this box instead. */
  .print-keep { break-inside: avoid; }

  /* Tables: headers repeat, rows stay whole, text wraps at word boundaries.
     A table that fits on one page is marked by the layout pass and kept
     whole; one that cannot fit still breaks, because the alternative is
     losing it off the end of the paper. */
  table { break-inside: auto; }
  .print-table-whole { break-inside: avoid; }
  thead { display: table-header-group; }
  tr { break-inside: avoid; }
  td, th { overflow-wrap: break-word; word-break: normal; }
  [class*="overflow-"], [style*="overflow"] { overflow: visible !important; max-height: none !important; }
  /* A cell's border is drawn by a wrapper inside the <td>, by the app's own
     "border" class, whose colour is a theme variable. Anything that leaves
     that variable unresolved in the print document prints a border with no
     colour, which is the missing line. A colour is stated here; a cell with a
     border of its own carries it inline and still wins. */
  .print-body table td > div, .print-body table th > div { border-color: #cbd5e1; }
  .print-body table td, .print-body table th { border-color: #cbd5e1; }

  table.print-table-compact { font-size: 10px; }
  table.print-table-compact td, table.print-table-compact th { padding: 3px 5px !important; }

  /* Images: centred, sized by the layout pass, never split across pages. */
  .print-image { display: block; margin-left: auto !important; margin-right: auto !important; break-inside: avoid; }
  /* A picture block is a custom element, so without this it is an INLINE box:
     "do not break inside" does not apply to one, and neither does the heading's
     "do not break after". */
  .print-image-block { display: block; break-inside: avoid; }
  /* The frame the editor draws around a picture is a block of its own between
     the two, and a break could still be taken inside it. */
  .print-image-block * { break-inside: avoid; }
  /* The caption is a row of two: its number and its text. Centred as a row,
     since text-align does not reach the boxes inside it. */
  .print-image-block figcaption { text-align: center; justify-content: center; }
  .print-own-page { break-before: page; break-after: page; display: flex; flex-direction: column; justify-content: center; }
  .print-portrait-page { min-height: 255mm; }
  .print-landscape.print-own-page { min-height: 180mm; }

  /* Wide tables and large wide images get a landscape page of their own. */
  .print-landscape { page: landscapePage; break-before: page; break-after: page; }
`;
