// ABOUTME: Inserts a chart block linked to a table — from the table's cell menu,
// ABOUTME: or from /chart typed right under a table — and opens its settings.
import { type Editor } from '@tiptap/core';
import { type Node as PMNode } from '@tiptap/pm/model';
import { type EditorState } from '@tiptap/pm/state';

import { generateId, IdType } from '@colanode/core';
import {
  suggestTableChart,
  tableMatrix,
} from '@colanode/ui/editor/views/chart-table';

// Charts inserted by the user open their settings once mounted; a chart that
// merely loads with the page does not. Keyed by the chart block id.
export const chartsToOpen = new Set<string>();

const isTable = (node: PMNode | null | undefined): node is PMNode =>
  node?.type.spec.tableRole === 'table';

/** The table holding `pos`, with its position, or null. */
export const tableAround = (
  state: EditorState,
  pos: number
): { pos: number; node: PMNode } | null => {
  const $pos = state.doc.resolve(pos);
  for (let depth = $pos.depth; depth > 0; depth--) {
    const node = $pos.node(depth);
    if (isTable(node)) {
      return { pos: $pos.before(depth), node };
    }
  }
  return null;
};

/** The table holding the selection, with its position, or null. */
export const tableAtSelection = (state: EditorState) =>
  tableAround(state, state.selection.head);

/** The table right before the block holding `pos`, if that sibling is one. */
export const tableBefore = (state: EditorState, pos: number): PMNode | null => {
  const $pos = state.doc.resolve(pos);
  if ($pos.depth < 1) {
    return null;
  }
  const parent = $pos.node($pos.depth - 1);
  const index = $pos.index($pos.depth - 1);
  const previous = index > 0 ? parent.child(index - 1) : null;
  return isTable(previous) ? previous : null;
};

/** The attrs of a new chart that follows this table. */
export const linkedChartAttrs = (table: PMNode) => {
  const id = generateId(IdType.Block);
  const suggestion = suggestTableChart(tableMatrix(table), true);
  return {
    id,
    chartType: suggestion.chartType,
    title: '',
    source: { tableId: table.attrs.id as string },
    xColumn: suggestion.xColumn,
    series: suggestion.series,
    headerRow: true,
    fromZero: true,
  };
};

/** Puts a chart of the table right under it and opens its settings. */
export const insertChartAfterTable = (
  editor: Editor,
  tablePos: number,
  table: PMNode
): boolean => {
  if (typeof table.attrs.id !== 'string') {
    return false;
  }
  const attrs = linkedChartAttrs(table);
  chartsToOpen.add(attrs.id);
  return editor
    .chain()
    .focus()
    .insertContentAt(tablePos + table.nodeSize, { type: 'chart', attrs })
    .run();
};
