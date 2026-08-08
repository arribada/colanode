// Editable cell for a `file` database field. The stored value is a
// StringArrayFieldValue of file-node ids (the same shape relation uses); files
// are uploaded through the existing temp-file + file.create pipeline and parented
// under the record, then resolved for display from the workspace node collection.

import { eq, inArray, useLiveQuery } from '@tanstack/react-db';
import { Paperclip, X } from 'lucide-react';
import { Fragment, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { LocalFileNode } from '@colanode/client/types';
import { FileFieldAttributes, StringArrayFieldValue } from '@colanode/core';
import { FileIcon } from '@colanode/ui/components/files/file-icon';
import { Badge } from '@colanode/ui/components/ui/badge';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useRecord } from '@colanode/ui/contexts/record';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useRecordField } from '@colanode/ui/hooks/use-record-field';
import { openFileDialog } from '@colanode/ui/lib/files';

interface RecordFileValueProps {
  field: FileFieldAttributes;
  readOnly?: boolean;
}

const FileChip = ({ file }: { file: LocalFileNode }) => (
  <div className="flex flex-row items-center gap-1 overflow-hidden">
    <FileIcon
      mimeType={file.mimeType}
      className="size-4 shrink-0 text-muted-foreground"
    />
    <p className="text-sm line-clamp-1 w-full">{file.name}</p>
  </div>
);

export const RecordFileValue = ({ field, readOnly }: RecordFileValueProps) => {
  const workspace = useWorkspace();
  const record = useRecord();
  const { value, setValue, clearValue } =
    useRecordField<StringArrayFieldValue>({ field });

  const [open, setOpen] = useState(false);
  const [uploading, setUploading] = useState(false);

  const fileIds = useMemo(() => value?.value ?? [], [value]);

  const filesQuery = useLiveQuery(
    (q) => {
      if (fileIds.length === 0) {
        return q
          .from({ nodes: workspace.collections.nodes })
          .where(({ nodes }) => eq(nodes.id, '')); // Return empty result
      }

      return q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => inArray(nodes.id, fileIds));
    },
    [workspace.userId, fileIds]
  );

  // Preserve the stored order and drop ids that don't (yet) resolve. Query rows
  // are cast to LocalFileNode the same way the relation value casts its rows.
  const files = useMemo(() => {
    const byId = new Map(
      filesQuery.data.map((node) => [node.id, node as LocalFileNode])
    );
    return fileIds
      .map((id) => byId.get(id))
      .filter((node): node is LocalFileNode => node !== undefined);
  }, [filesQuery.data, fileIds]);

  const canEdit = record.canEdit && !readOnly;

  const removeFile = (id: string) => {
    if (!canEdit) return;
    const next = fileIds.filter((fileId) => fileId !== id);
    if (next.length === 0) {
      clearValue();
    } else {
      setValue({ type: 'string_array', value: next });
    }
  };

  const addFiles = async () => {
    if (!canEdit || uploading) return;

    const result = await openFileDialog({ multiple: true });
    if (result.type === 'error') {
      toast.error(result.error);
      return;
    }
    if (result.type !== 'success') {
      return;
    }

    setUploading(true);
    try {
      const uploadedIds: string[] = [];
      for (const tempFile of result.files) {
        const output = await window.colanode.executeMutation({
          type: 'file.create',
          userId: workspace.userId,
          tempFileId: tempFile.id,
          parentId: record.id,
        });

        if (!output.success) {
          toast.error(output.error.message);
          continue;
        }

        // The create mutation types its returned id as string | null (it mirrors
        // the file node's nullable id attr); only keep a concrete id.
        const uploadedId = output.output.id;
        if (uploadedId) {
          uploadedIds.push(uploadedId);
        }
      }

      if (uploadedIds.length > 0) {
        setValue({ type: 'string_array', value: [...fileIds, ...uploadedIds] });
      }
    } finally {
      setUploading(false);
    }
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label={field.name}
          className="flex h-full w-full cursor-pointer flex-wrap items-center gap-1 p-0 overflow-hidden text-left"
        >
          {files.slice(0, 1).map((file) => (
            <FileChip key={file.id} file={file} />
          ))}
          {files.length === 0 && ' '}
          {files.length > 1 && (
            <Badge
              variant="outline"
              className="ml-2 text-xs px-1 text-muted-foreground"
            >
              +{files.length - 1}
            </Badge>
          )}
        </button>
      </PopoverTrigger>
      <PopoverContent className="w-80 p-1">
        <div className="flex flex-col flex-wrap gap-2 p-2">
          {files.length > 0 ? (
            <Fragment>
              {files.map((file) => (
                <div
                  key={file.id}
                  data-testid={`record-file-row-${file.id}`}
                  className="flex w-full flex-row items-center gap-2"
                >
                  <FileChip file={file} />
                  {canEdit && (
                    <button
                      type="button"
                      aria-label="Remove file"
                      data-testid={`record-file-remove-${file.id}`}
                      className="ml-auto cursor-pointer"
                      onClick={() => removeFile(file.id)}
                    >
                      <X className="size-4" />
                    </button>
                  )}
                </div>
              ))}
              <Separator className="w-full my-2" />
            </Fragment>
          ) : (
            <p className="text-sm text-muted-foreground">No files</p>
          )}
        </div>
        {canEdit && (
          <Button
            type="button"
            variant="ghost"
            className="w-full justify-start gap-2"
            disabled={uploading}
            onClick={addFiles}
          >
            <Paperclip className="size-4" />
            {uploading ? 'Uploading...' : 'Add files'}
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};
