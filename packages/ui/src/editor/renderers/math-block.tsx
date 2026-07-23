import { JSONContent } from '@tiptap/core';

import { MathRender } from '@colanode/ui/editor/math-render';

interface MathBlockRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const MathBlockRenderer = ({ node }: MathBlockRendererProps) => {
  const latex = (node.attrs?.latex as string | null) ?? '';

  return (
    <div
      data-type="math-block"
      className="my-1 flex w-full justify-center overflow-x-auto px-3 py-2"
    >
      <MathRender latex={latex} display={true} />
    </div>
  );
};
