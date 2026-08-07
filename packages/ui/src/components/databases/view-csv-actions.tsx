import { useMutation } from '@tanstack/react-query';
import { Download, Upload } from 'lucide-react';
import { Fragment, useState } from 'react';
import { toast } from 'sonner';

import { LocalRecordNode } from '@colanode/client/types';
import { compareString, FieldAttributes } from '@colanode/core';
import { ViewImportCsvDialog } from '@colanode/ui/components/databases/view-import-csv-dialog';
import { useDatabase } from '@colanode/ui/contexts/database';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import {
  downloadCsvFile,
  exportRecordsToCsv,
  sanitizeCsvFileName,
} from '@colanode/ui/lib/csv';

interface ViewCsvActionsProps {
  closeMenu?: () => void;
}

export interface CsvExportSource {
  databaseId: string;
  fields: FieldAttributes[];
  nameFieldName: string;
  fileName: string;
}

// Shared Export-CSV mutation so the view settings popover (via ViewCsvActions)
// and the database gear settings menu run the exact same export instead of each
// reimplementing the query / serialise / download.
export const useExportCsvMutation = (source: CsvExportSource) => {
  const workspace = useWorkspace();

  return useMutation({
    mutationFn: async () => {
      const nodes = await window.colanode.executeQuery({
        type: 'node.list',
        userId: workspace.userId,
        filters: [
          { field: ['type'], operator: 'eq', value: 'record' },
          { field: ['databaseId'], operator: 'eq', value: source.databaseId },
        ],
        sorts: [],
      });

      const records = nodes.filter(
        (node): node is LocalRecordNode => node.type === 'record'
      );
      records.sort((a, b) => compareString(a.createdAt, b.createdAt));

      return exportRecordsToCsv(records, source.fields, source.nameFieldName);
    },
    onSuccess: (result) => {
      downloadCsvFile(`${sanitizeCsvFileName(source.fileName)}.csv`, result.csv);

      if (result.skippedFields.length > 0) {
        const skippedNames = result.skippedFields
          .map((field) => field.name)
          .join(', ');
        toast.success(
          `Exported ${result.recordCount} records. Skipped unsupported fields: ${skippedNames}.`
        );
      } else {
        toast.success(`Exported ${result.recordCount} records.`);
      }
    },
    onError: () => {
      toast.error('Failed to export CSV.');
    },
  });
};

export const ViewCsvActions = ({ closeMenu }: ViewCsvActionsProps) => {
  const database = useDatabase();

  const [openImport, setOpenImport] = useState(false);

  const { mutate: exportCsv, isPending: isExporting } = useExportCsvMutation({
    databaseId: database.id,
    fields: database.fields,
    nameFieldName: database.nameField?.name ?? 'Name',
    fileName: database.name,
  });

  const canImport = database.canCreateRecord && !database.isLocked;

  return (
    <Fragment>
      <div className="flex flex-col gap-2 text-sm">
        <p className="my-1 font-semibold">Data</p>
        <button
          type="button"
          className="flex cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left hover:bg-accent"
          disabled={isExporting}
          onClick={() => {
            exportCsv();
          }}
        >
          <Download className="size-4" />
          <span>Export CSV</span>
        </button>
        {canImport && (
          <button
            type="button"
            className="flex cursor-pointer flex-row items-center gap-1 rounded-md p-0.5 text-left hover:bg-accent"
            onClick={() => {
              setOpenImport(true);
              closeMenu?.();
            }}
          >
            <Upload className="size-4" />
            <span>Import CSV</span>
          </button>
        )}
      </div>
      {openImport && (
        <ViewImportCsvDialog open={openImport} onOpenChange={setOpenImport} />
      )}
    </Fragment>
  );
};
