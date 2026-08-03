import { ChevronRight } from 'lucide-react';

import { LocalSpaceNode } from '@colanode/client/types';
import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import { SpaceSidebarDropdown } from '@colanode/ui/components/spaces/space-sidebar-dropdown';
import { SpaceSidebarGroup } from '@colanode/ui/components/spaces/space-sidebar-group';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
import { useSidebarTree } from '@colanode/ui/contexts/sidebar-tree';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { useSidebarNodeDnd } from '@colanode/ui/hooks/use-sidebar-node-dnd';
import {
  groupSpaceChildrenByType,
  sortSpaceChildren,
} from '@colanode/ui/lib/spaces';
import { cn } from '@colanode/ui/lib/utils';

interface SpaceSidebarItemProps {
  space: LocalSpaceNode;
}

export const SpaceSidebarItem = ({ space }: SpaceSidebarItemProps) => {
  const tree = useSidebarTree();
  const [showChat] = useChatVisibility();

  // Dropping onto the space row files the node at the top level of that space.
  const { ref, isDropInside } = useSidebarNodeDnd(space, { droppable: true });

  // Channels (including the default "Discussions" channel every workspace is
  // seeded with) stay out of the tree while chat is hidden.
  const spaceChildren = tree.childrenOf(space.id);
  const visibleChildren = showChat
    ? spaceChildren
    : spaceChildren.filter((node) => node.type !== 'channel');

  const children = sortSpaceChildren(space, visibleChildren);
  const groups = groupSpaceChildrenByType(children);

  return (
    <Collapsible
      key={space.id}
      defaultOpen={true}
      className="group/sidebar-space"
    >
      <div
        ref={ref}
        data-testid={`space-sidebar-item-${space.id}`}
        className={cn(
          'group/space-row text-sm flex h-7 items-center gap-2 overflow-hidden rounded-md px-2 text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer',
          isDropInside && 'bg-sidebar-accent ring-1 ring-sidebar-ring'
        )}
      >
        <CollapsibleTrigger asChild>
          <button className="flex min-w-0 items-center gap-2 overflow-hidden rounded-md text-left text-sm flex-1 cursor-pointer">
            <Avatar
              id={space.id}
              avatar={space.avatar}
              name={space.name}
              className="size-4 group-hover/space-row:hidden shrink-0"
            />
            <ChevronRight className="hidden size-4 shrink-0 transition-transform duration-200 group-hover/space-row:block group-data-[state=open]/sidebar-space:rotate-90 cursor-pointer rounded hover:bg-sidebar-accent/50" />
            <span className="truncate">{space.name}</span>
          </button>
        </CollapsibleTrigger>
        <SpaceSidebarDropdown space={space} />
      </div>
      <CollapsibleContent>
        {groups.length <= 1 ? (
          <ul className="ml-3 flex min-w-0 flex-col gap-0.5 py-0.5">
            {children.map((child) => (
              <li key={child.id} className="min-w-0">
                <SidebarItem node={child} />
              </li>
            ))}
          </ul>
        ) : (
          <div className="ml-3 flex min-w-0 flex-col gap-0.5 py-0.5">
            {groups.map((group) => (
              <SpaceSidebarGroup key={group.type} space={space} group={group} />
            ))}
          </div>
        )}
      </CollapsibleContent>
    </Collapsible>
  );
};
