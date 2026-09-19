// ABOUTME: Full-screen viewer for an image or a diagram of the editor, opened by
// ABOUTME: a double-click, with a button to copy the picture to the clipboard.
import { Copy } from 'lucide-react';
import { type ReactNode } from 'react';
import { toast } from 'sonner';

import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import {
  canCopyImages,
  copyPngToClipboard,
} from '@colanode/ui/lib/image-export';

// Must be called from the click itself (see copyPngToClipboard).
export const copyPicture = (png: () => Promise<Blob>): void => {
  if (!canCopyImages()) {
    toast.error("This browser can't copy images");
    return;
  }
  copyPngToClipboard(png()).then(
    () => toast.success('Image copied, paste it anywhere'),
    () => toast.error("Couldn't copy the image")
  );
};

interface MediaLightboxProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  title: string;
  onCopy?: () => void;
  children: ReactNode;
}

export const MediaLightbox = ({
  open,
  onOpenChange,
  title,
  onCopy,
  children,
}: MediaLightboxProps) => (
  <Dialog open={open} onOpenChange={onOpenChange}>
    <DialogContent
      data-testid="media-lightbox"
      className="flex h-[92vh] w-[95vw] max-w-[95vw] flex-col gap-3 p-4 sm:max-w-[95vw]"
      // Keep the editor from receiving the events of the viewer.
      onPointerDown={(event) => event.stopPropagation()}
      onKeyDown={(event) => event.stopPropagation()}
    >
      <div className="flex items-center gap-3 pr-8">
        <DialogTitle className="min-w-0 flex-1 truncate text-base">
          {title}
        </DialogTitle>
        {onCopy && (
          <Button variant="outline" size="sm" onClick={onCopy}>
            <Copy className="size-4" />
            Copy image
          </Button>
        )}
      </div>
      <div className="flex min-h-0 flex-1 items-center justify-center overflow-auto">
        {children}
      </div>
    </DialogContent>
  </Dialog>
);
