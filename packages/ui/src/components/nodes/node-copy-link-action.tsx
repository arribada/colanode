// ABOUTME: Node-agnostic "Copy link" menu action - copies a shareable deep link
// ABOUTME: built as {origin}/{workspaceId}/{nodeId} so it works everywhere.
import { Link2 } from 'lucide-react';
import { ComponentType, ReactNode } from 'react';
import { toast } from 'sonner';

import { useWorkspace } from '@colanode/ui/contexts/workspace';

// The menu item this action renders into. Both DropdownMenuItem and
// ContextMenuItem satisfy this shape, so the same action drops into either menu.
interface CopyLinkMenuItemProps {
  className?: string;
  onSelect?: (event: Event) => void;
  children?: ReactNode;
}

interface CopyLinkActionProps {
  nodeId: string;
  item: ComponentType<CopyLinkMenuItemProps>;
  label?: string;
}

// The path is always /{workspaceId}/{nodeId}, stable across users. The origin is
// taken from the current page whenever that is a real http(s) web origin - so a
// self-hosted deployment on any domain builds a correct link - and falls back to
// the canonical docs.arribada.org origin in the Electron build, whose location
// is a file:// / app:// URL rather than the deployment's web address.
export const CopyLinkAction = ({
  nodeId,
  item: MenuItem,
  label = 'Copy link',
}: CopyLinkActionProps) => {
  const workspace = useWorkspace();

  const handleCopy = async () => {
    try {
      const origin =
        typeof window !== 'undefined' &&
        (window.location.protocol === 'http:' ||
          window.location.protocol === 'https:')
          ? window.location.origin
          : 'https://docs.arribada.org';
      const link = `${origin}/${workspace.workspaceId}/${nodeId}`;
      await navigator.clipboard.writeText(link);
      toast.success('Link copied to clipboard');
    } catch {
      toast.error('Could not copy the link.');
    }
  };

  return (
    <MenuItem
      className="flex items-center gap-2 cursor-pointer"
      onSelect={() => void handleCopy()}
    >
      <Link2 className="size-4" />
      {label}
    </MenuItem>
  );
};
