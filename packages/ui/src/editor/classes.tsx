export const defaultClasses = {
  heading1: 'mb-1 mt-4 font-heading text-4xl font-bold group',
  heading2:
    'mb-px mt-3 font-heading text-2xl font-semibold tracking-tight group',
  heading3:
    'mb-px mt-2 font-heading text-xl font-semibold tracking-tight group',
  paragraph: 'm-0 px-0 py-1',
  bulletList: 'm-0 ps-6 list-disc [&_ul]:list-[circle] [&_ul_ul]:list-[square]',
  orderedList: 'm-0 ps-6 list-decimal',
  listItem: 'ml-2',
  codeBlock:
    'overflow-x-auto rounded-md bg-muted px-3 py-2 my-1 font-mono text-sm leading-[normal] [tab-size:2]',
  codeBlockHeader:
    'flex flex-row items-center justify-between text-muted-foreground font-sans border-b pb-2 mb-2 text-xs',
  code: 'whitespace-pre-wrap rounded-md bg-muted px-[0.3em] py-[0.2em] font-mono text-sm',
  blockquote: 'p-2 my-1 border-l-4 border-border bg-muted',
  taskList: 'not-prose pl-2',
  taskItem: 'flex items-start my-1',
  link: 'font-medium underline underline-offset-4 cursor-pointer',
  gif: 'max-h-72 my-1',
  emoji: 'max-h-5 max-w-5 h-5 w-5 px-0.5 mb-1 inline-block',
  dropcursor: 'text-primary-foreground bg-blue-500',
  mention:
    'inline-flex flex-row items-center gap-1 rounded-md bg-muted px-0.5 py-0',
  table: 'w-full',
  tableRow: 'min-w-full',
  tableCellWrapper: 'border',
  tableCell: 'flex p-1 px-2 items-center',
  tableHeaderWrapper: 'border',
  tableHeader: 'flex p-1 px-2 items-center font-semibold',
  toggle: 'my-1 flex flex-row items-start gap-1',
  toggleButton:
    'mt-1.5 ml-4 flex size-5 shrink-0 cursor-pointer items-center justify-center rounded text-muted-foreground hover:bg-accent',
  toggleInner: 'min-w-0 flex-1',
  toggleSummary: 'py-1 font-medium',
  toggleContent: 'pb-0.5',
  callout: 'my-1 flex flex-row items-start gap-2 rounded-md p-3',
  headingNumber:
    'mr-2 font-normal text-muted-foreground select-none tabular-nums',
  headingChevron:
    'inline-flex size-5 mr-1 shrink-0 items-center justify-center rounded align-middle text-muted-foreground opacity-0 transition-opacity cursor-pointer select-none hover:bg-accent group-hover:opacity-100',
  headingChevronCollapsed: 'opacity-100',
  headingCollapsedHidden: 'hidden',
};

export const calloutColors = [
  { value: 'default', label: 'Default', class: 'bg-muted' },
  { value: 'gray', label: 'Gray', class: 'bg-gray-100 dark:bg-gray-800/60' },
  { value: 'blue', label: 'Blue', class: 'bg-blue-100 dark:bg-blue-950/50' },
  {
    value: 'green',
    label: 'Green',
    class: 'bg-green-100 dark:bg-green-950/50',
  },
  {
    value: 'yellow',
    label: 'Yellow',
    class: 'bg-yellow-100 dark:bg-yellow-950/50',
  },
  {
    value: 'orange',
    label: 'Orange',
    class: 'bg-orange-100 dark:bg-orange-950/50',
  },
  { value: 'red', label: 'Red', class: 'bg-red-100 dark:bg-red-950/50' },
  {
    value: 'purple',
    label: 'Purple',
    class: 'bg-purple-100 dark:bg-purple-950/50',
  },
  { value: 'pink', label: 'Pink', class: 'bg-pink-100 dark:bg-pink-950/50' },
];

export const getCalloutColorClass = (color: string | null | undefined) => {
  const calloutColor = calloutColors.find((c) => c.value === color);
  return calloutColor?.class ?? 'bg-muted';
};
