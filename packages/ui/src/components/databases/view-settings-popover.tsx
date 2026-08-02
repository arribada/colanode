import { Lock, LockOpen, Trash2 } from 'lucide-react';
import { Fragment, ReactNode, useState } from 'react';

import { ViewAvatarInput } from '@colanode/ui/components/databases/view-avatar-input';
import { ViewCsvActions } from '@colanode/ui/components/databases/view-csv-actions';
import { ViewAutomationsSettings } from '@colanode/ui/components/databases/view-automations-settings';
import { ViewConditionalColorSettings } from '@colanode/ui/components/databases/view-conditional-color-settings';
import { ViewCopyLinkAction } from '@colanode/ui/components/databases/view-copy-link-action';
import { ViewFieldSettings } from '@colanode/ui/components/databases/view-field-settings';
import { ViewRenameInput } from '@colanode/ui/components/databases/view-rename-input';
import { ViewSettingsButton } from '@colanode/ui/components/databases/view-settings-button';
import { NodeDeleteDialog } from '@colanode/ui/components/nodes/node-delete-dialog';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { Separator } from '@colanode/ui/components/ui/separator';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useDatabaseView } from '@colanode/ui/contexts/database-view';

interface ViewSettingsPopoverProps {
  // Layout-specific settings (e.g. the chart's type/group-by/aggregate config)
  // rendered right after the header. Layouts without extra settings omit it.
  children?: ReactNode;
  // Sections that only make sense for record-listing layouts. Charts turn these
  // off since they aggregate records rather than list them field-by-field.
  showFieldSettings?: boolean;
  showConditionalColor?: boolean;
  showCsvActions?: boolean;
}

export const ViewSettingsPopover = ({
  children,
  showFieldSettings = true,
  showConditionalColor = true,
  showCsvActions = true,
}: ViewSettingsPopoverProps) => {
  const database = useDatabase();
  const view = useDatabaseView();

  const [open, setOpen] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  return (
    <Fragment>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <ViewSettingsButton />
        </PopoverTrigger>
        <PopoverContent className="mr-4 flex max-h-[80vh] w-90 flex-col gap-1.5 overflow-y-auto p-2">
          <div className="flex flex-row items-center gap-2">
            <ViewAvatarInput
              id={view.id}
              name={view.name}
              avatar={view.avatar}
              layout={view.layout}
              readOnly={!database.canEdit || database.isLocked}
            />
            <ViewRenameInput
              id={view.id}
              name={view.name}
              readOnly={!database.canEdit || database.isLocked}
            />
          </div>
          {children && (
            <Fragment>
              <Separator />
              {children}
            </Fragment>
          )}
          {showFieldSettings && (
            <Fragment>
              <Separator />
              <ViewFieldSettings />
            </Fragment>
          )}
          {showConditionalColor && (
            <Fragment>
              <Separator />
              <ViewConditionalColorSettings />
            </Fragment>
          )}
          <Separator />
          <ViewAutomationsSettings />
          <Separator />
          <ViewCopyLinkAction closeMenu={() => setOpen(false)} />
          {showCsvActions && (
            <Fragment>
              <Separator />
              <ViewCsvActions closeMenu={() => setOpen(false)} />
            </Fragment>
          )}
          {database.canEdit && (
            <Fragment>
              <Separator />
              <div className="flex flex-col gap-2 text-sm">
                <p className="my-1 font-semibold">Settings</p>
                <button
                  type="button"
                  className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left hover:bg-accent"
                  onClick={() => {
                    database.toggleLock();
                  }}
                >
                  {database.isLocked ? (
                    <LockOpen className="size-4" />
                  ) : (
                    <Lock className="size-4" />
                  )}
                  <span>
                    {database.isLocked ? 'Unlock database' : 'Lock database'}
                  </span>
                </button>
                {!database.isLocked && (
                  <button
                    type="button"
                    className="flex w-full cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left hover:bg-accent"
                    onClick={() => {
                      setOpenDelete(true);
                      setOpen(false);
                    }}
                  >
                    <Trash2 className="size-4" />
                    <span>Delete view</span>
                  </button>
                )}
              </div>
            </Fragment>
          )}
        </PopoverContent>
      </Popover>
      {openDelete && (
        <NodeDeleteDialog
          title="Are you sure you want delete this view?"
          description="This action cannot be undone. This view will no longer be accessible and all data in the view will be lost."
          id={view.id}
          open={openDelete}
          onOpenChange={setOpenDelete}
        />
      )}
    </Fragment>
  );
};
