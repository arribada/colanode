// ABOUTME: Shows a page's content as raw Markdown, read-only, with copy and
// ABOUTME: download — reached from the page settings, not from the view toggle.
import { ClipboardCopy, FileDown } from 'lucide-react';
import { toast } from 'sonner';

import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import {
  downloadTextFile,
  getDocumentExporter,
  safeFileName,
} from '@colanode/ui/lib/document-export';

interface PageMarkdownDialogProps {
  pageId: string;
  name: string;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const PageMarkdownDialog = ({
  pageId,
  name,
  open,
  onOpenChange,
}: PageMarkdownDialogProps) => {
  // Read each time the dialog opens: the exporter belongs to the editor on
  // screen, so this is exactly what the page holds at that moment.
  const markdown = open
    ? (getDocumentExporter(pageId)?.getMarkdown() ?? null)
    : null;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(markdown ?? '');
      toast.success('Markdown copied');
    } catch {
      toast.error('Could not copy to clipboard');
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="flex max-h-[85vh] flex-col gap-3 sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Markdown</DialogTitle>
          <DialogDescription>
            This page as raw Markdown. Read-only: edit the page itself to change
            it.
          </DialogDescription>
        </DialogHeader>

        {markdown === null ? (
          <p className="text-sm text-muted-foreground">
            Open the page to see its Markdown.
          </p>
        ) : (
          <pre
            data-testid="page-markdown"
            className="min-h-0 flex-1 overflow-auto whitespace-pre-wrap break-words rounded-md border border-border bg-muted p-3 font-mono text-xs leading-relaxed text-foreground"
          >
            {markdown.length > 0 ? markdown : '(This page is empty.)'}
          </pre>
        )}

        <DialogFooter>
          <Button
            type="button"
            variant="outline"
            disabled={!markdown}
            onClick={() => void copy()}
          >
            <ClipboardCopy className="size-4" />
            Copy
          </Button>
          <Button
            type="button"
            variant="outline"
            disabled={!markdown}
            onClick={() =>
              downloadTextFile(
                markdown ?? '',
                `${safeFileName(name)}.md`,
                'text/markdown'
              )
            }
          >
            <FileDown className="size-4" />
            Download
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
