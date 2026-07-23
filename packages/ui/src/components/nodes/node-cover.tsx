import { ImageIcon, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { NodeCover } from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import {
  coverColorPresets,
  coverGradientPresets,
  getCoverClass,
} from '@colanode/ui/lib/covers';
import { cn } from '@colanode/ui/lib/utils';

interface CoverPickerProps {
  cover: NodeCover | null | undefined;
  onChange: (cover: NodeCover | null) => void;
  children: React.ReactNode;
}

const CoverPicker = ({ cover, onChange, children }: CoverPickerProps) => {
  const [open, setOpen] = useState(false);

  const sections = [
    { title: 'Colors', presets: coverColorPresets },
    { title: 'Gradients', presets: coverGradientPresets },
  ];

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>{children}</PopoverTrigger>
      <PopoverContent className="w-72 p-3" align="end">
        <div className="flex flex-col gap-3">
          {sections.map((section) => (
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
          {cover && (
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => {
                onChange(null);
                setOpen(false);
              }}
            >
              <Trash2 className="size-4" />
              Remove cover
            </Button>
          )}
        </div>
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
  const coverClass = getCoverClass(cover);

  if (!coverClass) {
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
      className={cn('relative mb-4 h-32 w-full rounded-lg lg:h-40', coverClass)}
    >
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
