import { BarChart3 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const ChartCommand: EditorCommand = {
  key: 'chart',
  name: 'Chart',
  description: 'Insert a chart from data you enter',
  keywords: ['chart', 'graph', 'graphique', 'bar', 'line', 'pie', 'diagramme', 'stats'],
  icon: BarChart3,
  group: 'layout',
  disabled: false,
  handler: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .insertContent({
        type: 'chart',
        attrs: {
          chartType: 'bar',
          title: '',
          data: [
            { label: 'A', value: 10 },
            { label: 'B', value: 20 },
            { label: 'C', value: 15 },
          ],
        },
      })
      .run();
  },
};
