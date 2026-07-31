import { Plus } from 'lucide-react';
import { Fragment, useState } from 'react';

import { SpaceCreateDialog } from '@colanode/ui/components/spaces/space-create-dialog';

export const SpaceCreateButton = () => {
  const [open, setOpen] = useState(false);

  return (
    <Fragment>
      <button
        type="button"
        aria-label="Create space"
        data-testid="space-create-button"
        className="flex cursor-pointer items-center justify-center"
        onClick={() => setOpen(true)}
      >
        <Plus className="size-4" />
      </button>
      <SpaceCreateDialog open={open} onOpenChange={setOpen} />
    </Fragment>
  );
};
