// ABOUTME: Slash-menu "page template" commands — insert a ready-made document
// ABOUTME: scaffold (meeting notes, spec) at the cursor, like the ADR command.
import { JSONContent } from '@tiptap/core';
import { CalendarCheck, FileText } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

const paragraph = (text = ''): JSONContent => ({
  type: 'paragraph',
  content: text.length > 0 ? [{ type: 'text', text }] : [],
});

const heading = (text: string): JSONContent => ({
  type: 'heading3',
  content: [{ type: 'text', text }],
});

const bullets = (items: string[]): JSONContent => ({
  type: 'bulletList',
  content: items.map((text) => ({
    type: 'listItem',
    content: [paragraph(text)],
  })),
});

const tasks = (items: string[]): JSONContent => ({
  type: 'taskList',
  content: items.map((text) => ({
    type: 'taskItem',
    attrs: { checked: false },
    content: [paragraph(text)],
  })),
});

const template =
  (blocks: JSONContent[]): EditorCommand['handler'] =>
  ({ editor, range }) => {
    editor.chain().focus().deleteRange(range).insertContent(blocks).run();
  };

export const MeetingNotesCommand: EditorCommand = {
  key: 'meeting-notes',
  name: 'Meeting notes',
  description: 'Attendees, agenda, decisions and action items',
  keywords: ['meeting', 'notes', 'minutes', 'agenda', 'standup', 'template'],
  icon: CalendarCheck,
  group: 'other',
  disabled: false,
  handler: template([
    heading('Attendees'),
    paragraph(''),
    heading('Agenda'),
    bullets(['', '']),
    heading('Notes'),
    paragraph(''),
    heading('Decisions'),
    bullets(['']),
    heading('Action items'),
    tasks(['', '']),
  ]),
};

export const SpecCommand: EditorCommand = {
  key: 'spec',
  name: 'Spec / PRD',
  description: 'Problem, goals, proposal, risks and rollout',
  keywords: ['spec', 'prd', 'proposal', 'design', 'requirements', 'template'],
  icon: FileText,
  group: 'other',
  disabled: false,
  handler: template([
    heading('Problem'),
    paragraph('What are we solving, and for whom?'),
    heading('Goals'),
    bullets(['']),
    heading('Non-goals'),
    bullets(['']),
    heading('Proposal'),
    paragraph(''),
    heading('Risks & open questions'),
    bullets(['']),
    heading('Rollout'),
    tasks(['']),
  ]),
};
