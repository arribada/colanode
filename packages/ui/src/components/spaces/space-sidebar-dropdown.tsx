import { useNavigate } from '@tanstack/react-router';
import {
  Database,
  Ellipsis,
  MessageCircle,
  Presentation,
  Settings,
  StickyNote,
} from 'lucide-react';
import { Fragment, useState } from 'react';

import { LocalSpaceNode } from '@colanode/client/types';
import { extractNodeRole, hasNodeRole } from '@colanode/core';
import { ChannelCreateDialog } from '@colanode/ui/components/channels/channel-create-dialog';
import { DatabaseCreateDialog } from '@colanode/ui/components/databases/database-create-dialog';
import { PageCreateDialog } from '@colanode/ui/components/pages/page-create-dialog';
import {
  PageTemplateSubmenu,
  useCreatePageFromTemplate,
} from '@colanode/ui/components/pages/page-template-submenu';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { WhiteboardCreateDialog } from '@colanode/ui/components/whiteboards/whiteboard-create-dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';

interface SpaceSidebarDropdownProps {
  space: LocalSpaceNode;
}

export const SpaceSidebarDropdown = ({ space }: SpaceSidebarDropdownProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const [showChat] = useChatVisibility();

  const spaceRole = extractNodeRole(space, workspace.userId);
  const canCreate = spaceRole !== null && hasNodeRole(spaceRole, 'editor');

  const [openCreatePage, setOpenCreatePage] = useState(false);
  const [openCreateChannel, setOpenCreateChannel] = useState(false);
  const [openCreateDatabase, setOpenCreateDatabase] = useState(false);
  const [openCreateWhiteboard, setOpenCreateWhiteboard] = useState(false);

  const createPageFromTemplate = useCreatePageFromTemplate({
    spaceId: space.id,
    parentId: space.id,
  });

  return (
    <Fragment>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            aria-label="Space options"
            className="text-muted-foreground opacity-0 transition-opacity group-hover/sidebar-space:opacity-100 flex items-center justify-center p-0 mr-1 size-4 focus-visible:outline-none focus-visible:ring-0 cursor-pointer"
          >
            <Ellipsis />
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent className="ml-1 w-72">
          <DropdownMenuLabel>{space.name ?? 'Unnamed'}</DropdownMenuLabel>
          <DropdownMenuSeparator />
          {canCreate && (
            <DropdownMenuItem
              onSelect={() => setOpenCreatePage(true)}
              className="flex flex-row items-center gap-2 cursor-pointer"
            >
              <StickyNote className="size-4" />
              <span>Add page</span>
            </DropdownMenuItem>
          )}
          {canCreate && (
            <PageTemplateSubmenu
              spaceId={space.id}
              onSelect={createPageFromTemplate}
            />
          )}
          {canCreate && showChat && (
            <DropdownMenuItem
              onSelect={() => setOpenCreateChannel(true)}
              className="flex flex-row items-center gap-2 cursor-pointer"
            >
              <MessageCircle className="size-4" />
              <span>Add channel</span>
            </DropdownMenuItem>
          )}
          {canCreate && (
            <DropdownMenuItem
              onSelect={() => setOpenCreateDatabase(true)}
              className="flex flex-row items-center gap-2 cursor-pointer"
            >
              <Database className="size-4" />
              <span>Add database</span>
            </DropdownMenuItem>
          )}
          {canCreate && (
            <DropdownMenuItem
              onSelect={() => setOpenCreateWhiteboard(true)}
              className="flex flex-row items-center gap-2 cursor-pointer"
            >
              <Presentation className="size-4" />
              <span>Add board</span>
            </DropdownMenuItem>
          )}
          {canCreate && <DropdownMenuSeparator />}
          <DropdownMenuItem
            onClick={() =>
              navigate({
                to: '$nodeId',
                params: { nodeId: space.id },
              })
            }
            className="flex flex-row items-center gap-2 cursor-pointer"
          >
            <Settings className="size-4" />
            <span>Settings</span>
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      {openCreateChannel && (
        <ChannelCreateDialog
          spaceId={space.id}
          open={openCreateChannel}
          onOpenChange={setOpenCreateChannel}
        />
      )}
      {openCreatePage && (
        <PageCreateDialog
          spaceId={space.id}
          open={openCreatePage}
          onOpenChange={setOpenCreatePage}
        />
      )}
      {openCreateDatabase && (
        <DatabaseCreateDialog
          spaceId={space.id}
          open={openCreateDatabase}
          onOpenChange={setOpenCreateDatabase}
        />
      )}
      {openCreateWhiteboard && (
        <WhiteboardCreateDialog
          spaceId={space.id}
          open={openCreateWhiteboard}
          onOpenChange={setOpenCreateWhiteboard}
        />
      )}
    </Fragment>
  );
};
