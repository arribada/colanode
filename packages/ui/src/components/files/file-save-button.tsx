import { useNavigate } from '@tanstack/react-router';
import { Download } from 'lucide-react';

import { LocalFileNode } from '@colanode/client/types';
import { Button } from '@colanode/ui/components/ui/button';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useFileDownload } from '@colanode/ui/hooks/use-file-download';

interface FileSaveButtonProps {
  file: LocalFileNode;
}

export const FileSaveButton = ({ file }: FileSaveButtonProps) => {
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { download, isPending } = useFileDownload(file, {
    onDesktopSaved: () => navigate({ to: 'downloads' }),
  });

  return (
    <Button
      variant="outline"
      onClick={download}
      disabled={isPending}
      aria-busy={isPending}
      data-testid="file-save-button"
    >
      {isPending ? (
        <Spinner className="size-4" />
      ) : (
        <Download className="size-4" />
      )}
      Save
    </Button>
  );
};
