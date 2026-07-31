import { JSONContent } from '@tiptap/core';

import { MermaidRender } from '@colanode/ui/editor/mermaid-render';

interface MermaidRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

export const MermaidRenderer = ({ node }: MermaidRendererProps) => {
  const source = (node.attrs?.source as string | null) ?? '';

  return (
    <div
      data-type="mermaid"
      className="my-1 flex w-full justify-center overflow-x-auto px-3 py-2"
    >
      <MermaidRender source={source} />
    </div>
  );
};
