import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';

interface ToggleRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const ToggleRenderer = ({ node, keyPrefix }: ToggleRendererProps) => {
  return (
    <div data-type="toggle" data-open="true" className={defaultClasses.toggle}>
      <div className={defaultClasses.toggleInner}>
        <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
      </div>
    </div>
  );
};
