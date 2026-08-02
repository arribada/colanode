// ABOUTME: "Copy link to database" menu action — copies a deep link to the
// ABOUTME: database (built from its node id) to the clipboard for sharing.
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';

import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

interface ViewCopyLinkActionProps {
  closeMenu: () => void;
}

export const ViewCopyLinkAction = ({ closeMenu }: ViewCopyLinkActionProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const handleCopy = async () => {
    try {
      // A view is per-user local metadata and never appears in the URL, so the
      // old window.location link couldn't actually point at a view. Link to the
      // database by its node id instead — stable across users and the Electron
      // build, where the address bar isn't a docs.arribada.org URL.
      const link = `https://docs.arribada.org/${workspace.workspaceId}/${database.id}`;

      await navigator.clipboard.writeText(link);
      toast.success('Link to database copied to clipboard');
    } catch {
      toast.error('Could not copy the link to this database.');
    } finally {
      closeMenu();
    }
  };

  return (
    <button
      type="button"
      data-testid="view-copy-link"
      className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left text-sm hover:bg-accent"
      onClick={handleCopy}
    >
      <Link2 className="size-4" />
      <span>Copy link to database</span>
    </button>
  );
};
