import { useState } from 'react';
import { toast } from 'sonner';

import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { openFileDialog } from '@colanode/ui/lib/files';

interface AvatarUploadProps {
  onUpload: (id: string) => void;
}

export const AvatarUpload = ({ onUpload }: AvatarUploadProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();

  const [url, setUrl] = useState<string | undefined>(undefined);

  const handleSubmit = async (value: string) => {
    if (isPending) {
      return;
    }

    try {
      const response = await fetch(value);
      if (!response.ok) {
        throw new Error('Could not download the image from that URL.');
      }

      const blob = await response.blob();
      if (!blob.type.startsWith('image/')) {
        throw new Error('The URL does not point to an image.');
      }

      const name = value.split('/').pop()?.split('?')[0] || 'avatar';
      const file = new File([blob], name, { type: blob.type });
      const tempFile = await window.colanode.saveTempFile(file);

      mutate({
        input: {
          type: 'avatar.upload',
          accountId: workspace.accountId,
          file: tempFile,
        },
        onSuccess(output) {
          onUpload(output.id);
        },
        onError(error) {
          toast.error(error.message);
        },
      });
    } catch (error) {
      toast.error(
        error instanceof Error
          ? error.message
          : 'Could not import the image from that URL.'
      );
    }
  };

  return (
    <div className="h-[280px] min-h-[280px] w-[335px] min-w-[335px] p-1">
      <form
        className="mb-5 flex gap-x-2"
        onSubmit={async (e) => {
          e.preventDefault();
          e.stopPropagation();

          if (url) {
            await handleSubmit(url);
          }
        }}
      >
        <Input
          type="text"
          name="url"
          placeholder="Paste link to an image..."
          aria-label="Image URL"
          onChange={(e) => setUrl(e.target.value)}
          autoComplete="off"
        />
        <Button
          type="submit"
          className="h-auto px-3 py-0 text-sm"
          disabled={!url}
          data-testid="avatar-upload-url-submit-button"
        >
          Submit
        </Button>
      </form>
      <Button
        type="button"
        className="w-full cursor-pointer"
        variant="outline"
        data-testid="avatar-upload-file-button"
        disabled={isPending}
        onClick={async () => {
          if (isPending) {
            return;
          }

          const result = await openFileDialog({
            accept: 'image/jpeg, image/jpg, image/png, image/webp',
          });

          if (result.type === 'success') {
            const file = result.files[0];
            if (!file) {
              return;
            }

            mutate({
              input: {
                type: 'avatar.upload',
                accountId: workspace.accountId,
                file,
              },
              onSuccess(output) {
                onUpload(output.id);
              },
              onError(error) {
                toast.error(error.message);
              },
            });
          } else if (result.type === 'error') {
            toast.error(result.error);
          }
        }}
      >
        {isPending && <Spinner className="mr-1" />}
        Upload file
      </Button>
      <div className="mt-4 flex flex-col gap-2 text-center text-xs text-muted-foreground">
        <div>Recommended size is 280px x 280px</div>
        <div>The maximum size per file is 5MB.</div>
      </div>
    </div>
  );
};
