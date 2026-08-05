// ABOUTME: Standalone chart block — an atom node whose type/title/data live in
// ABOUTME: attrs (persisted); the node view renders a CSP-safe SVG chart.
import { mergeAttributes, Node } from '@tiptap/core';
import { ReactNodeViewRenderer } from '@tiptap/react';

import { ChartNodeView } from '@colanode/ui/editor/views/chart';

const DEFAULT_DATA = [
  { label: 'A', value: 10 },
  { label: 'B', value: 20 },
  { label: 'C', value: 15 },
];

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
