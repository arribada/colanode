import { EditorCommand, EditorCommandProps } from '@colanode/client/types';
import { CreateAdrCommand } from '@colanode/ui/editor/commands/adr';
import { AiCommand } from '@colanode/ui/editor/commands/ai';
import { BlockquoteCommand } from '@colanode/ui/editor/commands/blockquote';
import { BookmarkCommand } from '@colanode/ui/editor/commands/bookmark';
import { BulletListCommand } from '@colanode/ui/editor/commands/bullet-list';
import { CalloutCommand } from '@colanode/ui/editor/commands/callout';
import { ChartCommand } from '@colanode/ui/editor/commands/chart';
import { CodeBlockCommand } from '@colanode/ui/editor/commands/code-block';
import { ColumnsCommand } from '@colanode/ui/editor/commands/columns';
import { DatabaseCommand } from '@colanode/ui/editor/commands/database';
import { DatabaseInlineCommand } from '@colanode/ui/editor/commands/database-inline';
import { DatabaseLinkCommand } from '@colanode/ui/editor/commands/database-link';
import { DividerCommand } from '@colanode/ui/editor/commands/divider';
import { EmbedCommand } from '@colanode/ui/editor/commands/embed';
import { FileCommand } from '@colanode/ui/editor/commands/file';
import { FolderCommand } from '@colanode/ui/editor/commands/folder';
import { GithubCommand } from '@colanode/ui/editor/commands/github';
import { Heading1Command } from '@colanode/ui/editor/commands/heading1';
import { Heading2Command } from '@colanode/ui/editor/commands/heading2';
import { Heading3Command } from '@colanode/ui/editor/commands/heading3';
import {
  MathBlockCommand,
  MathInlineCommand,
} from '@colanode/ui/editor/commands/math';
import { MermaidCommand } from '@colanode/ui/editor/commands/mermaid';
import { NumberHeadingsCommand } from '@colanode/ui/editor/commands/number-headings';
import { OrderedListCommand } from '@colanode/ui/editor/commands/ordered-list';
import { PageCommand } from '@colanode/ui/editor/commands/page';
import {
  MeetingNotesCommand,
  SpecCommand,
} from '@colanode/ui/editor/commands/page-templates';
import { ParagraphCommand } from '@colanode/ui/editor/commands/paragraph';
import { PlaneCommand } from '@colanode/ui/editor/commands/plane';
import { TableCommand } from '@colanode/ui/editor/commands/table';
import { TableOfContentsCommand } from '@colanode/ui/editor/commands/table-of-contents';
import { TodoCommand } from '@colanode/ui/editor/commands/todo';
import { ToggleCommand } from '@colanode/ui/editor/commands/toggle';
import { WhiteboardCommand } from '@colanode/ui/editor/commands/whiteboard';

export type { EditorCommand, EditorCommandProps };

export {
  AiCommand,
  BlockquoteCommand,
  BulletListCommand,
  CalloutCommand,
  BookmarkCommand,
  EmbedCommand,
  PlaneCommand,
  ColumnsCommand,
  ChartCommand,
  GithubCommand,
  TableOfContentsCommand,
  CodeBlockCommand,
  DividerCommand,
  FileCommand,
  FolderCommand,
  Heading1Command,
  Heading2Command,
  Heading3Command,
  NumberHeadingsCommand,
  CreateAdrCommand,
  MeetingNotesCommand,
  SpecCommand,
  MathBlockCommand,
  MathInlineCommand,
  MermaidCommand,
  OrderedListCommand,
  PageCommand,
  ParagraphCommand,
  TableCommand,
  TodoCommand,
  ToggleCommand,
  DatabaseCommand,
  DatabaseInlineCommand,
  DatabaseLinkCommand,
  WhiteboardCommand,
};
