// ABOUTME: The menu entries of the project template: "New project" in the
// ABOUTME: projects space and on its pages, "Align with the project template".
import { FolderKanban, LayoutTemplate } from 'lucide-react';

import { LocalPageNode } from '@colanode/client/types';
import { DropdownMenuItem } from '@colanode/ui/components/ui/dropdown-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useQuery } from '@colanode/ui/hooks/use-query';

// The space projects live in, or null when the template is not enabled.
// One cached answer shared by every menu, refreshed every few minutes.
export const useProjectsSpaceId = (): string | null => {
  const workspace = useWorkspace();
  const query = useQuery(
    { type: 'project.parents.list', userId: workspace.userId },
    { staleTime: 5 * 60_000, retry: false }
  );
  return query.data?.[0]?.spaceId ?? null;
};

interface ProjectCreateMenuItemProps {
  // The space whose menu this is, or the space of the page whose menu it is.
  spaceId: string;
  label?: string;
  onSelect: () => void;
}

export const ProjectCreateMenuItem = ({
  spaceId,
  label = 'New project',
  onSelect,
}: ProjectCreateMenuItemProps) => {
  const projectsSpaceId = useProjectsSpaceId();
  if (!projectsSpaceId || projectsSpaceId !== spaceId) {
    return null;
  }

  return (
    <DropdownMenuItem
      onSelect={onSelect}
      className="flex flex-row items-center gap-2 cursor-pointer"
    >
      <FolderKanban className="size-4" />
      <span>{label}</span>
    </DropdownMenuItem>
  );
};

interface ProjectAlignMenuItemProps {
  page: LocalPageNode;
  canEdit: boolean;
  onSelect: () => void;
}

// Offered on the pages of the projects space that are not one of a
// project's template pages. On a project page it says which project it is
// and aligns it again, which adds whatever the template gained since.
export const ProjectAlignMenuItem = ({
  page,
  canEdit,
  onSelect,
}: ProjectAlignMenuItemProps) => {
  const projectsSpaceId = useProjectsSpaceId();
  if (!projectsSpaceId || page.rootId !== projectsSpaceId || page.projectRole) {
    return null;
  }

  return (
    <DropdownMenuItem
      className="flex items-center gap-2 cursor-pointer"
      disabled={!canEdit}
      onClick={() => {
        if (canEdit) {
          onSelect();
        }
      }}
    >
      <LayoutTemplate className="size-4" />
      {page.projectCode
        ? `Project ${page.projectCode}: align again`
        : 'Align with the project template'}
    </DropdownMenuItem>
  );
};
