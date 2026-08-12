// Import dialog for a Miro board export: pick the file, see exactly what will
// come across and what will not, then bring it in.

import { Upload } from 'lucide-react';
import { useRef, useState } from 'react';

import { BoardElement } from '@colanode/core';
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
  convertMiroBoard,
  MiroImportReport,
  parseMiroExport,
} from '@colanode/ui/lib/board/miro-import';

interface Preview {
  fileName: string;
  elements: BoardElement[];
  report: MiroImportReport;
  frames: string[];
}

interface BoardMiroImportDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onImport: (elements: BoardElement[]) => void;
}

export const BoardMiroImportDialog = ({
  open,
  onOpenChange,
  onImport,
}: BoardMiroImportDialogProps) => {
  const inputRef = useRef<HTMLInputElement>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [error, setError] = useState<string | null>(null);

  const readFile = async (file: File) => {
    setError(null);
    setPreview(null);
    try {
      const parsed = parseMiroExport(await file.text());
      const { scene, report } = convertMiroBoard(
        parsed.items,
        parsed.connectors
      );
      setPreview({
        fileName: file.name,
        elements: Object.values(scene),
        report,
        frames: parsed.frames,
      });
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not read that file.');
    }
  };

  const close = () => {
    setPreview(null);
    setError(null);
    onOpenChange(false);
  };

  const skipped = Object.entries(preview?.report.skipped ?? {});

  return (
    <Dialog open={open} onOpenChange={(o) => (o ? onOpenChange(o) : close())}>
      <DialogContent className="sm:max-w-xl">
        <DialogHeader>
          <DialogTitle>Import a Miro board</DialogTitle>
          <DialogDescription>
            Choose the JSON export of a Miro board. Sticky notes, shapes, text,
            frames and connectors come across; images and tables do not, and
            are listed below before you commit to anything.
          </DialogDescription>
        </DialogHeader>

        <input
          ref={inputRef}
          type="file"
          accept="application/json,.json"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0];
            if (file) {
              void readFile(file);
            }
            // Let the same file be picked again after a failed read.
            e.target.value = '';
          }}
        />

        <div className="space-y-3">
          <Button
            type="button"
            variant="outline"
            onClick={() => inputRef.current?.click()}
            className="w-full"
          >
            <Upload className="mr-2 size-4" />
            {preview ? preview.fileName : 'Choose a JSON export'}
          </Button>

          {error && (
            <p className="rounded-md bg-destructive/10 px-3 py-2 text-sm text-destructive">
              {error}
            </p>
          )}

          {preview && (
            <div className="space-y-2 rounded-md border border-border p-3 text-sm">
              <p className="font-medium">
                {preview.elements.length} elements ready to import
              </p>
              <ul className="space-y-0.5 text-muted-foreground">
                {Object.entries(preview.report.created).map(([type, n]) => (
                  <li key={type}>
                    {n} {type}
                    {n > 1 ? 's' : ''}
                  </li>
                ))}
              </ul>
              {preview.frames.length > 0 && (
                <p className="text-muted-foreground">
                  Frames in this file: {preview.frames.join(', ')}
                </p>
              )}
              {skipped.length > 0 && (
                <p className="text-amber-600 dark:text-amber-500">
                  Not imported:{' '}
                  {skipped.map(([type, n]) => `${n} ${type}`).join(', ')}
                </p>
              )}
              {preview.report.danglingConnectors > 0 && (
                <p className="text-muted-foreground">
                  {preview.report.danglingConnectors} connectors skipped — they
                  point at items outside this file.
                </p>
              )}
            </div>
          )}
        </div>

        <DialogFooter>
          <Button type="button" variant="outline" onClick={close}>
            Cancel
          </Button>
          <Button
            type="button"
            disabled={!preview || preview.elements.length === 0}
            onClick={() => {
              if (preview) {
                onImport(preview.elements);
              }
              close();
            }}
          >
            Import
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
