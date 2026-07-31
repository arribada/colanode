import { Bell, BellOff, Settings } from 'lucide-react';

import { LocalChatNode } from '@colanode/client/types';
import { NodeRole } from '@colanode/core';
import { NodeCollaboratorsPopover } from '@colanode/ui/components/collaborators/node-collaborators-popover';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useChannelMute } from '@colanode/ui/hooks/use-channel-mute';

interface ChatSettingsProps {
  chat: LocalChatNode;
  role: NodeRole;
}
export const ChatSettings = ({ chat, role }: ChatSettingsProps) => {
  const workspace = useWorkspace();
  const { muted } = useChannelMute(workspace.userId, chat.id);

  return (
    <div className="flex items-center gap-3">
      <NodeCollaboratorsPopover node={chat} nodes={[chat]} role={role} />
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Settings className="size-4 cursor-pointer text-muted-foreground hover:text-foreground" />
        </DropdownMenuTrigger>
        <DropdownMenuContent side="bottom" className="mr-2 w-80">
          <DropdownMenuItem
            className="flex items-center gap-2 cursor-pointer"
            onClick={() => {
              window.colanode.executeMutation({
                type: 'mute.set',
                userId: workspace.userId,
                nodeId: chat.id,
                muted: !muted,
              });
            }}
          >
            {muted ? (
              <Bell className="size-4" />
            ) : (
              <BellOff className="size-4" />
            )}
            {muted ? 'Unmute notifications' : 'Mute notifications'}
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
