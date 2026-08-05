// ABOUTME: Chart block node view — renders a CSP-safe SVG chart from data the
// ABOUTME: user types into a modal (type, title, rows of label/value/color).
import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { BarChart3, LineChart, PieChart, Pencil, Plus, Trash2 } from 'lucide-react';
import { useState } from 'react';

import { ChartBucket } from '@colanode/ui/components/databases/charts/chart-aggregation';
import {
  BarChartGraphic,
  LineChartGraphic,
  PieChartGraphic,
} from '@colanode/ui/components/databases/charts/chart-graphics';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import { Input } from '@colanode/ui/components/ui/input';
import { cn } from '@colanode/ui/lib/utils';

const PALETTE = [
  '#3b82f6',
  '#ef4444',
  '#10b981',
  '#f59e0b',
  '#8b5cf6',
  '#ec4899',
  '#14b8a6',
  '#f97316',
];

type ChartType = 'bar' | 'line' | 'pie';

interface ChartRow {
  label: string;
  value: number;
  color?: string;
}

const TYPES: { key: ChartType; label: string; icon: typeof BarChart3 }[] = [
  { key: 'bar', label: 'Bar', icon: BarChart3 },
  { key: 'line', label: 'Line', icon: LineChart },
  { key: 'pie', label: 'Pie', icon: PieChart },
];

const formatValue = (value: number): string =>
  Number.isInteger(value) ? String(value) : value.toFixed(1);

const toBuckets = (rows: ChartRow[]): ChartBucket[] =>
  rows.map((row, i) => {
    const value = Number(row.value) || 0;
    return {
      key: String(i),
      label: row.label || `#${i + 1}`,
      color: row.color || PALETTE[i % PALETTE.length] || '#3b82f6',
      value,
      count: value,
    };
  });

export const ChartNodeView = ({
  node,
  updateAttributes,
  editor,
}: NodeViewProps) => {
  const editable = editor.isEditable;
  const chartType = (node.attrs.chartType as ChartType) ?? 'bar';
  const title = (node.attrs.title as string) ?? '';
  const rows = ((node.attrs.data as ChartRow[]) ?? []).filter(Boolean);

  const [open, setOpen] = useState(false);
  const [draftType, setDraftType] = useState<ChartType>(chartType);
  const [draftTitle, setDraftTitle] = useState(title);
  const [draftRows, setDraftRows] = useState<ChartRow[]>(rows);

  const openEditor = () => {
    setDraftType(chartType);
    setDraftTitle(title);
    setDraftRows(rows.length > 0 ? rows : [{ label: '', value: 0 }]);
    setOpen(true);
  };

  const save = () => {
    updateAttributes({
      chartType: draftType,
      title: draftTitle,
      data: draftRows.map((r) => ({
        label: r.label,
        value: Number(r.value) || 0,
        color: r.color,
      })),
    });
    setOpen(false);
  };

  const buckets = toBuckets(rows);

  return (
    <NodeViewWrapper
      data-type="chart"
      className="group/chart relative my-2"
      contentEditable={false}
    >
      <div className="rounded-lg border bg-card p-3">
        {title ? (
          <p className="mb-2 text-center text-sm font-medium text-foreground">
            {title}
          </p>
        ) : null}
        <div className="flex w-full justify-center overflow-x-auto">
          {buckets.length === 0 ? (
            <p className="px-3 py-8 text-sm text-muted-foreground">
              No data yet — click Edit to add rows.
            </p>
          ) : chartType === 'pie' ? (
            <PieChartGraphic buckets={buckets} formatValue={formatValue} />
          ) : chartType === 'line' ? (
            <LineChartGraphic buckets={buckets} formatValue={formatValue} />
          ) : (
            <BarChartGraphic buckets={buckets} formatValue={formatValue} />
          )}
        </div>
      </div>

      {editable && (
        <button
          type="button"
          aria-label="Edit chart"
          onClick={openEditor}
          className="absolute right-2 top-2 hidden items-center gap-1 rounded-md border bg-popover px-2 py-1 text-xs shadow-sm group-hover/chart:flex"
        >
          <Pencil className="size-3.5" />
          Edit
        </button>
      )}

      <Dialog open={open} onOpenChange={setOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>Chart</DialogTitle>
            <DialogDescription>
              Choose a type, give it a title, and enter your data.
            </DialogDescription>
          </DialogHeader>

          <div className="flex flex-col gap-4">
            <div className="flex gap-2">
              {TYPES.map((t) => (
                <button
                  key={t.key}
                  type="button"
                  onClick={() => setDraftType(t.key)}
                  className={cn(
                    'flex flex-1 flex-col items-center gap-1 rounded-md border p-2 text-xs hover:bg-accent',
                    draftType === t.key
                      ? 'border-primary bg-accent'
                      : 'border-border'
                  )}
                >
                  <t.icon className="size-5" />
                  {t.label}
                </button>
              ))}
            </div>

            <Input
              value={draftTitle}
              placeholder="Chart title (optional)"
              onChange={(e) => setDraftTitle(e.target.value)}
            />

            <div className="flex flex-col gap-2">
              <div className="flex items-center justify-between">
                <span className="text-xs font-medium text-muted-foreground">
                  Data
                </span>
                <span className="text-xs text-muted-foreground">
                  {draftRows.length} row{draftRows.length === 1 ? '' : 's'}
                </span>
              </div>
              <div className="flex max-h-64 flex-col gap-2 overflow-y-auto">
                {draftRows.map((row, i) => (
                  <div key={i} className="flex items-center gap-2">
                    <input
                      type="color"
                      aria-label="Color"
                      value={row.color || PALETTE[i % PALETTE.length]}
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, color: e.target.value } : r
                          )
                        )
                      }
                      className="size-8 shrink-0 cursor-pointer rounded border border-border bg-transparent p-0.5"
                    />
                    <Input
                      value={row.label}
                      placeholder="Label"
                      className="flex-1"
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r, j) =>
                            j === i ? { ...r, label: e.target.value } : r
                          )
                        )
                      }
                    />
                    <Input
                      type="number"
                      value={String(row.value)}
                      placeholder="Value"
                      className="w-24"
                      onChange={(e) =>
                        setDraftRows((prev) =>
                          prev.map((r, j) =>
                            j === i
                              ? { ...r, value: Number(e.target.value) }
                              : r
                          )
                        )
                      }
                    />
                    <button
                      type="button"
                      aria-label="Remove row"
                      onClick={() =>
                        setDraftRows((prev) => prev.filter((_, j) => j !== i))
                      }
                      className="shrink-0 text-muted-foreground hover:text-red-600"
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
                onClick={() =>
                  setDraftRows((prev) => [
                    ...prev,
                    {
                      label: '',
                      value: 0,
                      color: PALETTE[prev.length % PALETTE.length],
                    },
                  ])
                }
              >
                <Plus className="size-4" />
                Add row
              </Button>
            </div>
          </div>

          <DialogFooter>
            <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
              Cancel
            </Button>
            <Button type="button" onClick={save}>
              Save
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </NodeViewWrapper>
  );
};
