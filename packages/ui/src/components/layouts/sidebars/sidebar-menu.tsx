import { count, inArray, useLiveQuery } from '@tanstack/react-db';
import { useLocation, useNavigate } from '@tanstack/react-router';
import {
  Bell,
  FolderKanban,
  Github,
  Home,
  LayoutGrid,
  MessageCircle,
  MessagesSquare,
  PanelLeftClose,
  PanelLeftOpen,
  Satellite,
  Search,
  Settings,
} from 'lucide-react';

import { SidebarMenuType, UploadStatus } from '@colanode/client/types';
import { SidebarMenuFooter } from '@colanode/ui/components/layouts/sidebars/sidebar-menu-footer';
import { SidebarMenuHeader } from '@colanode/ui/components/layouts/sidebars/sidebar-menu-header';
import { SidebarMenuIcon } from '@colanode/ui/components/layouts/sidebars/sidebar-menu-icon';
import { useRadar } from '@colanode/ui/contexts/radar';
import { useSearch } from '@colanode/ui/contexts/search';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { useLiveQuery as useColanodeLiveQuery } from '@colanode/ui/hooks/use-live-query';

// External links to the other Arribada apps, opened via
// window.colanode.openExternalUrl so it works on web and desktop.
const ARRIBADA_APPS = [
  {
    icon: FolderKanban,
    label: 'Plane — Projects',
    url: 'https://plane.arribada.org',
  },
  {
    icon: Satellite,
    label: 'Dashboard Devices',
    url: 'https://devices.arribada.org',
  },
  {
    icon: MessagesSquare,
    label: 'Chat',
    url: 'https://chat.arribada.org',
  },
  {
    icon: Github,
    label: 'GitHub — Code',
    url: 'https://github.com/arribada',
  },
] as const;

interface SidebarMenuProps {
  value: SidebarMenuType;
  onChange: (value: SidebarMenuType) => void;
  collapsed?: boolean;
  onToggleCollapsed?: () => void;
}

export const SidebarMenu = ({
  value,
  onChange,
  collapsed = false,
  onToggleCollapsed,
}: SidebarMenuProps) => {
  const workspace = useWorkspace();
  const radar = useRadar();
  const search = useSearch();
  const [showChat] = useChatVisibility();
  const navigate = useNavigate();
  const location = useLocation();

  const chatsState = radar.getChatsState(workspace.userId);
  const channelsState = radar.getChannelsState(workspace.userId);

  const notificationUnreadCountQuery = useColanodeLiveQuery({
    type: 'notification.unread-count',
    userId: workspace.userId,
  });

  const notificationUnreadCount = notificationUnreadCountQuery.data ?? 0;

  const pendingUploadsQuery = useLiveQuery(
    (q) =>
      q
        .from({ uploads: workspace.collections.uploads })
        .where(({ uploads }) =>
          inArray(uploads.status, [
            UploadStatus.Pending,
            UploadStatus.Uploading,
          ])
        )
        .select(({ uploads }) => ({
          count: count(uploads.fileId),
        }))
        .findOne(),
    [workspace.userId]
  );

  const pendingUploads = pendingUploadsQuery.data?.count ?? 0;

  return (
    <div className="flex flex-col h-full w-[65px] min-w-[65px] shrink-0 items-center">
      <SidebarMenuHeader />
      <div className="flex flex-col gap-1 mt-2 w-full p-2 items-center grow">
        <SidebarMenuIcon
          icon={Home}
          label="Home"
          onClick={() => {
            navigate({
              to: '/workspace/$userId/home',
              params: { userId: workspace.userId },
            });
          }}
          isActive={location.pathname.endsWith('/home')}
        />
        <SidebarMenuIcon
          icon={Search}
          label="Search"
          onClick={() => {
            search.setOpen(true);
          }}
        />
        {showChat && (
          <SidebarMenuIcon
            icon={MessageCircle}
            label="Chats"
            onClick={() => {
              onChange('chats');
            }}
            isActive={value === 'chats'}
            unreadBadge={{
              count: chatsState.unreadCount,
              unread: chatsState.hasUnread,
              maxCount: 99,
            }}
          />
        )}
        <SidebarMenuIcon
          icon={LayoutGrid}
          label="Spaces"
          onClick={() => {
            onChange('spaces');
          }}
          isActive={value === 'spaces'}
          unreadBadge={{
            count: showChat ? channelsState.unreadCount : 0,
            unread: showChat && channelsState.hasUnread,
            maxCount: 99,
          }}
        />
        <SidebarMenuIcon
          icon={Bell}
          label="Inbox"
          onClick={() => {
            onChange('inbox');
          }}
          isActive={value === 'inbox'}
          unreadBadge={{
            count: notificationUnreadCount,
            unread: notificationUnreadCount > 0,
            maxCount: 99,
          }}
        />
        <div className="my-1 h-px w-8 bg-sidebar-border" />
        {ARRIBADA_APPS.map((app) => (
          <SidebarMenuIcon
            key={app.url}
            icon={app.icon}
            label={app.label}
            onClick={() => window.colanode.openExternalUrl(app.url)}
          />
        ))}
        <div className="mt-auto" />
        {onToggleCollapsed && (
          <SidebarMenuIcon
            icon={collapsed ? PanelLeftOpen : PanelLeftClose}
            label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            onClick={onToggleCollapsed}
          />
        )}
        <SidebarMenuIcon
          icon={Settings}
          label="Settings"
          onClick={() => {
            onChange('settings');
          }}
          isActive={value === 'settings'}
          unreadBadge={{
            count: pendingUploads,
            unread: pendingUploads > 0,
            maxCount: 20,
            className: 'bg-blue-500',
          }}
        />
      </div>
      <SidebarMenuFooter />
    </div>
  );
};
