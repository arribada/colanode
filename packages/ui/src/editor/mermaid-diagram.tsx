import mermaid from 'mermaid';
import { useEffect, useId, useState } from 'react';

import { cn } from '@colanode/ui/lib/utils';

// Mermaid pulls in a large parser/renderer bundle, so like KaTeX it must only
// ever be reached through a dynamic import (see mermaid-render.tsx). This
// module statically imports the `mermaid` package.
let initialized = false;
const ensureInitialized = (): void => {
  if (initialized) {
    return;
  }
  mermaid.initialize({
    startOnLoad: false,
    // Render only from the user's own diagram source; never execute embedded
    // scripts / click handlers.
    securityLevel: 'strict',
    theme: 'default',
    fontFamily: 'inherit',
  });
  initialized = true;
};

interface MermaidDiagramProps {
  source: string;
  className?: string;
}

// Renders a Mermaid diagram source to inline SVG. Invalid syntax never throws:
// it renders a compact error panel with the parser message instead.
export const MermaidDiagram = ({ source, className }: MermaidDiagramProps) => {
  const [svg, setSvg] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const rawId = useId();
  // Mermaid needs a DOM-id-safe render id (React's useId contains ':').
  const renderId = `mermaid-${rawId.replace(/[^a-zA-Z0-9-]/g, '')}`;

  useEffect(() => {
    let cancelled = false;
    const trimmed = source.trim();
    if (trimmed.length === 0) {
      setSvg(null);
      setError(null);
      return;
    }

    ensureInitialized();

    const run = async () => {
      try {
        // parse() validates syntax and throws with a readable message.
        await mermaid.parse(trimmed);
        const { svg: rendered } = await mermaid.render(renderId, trimmed);
        if (!cancelled) {
          setSvg(rendered);
          setError(null);
        }
      } catch (e) {
        if (!cancelled) {
          setSvg(null);
          setError(e instanceof Error ? e.message : 'Invalid diagram syntax');
        }
      }
    };

    void run();

    return () => {
      cancelled = true;
    };
  }, [source, renderId]);

  if (error) {
    return (
      <div
        className={cn(
          'w-full rounded-md border border-destructive/40 bg-destructive/5 p-3 text-left text-sm text-destructive',
          className
        )}
      >
        <p className="font-medium">Diagram error</p>
        <pre className="mt-1 whitespace-pre-wrap break-words font-mono text-xs">
          {error}
        </pre>
      </div>
    );
  }

  if (svg === null) {
    return (
      <span className={cn('font-mono text-sm text-muted-foreground', className)}>
        Rendering diagram…
      </span>
    );
  }

  return (
    <div
      className={cn(
        'flex w-full justify-center overflow-x-auto rounded-md bg-white p-3',
        className
      )}
      // Trusted: mermaid produces this SVG from the user's own source with
      // securityLevel 'strict' (no scripts / click handlers executed).
      dangerouslySetInnerHTML={{ __html: svg }}
    />
  );
};
