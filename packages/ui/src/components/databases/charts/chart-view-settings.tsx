// ABOUTME: Settings popover for the database chart view — chart type, group-by
// ABOUTME: field, aggregation and (for sum/average) the numeric value field.
import {
  ChartColumnBig,
  ChartLine,
  ChartPie,
  Lock,
  LockOpen,
  Trash2,
} from 'lucide-react';
import { FC, Fragment, useState } from 'react';

import {
  DatabaseViewChartAggregate,
  DatabaseViewChartAttributes,
  DatabaseViewChartType,
} from '@colanode/core';
import { FieldSelect } from '@colanode/ui/components/databases/fields/field-select';
import { ViewAvatarInput } from '@colanode/ui/components/databases/view-avatar-input';
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
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { cn } from '@colanode/ui/lib/utils';

const chartTypes: { value: DatabaseViewChartType; label: string; icon: FC }[] = [
  { value: 'bar', label: 'Bar', icon: ChartColumnBig },
  { value: 'pie', label: 'Pie', icon: ChartPie },
  { value: 'line', label: 'Line', icon: ChartLine },
];

const aggregates: { value: DatabaseViewChartAggregate; label: string }[] = [
  { value: 'count', label: 'Count' },
  { value: 'sum', label: 'Sum' },
  { value: 'average', label: 'Average' },
];

export const ChartViewSettings = () => {
  const workspace = useWorkspace();
  const database = useDatabase();
  const view = useDatabaseView();

  const [open, setOpen] = useState(false);
  const [openDelete, setOpenDelete] = useState(false);

  const canEdit = database.canEdit && !database.isLocked;
  const chart = view.chart;
  const chartType = chart?.type ?? 'bar';
  const aggregate = chart?.aggregate ?? 'count';

  const numberFields = database.fields.filter(
    (field) => field.type === 'number'
  );

  const updateChart = (patch: Partial<DatabaseViewChartAttributes>) => {
    if (!canEdit) {
      return;
    }

    workspace.collections.nodes.update(view.id, (draft) => {
      if (draft.type !== 'database_view') {
        return;
      }

      const current = draft.chart ?? { type: 'bar' };
      draft.chart = {
        ...current,
        ...patch,
        type: patch.type ?? current.type ?? 'bar',
      };
    });
  };

  return (
    <Fragment>
      <Popover open={open} onOpenChange={setOpen}>
        <PopoverTrigger>
          <ViewSettingsButton />
        </PopoverTrigger>
        <PopoverContent className="mr-4 flex w-90 flex-col gap-1.5 p-2">
          <div className="flex flex-row items-center gap-2">
            <ViewAvatarInput
              id={view.id}
              name={view.name}
              avatar={view.avatar}
              layout={view.layout}
              readOnly={!canEdit}
            />
            <ViewRenameInput
              id={view.id}
              name={view.name}
              readOnly={!canEdit}
            />
          </div>
          <Separator />
          <div className="flex flex-col gap-3 py-1">
            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Chart type</p>
              <div className="grid grid-cols-3 gap-2">
                {chartTypes.map((type) => (
                  <button
                    key={type.value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => updateChart({ type: type.value })}
                    className={cn(
                      'flex cursor-pointer flex-col items-center gap-1 rounded-md border p-2 text-muted-foreground',
                      'hover:bg-accent',
                      chartType === type.value
                        ? 'border-foreground text-foreground'
                        : ''
                    )}
                  >
                    <type.icon />
                    <span className="text-xs">{type.label}</span>
                  </button>
                ))}
              </div>
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Group by</p>
              <FieldSelect
                fields={database.fields}
                value={chart?.groupBy ?? null}
                onChange={(fieldId) => updateChart({ groupBy: fieldId })}
              />
            </div>

            <div className="flex flex-col gap-1.5">
              <p className="text-sm font-medium">Aggregate</p>
              <div className="grid grid-cols-3 gap-2">
                {aggregates.map((item) => (
                  <button
                    key={item.value}
                    type="button"
                    disabled={!canEdit}
                    onClick={() => updateChart({ aggregate: item.value })}
                    className={cn(
                      'cursor-pointer rounded-md border p-1.5 text-xs text-muted-foreground',
                      'hover:bg-accent',
                      aggregate === item.value
                        ? 'border-foreground text-foreground'
                        : ''
                    )}
                  >
                    {item.label}
                  </button>
                ))}
              </div>
            </div>

            {aggregate !== 'count' && (
              <div className="flex flex-col gap-1.5">
                <p className="text-sm font-medium">Value field</p>
                {numberFields.length > 0 ? (
                  <FieldSelect
                    fields={numberFields}
                    value={chart?.valueFieldId ?? null}
                    onChange={(fieldId) =>
                      updateChart({ valueFieldId: fieldId })
                    }
                  />
                ) : (
                  <p className="text-xs text-muted-foreground">
                    Add a number field to use sum or average.
                  </p>
                )}
              </div>
            )}
          </div>

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
