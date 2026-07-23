import { useNavigate } from '@tanstack/react-router';
import {
  Database,
  Ellipsis,
  FileStack,
  Folder,
  MessageCircle,
  Plus,
  Presentation,
  Settings,
  StickyNote,
} from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { LocalSpaceNode } from '@colanode/client/types';
import { ChannelCreateDialog } from '@colanode/ui/components/channels/channel-create-dialog';
import { DatabaseCreateDialog } from '@colanode/ui/components/databases/database-create-dialog';
import { FolderCreateDialog } from '@colanode/ui/components/folders/folder-create-dialog';
import { PageCreateDialog } from '@colanode/ui/components/pages/page-create-dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuSub,
  DropdownMenuSubContent,
  DropdownMenuSubTrigger,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { WhiteboardCreateDialog } from '@colanode/ui/components/whiteboards/whiteboard-create-dialog';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChatVisibility } from '@colanode/ui/hooks/use-chat-visibility';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface SpaceSidebarDropdownProps {
  space: LocalSpaceNode;
}

export const SpaceSidebarDropdown = ({ space }: SpaceSidebarDropdownProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const [showChat] = useChatVisibility();

  const [openCreatePage, setOpenCreatePage] = useState(false);
  const [openCreateChannel, setOpenCreateChannel] = useState(false);
  const [openCreateDatabase, setOpenCreateDatabase] = useState(false);
  const [openCreateFolder, setOpenCreateFolder] = useState(false);
  const [openCreateWhiteboard, setOpenCreateWhiteboard] = useState(false);

  const pageTemplatesQuery = useLiveQuery({
    type: 'page.template.list',
    userId: workspace.userId,
    spaceId: space.id,
  });
  const pageTemplates = pageTemplatesQuery.data ?? [];

  const { mutate: createFromTemplate } = useMutation();
  const createPageFromTemplate = (templateId: string) => {
    createFromTemplate({
      input: {
        type: 'page.template.create',
        userId: workspace.userId,
        templateId,
        spaceId: space.id,
      },
      onSuccess(output) {
        navigate({
          to: '$nodeId',
          params: { nodeId: output.id },
        });
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

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
          <DropdownMenuItem
            onSelect={() => setOpenCreatePage(true)}
            className="flex flex-row items-center gap-2 cursor-pointer"
          >
            <StickyNote className="size-4" />
            <span>Add page</span>
          </DropdownMenuItem>
          {pageTemplates.length > 0 && (
            <DropdownMenuSub>
              <DropdownMenuSubTrigger className="flex flex-row items-center gap-2 cursor-pointer">
                <FileStack className="size-4" />
                <span>New from template</span>
              </DropdownMenuSubTrigger>
              <DropdownMenuSubContent>
                {pageTemplates.map((template) => (
                  <DropdownMenuItem
                    key={template.id}
                    data-testid={`page-template-item-${template.id}`}
                    className="cursor-pointer"
                    onSelect={() => createPageFromTemplate(template.id)}
                  >
                    {template.name || 'Untitled'}
                  </DropdownMenuItem>
                ))}
              </DropdownMenuSubContent>
            </DropdownMenuSub>
          )}
          {showChat && (
            <DropdownMenuItem
              onSelect={() => setOpenCreateChannel(true)}
              className="flex flex-row items-center gap-2 cursor-pointer"
            >
              <MessageCircle className="size-4" />
              <span>Add channel</span>
            </DropdownMenuItem>
          )}
          <DropdownMenuItem
            onSelect={() => setOpenCreateDatabase(true)}
            className="flex flex-row items-center gap-2 cursor-pointer"
          >
            <Database className="size-4" />
            <span>Add database</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setOpenCreateFolder(true)}
            className="flex flex-row items-center gap-2 cursor-pointer"
          >
            <Folder className="size-4" />
            <span>Add folder</span>
          </DropdownMenuItem>
          <DropdownMenuItem
            onSelect={() => setOpenCreateWhiteboard(true)}
            className="flex flex-row items-center gap-2 cursor-pointer"
          >
            <Presentation className="size-4" />
            <span>Add whiteboard</span>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
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
          <DropdownMenuItem
            onClick={() =>
              navigate({
                to: '$nodeId',
                params: { nodeId: space.id },
              })
            }
            className="flex flex-row items-center gap-2 cursor-pointer"
          >
            <Plus className="size-4" />
            <span>Add collaborators</span>
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
      {openCreateFolder && (
        <FolderCreateDialog
          spaceId={space.id}
          open={openCreateFolder}
          onOpenChange={setOpenCreateFolder}
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
