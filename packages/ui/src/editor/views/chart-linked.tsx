// ABOUTME: Chart block drawn from a table of the same page — follows the table
// ABOUTME: live; a dialog picks the type, the x column and the series to plot.
import { type Editor, type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import {
  ChartArea,
  ChartColumnBig,
  ChartColumnStacked,
  LineChart,
  Pencil,
  PieChart,
} from 'lucide-react';
import { useEffect, useMemo, useState } from 'react';

import { Button } from '@colanode/ui/components/ui/button';
import { Checkbox } from '@colanode/ui/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { chartsToOpen } from '@colanode/ui/editor/views/chart-insert';
import {
  MultiSeriesChart,
  seriesColor,
} from '@colanode/ui/editor/views/chart-multi-series';
import {
  buildTableChart,
  type ChartColumnRef,
  type ChartSeriesRef,
  columnNames,
  findTableById,
  MAX_CHART_SERIES,
  resolveColumn,
  type TableChartType,
  tableMatrix,
} from '@colanode/ui/editor/views/chart-table';
import { cn } from '@colanode/ui/lib/utils';

const TYPES: { key: TableChartType; label: string; icon: typeof PieChart }[] = [
  { key: 'bar', label: 'Bars', icon: ChartColumnBig },
  { key: 'stacked', label: 'Stacked', icon: ChartColumnStacked },
  { key: 'line', label: 'Lines', icon: LineChart },
  { key: 'area', label: 'Areas', icon: ChartArea },
  { key: 'pie', label: 'Pie', icon: PieChart },
];

const readMatrix = (editor: Editor, tableId: string): string[][] | null => {
  const table = findTableById(editor.state.doc, tableId);
  return table ? tableMatrix(table) : null;
};

// The table's cells, re-read whenever the document changes; the state only
// moves when the text of the table did, so typing elsewhere redraws nothing.
const useTableMatrix = (editor: Editor, tableId: string) => {
  const [matrix, setMatrix] = useState(() => readMatrix(editor, tableId));
  useEffect(() => {
    let last = JSON.stringify(readMatrix(editor, tableId));
    setMatrix(readMatrix(editor, tableId));
    const onUpdate = () => {
      const next = readMatrix(editor, tableId);
      const key = JSON.stringify(next);
      if (key !== last) {
        last = key;
        setMatrix(next);
      }
    };
    editor.on('update', onUpdate);
    return () => {
      editor.off('update', onUpdate);
    };
  }, [editor, tableId]);
  return matrix;
};

interface ChartSettings {
  chartType: TableChartType;
  title: string;
  xColumn: ChartColumnRef | null;
  series: ChartSeriesRef[];
  headerRow: boolean;
  fromZero: boolean;
}

const settingsOf = (attrs: Record<string, unknown>): ChartSettings => ({
  chartType: (TYPES.some((t) => t.key === attrs.chartType)
    ? attrs.chartType
    : 'bar') as TableChartType,
  title: typeof attrs.title === 'string' ? attrs.title : '',
  xColumn: (attrs.xColumn as ChartColumnRef | null) ?? null,
  series: Array.isArray(attrs.series) ? (attrs.series as ChartSeriesRef[]) : [],
  headerRow: attrs.headerRow !== false,
  fromZero: attrs.fromZero !== false,
});

export const TableChart = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const tableId = (node.attrs.source as { tableId: string }).tableId;
  const matrix = useTableMatrix(editor, tableId);
  const settings = settingsOf(node.attrs);
  const editable = editor.isEditable;

  const [open, setOpen] = useState(false);
  useEffect(() => {
    const id = node.attrs.id as string | null;
    if (id && chartsToOpen.delete(id) && editable) {
      setOpen(true);
    }
  }, [node.attrs.id, editable]);

  // settings is rebuilt from attrs on every render: memoise on its content.
  const settingsKey = JSON.stringify(settings);
  const data = useMemo(
    () =>
      matrix
        ? buildTableChart(matrix, JSON.parse(settingsKey) as ChartSettings)
        : null,
    [matrix, settingsKey]
  );

  return (
    <NodeViewWrapper
      data-type="chart"
      className="group/chart relative my-2"
      contentEditable={false}
    >
      <div className="rounded-lg border bg-card p-3">
        {settings.title ? (
          <p className="mb-2 text-center text-sm font-medium text-foreground">
            {settings.title}
          </p>
        ) : null}
        {data ? (
          <MultiSeriesChart
            data={data}
            chartType={settings.chartType}
            fromZero={settings.fromZero}
            title={settings.title}
          />
        ) : (
          <p className="px-3 py-8 text-center text-sm text-muted-foreground">
            The table this chart was drawn from is no longer on this page.
          </p>
        )}
      </div>

      {editable && matrix && (
        <button
          type="button"
          aria-label="Edit chart"
          onClick={() => setOpen(true)}
          className="absolute right-2 top-2 hidden items-center gap-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm group-hover/chart:flex"
        >
          <Pencil className="size-3.5" />
          Edit
        </button>
      )}

      {matrix && open && (
        <ChartSettingsDialog
          matrix={matrix}
          initial={settings}
          onOpenChange={setOpen}
          onSave={(next) => {
            updateAttributes(next);
            setOpen(false);
          }}
        />
      )}
    </NodeViewWrapper>
  );
};

interface ChartSettingsDialogProps {
  matrix: string[][];
  initial: ChartSettings;
  onOpenChange: (open: boolean) => void;
  onSave: (settings: ChartSettings) => void;
}

const ChartSettingsDialog = ({
  matrix,
  initial,
  onOpenChange,
  onSave,
}: ChartSettingsDialogProps) => {
  const [draft, setDraft] = useState<ChartSettings>(initial);
  const names = columnNames(matrix, draft.headerRow);
  const xIndex = resolveColumn(names, draft.xColumn);
  const preview = useMemo(
    () => buildTableChart(matrix, draft),
    [matrix, draft]
  );

  // Selected series, by where their column sits now.
  const selected = new Map<number, ChartSeriesRef>();
  for (const ref of draft.series) {
    const index = resolveColumn(names, ref);
    if (index !== null && index !== xIndex) {
      selected.set(index, ref);
    }
  }
  const slotOf = (index: number) =>
    xIndex !== null && index > xIndex ? index - 1 : index;

  const update = (patch: Partial<ChartSettings>) =>
    setDraft((prev) => ({ ...prev, ...patch }));

  const setSeries = (entries: Map<number, ChartSeriesRef>) =>
    update({
      series: [...entries.entries()]
        .sort(([a], [b]) => a - b)
        .map(([index, ref]) => ({ ...ref, index, name: names[index] ?? '' })),
    });

  const toggleSeries = (index: number, on: boolean) => {
    const next = new Map(selected);
    if (on) {
      next.set(index, { index, name: names[index] ?? '' });
    } else {
      next.delete(index);
    }
    setSeries(next);
  };

  const setColor = (index: number, color: string) => {
    const next = new Map(selected);
    const ref = next.get(index);
    if (ref) {
      next.set(index, { ...ref, color });
      setSeries(next);
    }
  };

  const atLimit = selected.size >= MAX_CHART_SERIES;

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogContent className="max-h-[calc(100vh-2rem)] max-w-[calc(100vw-2rem)] overflow-y-auto sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>Chart from table</DialogTitle>
          <DialogDescription>
            Pick what goes across and which columns to plot. The chart follows
            the table as you edit it.
          </DialogDescription>
        </DialogHeader>

        <div className="grid gap-5 md:grid-cols-[minmax(0,15rem)_minmax(0,1fr)]">
          <div className="flex flex-col gap-4">
            <div className="grid grid-cols-5 gap-1.5">
              {TYPES.map((type) => (
                <button
                  key={type.key}
                  type="button"
                  title={type.label}
                  onClick={() => update({ chartType: type.key })}
                  className={cn(
                    'flex flex-col items-center gap-1 rounded-md border p-1.5 text-[11px] hover:bg-accent',
                    draft.chartType === type.key
                      ? 'border-primary bg-accent'
                      : 'border-border'
                  )}
                >
                  <type.icon className="size-4" />
                  {type.label}
                </button>
              ))}
            </div>

            <Input
              value={draft.title}
              placeholder="Chart title (optional)"
              onChange={(e) => update({ title: e.target.value })}
            />

            <label className="flex flex-col gap-1.5 text-xs font-medium text-muted-foreground">
              Across the bottom (X)
              <select
                value={xIndex ?? ''}
                onChange={(e) => {
                  const index = Number(e.target.value);
                  update({ xColumn: { index, name: names[index] ?? '' } });
                }}
                className="h-9 rounded-md border border-input bg-transparent px-2 text-sm text-foreground"
              >
                {names.map((name, index) => (
                  <option key={index} value={index}>
                    {name}
                  </option>
                ))}
              </select>
            </label>

            <div className="flex flex-col gap-1.5">
              <span className="text-xs font-medium text-muted-foreground">
                {draft.chartType === 'pie'
                  ? 'Value (the pie uses the first one ticked)'
                  : 'Plotted columns (Y)'}
              </span>
              <div className="flex flex-col gap-0.5">
                {names.map((name, index) => {
                  if (index === xIndex) {
                    return null;
                  }
                  const ref = selected.get(index);
                  const on = Boolean(ref);
                  return (
                    <div
                      key={index}
                      className="flex items-center gap-2 rounded px-1 py-1 hover:bg-accent"
                    >
                      <Checkbox
                        id={`chart-series-${index}`}
                        checked={on}
                        disabled={!on && atLimit}
                        onCheckedChange={(value) =>
                          toggleSeries(index, value === true)
                        }
                      />
                      <label
                        htmlFor={`chart-series-${index}`}
                        className="flex-1 truncate text-sm"
                      >
                        {name}
                      </label>
                      {on && draft.chartType !== 'pie' && (
                        <label
                          title="Change colour"
                          className="relative size-4 shrink-0 cursor-pointer rounded-sm"
                          style={{
                            background: seriesColor({
                              slot: slotOf(index),
                              color: ref?.color ?? null,
                            }),
                          }}
                        >
                          <input
                            type="color"
                            aria-label={`Colour of ${name}`}
                            value={ref?.color || '#2a78d6'}
                            onChange={(e) => setColor(index, e.target.value)}
                            className="absolute inset-0 size-full cursor-pointer opacity-0"
                          />
                        </label>
                      )}
                    </div>
                  );
                })}
              </div>
              {atLimit && (
                <p className="text-xs text-muted-foreground">
                  At most {MAX_CHART_SERIES} series on one chart.
                </p>
              )}
            </div>

            <div className="flex flex-col gap-2 border-t pt-3 text-sm">
              <label
                htmlFor="chart-header-row"
                className="flex items-center gap-2"
              >
                <Checkbox
                  id="chart-header-row"
                  checked={draft.headerRow}
                  onCheckedChange={(value) =>
                    update({ headerRow: value === true })
                  }
                />
                First row holds the column names
              </label>
              {draft.chartType === 'line' && (
                <label
                  htmlFor="chart-from-zero"
                  className="flex items-center gap-2"
                >
                  <Checkbox
                    id="chart-from-zero"
                    checked={draft.fromZero}
                    onCheckedChange={(value) =>
                      update({ fromZero: value === true })
                    }
                  />
                  Start the axis at zero
                </label>
              )}
            </div>
          </div>

          <div className="viz-palette min-w-0 rounded-lg border bg-card p-3">
            {draft.title && (
              <p className="mb-2 text-center text-sm font-medium">
                {draft.title}
              </p>
            )}
            <MultiSeriesChart
              data={preview}
              chartType={draft.chartType}
              fromZero={draft.fromZero}
              title={draft.title}
            />
          </div>
        </div>

        <DialogFooter>
          <Button
            type="button"
            variant="ghost"
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button type="button" onClick={() => onSave(draft)}>
            Save
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
