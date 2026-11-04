// ABOUTME: "New project" -- creates a project from the optional template: the
// ABOUTME: project page, its thirteen named pages, and its Plane project.
import { useNavigate } from '@tanstack/react-router';
import { useEffect, useMemo, useState } from 'react';
import { toast } from 'sonner';

import {
  isValidProjectCode,
  normalizeProjectCode,
  getProjectTemplatePages,
  ProjectPlaneMode,
  ProjectTemplateKind,
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
import { planeChoices, resolvePlaneMode } from '@colanode/ui/lib/projects';

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
  const [template, setTemplate] = useState<ProjectTemplateKind>('full');
  const [sourceUrl, setSourceUrl] = useState('');
  const [sourceLabel, setSourceLabel] = useState('');
  const sourceValid =
    sourceUrl.trim().length === 0 || /^https?:\/\/\S+$/.test(sourceUrl.trim());
  // What the person picked, for the code they picked it for.
  const [planePick, setPlanePick] = useState<{
    code: string;
    mode: ProjectPlaneMode;
  } | null>(null);

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
  // Only the answer for the code on screen: while the code is being typed
  // the previous code's answer said what Plane had under the old one.
  const check =
    codeValid && code === debouncedCode ? checkQuery.data : undefined;
  const choices = useMemo(() => planeChoices(check?.plane), [check?.plane]);

  // The first choice until the person picks one, then their pick, for as
  // long as the code is the one they picked it for. This was an effect that
  // reset the choice on every answer: a refetch arriving after a click on
  // "No Plane project for now" put it back on "Create the Plane project".
  const plane = resolvePlaneMode(planePick, code, choices);

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
    sourceValid &&
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
        template,
        source: sourceUrl.trim()
          ? { url: sourceUrl.trim(), label: sourceLabel.trim() || null }
          : null,
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
            Creates the project page and its{' '}
            {getProjectTemplatePages(template).length} pages (Overview,
            Requirements, Tests and validation, Decisions and ADR…), each one
            saying what belongs on it.
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
            <legend className="text-sm font-medium mb-1.5">Size</legend>
            <TemplateChoice value={template} onChange={setTemplate} />
          </fieldset>

          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-source-new" className="text-sm font-medium">
              Reference document (optional)
            </label>
            <Input
              id="project-source-new"
              value={sourceUrl}
              placeholder="https://drive.google.com/… when a document is the reference"
              onChange={(event) => setSourceUrl(event.target.value)}
            />
            {sourceUrl.trim().length > 0 && (
              <Input
                aria-label="Name of the reference document"
                value={sourceLabel}
                placeholder="Its name, e.g. Technical Requirements Specification v1"
                onChange={(event) => setSourceLabel(event.target.value)}
              />
            )}
            <span className="text-xs text-muted-foreground">
              {sourceValid
                ? 'Leave empty when the wiki registers are the reference. Set it when a specification or a contract on Drive is: the registers then say they are its working copy.'
                : 'A link starting with https://'}
            </span>
          </div>

          <fieldset className="flex flex-col gap-1.5">
            <legend className="text-sm font-medium mb-1.5">Plane</legend>
            {!isValidProjectCode(code) ? (
              <span className="text-xs text-muted-foreground">
                Type a code to see what Plane has under it.
              </span>
            ) : !check ? (
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
                    onChange={() => setPlanePick({ code, mode: choice.mode })}
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

const TEMPLATE_CHOICES: Array<{
  kind: ProjectTemplateKind;
  label: string;
  hint: string;
}> = [
  {
    kind: 'full',
    label: 'Full: 13 pages',
    hint: 'For a contract or funder project: requirements, use cases, specifications, hardware and software design, tests, BOM, decisions, procurement, roadmap, partners, references.',
  },
  {
    kind: 'lite',
    label: 'Light: 5 pages',
    hint: 'For a small project: Overview (with plan, people and documents), Requirements, Design, Tests and validation, Decisions. Same registers and project graph.',
  },
];

// Full or light: the choice a small project makes once, at creation (and
// again when it is aligned).
export const TemplateChoice = ({
  value,
  onChange,
  name = 'project-template',
}: {
  value: ProjectTemplateKind;
  onChange: (value: ProjectTemplateKind) => void;
  name?: string;
}) => (
  <>
    {TEMPLATE_CHOICES.map((choice) => (
      <label
        key={choice.kind}
        aria-label={choice.label}
        className="flex items-start gap-2 text-sm cursor-pointer"
      >
        <input
          type="radio"
          name={name}
          className="mt-1"
          checked={value === choice.kind}
          onChange={() => onChange(choice.kind)}
        />
        <span className="flex flex-col">
          <span>{choice.label}</span>
          <span className="text-xs text-muted-foreground">{choice.hint}</span>
        </span>
      </label>
    ))}
  </>
);
