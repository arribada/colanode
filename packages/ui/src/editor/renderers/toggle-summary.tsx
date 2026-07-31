import { JSONContent } from '@tiptap/core';

import { defaultClasses } from '@colanode/ui/editor/classes';
import { NodeChildrenRenderer } from '@colanode/ui/editor/renderers/node-children';

interface ToggleSummaryRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const ToggleSummaryRenderer = ({
  node,
  keyPrefix,
}: ToggleSummaryRendererProps) => {
  return (
    <div data-type="toggle-summary" className={defaultClasses.toggleSummary}>
      <NodeChildrenRenderer node={node} keyPrefix={keyPrefix} />
    </div>
  );
};
