import { ImageIcon, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { NodeCover } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@colanode/ui/components/ui/tabs';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import {
  coverColorPresets,
  coverGradientPresets,
  getCoverClass,
  unsplashCoverCategories,
} from '@colanode/ui/lib/covers';
import { openFileDialog } from '@colanode/ui/lib/files';
import { cn } from '@colanode/ui/lib/utils';

// ---- image cover rendering ---------------------------------------------
const isRemote = (value: string) => /^https?:\/\//.test(value);

const AvatarCoverImage = ({ avatarId }: { avatarId: string }) => {
  const workspace = useWorkspace();
  const avatarQuery = useLiveQuery({
    type: 'avatar.get',
    accountId: workspace.accountId,
    avatarId,
  });
  const url = avatarQuery.data?.url;
  if (!url) {
    return <div className="h-full w-full rounded-lg bg-muted" />;
  }
  return (
    <img
      src={url}
      alt="Cover"
      className="h-full w-full rounded-lg object-cover"
    />
  );
};

const CoverImage = ({ value }: { value: string }) =>
  isRemote(value) ? (
    <img
      src={value}
      alt="Cover"
      className="h-full w-full rounded-lg object-cover"
    />
  ) : (
    <AvatarCoverImage avatarId={value} />
  );

// ---- picker -------------------------------------------------------------
interface CoverPickerProps {
  cover: NodeCover | null | undefined;
  onChange: (cover: NodeCover | null) => void;
  children: React.ReactNode;
}

const CoverPicker = ({ cover, onChange, children }: CoverPickerProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();
  const [open, setOpen] = useState(false);

  const paletteSections = [
    { title: 'Colors', presets: coverColorPresets },
    { title: 'Gradients', presets: coverGradientPresets },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-96 p-3" align="end">
        <Tabs defaultValue="palette">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="palette">Palette</TabsTrigger>
            <TabsTrigger value="upload">Upload</TabsTrigger>
            <TabsTrigger value="unsplash">Unsplash</TabsTrigger>
          </TabsList>

          {/* Palette */}
          <TabsContent value="palette" className="flex flex-col gap-3 pt-2">
            {paletteSections.map((section) => (
              <div key={section.title}>
                <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                  {section.title}
                </p>
                <div className="grid grid-cols-8 gap-1.5">
                  {section.presets.map((preset) => {
                    const isActive =
                      cover?.type === preset.cover.type &&
                      cover?.value === preset.cover.value;
                    return (
                      <button
                        key={preset.cover.value}
                        type="button"
                        title={preset.label}
                        aria-label={`${preset.label} cover`}
                        className={cn(
                          'size-7 cursor-pointer rounded-md',
                          preset.class,
                          isActive
                            ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                            : 'hover:opacity-80'
                        )}
                        onClick={() => {
                          onChange(preset.cover);
                          setOpen(false);
                        }}
                      />
                    );
                  })}
                </div>
              </div>
            ))}
          </TabsContent>

          {/* Upload */}
          <TabsContent value="upload" className="pt-2">
            <Button
              type="button"
              variant="outline"
              className="w-full cursor-pointer"
              disabled={isPending}
              onClick={async () => {
                if (isPending) return;
                const result = await openFileDialog({
                  accept: 'image/jpeg, image/jpg, image/png, image/webp',
                });
                if (result.type === 'success') {
                  const file = result.files[0];
                  if (!file) return;
                  mutate({
                    input: {
                      type: 'avatar.upload',
                      accountId: workspace.accountId,
                      file,
                    },
                    onSuccess(output) {
                      onChange({ type: 'image', value: output.id });
                      setOpen(false);
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
              {isPending ? (
                <Spinner className="mr-1" />
              ) : (
                <Upload className="mr-1 size-4" />
              )}
              Upload an image
            </Button>
            <p className="mt-3 text-center text-xs text-muted-foreground">
              JPG, PNG or WebP. Max 5MB.
            </p>
          </TabsContent>

          {/* Unsplash */}
          <TabsContent value="unsplash" className="pt-2">
            <div className="flex max-h-72 flex-col gap-3 overflow-y-auto pr-1">
              {unsplashCoverCategories.map((category) => (
                <div key={category.title}>
                  <p className="mb-1.5 text-xs font-medium text-muted-foreground">
                    {category.title}
                  </p>
                  <div className="grid grid-cols-4 gap-1.5">
                    {category.presets.map((preset) => {
                      const isActive =
                        cover?.type === 'image' && cover?.value === preset.url;
                      return (
                        <button
                          key={preset.id}
                          type="button"
                          title={preset.label}
                          aria-label={`${preset.label} cover`}
                          className={cn(
                            'h-12 w-full cursor-pointer overflow-hidden rounded-md bg-muted',
                            isActive
                              ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                              : 'hover:opacity-80'
                          )}
                          onClick={() => {
                            onChange({ type: 'image', value: preset.url });
                            setOpen(false);
                          }}
                        >
                          <img
                            src={preset.thumb}
                            alt={preset.label}
                            loading="lazy"
                            className="h-full w-full object-cover"
                          />
                        </button>
                      );
                    })}
                  </div>
                </div>
              ))}
            </div>
            <p className="mt-2 text-center text-[11px] text-muted-foreground">
              Photos from Unsplash
            </p>
          </TabsContent>
        </Tabs>

        {cover && (
          <Button
            type="button"
            variant="outline"
            size="sm"
            className="mt-3 w-full"
            onClick={() => {
              onChange(null);
              setOpen(false);
            }}
          >
            <Trash2 className="mr-1 size-4" />
            Remove cover
          </Button>
        )}
      </PopoverContent>
    </Popover>
  );
};

interface NodeCoverBannerProps {
  cover: NodeCover | null | undefined;
  canEdit: boolean;
  onChange: (cover: NodeCover | null) => void;
}

// Banner shown at the top of page and record containers. Without a cover it
// renders an "Add cover" affordance (revealed on hover of the surrounding
// `group/cover` element); with a cover it renders the banner plus a change
// control for editors.
export const NodeCoverBanner = ({
  cover,
  canEdit,
  onChange,
}: NodeCoverBannerProps) => {
  const isImage = cover?.type === 'image';
  const coverClass = getCoverClass(cover); // null for image type

  if (!coverClass && !isImage) {
    if (!canEdit) {
      return null;
    }

    return (
      <div className="flex h-8 items-center opacity-0 transition-opacity focus-within:opacity-100 group-hover/cover:opacity-100">
        <CoverPicker cover={cover} onChange={onChange}>
          <Button
            type="button"
            variant="ghost"
            size="sm"
            className="text-muted-foreground"
            data-testid="add-cover-button"
          >
            <ImageIcon className="size-4" />
            Add cover
          </Button>
        </CoverPicker>
      </div>
    );
  }

  return (
    <div
      data-testid="node-cover"
      className={cn(
        'relative mb-4 h-32 w-full overflow-hidden rounded-lg lg:h-40',
        !isImage && coverClass
      )}
    >
      {isImage && cover && <CoverImage value={cover.value} />}
      {canEdit && (
        <div className="absolute right-2 top-2 opacity-0 transition-opacity focus-within:opacity-100 group-hover/cover:opacity-100">
          <CoverPicker cover={cover} onChange={onChange}>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="bg-background/70 backdrop-blur"
              data-testid="change-cover-button"
            >
              Change cover
            </Button>
          </CoverPicker>
        </div>
      )}
    </div>
  );
};
