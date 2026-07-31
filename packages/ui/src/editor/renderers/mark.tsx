import { JSONContent } from '@tiptap/core';
import { Fragment } from 'react';

import { defaultClasses } from '@colanode/ui/editor/classes';

interface MarkRendererProps {
  node: JSONContent;
  children: React.ReactNode | React.ReactNode[];
}

export const MarkRenderer = ({ node, children }: MarkRendererProps) => {
  let result = <Fragment>{children}</Fragment>;

  if (node.marks && node.marks.length > 0) {
    node.marks.forEach((mark) => {
      if (mark.type === 'bold') {
        result = <strong>{result}</strong>;
      } else if (mark.type === 'italic') {
        result = <em>{result}</em>;
      } else if (mark.type === 'underline') {
        result = <u>{result}</u>;
      } else if (mark.type === 'strike') {
        result = <s>{result}</s>;
      } else if (mark.type === 'code') {
        result = <code className={defaultClasses.code}>{result}</code>;
      } else if (mark.type === 'color' && mark.attrs?.color) {
        result = (
          <span className={`text-${mark.attrs.color}-600`}>{result}</span>
        );
      } else if (mark.type === 'highlight' && mark.attrs?.highlight) {
        result = (
          <span className={`bg-${mark.attrs.highlight}-200`}>{result}</span>
        );
      } else if (mark.type === 'link' && mark.attrs?.href) {
        // No target: a link follows in place, and ctrl/cmd-click (or a middle
        // click) opens a new tab the way it does everywhere else. Forcing
        // _blank took that choice away and left a trail of tabs behind.
        result = (
          <a
            href={mark.attrs.href}
            className={defaultClasses.link}
            rel="noreferrer"
          >
            {result}
          </a>
        );
      }
    });
  }

  return result;
};
