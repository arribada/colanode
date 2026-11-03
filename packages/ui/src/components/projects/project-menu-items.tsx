// ABOUTME: The menu entries of the project template: "New project" in the
// ABOUTME: projects space and on its pages, "Align with the project template".
import { Columns3, FolderKanban, LayoutTemplate } from 'lucide-react';

import { LocalNode, LocalPageNode } from '@colanode/client/types';
import {
  PROJECT_LANE_LABELS,
  PROJECT_LANES,
  isProjectLane,
  resolveProjectLane,
  type ProjectLaneHolder,
} from '@colanode/core';
import {
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuRadioGroup,
  DropdownMenuRadioItem,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
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

// The kinds of node the project graph walks through under a project root.
const PROJECT_TREE_TYPES = new Set(['page', 'whiteboard', 'folder']);

const holderOf = (node: LocalNode): ProjectLaneHolder =>
  node.type === 'page'
    ? {
        projectCode: node.projectCode,
        projectRole: node.projectRole,
        projectLane: node.projectLane,
      }
    : {};

interface ProjectLaneMenuItemProps {
  page: LocalPageNode;
  // The page's breadcrumb, outermost first.
  chain: readonly LocalNode[];
  canEdit: boolean;
}

// On a page of a template project that is not one of the template's own
// pages: the column the project graph draws it in. Automatic is the column
// of the page above it, so only a page that belongs elsewhere needs a choice
// ("Field trial plan" under Hardware design goes to Verification).
export const ProjectLaneMenuItem = ({
  page,
  chain,
  canEdit,
}: ProjectLaneMenuItemProps) => {
  const ancestors = chain.filter((node) => node.id !== page.id);
  let rootIndex = -1;
  for (let i = ancestors.length - 1; i >= 0; i--) {
    const node = ancestors[i];
    if (node?.type === 'page' && node.projectCode) {
      rootIndex = i;
      break;
    }
  }
  if (rootIndex < 0 || page.projectCode) {
    return null;
  }
  const between = ancestors.slice(rootIndex);
  if (between.some((node) => !PROJECT_TREE_TYPES.has(node.type))) {
    return null;
  }
  const holders = between.map(holderOf);
  const current = resolveProjectLane([...holders, holderOf(page)]);
  if (!current || current.source === 'role') {
    return null;
  }
  const automatic = resolveProjectLane([...holders, {}]);
  const chosen = isProjectLane(page.projectLane) ? page.projectLane : null;

  return (
    <ProjectLaneSub
      pageId={page.id}
      code={current.code}
      label={PROJECT_LANE_LABELS[current.lane]}
      automaticLabel={PROJECT_LANE_LABELS[automatic?.lane ?? 'design']}
      value={chosen ?? 'auto'}
      canEdit={canEdit}
    />
  );
};

const ProjectLaneSub = ({
  pageId,
  code,
  label,
  automaticLabel,
  value,
  canEdit,
}: {
  pageId: string;
  code: string;
  label: string;
  automaticLabel: string;
  value: string;
  canEdit: boolean;
}) => {
  const workspace = useWorkspace();
  return (
    <DropdownMenuSub>
      <DropdownMenuSubTrigger
        disabled={!canEdit}
        className="gap-2"
        data-testid="project-lane-trigger"
      >
        <Columns3 className="size-4" />
        <span>Project column</span>
        <span className="ml-auto text-xs text-muted-foreground">{label}</span>
      </DropdownMenuSubTrigger>
      <DropdownMenuSubContent className="w-64">
        <DropdownMenuLabel className="text-xs font-normal text-muted-foreground">
          The column of {code}&apos;s project graph this page is drawn in.
        </DropdownMenuLabel>
        <DropdownMenuRadioGroup
          value={value}
          onValueChange={(next) => {
            if (!canEdit) {
              return;
            }
            const nodes = workspace.collections.nodes;
            if (!nodes.has(pageId)) {
              return;
            }
            nodes.update(pageId, (draft) => {
              if (draft.type !== 'page') {
                return;
              }
              draft.projectLane = isProjectLane(next) ? next : null;
            });
          }}
        >
          <DropdownMenuRadioItem value="auto">
            Automatic: {automaticLabel}, like the page above
          </DropdownMenuRadioItem>
          {PROJECT_LANES.map((lane) => (
            <DropdownMenuRadioItem key={lane} value={lane}>
              {PROJECT_LANE_LABELS[lane]}
            </DropdownMenuRadioItem>
          ))}
        </DropdownMenuRadioGroup>
      </DropdownMenuSubContent>
    </DropdownMenuSub>
  );
};
