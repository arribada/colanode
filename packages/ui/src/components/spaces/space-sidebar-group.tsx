import { ChevronRight } from 'lucide-react';

import { LocalSpaceNode } from '@colanode/client/types';
import { SidebarItem } from '@colanode/ui/components/layouts/sidebars/sidebar-item';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';
import { SpaceChildGroup } from '@colanode/ui/lib/spaces';

interface SpaceSidebarGroupProps {
  space: LocalSpaceNode;
  group: SpaceChildGroup;
}

export const SpaceSidebarGroup = ({ space, group }: SpaceSidebarGroupProps) => {
  const workspace = useWorkspace();
  const [collapsed, setCollapsed] = useMetadata<boolean>(
    workspace.userId,
    `sidebar.group.${space.id}.${group.type}`
  );

  const open = collapsed !== true;

  return (
    <Collapsible
      open={open}
      onOpenChange={(next) => setCollapsed(next ? undefined : true)}
      className="group/space-group"
    >
      <CollapsibleTrigger asChild>
        <button className="flex h-6 w-full items-center gap-1 rounded-md px-2 text-xs font-medium text-muted-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground cursor-pointer">
          <ChevronRight className="size-3 transition-transform duration-200 group-data-[state=open]/space-group:rotate-90" />
          <span>{group.label}</span>
        </button>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <ul className="ml-2 flex min-w-0 flex-col gap-0.5 py-0.5">
          {group.items.map((child) => (
            <li key={child.id}>
              <SidebarItem node={child} />
            </li>
          ))}
        </ul>
      </CollapsibleContent>
    </Collapsible>
  );
};
