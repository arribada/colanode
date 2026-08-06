// ABOUTME: Server-side rendering for public share pages — turns a document's
// ABOUTME: rich-text blocks into safe HTML and wraps it in a standalone page.
import { DocumentContent } from '@colanode/core';

type Block = {
  id: string;
  type: string;
  parentId?: string;
  index?: string;
  content?: Array<{
    type: string;
    text?: string;
    marks?: Array<{ type: string; attrs?: Record<string, unknown> }>;
  }>;
  attrs?: Record<string, unknown>;
};

const esc = (s: string): string =>
  s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');

// Inline leaf content -> HTML, applying marks (bold/italic/underline/etc).
const renderInline = (block: Block): string => {
  if (!block.content || block.content.length === 0) {
    return '';
  }
  return block.content
    .map((leaf) => {
      if (leaf.type !== 'text') {
        return '';
      }
      let html = esc(leaf.text ?? '');
      for (const mark of leaf.marks ?? []) {
        switch (mark.type) {
          case 'bold':
            html = `<strong>${html}</strong>`;
            break;
          case 'italic':
            html = `<em>${html}</em>`;
            break;
          case 'underline':
            html = `<u>${html}</u>`;
            break;
          case 'strikethrough':
            html = `<s>${html}</s>`;
            break;
          case 'code':
            html = `<code>${html}</code>`;
            break;
          case 'link': {
            const href = String(mark.attrs?.href ?? '#');
            html = `<a href="${esc(href)}" rel="noopener nofollow" target="_blank">${html}</a>`;
            break;
          }
          default:
            break;
        }
      }
      return html;
    })
    .join('');
};

const childrenOf = (blocks: Record<string, Block>, parentId: string): Block[] =>
  Object.values(blocks)
    .filter((b) => b.parentId === parentId)
    .sort((a, b) => (a.index ?? '').localeCompare(b.index ?? ''));

const renderBlock = (blocks: Record<string, Block>, block: Block): string => {
  const kids = childrenOf(blocks, block.id);
  const kidsHtml = kids.map((k) => renderBlock(blocks, k)).join('');

  switch (block.type) {
    case 'paragraph':
      return `<p>${renderInline(block)}</p>`;
    case 'heading1':
      return `<h1>${renderInline(block)}</h1>`;
    case 'heading2':
      return `<h2>${renderInline(block)}</h2>`;
    case 'heading3':
      return `<h3>${renderInline(block)}</h3>`;
    case 'bulletList':
      return `<ul>${kidsHtml}</ul>`;
    case 'orderedList':
      return `<ol>${kidsHtml}</ol>`;
    case 'listItem':
    case 'taskItem':
      return `<li>${renderInline(block)}${kidsHtml}</li>`;
    case 'taskList':
      return `<ul class="task">${kidsHtml}</ul>`;
    case 'blockquote':
      return `<blockquote>${renderInline(block)}${kidsHtml}</blockquote>`;
    case 'codeBlock':
      return `<pre><code>${esc(block.content?.map((c) => c.text ?? '').join('') ?? '')}</code></pre>`;
    case 'horizontalRule':
      return '<hr />';
    case 'table':
      return `<table>${kidsHtml}</table>`;
    case 'tableRow':
      return `<tr>${kidsHtml}</tr>`;
    case 'tableCell':
      return `<td>${renderInline(block)}${kidsHtml}</td>`;
    case 'tableHeader':
      return `<th>${renderInline(block)}${kidsHtml}</th>`;
    case 'toggle':
      return `<details open>${kidsHtml}</details>`;
    case 'toggleSummary':
      return `<summary>${renderInline(block)}</summary>`;
    case 'toggleContent':
      return `<div>${kidsHtml}</div>`;
    case 'callout':
      return `<div class="callout">${renderInline(block)}${kidsHtml}</div>`;
    case 'columns':
      return `<div class="columns">${kidsHtml}</div>`;
    case 'column':
      return `<div class="column">${kidsHtml}</div>`;
    default:
      // Interactive / media blocks (database, mermaid, chart, file, image,
      // whiteboard) are not rendered in the read-only share for now.
      if (kids.length > 0) {
        return `<div>${kidsHtml}</div>`;
      }
      return '';
  }
};

// Render a document's rich-text content to an HTML fragment.
export const renderDocumentHtml = (
  documentId: string,
  content: DocumentContent | null | undefined
): string => {
  if (!content || content.type !== 'rich_text' || !content.blocks) {
    return '';
  }
  const blocks = content.blocks as unknown as Record<string, Block>;
  const roots = childrenOf(blocks, documentId);
  return roots.map((b) => renderBlock(blocks, b)).join('');
};

const BASE_CSS = `
  :root { color-scheme: light; }
  * { box-sizing: border-box; }
  body { margin: 0; font-family: ui-sans-serif, system-ui, -apple-system, Segoe UI, Roboto, sans-serif; color: #111827; background: #f8fafc; line-height: 1.65; }
  .wrap { max-width: 780px; margin: 0 auto; padding: 48px 20px 96px; }
  .card { background: #fff; border: 1px solid #e5e7eb; border-radius: 14px; padding: 40px 44px; box-shadow: 0 1px 2px rgba(0,0,0,.04); }
  h1.title { font-size: 30px; margin: 0 0 6px; }
  .meta { color: #6b7280; font-size: 13px; margin-bottom: 24px; }
  .content h1 { font-size: 24px; margin: 1.4em 0 .5em; }
  .content h2 { font-size: 20px; margin: 1.3em 0 .5em; }
  .content h3 { font-size: 17px; margin: 1.2em 0 .4em; }
  .content p { margin: .7em 0; }
  .content ul, .content ol { padding-left: 1.4em; margin: .6em 0; }
  .content blockquote { margin: .8em 0; padding-left: 14px; border-left: 3px solid #d1d5db; color: #4b5563; }
  .content pre { background: #0f172a; color: #e2e8f0; padding: 14px 16px; border-radius: 8px; overflow-x: auto; }
  .content code { font-family: ui-monospace, SFMono-Regular, Menlo, monospace; font-size: .92em; }
  .content pre code { color: inherit; }
  .content table { border-collapse: collapse; width: 100%; margin: 1em 0; }
  .content th, .content td { border: 1px solid #e5e7eb; padding: 6px 10px; text-align: left; }
  .content a { color: #2563eb; }
  .content hr { border: none; border-top: 1px solid #e5e7eb; margin: 1.4em 0; }
  .content .callout { background: #f1f5f9; border-radius: 8px; padding: 10px 14px; margin: .8em 0; }
  .content .columns { display: flex; gap: 1rem; flex-wrap: wrap; }
  .content .column { flex: 1 1 200px; min-width: 180px; }
  .content details { margin: .6em 0; }
  .foot { margin-top: 28px; color: #9ca3af; font-size: 12px; text-align: center; }
  .lock { max-width: 380px; margin: 12vh auto; text-align: center; }
  .lock input { width: 100%; padding: 10px 12px; border: 1px solid #cbd5e1; border-radius: 8px; font-size: 15px; margin: 14px 0; }
  .lock button { width: 100%; padding: 10px; border: none; border-radius: 8px; background: #2563eb; color: #fff; font-size: 15px; cursor: pointer; }
  .lock .err { color: #dc2626; font-size: 13px; }
`;

export const renderSharePage = (params: {
  title: string;
  bodyHtml: string;
  workspaceName?: string;
}): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
  `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
  `<meta name="robots" content="noindex, nofollow" />` +
  `<title>${esc(params.title)}</title><style>${BASE_CSS}</style></head><body>` +
  `<div class="wrap"><div class="card">` +
  `<h1 class="title">${esc(params.title)}</h1>` +
  (params.workspaceName
    ? `<div class="meta">Shared from ${esc(params.workspaceName)}</div>`
    : '') +
  `<div class="content">${params.bodyHtml}</div>` +
  `</div><div class="foot">Read-only shared page.</div></div></body></html>`;

export const renderPasswordPage = (params: {
  token: string;
  error?: boolean;
}): string =>
  `<!doctype html><html lang="en"><head><meta charset="utf-8" />` +
  `<meta name="viewport" content="width=device-width, initial-scale=1" />` +
  `<meta name="robots" content="noindex, nofollow" />` +
  `<title>Protected page</title><style>${BASE_CSS}</style></head><body>` +
  // POSTs JSON (parsed natively by the server) and swaps in the returned page.
  `<form class="lock" onsubmit="event.preventDefault();var p=this.password.value;` +
  `fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},` +
  `body:JSON.stringify({password:p})}).then(function(r){return r.text()}).then(function(h){` +
  `document.open();document.write(h);document.close();});">` +
  `<h2>Password required</h2>` +
  `<p>This shared page is protected.</p>` +
  `<input type="password" name="password" placeholder="Password" autofocus />` +
  (params.error ? `<div class="err">Wrong password.</div>` : '') +
  `<button type="submit">Open</button>` +
  `</form></body></html>`;
