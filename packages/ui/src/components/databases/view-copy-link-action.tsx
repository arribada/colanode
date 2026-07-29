// ABOUTME: "Copy link to view" menu action — copies a deep link to the current
// ABOUTME: database view to the clipboard so it can be shared or bookmarked.
import { Link2 } from 'lucide-react';
import { toast } from 'sonner';

interface ViewCopyLinkActionProps {
  closeMenu: () => void;
}

export const ViewCopyLinkAction = ({ closeMenu }: ViewCopyLinkActionProps) => {
  const handleCopy = async () => {
    try {
      const link =
        typeof window !== 'undefined' && window.location
          ? window.location.href
          : '';

      if (!link) {
        toast.error('No link is available for this view.');
        return;
      }

      await navigator.clipboard.writeText(link);
      toast.success('Link to view copied to clipboard');
    } catch {
      toast.error('Could not copy the link to this view.');
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
      <span>Copy link to view</span>
    </button>
  );
};
