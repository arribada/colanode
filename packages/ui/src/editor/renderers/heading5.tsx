import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';

interface Heading5RendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const Heading5Renderer = ({
  node,
  keyPrefix,
}: Heading5RendererProps) => {
  return (
    <h5 className={defaultClasses.heading5}>
      <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
    </h5>
  );
};
