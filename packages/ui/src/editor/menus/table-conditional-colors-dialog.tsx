// ABOUTME: Dialog that edits an editor-table's conditional-colour rules.
// ABOUTME: Writes the rules onto the table node so the plugin can paint cells.
import { type Editor } from '@tiptap/core';
import { Plus, Trash2 } from 'lucide-react';
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
import { type ConditionalColorRule } from '@colanode/ui/editor/views/table-conditional-colors';
import { editorColors } from '@colanode/ui/lib/editor';
import { cn } from '@colanode/ui/lib/utils';

interface Props {
  editor: Editor;
  tablePos: number;
  columns: string[];
  initialRules: ConditionalColorRule[];
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

const OPERATORS: {
  value: ConditionalColorRule['operator'];
  label: string;
  needsValue: boolean;
}[] = [
  { value: 'contains', label: 'Contains', needsValue: true },
  { value: 'equals', label: 'Equals', needsValue: true },
  { value: 'not_empty', label: 'Is not empty', needsValue: false },
  { value: 'empty', label: 'Is empty', needsValue: false },
];

const colorOptions = editorColors.filter((color) => color.color !== 'default');
const selectClass =
  'h-8 rounded-md border border-input bg-background px-2 text-sm outline-none focus:ring-1 focus:ring-ring';

let ruleSeq = 0;
const newRule = (): ConditionalColorRule => {
  ruleSeq += 1;
  return {
    id: `rule-${ruleSeq}-${Date.now()}`,
    columnIndex: null,
    operator: 'contains',
    value: '',
    color: colorOptions[0]?.color ?? 'green',
    scope: 'cell',
  };
};

export const TableConditionalColorsDialog = ({
  editor,
  tablePos,
  columns,
  initialRules,
  open,
  onOpenChange,
}: Props) => {
  const [rules, setRules] = useState<ConditionalColorRule[]>(initialRules);

  // Re-seed the local draft each time the dialog opens (initialRules changes
  // identity every render, so it can't be a dependency here).
  useEffect(() => {
    if (open) {
      setRules(initialRules);
    }
  }, [open]);

  const update = (id: string, changes: Partial<ConditionalColorRule>) => {
    setRules((prev) =>
      prev.map((rule) => (rule.id === id ? { ...rule, ...changes } : rule))
    );
  };

  const save = () => {
    const cleaned = rules.filter((rule) => rule.color);
    editor
      .chain()
      .command(({ tr }) => {
        tr.setNodeAttribute(tablePos, 'colorRules', cleaned);
        return true;
      })
      .run();
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl">
        <DialogHeader>
          <DialogTitle>Conditional colours</DialogTitle>
        </DialogHeader>
        <p className="text-sm text-muted-foreground">
          Colour a cell (or its whole row) automatically when its text matches a
          rule. Cells you coloured by hand are left untouched.
        </p>
        <div className="flex max-h-80 flex-col gap-2 overflow-y-auto py-1">
          {rules.length === 0 && (
            <p className="py-4 text-center text-sm text-muted-foreground">
              No rules yet.
            </p>
          )}
          {rules.map((rule) => {
            const operator = OPERATORS.find((o) => o.value === rule.operator);
            return (
              <div
                key={rule.id}
                className="flex flex-wrap items-center gap-2 rounded-md border border-border p-2"
              >
                <select
                  className={selectClass}
                  value={rule.columnIndex ?? 'any'}
                  onChange={(event) =>
                    update(rule.id, {
                      columnIndex:
                        event.target.value === 'any'
                          ? null
                          : Number(event.target.value),
                    })
                  }
                >
                  <option value="any">Any column</option>
                  {columns.map((label, index) => (
                    <option key={index} value={index}>
                      {label}
                    </option>
                  ))}
                </select>
                <select
                  className={selectClass}
                  value={rule.operator}
                  onChange={(event) =>
                    update(rule.id, {
                      operator: event.target
                        .value as ConditionalColorRule['operator'],
                    })
                  }
                >
                  {OPERATORS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                {operator?.needsValue && (
                  <Input
                    className="h-8 w-32"
                    placeholder="value"
                    value={rule.value}
                    onChange={(event) =>
                      update(rule.id, { value: event.target.value })
                    }
                  />
                )}
                <select
                  className={selectClass}
                  value={rule.scope}
                  onChange={(event) =>
                    update(rule.id, {
                      scope: event.target
                        .value as ConditionalColorRule['scope'],
                    })
                  }
                >
                  <option value="cell">Colour this cell</option>
                  <option value="row">Colour whole row</option>
                </select>
                <select
                  className={selectClass}
                  value={rule.color}
                  onChange={(event) =>
                    update(rule.id, { color: event.target.value })
                  }
                >
                  {colorOptions.map((color) => (
                    <option key={color.color} value={color.color}>
                      {color.name}
                    </option>
                  ))}
                </select>
                <span
                  className={cn(
                    'size-5 rounded border border-border',
                    colorOptions.find((c) => c.color === rule.color)?.bgClass
                  )}
                />
                <button
                  type="button"
                  className="ml-auto text-muted-foreground hover:text-destructive"
                  onClick={() =>
                    setRules((prev) => prev.filter((r) => r.id !== rule.id))
                  }
                  title="Remove rule"
                >
                  <Trash2 className="size-4" />
                </button>
              </div>
            );
          })}
        </div>
        <Button
          type="button"
          variant="outline"
          className="w-full gap-2"
          onClick={() => setRules((prev) => [...prev, newRule()])}
        >
          <Plus className="size-4" />
          Add rule
        </Button>
        <DialogFooter>
          <Button variant="ghost" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button onClick={save}>Save</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
