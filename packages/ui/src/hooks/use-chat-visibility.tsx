import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMetadata } from '@colanode/ui/hooks/use-metadata';

// Chat (channels + direct chats) is hidden by default in this fork: the team
// keeps chat in a dedicated tool and uses Colanode for docs. The preference is
// stored per workspace in the local metadata store (same mechanism as sidebar
// width) and can be flipped from the workspace settings page. Page comments
// are message nodes on pages and are not affected by this setting.
export const useChatVisibility = (): [boolean, (visible: boolean) => void] => {
  const workspace = useWorkspace();
  const [visible, setVisible] = useMetadata<boolean>(
    workspace.userId,
    'chat.visible'
  );

  return [visible === true, setVisible];
};
