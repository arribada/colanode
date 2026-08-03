import { Resizable } from 're-resizable';
import { useCallback } from 'react';

import { Sidebar } from '@colanode/ui/components/layouts/sidebars/sidebar';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

const DEFAULT_WIDTH = 300;
const RAIL_WIDTH = 65;

export const SidebarDesktop = () => {
  const workspace = useWorkspace();
  const [width, setWidth] = useMetadata<number>(
    workspace.userId,
    'sidebar.width'
  );
  const [collapsed, setCollapsed] = useMetadata<boolean>(
    workspace.userId,
    'sidebar.collapsed'
  );

  const isCollapsed = collapsed ?? false;

  const handleResize = useCallback(
    (newWidth: number) => {
      setWidth(newWidth);
    },
    [setWidth]
  );

  return (
    <Resizable
      as="aside"
      size={{
        width: isCollapsed ? RAIL_WIDTH : (width ?? DEFAULT_WIDTH),
        height: '100%',
      }}
      className="border-r border-sidebar-border"
      minWidth={isCollapsed ? RAIL_WIDTH : 200}
      maxWidth={500}
      enable={{
        bottom: false,
        bottomLeft: false,
        bottomRight: false,
        left: false,
        right: !isCollapsed,
        top: false,
        topLeft: false,
        topRight: false,
      }}
      handleClasses={{
        right: 'opacity-0 hover:opacity-100 bg-blue-400 z-50',
      }}
      handleStyles={{
        right: {
          width: '10px',
          right: '-5px',
        },
      }}
      onResize={(_, __, ref) => {
        if (!isCollapsed) {
          handleResize(ref.offsetWidth);
        }
      }}
    >
      <Sidebar
        collapsed={isCollapsed}
        onToggleCollapsed={() => setCollapsed(!isCollapsed)}
      />
    </Resizable>
  );
};
