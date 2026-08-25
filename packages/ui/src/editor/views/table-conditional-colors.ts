// ABOUTME: ProseMirror plugin that colours editor-table cells by their value.
// ABOUTME: Reads each table's colorRules attribute and decorates matching cells.
import { type Node as ProseMirrorNode } from '@tiptap/pm/model';
import { Plugin, PluginKey } from '@tiptap/pm/state';
import { Decoration, DecorationSet } from '@tiptap/pm/view';

export type ConditionalColorOperator =
  | 'contains'
  | 'equals'
  | 'empty'
  | 'not_empty';

export type ConditionalColorScope = 'cell' | 'row';

export interface ConditionalColorRule {
  id: string;
  columnIndex: number | null; // null = any column
  operator: ConditionalColorOperator;
  value: string;
  color: string; // an editorColors color name, never 'default'
  scope: ConditionalColorScope;
}

export const parseColorRules = (raw: unknown): ConditionalColorRule[] => {
  if (Array.isArray(raw)) {
    return raw as ConditionalColorRule[];
  }
  if (typeof raw === 'string' && raw.length > 0) {
    try {
      const parsed = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as ConditionalColorRule[]) : [];
    } catch {
      return [];
    }
  }
  return [];
};

const matches = (rule: ConditionalColorRule, text: string): boolean => {
  const value = text.trim();
  const needle = rule.value.trim().toLowerCase();
  switch (rule.operator) {
    case 'empty':
      return value.length === 0;
    case 'not_empty':
      return value.length > 0;
    case 'equals':
      return value.toLowerCase() === needle;
    case 'contains':
      return needle.length > 0 && value.toLowerCase().includes(needle);
    default:
      return false;
  }
};

const hasManualBackground = (cell: ProseMirrorNode): boolean => {
  const bg = cell.attrs.backgroundColor as string | null;
  return bg != null && bg !== 'default';
};

const buildDecorations = (doc: ProseMirrorNode): DecorationSet => {
  const decorations: Decoration[] = [];

  doc.descendants((node, pos) => {
    if (node.type.name !== 'table') {
      return true;
    }
    const rules = parseColorRules(node.attrs.colorRules);
    if (rules.length === 0) {
      return false;
    }

    node.forEach((rowNode, rowOffset) => {
      if (rowNode.type.name !== 'tableRow') {
        return;
      }
      const rowStart = pos + 1 + rowOffset;

      const cells: {
        node: ProseMirrorNode;
        pos: number;
        columnIndex: number;
      }[] = [];
      let columnIndex = 0;
      rowNode.forEach((cellNode, cellOffset) => {
        cells.push({
          node: cellNode,
          pos: rowStart + 1 + cellOffset,
          columnIndex,
        });
        columnIndex += (cellNode.attrs.colspan as number | null) ?? 1;
      });

      // Cell-scope rules win over the broader row-scope rule for a given cell.
      let rowColor: string | null = null;
      const cellColors = new Map<number, string>();

      cells.forEach((cell, index) => {
        for (const rule of rules) {
          if (
            rule.columnIndex != null &&
            rule.columnIndex !== cell.columnIndex
          ) {
            continue;
          }
          if (!matches(rule, cell.node.textContent)) {
            continue;
          }
          if (rule.scope === 'row') {
            if (rowColor == null) {
              rowColor = rule.color;
            }
          } else if (!cellColors.has(index)) {
            cellColors.set(index, rule.color);
          }
        }
      });

      cells.forEach((cell, index) => {
        const color = cellColors.get(index) ?? rowColor;
        if (color == null || hasManualBackground(cell.node)) {
          return;
        }
        decorations.push(
          Decoration.node(cell.pos, cell.pos + cell.node.nodeSize, {
            'data-cond-color': color,
          })
        );
      });
    });

    return false;
  });

  return DecorationSet.create(doc, decorations);
};

export const tableConditionalColorsKey = new PluginKey('tableConditionalColors');

export const tableConditionalColorsPlugin = () =>
  new Plugin({
    key: tableConditionalColorsKey,
    state: {
      init: (_config, { doc }) => buildDecorations(doc),
      apply: (tr, old) => (tr.docChanged ? buildDecorations(tr.doc) : old),
    },
    props: {
      decorations(state) {
        return this.getState(state);
      },
    },
  });
