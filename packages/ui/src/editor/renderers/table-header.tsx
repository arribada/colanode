import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface TableHeaderRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
  override?: string | null;
}

export const TableHeaderRenderer = ({
  node,
  keyPrefix,
  override,
}: TableHeaderRendererProps) => {
  const align = node.attrs?.align ?? 'left';
  const valign = node.attrs?.valign ?? 'middle';
  const backgroundColorAttr = node.attrs?.backgroundColor ?? null;
  const backgroundColor = backgroundColorAttr
    ? editorColors.find((color) => color.color === backgroundColorAttr)
    : null;
  const hasOverride = override !== null && override !== undefined;

  return (
    <th
      className={defaultClasses.tableHeaderWrapper}
      data-border-style={node.attrs?.borderStyle ?? 'default'}
      data-border-color={node.attrs?.borderColor ?? 'default'}
      data-valign={valign}
      colSpan={(node.attrs?.colspan as number | null) ?? 1}
      rowSpan={(node.attrs?.rowspan as number | null) ?? 1}
    >
      <div
        className={cn(
          'h-full w-full',
          defaultClasses.tableHeader,
          backgroundColor?.bgClass || 'bg-muted',
          align === 'left' && 'justify-start',
          align === 'center' && 'justify-center',
          align === 'right' && 'justify-end',
          valign === 'top' && 'items-start',
          valign === 'bottom' && 'items-end'
        )}
      >
        {hasOverride ? (
          override
        ) : (
          <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
        )}
      </div>
    </th>
  );
};
