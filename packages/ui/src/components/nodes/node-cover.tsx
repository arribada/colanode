import { ImageIcon, Search, Trash2, Upload } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { NodeCover, UnsplashPhoto } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
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
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';
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

// ---- unsplash tab -------------------------------------------------------
interface UnsplashTabProps {
  accountId: string;
  cover: NodeCover | null | undefined;
  // Sets the cover to the given remote image URL and closes the popover —
  // the same path the curated presets and the palette use.
  onSelect: (url: string) => void;
}

// The Unsplash tab: a debounced live search over the server proxy plus the
// curated presets shown while the search box is empty. The Unsplash Access
// Key lives only on the server; this component never sees it.
const UnsplashTab = ({ accountId, cover, onSelect }: UnsplashTabProps) => {
  const [search, setSearch] = useState('');
  const debounced = useDebouncedValue(search, 400);
  const trimmed = debounced.trim();
  const { mutate } = useMutation();

  const searchQuery = useQuery(
    {
      type: 'unsplash.search',
      accountId,
      query: trimmed,
      page: 1,
    },
    {
      // Only hit the network once there's something to search for; the
      // curated presets carry the empty state.
      enabled: trimmed.length > 0,
    }
  );

  const handlePhoto = (photo: UnsplashPhoto) => {
    // Unsplash API guideline: ping the photo's download endpoint when it's
    // actually used. Fire-and-forget — never blocks selecting the cover.
    mutate({
      input: {
        type: 'unsplash.download',
        accountId,
        downloadLocation: photo.downloadLocation,
      },
    });
    onSelect(photo.regular);
  };

  const results = searchQuery.data?.results ?? [];

  return (
    <div className="flex flex-col gap-2 pt-2">
      <div className="relative">
        <Search className="pointer-events-none absolute left-2 top-1/2 size-4 -translate-y-1/2 text-muted-foreground" />
        <Input
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          placeholder="Search Unsplash photos"
          className="h-8 pl-8 text-sm"
          autoFocus
        />
      </div>

      {trimmed.length === 0 ? (
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
                      onClick={() => onSelect(preset.url)}
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
      ) : (
        <div className="flex max-h-72 min-h-24 flex-col overflow-y-auto pr-1">
          {searchQuery.isLoading ? (
            <div className="flex flex-1 items-center justify-center py-8">
              <Spinner />
            </div>
          ) : searchQuery.data?.error ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              Unsplash unavailable
            </p>
          ) : results.length === 0 ? (
            <p className="py-8 text-center text-xs text-muted-foreground">
              No results
            </p>
          ) : (
            <div className="grid grid-cols-3 gap-1.5">
              {results.map((photo) => {
                const isActive =
                  cover?.type === 'image' && cover?.value === photo.regular;
                return (
                  <div
                    key={photo.id}
                    className="group/photo relative h-16 overflow-hidden rounded-md bg-muted"
                  >
                    <button
                      type="button"
                      title={`Photo by ${photo.authorName} on Unsplash`}
                      aria-label={`Select photo by ${photo.authorName}`}
                      className={cn(
                        'h-full w-full cursor-pointer',
                        isActive
                          ? 'ring-2 ring-ring ring-offset-2 ring-offset-background'
                          : 'hover:opacity-80'
                      )}
                      onClick={() => handlePhoto(photo)}
                    >
                      <img
                        src={photo.thumb}
                        alt={photo.description ?? 'Unsplash photo'}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    </button>
                    {photo.authorUsername && (
                      <a
                        href={`https://unsplash.com/@${photo.authorUsername}?utm_source=colanode&utm_medium=referral`}
                        target="_blank"
                        rel="noreferrer"
                        onClick={(event) => event.stopPropagation()}
                        className="absolute inset-x-0 bottom-0 truncate bg-black/50 px-1 py-0.5 text-[9px] text-white opacity-0 transition-opacity hover:underline group-hover/photo:opacity-100"
                      >
                        {photo.authorName}
                      </a>
                    )}
                  </div>
                );
              })}
            </div>
          )}
        </div>
      )}

      <p className="mt-1 text-center text-[11px] text-muted-foreground">
        Photos from{' '}
        <a
          href="https://unsplash.com/?utm_source=colanode&utm_medium=referral"
          target="_blank"
          rel="noreferrer"
          className="underline hover:text-foreground"
        >
          Unsplash
        </a>
      </p>
    </div>
  );
};

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
          <TabsContent value="unsplash">
            <UnsplashTab
              accountId={workspace.accountId}
              cover={cover}
              onSelect={(url) => {
                onChange({ type: 'image', value: url });
                setOpen(false);
              }}
            />
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
