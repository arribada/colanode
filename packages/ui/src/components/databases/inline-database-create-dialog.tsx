// ABOUTME: Modal to set up an inline database on creation -- name plus an
// ABOUTME: add/remove list of properties (columns) before it is inserted.
import { GripVertical, Plus, Trash2 } from 'lucide-react';
import { useEffect, useState } from 'react';

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

export interface InlineDatabaseProperty {
  name: string;
  type: string;
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

// Only the simple scalar field types (no extra required config) are offered
// here; richer types like Select can be added from the database afterwards.
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

// Select / relation etc. keep their options / target empty here; they are
// configured from the database's field settings once it exists.

const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring';

export const InlineDatabaseCreateDialog = ({
  open,
  onOpenChange,
  onCreate,
}: InlineDatabaseCreateDialogProps) => {
  const [name, setName] = useState('');
  const [properties, setProperties] = useState<InlineDatabaseProperty[]>([
    { name: 'Comment', type: 'text' },
  ]);

  useEffect(() => {
    if (open) {
      setName('');
      setProperties([{ name: 'Comment', type: 'text' }]);
    }
  }, [open]);

  const update = (index: number, changes: Partial<InlineDatabaseProperty>) => {
    setProperties((prev) =>
      prev.map((property, i) =>
        i === index ? { ...property, ...changes } : property
      )
    );
  };

  const create = () => {
    const values = {
      name: name.trim() || 'Untitled',
      properties: properties
        .map((property) => ({
          name: property.name.trim(),
          type: property.type,
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
            <div className="flex max-h-64 flex-col gap-1.5 overflow-y-auto">
              {properties.map((property, index) => (
                <div
                  key={index}
                  className="flex items-center gap-1.5 rounded-md border border-border p-1.5"
                >
                  <GripVertical className="size-4 shrink-0 text-muted-foreground" />
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
                      properties.length === 1 && 'pointer-events-none opacity-40'
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
