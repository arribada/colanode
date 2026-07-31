import { JSONContent } from '@tiptap/core';

import { MathRender } from '@colanode/ui/editor/math-render';

interface MathInlineRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const MathInlineRenderer = ({ node }: MathInlineRendererProps) => {
  const latex = (node.attrs?.latex as string | null) ?? '';

  return (
    <span data-type="math-inline">
      <MathRender latex={latex} display={false} />
    </span>
  );
};
