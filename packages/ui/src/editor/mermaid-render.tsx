import { Suspense, lazy } from 'react';

import { cn } from '@colanode/ui/lib/utils';

// Mermaid (parser + renderer) is heavy, too heavy to ship in the main editor
// bundle for the common case where a document has no diagram at all. The real
// renderer lives in mermaid-diagram.tsx and is only fetched — once, then
// cached by the module loader — the first time a mermaid node actually
// renders. Same lazy pattern as math-render.tsx / KaTeX.
const MermaidDiagram = lazy(() =>
  import('@colanode/ui/editor/mermaid-diagram').then((module) => ({
    default: module.MermaidDiagram,
  }))
);

interface MermaidRenderProps {
  source: string;
  className?: string;
}

export const MermaidRender = ({ source, className }: MermaidRenderProps) => {
  const hasSource = source.trim().length > 0;

  if (!hasSource) {
    return (
      <span
        className={cn(
          'select-none rounded bg-muted px-1.5 py-0.5 text-sm text-muted-foreground',
          className
        )}
      >
        New diagram
      </span>
    );
  }

  return (
    <Suspense
      fallback={
        <span
          className={cn('font-mono text-sm text-muted-foreground', className)}
        >
          Rendering diagram…
        </span>
      }
    >
      <MermaidDiagram source={source} className={className} />
    </Suspense>
  );
};
