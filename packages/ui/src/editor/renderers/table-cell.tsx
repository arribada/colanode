import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface TableCellRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
  // A pre-computed display string (summary total or formatted number) supplied
  // by the table renderer; when set it replaces the cell's own content.
  override?: string | null;
}

export const TableCellRenderer = ({
  node,
  keyPrefix,
  override,
}: TableCellRendererProps) => {
  const align = node.attrs?.align ?? 'left';
  const valign = node.attrs?.valign ?? 'middle';
  const backgroundColorAttr = node.attrs?.backgroundColor ?? null;
  const backgroundColor = backgroundColorAttr
    ? editorColors.find((color) => color.color === backgroundColorAttr)
    : null;
  const hasOverride = override !== null && override !== undefined;

  return (
    <td
      className={defaultClasses.tableCellWrapper}
      data-border-style={node.attrs?.borderStyle ?? 'default'}
      data-border-color={node.attrs?.borderColor ?? 'default'}
      data-valign={valign}
      colSpan={(node.attrs?.colspan as number | null) ?? 1}
      rowSpan={(node.attrs?.rowspan as number | null) ?? 1}
    >
      <div
        className={cn(
          defaultClasses.tableCell,
          backgroundColor?.bgClass,
          align === 'left' && 'justify-start',
          align === 'center' && 'justify-center',
          align === 'right' && 'justify-end',
          valign === 'top' && 'items-start',
          valign === 'bottom' && 'items-end',
          hasOverride && 'justify-end font-medium tabular-nums'
        )}
      >
        {hasOverride ? (
          override
        ) : (
          <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
        )}
      </div>
    </td>
  );
};
