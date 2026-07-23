import { eq, useLiveQuery } from '@tanstack/react-db';
import { Trash2 } from 'lucide-react';

import { LocalSpaceNode } from '@colanode/client/types';
import { SidebarHeader } from '@colanode/ui/components/layouts/sidebars/sidebar-header';
import { SidebarSettingsItem } from '@colanode/ui/components/layouts/sidebars/sidebar-settings-item';
import { SpaceCreateButton } from '@colanode/ui/components/spaces/space-create-button';
import { SpaceSidebarItem } from '@colanode/ui/components/spaces/space-sidebar-item';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

export const SidebarSpaces = () => {
  const workspace = useWorkspace();
  const canCreateSpace =
    workspace.role !== 'guest' && workspace.role !== 'none';

  const spaceListQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.type, 'space'))
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId]
  );

  const spaces = spaceListQuery.data.map((node) => node as LocalSpaceNode);

  return (
    <div className="flex flex-col group/sidebar h-full px-2">
      <SidebarHeader
        title="Spaces"
        actions={canCreateSpace && <SpaceCreateButton />}
      />
      <div className="flex w-full min-w-0 flex-col gap-1">
        {spaces.map((space) => (
          <SpaceSidebarItem space={space} key={space.id} />
        ))}
      </div>
      <div className="mt-auto flex w-full min-w-0 flex-col gap-1 pb-2 pt-4">
        <Link
          from="/workspace/$userId"
          to="trash"
          activeProps={{ 'aria-current': 'page' }}
        >
          {({ isActive }) => (
            <SidebarSettingsItem
              title="Trash"
              icon={Trash2}
              isActive={isActive}
            />
          )}
        </Link>
      </div>
    </div>
  );
};
