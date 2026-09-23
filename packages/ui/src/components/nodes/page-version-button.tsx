// ABOUTME: Page-header control that cuts and displays a git-like version tag.
// ABOUTME: Proposes a normalized next tag and keeps an append-only version log.

import { Tag } from 'lucide-react';
import { useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode, LocalRecordNode } from '@colanode/client/types';
import {
  VersionBump,
  compareVersions,
  isValidVersion,
  normalizeVersion,
  proposeNextVersion,
} from '@colanode/core';
import { Button } from '@colanode/ui/components/ui/button';
import { Input } from '@colanode/ui/components/ui/input';
import { Textarea } from '@colanode/ui/components/ui/textarea';
import {
  Popover,
  PopoverContent,
  PopoverTrigger,
} from '@colanode/ui/components/ui/popover';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';

interface PageVersionEntry {
  version: string;
  at: string;
  by: string;
  note?: string | null;
}

const BUMPS: { key: VersionBump; label: string }[] = [
  { key: 'patch', label: 'Patch' },
  { key: 'minor', label: 'Minor' },
  { key: 'major', label: 'Major' },
];

export const PageVersionButton = ({
  page,
}: {
  page: LocalPageNode | LocalRecordNode;
}) => {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(false);
  const [custom, setCustom] = useState('');
  const [note, setNote] = useState('');
  const { mutate } = useMutation();

  const current = page.version ?? null;
  const log: PageVersionEntry[] = page.versionLog ?? [];

  const cut = (raw: string) => {
    const normalized = normalizeVersion(raw);
    if (!normalized) {
      toast.error('Use a version like v1.2.0');
      return;
    }
    if (current && compareVersions(normalized, current) <= 0) {
      toast.error(`${normalized} must be greater than ${current}`);
      return;
    }
    const nodes = workspace.collections.nodes;
    if (!nodes.has(page.id)) {
      return;
    }
    nodes.update(page.id, (draft) => {
      if (draft.type !== 'page' && draft.type !== 'record') {
        return;
      }
      const entry: PageVersionEntry = {
        version: normalized,
        at: new Date().toISOString(),
        by: workspace.userId,
        note: note.trim() || null,
      };
      draft.version = normalized;
      draft.versionLog = [...(draft.versionLog ?? []), entry];
    });
    // The tag alone says nothing about what the page looked like at the time.
    // Cutting a version also asks the server for a snapshot under that tag, so
    // the version can be read back later instead of only being named.
    mutate({
      input: {
        type: 'document.snapshot.create',
        userId: workspace.userId,
        documentId: page.id,
        name: normalized,
        note: note.trim() || null,
      },
      onError(error) {
        toast.error(
          `${normalized} was tagged, but not captured: ${error.message}`
        );
      },
    });

    setCustom('');
    setNote('');
    setOpen(false);
    toast.success(`Version ${normalized} cut`);
  };

  return (
    <Popover open={open} onOpenChange={setOpen}>
      <PopoverTrigger asChild>
        <button
          type="button"
          aria-label="Page version"
          title="Page version"
          className="flex h-8 items-center gap-1 rounded-md border border-border px-2 text-xs font-medium text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          <Tag className="size-3.5" />
          <span className="tabular-nums">{current ?? 'Version'}</span>
        </button>
      </PopoverTrigger>
      <PopoverContent align="end" className="w-72 p-3">
        <div className="flex flex-col gap-3">
          <div>
            <p className="text-xs font-medium text-muted-foreground">
              Current version
            </p>
            <p className="text-sm font-semibold tabular-nums">
              {current ?? 'None yet'}
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              What changed (optional)
            </p>
            <Textarea
              value={note}
              onChange={(e) => setNote(e.target.value)}
              placeholder="Added the noise measurements for GW 2"
              rows={2}
              className="min-h-16 text-sm"
            />
            <p className="mt-1 text-[11px] text-muted-foreground">
              Shown in the version history and in the revision table of the PDF
              export.
            </p>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Cut a new version
            </p>
            <div className="flex gap-1">
              {BUMPS.map((bump) => {
                const next = proposeNextVersion(current, bump.key);
                return (
                  <Button
                    key={bump.key}
                    type="button"
                    variant="outline"
                    size="sm"
                    className="h-auto flex-1 flex-col gap-0 py-1"
                    onClick={() => cut(next)}
                  >
                    <span className="text-[11px]">{bump.label}</span>
                    <span className="text-[11px] tabular-nums text-muted-foreground">
                      {next}
                    </span>
                  </Button>
                );
              })}
            </div>
          </div>

          <div>
            <p className="mb-1 text-xs font-medium text-muted-foreground">
              Or a custom tag
            </p>
            <div className="flex gap-1">
              <Input
                value={custom}
                onChange={(e) => setCustom(e.target.value)}
                placeholder="v2.0.0"
                className="h-8 text-sm"
                onKeyDown={(e) => {
                  if (e.key === 'Enter' && custom.trim()) {
                    cut(custom);
                  }
                }}
              />
              <Button
                type="button"
                size="sm"
                disabled={!custom.trim() || !isValidVersion(custom)}
                onClick={() => cut(custom)}
              >
                Cut
              </Button>
            </div>
          </div>

          {log.length > 0 && (
            <div>
              <p className="mb-1 text-xs font-medium text-muted-foreground">
                History
              </p>
              <div className="flex max-h-40 flex-col gap-0.5 overflow-y-auto">
                {[...log].reverse().map((entry, index) => (
                  <div
                    key={`${entry.version}-${index}`}
                    className="rounded-md px-2 py-1 text-xs hover:bg-accent"
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium tabular-nums">
                        {entry.version}
                      </span>
                      <span className="text-muted-foreground">
                        {new Date(entry.at).toLocaleString(undefined, {
                          dateStyle: 'medium',
                          timeStyle: 'short',
                        })}
                      </span>
                    </div>
                    {entry.note && (
                      <p className="mt-0.5 whitespace-pre-wrap text-muted-foreground">
                        {entry.note}
                      </p>
                    )}
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      </PopoverContent>
    </Popover>
  );
};
