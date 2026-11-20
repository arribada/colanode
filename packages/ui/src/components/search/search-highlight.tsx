// ABOUTME: Text with the parts a search matched marked in yellow, for result titles,
// ABOUTME: excerpts and the passages of the preview panel.
import { Fragment, ReactNode } from 'react';

import { SearchTextRange } from '@colanode/core';
import { cn } from '@colanode/ui/lib/utils';

interface SearchHighlightProps {
  text: string;
  ranges: SearchTextRange[];
  className?: string;
}

export const SearchHighlight = ({
  text,
  ranges,
  className,
}: SearchHighlightProps) => {
  const pieces: ReactNode[] = [];
  let cursor = 0;
  for (const range of [...ranges].sort((a, b) => a.start - b.start)) {
    const start = Math.max(range.start, cursor);
    const end = Math.min(range.end, text.length);
    if (end <= start) {
      continue;
    }
    if (start > cursor) {
      pieces.push(text.slice(cursor, start));
    }
    pieces.push(
      <mark
        key={start}
        className="rounded-[2px] bg-yellow-200 px-px text-inherit dark:bg-yellow-500/40"
      >
        {text.slice(start, end)}
      </mark>
    );
    cursor = end;
  }
  if (cursor < text.length) {
    pieces.push(text.slice(cursor));
  }

  return (
    <span className={cn(className)}>
      {pieces.map((piece, index) => (
        <Fragment key={index}>{piece}</Fragment>
      ))}
    </span>
  );
};
