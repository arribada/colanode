import { useState } from 'react';

import { SidebarMenuType } from '@colanode/client/types';
import { InboxPanel } from '@colanode/ui/components/inbox/inbox-panel';
import { SidebarChats } from '@colanode/ui/components/layouts/sidebars/sidebar-chats';
import { SidebarMenu } from '@colanode/ui/components/layouts/sidebars/sidebar-menu';
import { SidebarSettings } from '@colanode/ui/components/layouts/sidebars/sidebar-settings';
import { SidebarSpaces } from '@colanode/ui/components/layouts/sidebars/sidebar-spaces';
import { useApp } from '@colanode/ui/contexts/app';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { cn } from '@colanode/ui/lib/utils';

export const Sidebar = () => {
  const app = useApp();
  const workspace = useWorkspace();
  const [showChat] = useChatVisibility();
  const [selectedMenu, setMenu] = useState<SidebarMenuType>('spaces');

  // If chat gets hidden while the chats panel is open, fall back to spaces so
  // the sidebar never shows a panel that no longer has a menu entry.
  const menu = selectedMenu === 'chats' && !showChat ? 'spaces' : selectedMenu;

  return (
    <div
      className={cn(
        'flex h-full min-h-full max-h-full w-full min-w-full flex-row',
        app.type === 'mobile' ? 'bg-background' : 'bg-sidebar'
      )}
    >
      <SidebarMenu value={menu} onChange={setMenu} />
      <div className="min-h-0 grow overflow-auto border-l border-sidebar-border">
        {menu === 'spaces' && <SidebarSpaces />}
        {menu === 'chats' && <SidebarChats />}
        {menu === 'inbox' && <InboxPanel userId={workspace.userId} />}
        {menu === 'settings' && <SidebarSettings />}
      </div>
    </div>
  );
};
