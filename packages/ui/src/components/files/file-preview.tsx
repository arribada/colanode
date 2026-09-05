import { RotateCw } from 'lucide-react';

import { DownloadStatus, LocalFileNode } from '@colanode/client/types';
import { FileStatus } from '@colanode/core';
import { FileDownloadProgress } from '@colanode/ui/components/files/file-download-progress';
import { FileNoPreview } from '@colanode/ui/components/files/file-no-preview';
import { FileNotUploaded } from '@colanode/ui/components/files/file-not-uploaded';
import { FilePreviewAudio } from '@colanode/ui/components/files/previews/file-preview-audio';
import { FilePreviewImage } from '@colanode/ui/components/files/previews/file-preview-image';
import { FilePreviewVideo } from '@colanode/ui/components/files/previews/file-preview-video';
import { Button } from '@colanode/ui/components/ui/button';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

interface FilePreviewProps {
  file: LocalFileNode;
}

export const FilePreview = ({ file }: FilePreviewProps) => {
  const workspace = useWorkspace();

  const isReady = file.status === FileStatus.Ready;
  const localFileQuery = useLiveQuery({
    type: 'local.file.get',
    fileId: file.id,
    userId: workspace.userId,
    autoDownload: isReady,
  });

  if (localFileQuery.isPending) {
    return null;
  }

  const localFile = localFileQuery.data;
  if (!localFile) {
    if (!isReady) {
      return <FileNotUploaded mimeType={file.mimeType} />;
    }

    return <FileNoPreview mimeType={file.mimeType} />;
  }

  if (localFile.downloadStatus === DownloadStatus.Failed) {
    return (
      <div className="flex h-full w-full items-center justify-center">
        <div className="flex flex-col items-center gap-4 text-center text-muted-foreground">
          <p className="text-sm font-medium text-muted-foreground">
            Couldn't download this file.
          </p>
          <Button
            type="button"
            variant="outline"
            onClick={() => localFileQuery.refetch()}
          >
            <RotateCw className="mr-2 size-4" /> Retry
          </Button>
        </div>
      </div>
    );
  }

  if (localFile.downloadStatus !== DownloadStatus.Completed) {
    return <FileDownloadProgress progress={localFile.downloadProgress} />;
  }

  if (localFile.downloadStatus === DownloadStatus.Completed && localFile.url) {
    if (file.subtype === 'image') {
      return <FilePreviewImage url={localFile.url} name={file.name} />;
    }

    if (file.subtype === 'video') {
      return <FilePreviewVideo url={localFile.url} />;
    }

    if (file.subtype === 'audio') {
      return <FilePreviewAudio url={localFile.url} name={file.name} />;
    }

    if (file.subtype === 'pdf') {
      return (
        <iframe
          src={localFile.url}
          title={file.name}
          className="h-full w-full rounded-md border border-border"
        />
      );
    }
  }

  return <FileNoPreview mimeType={file.mimeType} />;
};
