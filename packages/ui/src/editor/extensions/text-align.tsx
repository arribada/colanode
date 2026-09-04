// ABOUTME: Editor extension adding text alignment (left/center/right/justify)
// ABOUTME: to paragraphs and headings, rendered as an inline text-align style.
import { Extension } from '@tiptap/core';

export type TextAlignValue = 'left' | 'center' | 'right' | 'justify';

export const TEXT_ALIGNMENTS: TextAlignValue[] = [
  'left',
  'center',
  'right',
  'justify',
];

const TEXT_ALIGN_TYPES = ['paragraph', 'heading'];

declare module '@tiptap/core' {
  interface Commands<ReturnType> {
    textAlign: {
      setTextAlign: (align: TextAlignValue) => ReturnType;
      unsetTextAlign: () => ReturnType;
    };
  }
}

export const TextAlignExtension = Extension.create({
  name: 'textAlign',

  addGlobalAttributes() {
    return [
      {
        types: TEXT_ALIGN_TYPES,
        attributes: {
          textAlign: {
            default: null,
            parseHTML: (element: HTMLElement) => {
              const align = element.style.textAlign;
              return align &&
                TEXT_ALIGNMENTS.includes(align as TextAlignValue)
                ? align
                : null;
            },
            renderHTML: (attributes: Record<string, unknown>) => {
              const align = attributes.textAlign as string | null;
              // 'left' is the default flow direction, so don't emit a style for
              // it — keeps clean documents and lets the theme/rtl decide.
              if (!align || align === 'left') {
                return {};
              }
              return { style: `text-align: ${align}` };
            },
          },
        },
      },
    ];
  },

  addCommands() {
    return {
      setTextAlign:
        (align: TextAlignValue) =>
        ({ commands }) => {
          if (!TEXT_ALIGNMENTS.includes(align)) {
            return false;
          }
          return TEXT_ALIGN_TYPES.map((type) =>
            commands.updateAttributes(type, { textAlign: align })
          ).some((applied) => applied);
        },
      unsetTextAlign:
        () =>
        ({ commands }) => {
          return TEXT_ALIGN_TYPES.map((type) =>
            commands.resetAttributes(type, 'textAlign')
          ).some((applied) => applied);
        },
    };
  },
});