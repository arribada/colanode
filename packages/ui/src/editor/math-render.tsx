import { Suspense, lazy } from 'react';

import { cn } from '@colanode/ui/lib/utils';

interface MathRenderProps {
  latex: string;
  display: boolean;
  className?: string;
}

// KaTeX is ~270KB minified, too heavy to ship in the main editor bundle for
// the (common) case where a document has no math nodes at all. The real
// renderer lives in katex-render.tsx and is only fetched — once, then cached
// by the module loader — the first time a math node actually renders, the
// same pattern used for the whiteboard canvas (see
// components/whiteboards/whiteboard-container.tsx).
const KatexRender = lazy(() =>
  import('@colanode/ui/editor/katex-render').then((module) => ({
    default: module.KatexRender,
  }))
);

// Renders a LaTeX string with KaTeX. Invalid input never throws: KaTeX is
// configured with throwOnError false and any residual parse error falls back
// to showing the raw source.
export const MathRender = ({ latex, display, className }: MathRenderProps) => {
  const hasLatex = latex.trim().length > 0;

  if (!hasLatex) {
    return (
      <span
        className={cn(
          'select-none rounded bg-muted px-1.5 py-0.5 text-sm text-muted-foreground',
          className
        )}
      >
        New equation
      </span>
    );
  }

  return (
    <Suspense
      fallback={
        <span
          className={cn('font-mono text-sm text-muted-foreground', className)}
        >
          {latex}
        </span>
      }
    >
      <KatexRender latex={latex} display={display} className={className} />
    </Suspense>
  );
};
