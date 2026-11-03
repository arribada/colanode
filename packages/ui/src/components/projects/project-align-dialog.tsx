// ABOUTME: "Align with the project template" -- shows what aligning an existing
// ABOUTME: project would change, then applies it. Never deletes or renames a page.
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import { LocalPageNode } from '@colanode/client/types';
import {
  isValidProjectCode,
  normalizeProjectCode,
  ProjectAlignOutput,
  ProjectPlaneMode,
  suggestProjectCode,
} from '@colanode/core';
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
import { Spinner } from '@colanode/ui/components/ui/spinner';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { describeAlignPlan, planeChoices } from '@colanode/ui/lib/projects';

interface ProjectAlignDialogProps {
  page: LocalPageNode;
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export const ProjectAlignDialog = ({
  page,
  open,
  onOpenChange,
}: ProjectAlignDialogProps) => {
  const workspace = useWorkspace();
  const { mutate, isPending } = useMutation();

  const [code, setCode] = useState(
    page.projectCode ?? suggestProjectCode(page.name)
  );
  const [aliases, setAliases] = useState('');
  const [preview, setPreview] = useState<ProjectAlignOutput | null>(null);
  const [plane, setPlane] = useState<ProjectPlaneMode>('none');

  // A preview describes one code; editing the code makes it stale.
  useEffect(() => {
    setPreview(null);
  }, [code, aliases]);

  const choices = useMemo(
    () => planeChoices(preview?.plan.plane),
    [preview?.plan.plane]
  );
  useEffect(() => {
    setPlane(choices[0]?.mode ?? 'none');
  }, [choices]);

  const aliasList = aliases
    .split(',')
    .map((alias) => alias.trim())
    .filter((alias) => alias.length > 0);

  const run = (apply: boolean) => {
    if (!isValidProjectCode(code) || isPending) {
      return;
    }
    mutate({
      input: {
        type: 'project.align',
        userId: workspace.userId,
        pageId: page.id,
        code,
        apply,
        plane,
        aliases: aliasList,
      },
      onSuccess(output) {
        if (!apply) {
          setPreview(output);
          return;
        }
        toast.success(
          `${page.name} now follows the project template as ${code}.`
        );
        onOpenChange(false);
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  const lines = preview ? describeAlignPlan(preview.plan) : [];

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl">
        <DialogHeader>
          <DialogTitle>Align with the project template</DialogTitle>
          <DialogDescription>
            Gives this project its code, marks the pages that match the
            template, adds the ones it lacks and the three registers. No page is
            deleted, moved or renamed. Following the template is optional: only
            the project views need it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-align-code" className="text-sm font-medium">
              Code
            </label>
            <Input
              id="project-align-code"
              value={code}
              className="font-mono uppercase"
              onChange={(event) =>
                setCode(normalizeProjectCode(event.target.value))
              }
            />
            <span className="text-xs text-muted-foreground">
              The Plane identifier of this project, 2 to 10 capital letters.
            </span>
          </div>

          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-align-aliases"
              className="text-sm font-medium"
            >
              Other names it goes by (optional)
            </label>
            <Input
              id="project-align-aliases"
              value={aliases}
              placeholder="e.g. Sea Turtle Doppler, STU-T"
              onChange={(event) => setAliases(event.target.value)}
            />
            <span className="text-xs text-muted-foreground">
              Comma-separated. Used to find this project among the existing ADR
              and task options, so they are renamed instead of duplicated.
            </span>
          </div>

          {preview && (
            <div className="flex flex-col gap-2 rounded border border-border/60 p-3 text-sm max-h-72 overflow-auto">
              {lines.length === 0 ? (
                <span>
                  Nothing to change: the project already follows the template.
                </span>
              ) : (
                <ul className="list-disc pl-5 flex flex-col gap-1">
                  {lines.map((line) => (
                    <li key={line}>{line}</li>
                  ))}
                </ul>
              )}
              {preview.plan.unmatched.length > 0 && (
                <span className="text-xs text-muted-foreground">
                  Kept as they are, without a role:{' '}
                  {preview.plan.unmatched.map((entry) => entry.name).join(', ')}
                  .
                </span>
              )}
            </div>
          )}

          {preview && choices.length > 1 && (
            <fieldset className="flex flex-col gap-1.5">
              <legend className="text-sm font-medium mb-1.5">Plane</legend>
              {choices.map((choice) => (
                <label
                  key={choice.mode}
                  className="flex items-start gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="project-align-plane"
                    className="mt-1"
                    checked={plane === choice.mode}
                    onChange={() => setPlane(choice.mode)}
                  />
                  <span className="flex flex-col">
                    <span>{choice.label}</span>
                    {choice.hint && (
                      <span className="text-xs text-muted-foreground">
                        {choice.hint}
                      </span>
                    )}
                  </span>
                </label>
              ))}
            </fieldset>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          {preview ? (
            <Button disabled={isPending} onClick={() => run(true)}>
              {isPending && <Spinner className="mr-1" />}
              Apply
            </Button>
          ) : (
            <Button
              disabled={isPending || !isValidProjectCode(code)}
              onClick={() => run(false)}
            >
              {isPending && <Spinner className="mr-1" />}
              Preview the changes
            </Button>
          )}
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
