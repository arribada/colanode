// ABOUTME: The caption field under a figure or a table: a box that wraps a long
// ABOUTME: caption onto as many lines as it needs instead of hiding it.
import { useEffect, useRef } from 'react';

import { cn } from '@colanode/ui/lib/utils';

interface CaptionFieldProps {
  value: string;
  placeholder: string;
  autoFocus?: boolean;
  className?: string;
  onChange: (value: string) => void;
}

export const CaptionField = ({
  value,
  placeholder,
  autoFocus,
  className,
  onChange,
}: CaptionFieldProps) => {
  const ref = useRef<HTMLTextAreaElement>(null);

  // A caption used to be a single-line input: past its width the text scrolled
  // out of sight, so a long caption could only be read a few words at a time.
  // A text box wraps, but it keeps whatever height it was given, so it is told
  // to be exactly as tall as the text it holds.
  useEffect(() => {
    const field = ref.current;
    if (!field) {
      return;
    }

    field.style.height = 'auto';
    field.style.height = `${field.scrollHeight}px`;
  }, [value]);

  return (
    <textarea
      ref={ref}
      // eslint-disable-next-line jsx-a11y/no-autofocus -- focus the caption right after "Add caption"
      autoFocus={autoFocus}
      rows={1}
      value={value}
      placeholder={placeholder}
      // One run of text: a line break of its own would print as a broken line.
      onKeyDown={(event) => {
        if (event.key === 'Enter') {
          event.preventDefault();
        }
      }}
      onPointerDown={(event) => event.stopPropagation()}
      onChange={(event) => onChange(event.target.value.replace(/\n/g, ' '))}
      // What the PDF export reads. A text box holds its text as a property, so
      // the markup the export is handed would otherwise carry the caption the
      // field was mounted with, not the one on screen.
      data-caption={value}
      className={cn(
        'w-full resize-none overflow-hidden border-none bg-transparent p-0 italic leading-5 outline-none placeholder:not-italic placeholder:text-muted-foreground',
        className
      )}
    />
  );
};
