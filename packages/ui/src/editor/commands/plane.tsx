import { FolderKanban, GanttChartSquare } from 'lucide-react';

import { EditorCommand } from '@colanode/client/types';

export const PlaneCommand: EditorCommand = {
  key: 'plane',
  name: 'Plane project',
  description: 'Embed links to a Plane project (read-only)',
  keywords: [
    'plane',
    'projet',
    'project',
    'board',
    'tableau',
    'kanban',
    'issues',
    'taches',
    'tasks',
    'liens',
  ],
  icon: FolderKanban,
  group: 'embeds',
  disabled: false,
  handler: ({ editor, range }) => {
    // Insert with an empty projectId — the block itself renders a project
    // picker (mirrors how /embed and /bookmark insert an empty block that
    // then prompts for its URL). Read-only: the block only ever links out.
    editor.chain().focus().deleteRange(range).setPlaneEmbed().run();
  },
};

// Same read-only Plane embed, inserted straight into timeline (Gantt) mode.
// Once a project is picked the block draws each scheduled issue as a bar from
// its start date to its target date; the mode can still be toggled in-place.
export const PlaneTimelineCommand: EditorCommand = {
  key: 'plane-timeline',
  name: 'Plane timeline',
  description: 'Embed a Plane project as a Gantt timeline (read-only)',
  keywords: [
    'plane',
    'timeline',
    'gantt',
    'chronologie',
    'planning',
    'roadmap',
    'schedule',
    'calendrier',
    'project',
    'projet',
  ],
  icon: GanttChartSquare,
  group: 'embeds',
  disabled: false,
  handler: ({ editor, range }) => {
    editor
      .chain()
      .focus()
      .deleteRange(range)
      .setPlaneEmbed('', 'timeline')
      .run();
  },
};
