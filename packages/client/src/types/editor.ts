import { Editor, type Range } from '@tiptap/core';
import { FC } from 'react';

export type EditorCommandProps = {
  editor: Editor;
  range: Range;
  context: EditorContext | null;
};

export type EditorContext = {
  userId: string;
  documentId: string;
  accountId: string;
  workspaceId: string;
  rootId: string;
  // Opens the inline-database creation modal (name + properties) instead of
  // creating a database silently. Provided by the document editor.
  onCreateInlineDatabase?: () => void;
};

// Slash-menu section a command belongs to. Every command declares its own group
// (see EditorCommand.group), so a newly added command lands in the right section
// without touching a central map. `other` is the trailing catch-all.
export type EditorCommandGroup =
  | 'ai'
  | 'basic'
  | 'layout'
  | 'media'
  | 'embeds'
  | 'database'
  | 'pages'
  | 'other';

export type EditorCommandGroupDefinition = {
  key: EditorCommandGroup;
  label: string;
};

// Slash-menu sections in display order, with the labels rendered as uppercase
// section headers. The commander buckets commands by `EditorCommand.group` and
// renders sections in this order, hiding any that end up empty after filtering.
export const EDITOR_COMMAND_GROUPS: EditorCommandGroupDefinition[] = [
  { key: 'ai', label: 'AI' },
  { key: 'basic', label: 'Basic blocks' },
  { key: 'layout', label: 'Layout' },
  { key: 'media', label: 'Media' },
  { key: 'embeds', label: 'Embeds' },
  { key: 'database', label: 'Database' },
  { key: 'pages', label: 'Pages & files' },
  { key: 'other', label: 'Other' },
];

export type EditorCommand = {
  key: string;
  name: string;
  description: string;
  keywords?: string[];
  icon: FC<React.SVGProps<SVGSVGElement>>;
  group: EditorCommandGroup;
  handler: (props: EditorCommandProps) => void | Promise<void>;
  disabled?: boolean;
};
