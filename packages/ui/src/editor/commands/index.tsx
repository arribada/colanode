import { EditorCommand, EditorCommandProps } from '@colanode/client/types';
import { BlockquoteCommand } from '@colanode/ui/editor/commands/blockquote';
import { BulletListCommand } from '@colanode/ui/editor/commands/bullet-list';
import { BookmarkCommand } from '@colanode/ui/editor/commands/bookmark';
import { EmbedCommand } from '@colanode/ui/editor/commands/embed';
import { CalloutCommand } from '@colanode/ui/editor/commands/callout';
import { ColumnsCommand } from '@colanode/ui/editor/commands/columns';
import { CodeBlockCommand } from '@colanode/ui/editor/commands/code-block';
import { DatabaseCommand } from '@colanode/ui/editor/commands/database';
import { DatabaseInlineCommand } from '@colanode/ui/editor/commands/database-inline';
import { DatabaseLinkCommand } from '@colanode/ui/editor/commands/database-link';
import { DividerCommand } from '@colanode/ui/editor/commands/divider';
import { FileCommand } from '@colanode/ui/editor/commands/file';
import { FolderCommand } from '@colanode/ui/editor/commands/folder';
import { Heading1Command } from '@colanode/ui/editor/commands/heading1';
import { Heading2Command } from '@colanode/ui/editor/commands/heading2';
import { Heading3Command } from '@colanode/ui/editor/commands/heading3';
import {
  MathBlockCommand,
  MathInlineCommand,
} from '@colanode/ui/editor/commands/math';
import { OrderedListCommand } from '@colanode/ui/editor/commands/ordered-list';
import { PageCommand } from '@colanode/ui/editor/commands/page';
import { ParagraphCommand } from '@colanode/ui/editor/commands/paragraph';
import { TableOfContentsCommand } from '@colanode/ui/editor/commands/table-of-contents';
import { TableCommand } from '@colanode/ui/editor/commands/table';
import { TodoCommand } from '@colanode/ui/editor/commands/todo';
import { ToggleCommand } from '@colanode/ui/editor/commands/toggle';

export type { EditorCommand, EditorCommandProps };

export {
  BlockquoteCommand,
  BulletListCommand,
  CalloutCommand,
  BookmarkCommand,
  EmbedCommand,
  ColumnsCommand,
  TableOfContentsCommand,
  CodeBlockCommand,
  DividerCommand,
  FileCommand,
  FolderCommand,
  Heading1Command,
  Heading2Command,
  Heading3Command,
  MathBlockCommand,
  MathInlineCommand,
  OrderedListCommand,
  PageCommand,
  ParagraphCommand,
  TableCommand,
  TodoCommand,
  ToggleCommand,
  DatabaseCommand,
  DatabaseInlineCommand,
  DatabaseLinkCommand,
};
