import { Resizable } from 're-resizable';
import { useCallback, useEffect, useState } from 'react';

import { Sidebar } from '@colanode/ui/components/layouts/sidebars/sidebar';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

const DEFAULT_WIDTH = 300;
const RAIL_WIDTH = 65;

export const SidebarDesktop = () => {
  const workspace = useWorkspace();
  const [storedWidth, setStoredWidth] = useMetadata<number>(
    workspace.userId,
    'sidebar.width'
  );
  const [collapsed, setCollapsed] = useMetadata<boolean>(
    workspace.userId,
    'sidebar.collapsed'
  );

  const isCollapsed = collapsed ?? false;

  // re-resizable's `size` is controlled, but `setStoredWidth` (metadata) is
  // async, so binding `size` straight to the stored value makes the panel snap
  // back to the old width on release (the controlled size hasn't updated yet).
  // Keep a synchronous local mirror for the live drag, and persist to metadata
  // only when the drag stops.
  const [liveWidth, setLiveWidth] = useState<number>(
    storedWidth ?? DEFAULT_WIDTH
  );

  useEffect(() => {
    if (storedWidth != null) {
      setLiveWidth(storedWidth);
    }
  }, [storedWidth]);

  const persistWidth = useCallback(
    (newWidth: number) => {
      setStoredWidth(newWidth);
    },
    [setStoredWidth]
  );

  return (
    <Resizable
      as="aside"
      size={{
        width: isCollapsed ? RAIL_WIDTH : liveWidth,
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
          setLiveWidth(ref.offsetWidth);
        }
      }}
      onResizeStop={(_, __, ref) => {
        if (!isCollapsed) {
          persistWidth(ref.offsetWidth);
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
