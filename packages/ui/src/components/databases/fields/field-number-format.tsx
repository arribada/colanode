// ABOUTME: Number-format picker for a number field's settings — writes the
// ABOUTME: chosen format onto the field so every view renders it the same way.
import { Check, Hash } from 'lucide-react';

import { NumberFieldAttributes } from '@colanode/core';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  NUMBER_FORMATS,
  NumberFormatKind,
} from '@colanode/ui/lib/number-format';
import { cn } from '@colanode/ui/lib/utils';

interface FieldNumberFormatProps {
  field: NumberFieldAttributes;
}

export const FieldNumberFormat = ({ field }: FieldNumberFormatProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const canEdit = database.canEdit && !database.isLocked;
  const current: NumberFormatKind =
    (field.format as NumberFormatKind | null | undefined) ?? 'plain';
  const currentOption =
    NUMBER_FORMATS.find((option) => option.value === current) ??
    NUMBER_FORMATS[0];

  // The format lives on the field (on the database node), so it is shared: every
  // view of this database renders the number the same way. Mirrors the direct
  // node.update used elsewhere for discrete field-settings changes.
  const setFormat = (format: NumberFormatKind) => {
    if (!canEdit) {
      return;
    }
    workspace.collections.nodes.update(database.id, (draft) => {
      if (draft.type !== 'database') {
        return;
      }
      const attributes = draft.fields[field.id];
      if (!attributes || attributes.type !== 'number') {
        return;
      }
      attributes.format = format;
    });
  };

  return (
    <div className="flex flex-col gap-1">
      <span className="px-1 text-xs text-muted-foreground">Number format</span>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <button
            type="button"
            disabled={!canEdit}
            className="flex flex-row items-center justify-between gap-2 rounded-sm p-1 text-sm hover:bg-accent disabled:cursor-default disabled:opacity-60"
          >
            <span className="flex items-center gap-2">
              <Hash className="size-4" />
              <span>{currentOption?.label ?? 'Plain'}</span>
            </span>
            <span className="text-xs text-muted-foreground">
              {currentOption?.example}
            </span>
          </button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="start" className="w-56">
          {NUMBER_FORMATS.map((option) => (
            <DropdownMenuItem
              key={option.value}
              onSelect={() => setFormat(option.value)}
              className="flex items-center justify-between gap-2"
            >
              <span className="flex items-center gap-2">
                <Check
                  className={cn(
                    'size-4',
                    option.value === current ? 'opacity-100' : 'opacity-0'
                  )}
                />
                <span>{option.label}</span>
              </span>
              <span className="text-xs text-muted-foreground">
                {option.example}
              </span>
            </DropdownMenuItem>
          ))}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
};
