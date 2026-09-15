import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';

interface Heading4RendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const Heading4Renderer = ({
  node,
  keyPrefix,
}: Heading4RendererProps) => {
  return (
    <h4 className={defaultClasses.heading4}>
      <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
    </h4>
  );
};
