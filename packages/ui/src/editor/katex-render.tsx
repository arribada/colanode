import 'katex/dist/katex.min.css';

import katex from 'katex';
import { useMemo } from 'react';

import { cn } from '@colanode/ui/lib/utils';

interface KatexRenderProps {
  latex: string;
  display: boolean;
  className?: string;
}

// The actual KaTeX-dependent renderer. This module statically imports
// `katex` (and its CSS), so it must only ever be reached through a dynamic
// import — see math-render.tsx, which lazy-loads it so documents without any
// math nodes never pay for the ~270KB KaTeX chunk.
export const KatexRender = ({ latex, display, className }: KatexRenderProps) => {
  const html = useMemo(() => {
    try {
      return katex.renderToString(latex, {
        displayMode: display,
        throwOnError: false,
        strict: 'ignore',
      });
    } catch {
      return null;
    }
  }, [latex, display]);

  if (html === null) {
    return (
      <span
        className={cn('font-mono text-sm text-destructive', className)}
        title="Invalid LaTeX"
      >
        {latex}
      </span>
    );
  }

  return (
    <span
      className={className}
      // KaTeX output is generated from escaped LaTeX source and is safe.
      dangerouslySetInnerHTML={{ __html: html }}
    />
  );
};
