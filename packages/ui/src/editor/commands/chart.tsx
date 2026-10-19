import { BarChart3 } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';
import {
  chartsToOpen,
  linkedChartAttrs,
  tableBefore,
} from '@colanode/ui/editor/views/chart-insert';

export const ChartCommand: EditorCommand = {
  key: 'chart',
  name: 'Chart',
  description: 'Chart the table just above, or data you enter',
  keywords: ['chart', 'graph', 'graphique', 'bar', 'line', 'pie', 'diagramme', 'stats'],
  icon: BarChart3,
  group: 'layout',
  disabled: false,
  handler: ({ editor, range }) => {
    // Typed right under a table, /chart draws that table.
    const table = tableBefore(editor.state, range.from);
    if (table && typeof table.attrs.id === 'string') {
      const attrs = linkedChartAttrs(table);
      chartsToOpen.add(attrs.id);
      editor
        .chain()
        .focus()
        .deleteRange(range)
        .insertContent({ type: 'chart', attrs })
        .run();
      return;
    }
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
