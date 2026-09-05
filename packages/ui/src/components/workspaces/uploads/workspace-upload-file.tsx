import { eq, useLiveQuery } from '@tanstack/react-db';
import { BadgeAlert, RotateCw } from 'lucide-react';
import { toast } from 'sonner';

import { UploadStatus, Upload, LocalFileNode } from '@colanode/client/types';
import { formatBytes, timeAgo } from '@colanode/core';
import { FileThumbnail } from '@colanode/ui/components/files/file-thumbnail';
import { Button } from '@colanode/ui/components/ui/button';
import { Link } from '@colanode/ui/components/ui/link';
import { WorkspaceUploadStatus } from '@colanode/ui/components/workspaces/uploads/workspace-upload-status';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface WorkspaceUploadFileProps {
  upload: Upload;
}

export const WorkspaceUploadFile = ({ upload }: WorkspaceUploadFileProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();

  const retryUpload = (e: React.MouseEvent) => {
    e.preventDefault();
    e.stopPropagation();
    mutate({
      input: {
        type: 'file.upload.retry',
        userId: workspace.userId,
        fileId: upload.fileId,
      },
      onError: (error) => {
        toast.error(error.message);
      },
    });
  };

  const fileQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.id, upload.fileId))
        .findOne(),
    [workspace.userId, upload.fileId]
  );

  const file = fileQuery.data as LocalFileNode | undefined;

  if (!file) {
    return (
      <div className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors flex items-center gap-6 cursor-pointer">
        <BadgeAlert className="size-10 text-muted-foreground" />

        <div className="grow flex flex-col gap-2 justify-center items-start min-w-0">
          <p className="font-medium text-sm truncate w-full">
            File not found or has been deleted
          </p>
          {upload.errorMessage && (
            <p className="text-xs text-red-500">{upload.errorMessage}</p>
          )}
        </div>
        <div className="flex items-center gap-2 shrink-0">
          {upload.status === UploadStatus.Failed && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              disabled={isPending}
              onClick={retryUpload}
            >
              <RotateCw className="mr-2 size-4" /> Retry
            </Button>
          )}
          <div className="w-10 flex items-center justify-center">
            <WorkspaceUploadStatus
              status={upload.status}
              progress={upload.progress}
            />
          </div>
        </div>
      </div>
    );
  }

  return (
    <Link
      from="/workspace/$userId"
      to="$nodeId"
      params={{ nodeId: file.id }}
      className="border rounded-lg p-4 bg-card hover:bg-accent/50 transition-colors flex items-center gap-6 cursor-pointer"
    >
      <FileThumbnail
        userId={workspace.userId}
        file={file}
        className="size-10 text-muted-foreground"
      />
      <div className="grow flex flex-col gap-2 justify-center items-start min-w-0">
        <p className="font-medium text-sm truncate w-full">{file.name}</p>
        <p className="flex items-center gap-4 text-xs text-muted-foreground">
          <span>{file.mimeType}</span>
          <span>{formatBytes(file.size)}</span>
          {upload.completedAt && (
            <span>{timeAgo(new Date(upload.completedAt))}</span>
          )}
        </p>
        {upload.errorMessage && (
          <p className="text-xs text-red-500">{upload.errorMessage}</p>
        )}
      </div>
      <div className="flex items-center gap-2 shrink-0">
        {upload.status === UploadStatus.Failed && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isPending}
            onClick={retryUpload}
          >
            <RotateCw className="mr-2 size-4" /> Retry
          </Button>
        )}
        <div className="w-10 flex items-center justify-center">
          <WorkspaceUploadStatus
            status={upload.status}
            progress={upload.progress}
          />
        </div>
      </div>
    </Link>
  );
};
