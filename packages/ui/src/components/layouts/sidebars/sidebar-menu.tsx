import { count, inArray, useLiveQuery } from '@tanstack/react-db';
import {
  Bell,
  LayoutGrid,
  MessageCircle,
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
import { useLiveQuery as useColanodeLiveQuery } from '@colanode/ui/hooks/use-live-query';

interface SidebarMenuProps {
  value: SidebarMenuType;
  onChange: (value: SidebarMenuType) => void;
}

export const SidebarMenu = ({ value, onChange }: SidebarMenuProps) => {
  const workspace = useWorkspace();
  const radar = useRadar();
  const search = useSearch();

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
    <div className="flex flex-col h-full w-[65px] min-w-[65px] items-center">
      <SidebarMenuHeader />
      <div className="flex flex-col gap-1 mt-2 w-full p-2 items-center grow">
        <SidebarMenuIcon
          icon={Search}
          label="Search"
          onClick={() => {
            search.setOpen(true);
          }}
        />
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
        <SidebarMenuIcon
          icon={LayoutGrid}
          label="Spaces"
          onClick={() => {
            onChange('spaces');
          }}
          isActive={value === 'spaces'}
          unreadBadge={{
            count: channelsState.unreadCount,
            unread: channelsState.hasUnread,
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
        <div className="mt-auto" />
        <SidebarMenuIcon
          icon={Settings}
          label="Settings"
          onClick={() => {
            onChange('settings');
          }}
          className="mt-auto"
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
