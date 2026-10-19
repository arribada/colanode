// ABOUTME: Chart block — an atom node whose type/title and either typed data or a
// ABOUTME: link to a table of the page live in attrs; the view renders an SVG chart.
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ChartNodeView } from '@colanode/ui/editor/views/chart';

const DEFAULT_DATA = [
  { label: 'A', value: 10 },
  { label: 'B', value: 20 },
  { label: 'C', value: 15 },
];

// An object-valued attribute, kept as JSON in a data attribute so the chart
// survives copy and paste as HTML.
const jsonAttribute = (attr: string, html: string, fallback: unknown) => ({
  default: fallback,
  parseHTML: (el: HTMLElement) => {
    const raw = el.getAttribute(html);
    if (!raw) {
      return fallback;
    }
    try {
      return JSON.parse(raw);
    } catch {
      return fallback;
    }
  },
  renderHTML: (attrs: Record<string, unknown>) =>
    attrs[attr] == null ? {} : { [html]: JSON.stringify(attrs[attr]) },
});

export const ChartNode = Node.create({
  name: 'chart',
  group: 'block',
  atom: true,
  draggable: true,
  selectable: true,

  addAttributes() {
    return {
      chartType: {
        default: 'bar',
        parseHTML: (el) => el.getAttribute('data-chart-type') ?? 'bar',
        renderHTML: (attrs) => ({
          'data-chart-type': attrs.chartType ?? 'bar',
        }),
      },
      title: {
        default: '',
        parseHTML: (el) => el.getAttribute('data-chart-title') ?? '',
        renderHTML: (attrs) => ({ 'data-chart-title': attrs.title ?? '' }),
      },
      // Array of { label, value, color? }. Stored as JSON in a data attribute
      // for HTML round-trips; the block store keeps the raw array in attrs.
      data: {
        default: DEFAULT_DATA,
        parseHTML: (el) => {
          try {
            const parsed = JSON.parse(el.getAttribute('data-chart-data') ?? '');
            return Array.isArray(parsed) ? parsed : DEFAULT_DATA;
          } catch {
            return DEFAULT_DATA;
          }
        },
        renderHTML: (attrs) => ({
          'data-chart-data': JSON.stringify(attrs.data ?? []),
        }),
      },
      // A chart drawn from a table of the same page: { tableId }. While set,
      // `data` is ignored and the chart follows the table as it is edited.
      source: jsonAttribute('source', 'data-chart-source', null),
      // { index, name } of the column across the bottom.
      xColumn: jsonAttribute('xColumn', 'data-chart-x', null),
      // [{ index, name, color? }] — one per plotted column.
      series: jsonAttribute('series', 'data-chart-series', []),
      headerRow: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-chart-header-row') !== 'false',
        renderHTML: (attrs) => ({
          'data-chart-header-row': String(attrs.headerRow !== false),
        }),
      },
      // A line chart may start its axis at its data instead of at zero.
      fromZero: {
        default: true,
        parseHTML: (el) => el.getAttribute('data-chart-from-zero') !== 'false',
        renderHTML: (attrs) => ({
          'data-chart-from-zero': String(attrs.fromZero !== false),
        }),
      },
    };
  },

  parseHTML() {
    return [{ tag: 'div[data-type="chart"]' }];
  },

  renderHTML({ HTMLAttributes }) {
    return ['div', mergeAttributes(HTMLAttributes, { 'data-type': 'chart' })];
  },

  addNodeView() {
    return ReactNodeViewRenderer(ChartNodeView);
  },
});
