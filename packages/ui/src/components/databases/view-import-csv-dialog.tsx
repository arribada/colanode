import { useMutation } from '@tanstack/react-query';
import { ChevronsUpDown, Plus, SkipForward, Type } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalRecordNode } from '@colanode/client/types';
import { FieldAttributes, generateId, IdType } from '@colanode/core';
import { FieldIcon } from '@colanode/ui/components/databases/fields/field-icon';
import { Button } from '@colanode/ui/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@colanode/ui/components/ui/dialog';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@colanode/ui/components/ui/dropdown-menu';
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  buildCsvImportPlan,
  CsvColumnTarget,
  isCsvImportableField,
  parseCsv,
} from '@colanode/ui/lib/csv';
import { getRandomSelectOptionColor } from '@colanode/ui/lib/databases';

const IMPORT_BATCH_SIZE = 25;

interface ParsedCsv {
  fileName: string;
  headers: string[];
  rows: string[][];
}

interface CsvColumnTargetSelectProps {
  target: CsvColumnTarget;
  fields: FieldAttributes[];
  canCreateFields: boolean;
  onChange: (target: CsvColumnTarget) => void;
}

const targetLabel = (
  target: CsvColumnTarget,
  fields: FieldAttributes[]
): string => {
  if (target.type === 'skip') {
    return 'Skip column';
  }

  if (target.type === 'name') {
    return 'Record name';
  }

  if (target.type === 'field') {
    const field = fields.find((f) => f.id === target.fieldId);
    return field ? field.name : 'Unknown field';
  }

  return target.fieldType === 'select' ? 'New select field' : 'New text field';
};

const CsvColumnTargetSelect = ({
  target,
  fields,
  canCreateFields,
  onChange,
}: CsvColumnTargetSelectProps) => {
  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button
          type="button"
          variant="outline"
          size="sm"
          className="w-48 justify-between"
        >
          <span className="truncate">{targetLabel(target, fields)}</span>
          <ChevronsUpDown className="size-4 shrink-0 opacity-50" />
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent className="max-h-80 w-56 overflow-y-auto">
        <DropdownMenuItem onSelect={() => onChange({ type: 'skip' })}>
          <SkipForward className="size-4" />
          <span>Skip column</span>
        </DropdownMenuItem>
        <DropdownMenuItem onSelect={() => onChange({ type: 'name' })}>
          <Type className="size-4" />
          <span>Record name</span>
        </DropdownMenuItem>
        {fields.length > 0 && <DropdownMenuSeparator />}
        {fields.map((field) => (
          <DropdownMenuItem
            key={field.id}
            onSelect={() => onChange({ type: 'field', fieldId: field.id })}
          >
            <FieldIcon type={field.type} className="size-4" />
            <span className="truncate">{field.name}</span>
          </DropdownMenuItem>
        ))}
        {canCreateFields && (
          <>
            <DropdownMenuSeparator />
            <DropdownMenuItem
              onSelect={() =>
                onChange({ type: 'create-field', fieldType: 'text' })
              }
            >
              <Plus className="size-4" />
              <span>New text field</span>
            </DropdownMenuItem>
            <DropdownMenuItem
              onSelect={() =>
                onChange({ type: 'create-field', fieldType: 'select' })
              }
            >
              <Plus className="size-4" />
              <span>New select field</span>
            </DropdownMenuItem>
          </>
        )}
      </DropdownMenuContent>
    </DropdownMenu>
  );
};

const guessColumnTargets = (
  headers: string[],
  fields: FieldAttributes[],
  nameHeader: string,
  canCreateFields: boolean
): CsvColumnTarget[] => {
  const targets: CsvColumnTarget[] = [];
  const usedFieldIds = new Set<string>();
  let nameAssigned = false;

  for (const header of headers) {
    const normalized = header.trim().toLowerCase();

    if (
      !nameAssigned &&
      normalized.length > 0 &&
      (normalized === nameHeader.trim().toLowerCase() || normalized === 'name')
    ) {
      targets.push({ type: 'name' });
      nameAssigned = true;
      continue;
    }

    const field = fields.find(
      (f) =>
        isCsvImportableField(f) &&
        !usedFieldIds.has(f.id) &&
        f.name.trim().toLowerCase() === normalized
    );

    if (field) {
      targets.push({ type: 'field', fieldId: field.id });
      usedFieldIds.add(field.id);
      continue;
    }

    targets.push(
      canCreateFields
        ? { type: 'create-field', fieldType: 'text' }
        : { type: 'skip' }
    );
  }

  return targets;
};

interface ViewImportCsvDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ViewImportCsvDialog = ({
  open,
  onOpenChange,
}: ViewImportCsvDialogProps) => {
  const workspace = useWorkspace();
  const database = useDatabase();

  const [parsed, setParsed] = useState<ParsedCsv | null>(null);
  const [targets, setTargets] = useState<CsvColumnTarget[]>([]);
  const [progress, setProgress] = useState<number | null>(null);

  const importableFields = database.fields.filter(isCsvImportableField);
  const canCreateFields = database.canEdit && !database.isLocked;

  const handleFile = async (file: File | undefined) => {
    if (!file) {
      return;
    }

    try {
      const text = await file.text();
      const rows = parseCsv(text);
      const headers = rows[0];

      if (!headers || headers.every((header) => header.trim().length === 0)) {
        toast.error('The CSV file is empty.');
        return;
      }

      setParsed({
        fileName: file.name,
        headers,
        rows: rows.slice(1),
      });
      setTargets(
        guessColumnTargets(
          headers,
          database.fields,
          database.nameField?.name ?? 'Name',
          canCreateFields
        )
      );
    } catch {
      toast.error('Failed to read the CSV file.');
    }
  };

  const { mutate: importCsv, isPending: isImporting } = useMutation({
    mutationFn: async () => {
      if (!parsed) {
        return null;
      }

      const mappedFieldIds = new Set<string>();
      let nameCount = 0;
      for (const target of targets) {
        if (target.type === 'field') {
          if (mappedFieldIds.has(target.fieldId)) {
            throw new Error('Multiple columns are mapped to the same field.');
          }
          mappedFieldIds.add(target.fieldId);
        } else if (target.type === 'name') {
          nameCount++;
        }
      }

      if (nameCount > 1) {
        throw new Error('Only one column can be mapped to the record name.');
      }

      const plan = buildCsvImportPlan(
        parsed.headers,
        parsed.rows,
        targets,
        database.fields,
        {
          fieldId: () => generateId(IdType.Field),
          selectOptionId: () => generateId(IdType.SelectOption),
          selectOptionColor: getRandomSelectOptionColor,
        }
      );

      if (plan.records.length === 0) {
        throw new Error('No records found in the CSV file.');
      }

      const nodes = workspace.collections.nodes;

      if (
        plan.newFields.length > 0 ||
        Object.keys(plan.newOptions).length > 0
      ) {
        const tx = nodes.update(database.id, (draft) => {
          if (draft.type !== 'database') {
            return;
          }

          for (const field of plan.newFields) {
            draft.fields[field.id] = field;
          }

          for (const [fieldId, options] of Object.entries(plan.newOptions)) {
            const field = draft.fields[fieldId];
            if (
              !field ||
              (field.type !== 'select' && field.type !== 'multi_select')
            ) {
              continue;
            }

            const merged = { ...(field.options ?? {}) };
            for (const option of options) {
              merged[option.id] = option;
            }

            draft.fields[fieldId] = { ...field, options: merged };
          }
        });
        await tx.isPersisted.promise;
      }

      setProgress(0);
      let imported = 0;
      for (let i = 0; i < plan.records.length; i += IMPORT_BATCH_SIZE) {
        const batch = plan.records.slice(i, i + IMPORT_BATCH_SIZE);
        const items: LocalRecordNode[] = batch.map((record) => ({
          id: generateId(IdType.Record),
          type: 'record',
          parentId: database.id,
          rootId: database.rootId,
          databaseId: database.id,
          name: record.name,
          fields: record.fields,
          createdAt: new Date().toISOString(),
          createdBy: workspace.userId,
          updatedAt: null,
          updatedBy: null,
          localRevision: '0',
          serverRevision: '0',
        }));

        const tx = nodes.insert(items);
        await tx.isPersisted.promise;

        imported += items.length;
        setProgress(imported);
      }

      return {
        imported,
        newFieldCount: plan.newFields.length,
      };
    },
    onSuccess: (result) => {
      if (!result) {
        return;
      }

      const fieldNote =
        result.newFieldCount > 0
          ? ` Created ${result.newFieldCount} new ${result.newFieldCount === 1 ? 'field' : 'fields'}.`
          : '';
      toast.success(`Imported ${result.imported} records.${fieldNote}`);
      onOpenChange(false);
    },
    onError: (error) => {
      toast.error(
        error instanceof Error ? error.message : 'Failed to import CSV.'
      );
    },
    onSettled: () => {
      setProgress(null);
    },
  });

  const rowCount = parsed
    ? parsed.rows.filter((row) =>
        row.some((cell) => cell.trim().length > 0)
      ).length
    : 0;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-2xl">
        <DialogHeader>
          <DialogTitle>Import CSV</DialogTitle>
          <DialogDescription>
            Import records from a CSV file into this database. The first row is
            used as the header. Relation and file fields are not supported.
          </DialogDescription>
        </DialogHeader>
        {!parsed ? (
          <input
            type="file"
            accept=".csv,text/csv"
            aria-label="CSV file"
            className="cursor-pointer rounded-md border border-dashed p-8 text-sm"
            onChange={(e) => {
              handleFile(e.target.files?.[0]);
            }}
          />
        ) : (
          <div className="flex flex-col gap-3">
            <div className="flex flex-row items-center justify-between gap-2 text-sm text-muted-foreground">
              <span className="truncate">
                {parsed.fileName} — {rowCount}{' '}
                {rowCount === 1 ? 'row' : 'rows'}
              </span>
              <Button
                type="button"
                variant="outline"
                size="sm"
                disabled={isImporting}
                onClick={() => {
                  setParsed(null);
                  setTargets([]);
                }}
              >
                Choose another file
              </Button>
            </div>
            <div className="flex max-h-80 flex-col gap-2 overflow-y-auto pr-1">
              {parsed.headers.map((header, index) => {
                const sample = parsed.rows
                  .map((row) => row[index] ?? '')
                  .find((cell) => cell.trim().length > 0);

                return (
                  <div
                    key={`${index}-${header}`}
                    className="flex flex-row items-center justify-between gap-2"
                  >
                    <div className="flex min-w-0 flex-col">
                      <span className="truncate text-sm font-medium">
                        {header.trim() || `Column ${index + 1}`}
                      </span>
                      {sample && (
                        <span className="truncate text-xs text-muted-foreground">
                          e.g. {sample}
                        </span>
                      )}
                    </div>
                    <CsvColumnTargetSelect
                      target={targets[index] ?? { type: 'skip' }}
                      fields={importableFields}
                      canCreateFields={canCreateFields}
                      onChange={(target) => {
                        setTargets((prev) => {
                          const next = [...prev];
                          next[index] = target;
                          return next;
                        });
                      }}
                    />
                  </div>
                );
              })}
            </div>
          </div>
        )}
        <DialogFooter>
          {progress !== null && (
            <span className="mr-auto flex flex-row items-center gap-2 text-sm text-muted-foreground">
              <Spinner className="size-4" />
              Imported {progress} of {rowCount} records…
            </span>
          )}
          <Button
            type="button"
            variant="outline"
            size="sm"
            disabled={isImporting}
            onClick={() => onOpenChange(false)}
          >
            Cancel
          </Button>
          <Button
            type="button"
            size="sm"
            disabled={!parsed || isImporting}
            onClick={() => importCsv()}
          >
            {isImporting && <Spinner className="mr-1" />}
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
