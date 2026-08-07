import { Search, Trash2 } from 'lucide-react';

import { SidebarFavorites } from '@colanode/ui/components/layouts/sidebars/sidebar-favorites';
import { SidebarHeader } from '@colanode/ui/components/layouts/sidebars/sidebar-header';
import { SidebarSettingsItem } from '@colanode/ui/components/layouts/sidebars/sidebar-settings-item';
import { SidebarSpacesSkeleton } from '@colanode/ui/components/layouts/sidebars/sidebar-spaces-skeleton';
import { SidebarTreeProvider } from '@colanode/ui/components/layouts/sidebars/sidebar-tree-provider';
import { SpaceCreateButton } from '@colanode/ui/components/spaces/space-create-button';
import { SpaceSidebarItem } from '@colanode/ui/components/spaces/space-sidebar-item';
import { Link } from '@colanode/ui/components/ui/link';
import { useSearch } from '@colanode/ui/contexts/search';
import { useSidebarTree } from '@colanode/ui/contexts/sidebar-tree';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

const SidebarSpacesContent = () => {
  const workspace = useWorkspace();
  const tree = useSidebarTree();
  const search = useSearch();
  const canCreateSpace =
    workspace.role !== 'guest' && workspace.role !== 'none';

  const isMac =
    typeof navigator !== 'undefined' &&
    /Mac|iPhone|iPad|iPod/.test(navigator.platform || navigator.userAgent);

  return (
    <div className="flex flex-col group/sidebar h-full px-2">
      <button
        type="button"
        onClick={() => search.setOpen(true)}
        aria-label="Search"
        className="mt-2 flex w-full items-center gap-2 rounded-md border border-sidebar-border bg-sidebar-accent/40 px-2 py-1.5 text-sm text-muted-foreground transition-colors hover:bg-sidebar-accent app-no-drag-region"
      >
        <Search className="size-4 shrink-0" />
        <span className="grow text-left">Search</span>
        <kbd className="pointer-events-none rounded border border-sidebar-border bg-background px-1.5 py-0.5 text-[10px] font-medium text-muted-foreground">
          {isMac ? '⌘K' : 'Ctrl K'}
        </kbd>
      </button>
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
