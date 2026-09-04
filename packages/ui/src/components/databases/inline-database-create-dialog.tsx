// ABOUTME: Modal to set up an inline database on creation -- name plus an
// ABOUTME: add/remove/configure list of properties (columns) before insert.
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

import { DatabaseSelect } from '@colanode/ui/components/databases/database-select';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { cn } from '@colanode/ui/lib/utils';

// Internal per-row state (optionsText is the raw comma-separated input).
interface PropertyDraft {
  name: string;
  type: string;
  relationDatabaseId?: string;
  optionsText?: string;
}

export interface InlineDatabaseProperty {
  name: string;
  type: string;
  relationDatabaseId?: string;
  options?: string[];
}

export interface InlineDatabaseValues {
  name: string;
  properties: InlineDatabaseProperty[];
}

interface InlineDatabaseCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onCreate: (values: InlineDatabaseValues) => void;
}

const PROPERTY_TYPES: { value: string; label: string }[] = [
  { value: 'text', label: 'Text' },
  { value: 'number', label: 'Number' },
  { value: 'select', label: 'Select' },
  { value: 'multi_select', label: 'Multi-select' },
  { value: 'date', label: 'Date' },
  { value: 'boolean', label: 'Checkbox' },
  { value: 'url', label: 'URL' },
  { value: 'email', label: 'Email' },
  { value: 'phone', label: 'Phone' },
  { value: 'rating', label: 'Rating' },
  { value: 'relation', label: 'Relation' },
  { value: 'collaborator', label: 'Person' },
  { value: 'file', label: 'File' },
];

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring';

export const InlineDatabaseCreateDialog = ({
  open,
  onOpenChange,
  onCreate,
}: InlineDatabaseCreateDialogProps) => {
  const [name, setName] = useState('');
  const [properties, setProperties] = useState<PropertyDraft[]>([
    { name: 'Comment', type: 'text' },
  ]);
  const [dragIndex, setDragIndex] = useState<number | null>(null);

  const reorder = (from: number, to: number) => {
    setProperties((prev) => {
      if (from === to || from < 0 || to < 0 || from >= prev.length) {
        return prev;
      }
      const next = [...prev];
      const [moved] = next.splice(from, 1);
      next.splice(to, 0, moved!);
      return next;
    });
  };

  useEffect(() => {
    if (open) {
      setName('');
      setProperties([{ name: 'Comment', type: 'text' }]);
    }
  }, [open]);

  const update = (index: number, changes: Partial<PropertyDraft>) => {
    setProperties((prev) =>
      prev.map((property, i) =>
        i === index ? { ...property, ...changes } : property
      )
    );
  };

  const create = () => {
    const values: InlineDatabaseValues = {
      name: name.trim() || 'Untitled',
      properties: properties
        .map((property) => ({
          name: property.name.trim(),
          type: property.type,
          relationDatabaseId:
            property.type === 'relation'
              ? property.relationDatabaseId
              : undefined,
          options:
            property.type === 'select' || property.type === 'multi_select'
              ? (property.optionsText ?? '')
                  .split(',')
                  .map((o) => o.trim())
                  .filter((o) => o.length > 0)
              : undefined,
        }))
        .filter((property) => property.name.length > 0),
    };
    // Close first so a downstream error can never leave the modal stuck open.
    onOpenChange(false);
    onCreate(values);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New database</DialogTitle>
        </DialogHeader>
        <div className="flex flex-col gap-3 py-1">
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Name
            </span>
            <Input
              // eslint-disable-next-line jsx-a11y/no-autofocus -- name the database immediately
              autoFocus
              value={name}
              placeholder="Database name"
              onChange={(event) => setName(event.target.value)}
              onKeyDown={(event) => {
                if (event.key === 'Enter') {
                  event.preventDefault();
                  create();
                }
              }}
            />
          </div>
          <div className="flex flex-col gap-1">
            <span className="text-xs font-medium text-muted-foreground">
              Properties
            </span>
            <div className="flex max-h-72 flex-col gap-1.5 overflow-y-auto">
              {properties.map((property, index) => (
                <div
                  key={index}
                  className="flex flex-col gap-1.5 rounded-md border border-border p-1.5"
                  onDragOver={(event) => event.preventDefault()}
                  onDrop={() => {
                    if (dragIndex != null) {
                      reorder(dragIndex, index);
                    }
                    setDragIndex(null);
                  }}
                >
                  <div className="flex items-center gap-1.5">
                    <span
                      draggable
                      onDragStart={() => setDragIndex(index)}
                      onDragEnd={() => setDragIndex(null)}
                      className="cursor-grab active:cursor-grabbing"
                      aria-label="Drag to reorder"
                    >
                      <GripVertical className="size-4 shrink-0 text-muted-foreground" />
                    </span>
                    <Input
                      className="h-8 flex-1"
                      value={property.name}
                      placeholder="Property name"
                      onChange={(event) =>
                        update(index, { name: event.target.value })
                      }
                    />
                    <select
                      className={selectClass}
                      value={property.type}
                      onChange={(event) =>
                        update(index, { type: event.target.value })
                      }
                    >
                      {PROPERTY_TYPES.map((type) => (
                        <option key={type.value} value={type.value}>
                          {type.label}
                        </option>
                      ))}
                    </select>
                    <button
                      type="button"
                      aria-label="Remove property"
                      className={cn(
                        'flex size-7 shrink-0 items-center justify-center rounded-sm text-muted-foreground hover:text-destructive',
                        properties.length === 1 &&
                          'pointer-events-none opacity-40'
                      )}
                      onClick={() =>
                        setProperties((prev) =>
                          prev.filter((_, i) => i !== index)
                        )
                      }
                    >
                      <Trash2 className="size-4" />
                    </button>
                  </div>
                  {property.type === 'relation' && (
                    <div className="flex flex-col gap-1 pl-7">
                      <DatabaseSelect
                        id={property.relationDatabaseId ?? null}
                        onChange={(databaseId) =>
                          update(index, { relationDatabaseId: databaseId })
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">
                        Links to records of the chosen database.
                      </span>
                    </div>
                  )}
                  {(property.type === 'select' ||
                    property.type === 'multi_select') && (
                    <div className="flex flex-col gap-1 pl-7">
                      <Input
                        className="h-8"
                        value={property.optionsText ?? ''}
                        placeholder="Options, comma-separated (e.g. Low, Medium, High)"
                        onChange={(event) =>
                          update(index, { optionsText: event.target.value })
                        }
                      />
                      <span className="text-[11px] text-muted-foreground">
                        You can add or edit options later from the column too.
                      </span>
                    </div>
                  )}
                </div>
              ))}
            </div>
            <Button
              type="button"
              variant="outline"
              size="sm"
              className="mt-1 w-full gap-2"
              onClick={() =>
                setProperties((prev) => [...prev, { name: '', type: 'text' }])
              }
            >
              <Plus className="size-4" />
              Add property
            </Button>
          </div>
        </div>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={create}>Create</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
