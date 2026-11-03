// ABOUTME: "New project" -- creates a project from the optional template: the
// ABOUTME: project page, its thirteen named pages, and its Plane project.
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  isValidProjectCode,
  normalizeProjectCode,
  ProjectPlaneMode,
  PROJECT_TEMPLATE_PAGES,
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
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useMutation } from '@colanode/ui/hooks/use-mutation';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { planeChoices } from '@colanode/ui/lib/projects';

interface ProjectCreateDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  // The mission or product line to preselect.
  parentId?: string;
}

export const ProjectCreateDialog = ({
  open,
  onOpenChange,
  parentId,
}: ProjectCreateDialogProps) => {
  const workspace = useWorkspace();
  const navigate = useNavigate({ from: '/workspace/$userId' });
  const { mutate, isPending } = useMutation();

  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [codeTouched, setCodeTouched] = useState(false);
  const [selectedParent, setSelectedParent] = useState(parentId ?? '');
  const [plane, setPlane] = useState<ProjectPlaneMode | null>(null);

  useEffect(() => {
    if (!codeTouched) {
      setCode(suggestProjectCode(name));
    }
  }, [name, codeTouched]);

  const parentsQuery = useQuery(
    { type: 'project.parents.list', userId: workspace.userId },
    { enabled: open, staleTime: 60_000 }
  );
  const parents = parentsQuery.data ?? [];

  useEffect(() => {
    if (!selectedParent && parents.length > 0) {
      setSelectedParent(parentId ?? parents[0]!.id);
    }
  }, [parents, parentId, selectedParent]);

  const debouncedCode = useDebouncedValue(code, 300);
  const codeValid = isValidProjectCode(debouncedCode);
  const checkQuery = useQuery(
    {
      type: 'project.code.check',
      userId: workspace.userId,
      code: debouncedCode,
    },
    { enabled: open && codeValid, staleTime: 10_000 }
  );
  const check = codeValid ? checkQuery.data : undefined;
  const choices = useMemo(() => planeChoices(check?.plane), [check?.plane]);

  // The Plane choice follows the code until the person picks one; a code
  // that changes makes the previous pick meaningless.
  useEffect(() => {
    setPlane(choices[0]?.mode ?? null);
  }, [choices]);

  const codeError = !isValidProjectCode(code)
    ? code.length === 0
      ? null
      : '2 to 10 capital letters, the same as the Plane identifier.'
    : check?.wiki
      ? `Already used by the wiki project "${check.wiki.name}".`
      : null;

  const canSubmit =
    name.trim().length > 0 &&
    isValidProjectCode(code) &&
    code === debouncedCode &&
    !!check &&
    !check.wiki &&
    selectedParent.length > 0 &&
    plane !== null &&
    !isPending;

  const submit = () => {
    if (!canSubmit || plane === null) {
      return;
    }
    mutate({
      input: {
        type: 'project.create',
        userId: workspace.userId,
        parentId: selectedParent,
        name: name.trim(),
        code,
        plane,
      },
      onSuccess(output) {
        toast.success(
          output.plane
            ? `Project ${code} created, with its Plane project.`
            : `Project ${code} created.`
        );
        onOpenChange(false);
        navigate({ to: '$nodeId', params: { nodeId: output.rootId } });
      },
      onError(error) {
        toast.error(error.message);
      },
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>New project</DialogTitle>
          <DialogDescription>
            Creates the project page and its {PROJECT_TEMPLATE_PAGES.length}{' '}
            pages (Overview, Requirements, Tests and validation, Decisions and
            ADR…), each one saying what belongs on it.
          </DialogDescription>
        </DialogHeader>

        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-name" className="text-sm font-medium">
              Name
            </label>
            <Input
              id="project-name"
              value={name}
              placeholder="e.g. Sea Turtle Tag GPS"
              onChange={(event) => setName(event.target.value)}
            />
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-code" className="text-sm font-medium">
              Code
            </label>
            <Input
              id="project-code"
              value={code}
              placeholder="e.g. STUG"
              className="font-mono uppercase"
              onChange={(event) => {
                setCodeTouched(true);
                setCode(normalizeProjectCode(event.target.value));
              }}
            />
            <span className="text-xs text-muted-foreground">
              The project identifier on the wiki and on Plane. It cannot be
              changed later without renaming every Plane work item.
            </span>
            {codeError && (
              <span className="text-xs text-red-600 dark:text-red-400">
                {codeError}
              </span>
            )}
          </div>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-parent" className="text-sm font-medium">
              Where
            </label>
            {parentsQuery.isPending ? (
              <Spinner />
            ) : parentsQuery.isError ? (
              <span className="text-xs text-red-600 dark:text-red-400">
                The project template is not available on this server.
              </span>
            ) : (
              <select
                id="project-parent"
                aria-label="Mission or product line"
                value={selectedParent}
                onChange={(event) => setSelectedParent(event.target.value)}
                className="w-full rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none"
              >
                {parents.map((parent) => (
                  <option key={parent.id} value={parent.id}>
                    {parent.depth > 1 ? '   ' : ''}
                    {parent.path}
                  </option>
                ))}
              </select>
            )}
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium mb-1.5">Plane</legend>
            {!codeValid ? (
              <span className="text-xs text-muted-foreground">
                Type a code to see what Plane has under it.
              </span>
            ) : checkQuery.isPending ? (
              <Spinner />
            ) : (
              choices.map((choice) => (
                <label
                  key={choice.mode}
                  className="flex items-start gap-2 text-sm cursor-pointer"
                >
                  <input
                    type="radio"
                    name="project-plane"
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
              ))
            )}
          </fieldset>
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={() => onOpenChange(false)}>
            Cancel
          </Button>
          <Button disabled={!canSubmit} onClick={submit}>
            {isPending && <Spinner className="mr-1" />}
            Create project
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
