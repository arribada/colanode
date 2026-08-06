import { Trash2 } from 'lucide-react';

import { SidebarFavorites } from '@colanode/ui/components/layouts/sidebars/sidebar-favorites';
import { SidebarHeader } from '@colanode/ui/components/layouts/sidebars/sidebar-header';
import { SidebarSettingsItem } from '@colanode/ui/components/layouts/sidebars/sidebar-settings-item';
import { SidebarSpacesSkeleton } from '@colanode/ui/components/layouts/sidebars/sidebar-spaces-skeleton';
import { SidebarTreeProvider } from '@colanode/ui/components/layouts/sidebars/sidebar-tree-provider';
import { SpaceCreateButton } from '@colanode/ui/components/spaces/space-create-button';
import { SpaceSidebarItem } from '@colanode/ui/components/spaces/space-sidebar-item';
import { Link } from '@colanode/ui/components/ui/link';
import { useSidebarTree } from '@colanode/ui/contexts/sidebar-tree';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const SidebarSpacesContent = () => {
  const workspace = useWorkspace();
  const tree = useSidebarTree();
  const canCreateSpace =
    workspace.role !== 'guest' && workspace.role !== 'none';

  return (
    <div className="flex flex-col group/sidebar h-full px-2">
      <SidebarFavorites />
      <SidebarHeader
        title="Spaces"
        actions={canCreateSpace && <SpaceCreateButton />}
      />
      <div className="flex w-full min-w-0 flex-col gap-1">
        {tree.isLoading ? (
          <SidebarSpacesSkeleton />
        ) : (
          tree.spaces.map((space) => (
            <SpaceSidebarItem space={space} key={space.id} />
          ))
        )}
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

export const SidebarSpaces = () => {
  return (
    <SidebarTreeProvider>
      <SidebarSpacesContent />
    </SidebarTreeProvider>
  );
};
