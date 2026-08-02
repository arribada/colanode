// ABOUTME: Node-agnostic "Copy link" menu action — copies a shareable deep link
// ABOUTME: built from the node id (not window.location) so it works everywhere.
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

// The link is built from the node id and workspace id rather than
// window.location.href, so it resolves the same from the sidebar, a breadcrumb,
// or the Electron build — none of which sit on a docs.arribada.org URL.
export const CopyLinkAction = ({
  nodeId,
  item: MenuItem,
  label = 'Copy link',
}: CopyLinkActionProps) => {
  const workspace = useWorkspace();

  const handleCopy = async () => {
    try {
      const link = `https://docs.arribada.org/${workspace.workspaceId}/${nodeId}`;
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
