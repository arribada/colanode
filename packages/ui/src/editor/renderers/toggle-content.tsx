import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';

interface ToggleContentRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const ToggleContentRenderer = ({
  node,
  keyPrefix,
}: ToggleContentRendererProps) => {
  return (
    <div data-type="toggle-content" className={defaultClasses.toggleContent}>
      <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
    </div>
  );
};
