// ABOUTME: Saves a wiki file to the user's disk -- desktop save dialog or web
// ABOUTME: <a download> -- shared by the file page and the image viewer.
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalFileNode } from '@colanode/client/types';
import { useApp } from '@colanode/ui/contexts/app';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { downloadBlob, downloadUrl } from '@colanode/ui/lib/download';

interface UseFileDownloadOptions {
  // Called once a desktop save is queued, so the file page can send the user
  // to the Downloads list while the image viewer simply stays where it is.
  onDesktopSaved?: () => void;
}

export const useFileDownload = (
  file: LocalFileNode,
  options: UseFileDownloadOptions = {}
) => {
  const app = useApp();
  const workspace = useWorkspace();
  const mutation = useMutation();
  const [isSaving, setIsSaving] = useState(false);

  const downloadDesktop = async () => {
    const path = await window.colanode.showFileSaveDialog({ name: file.name });
    if (!path) {
      return;
    }

    mutation.mutate({
      input: {
        type: 'file.download',
        userId: workspace.userId,
        fileId: file.id,
        path,
      },
      onSuccess: () => options.onDesktopSaved?.(),
      onError: (error) => {
        console.error('Failed to save file', { fileId: file.id, error });
        toast.error('Failed to save file');
      },
    });
  };

  const downloadWeb = async () => {
    setIsSaving(true);

    try {
      const localFile = await window.colanode.executeQuery({
        type: 'local.file.get',
        fileId: file.id,
        userId: workspace.userId,
      });

      // Already on this device: hand the local copy straight to the browser.
      if (localFile && localFile.url) {
        downloadUrl(localFile.url, file.name);
        return;
      }

      const request = await window.colanode.executeQuery({
        type: 'file.download.request.get',
        id: file.id,
        userId: workspace.userId,
      });

      if (!request) {
        toast.error('Failed to save file');
        return;
      }

      const response = await fetch(request.url, {
        method: 'GET',
        headers: request.headers,
      });

      if (!response.ok) {
        toast.error('Failed to save file');
        return;
      }

      downloadBlob(await response.blob(), file.name);
    } catch (error) {
      console.error('Failed to save file', { fileId: file.id, error });
      toast.error('Failed to save file');
    } finally {
      setIsSaving(false);
    }
  };

  const download = () => {
    if (app.type === 'desktop') {
      void downloadDesktop();
    } else if (app.type === 'web') {
      void downloadWeb();
    }
  };

  return { download, isPending: mutation.isPending || isSaving };
};
