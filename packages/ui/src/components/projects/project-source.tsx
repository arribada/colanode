// ABOUTME: The reference document of a template project, shown on its page and on its
// ABOUTME: registers: when a Drive document is the reference, the wiki is its working copy.
import { FileText } from 'lucide-react';
import { useContext, useEffect, useState } from 'react';

import { LocalNode, LocalPageNode } from '@colanode/client/types';
import { findProjectRootIndex } from '@colanode/core';
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
import { NodeContext } from '@colanode/ui/contexts/node';
import { useWorkspace } from '@colanode/ui/contexts/workspace';

// The pages that hold a register: where the question "is this the source?"
// is asked.
const REGISTER_ROLES = new Set(['requirements', 'tests', 'decisions']);

const isLink = (value: string): boolean =>
  /^https?:\/\/\S+$/.test(value.trim());

// The project root of a page, from its breadcrumb: the closest page that
// carries a project code. The page itself is taken from props, so a change
// to it shows at once.
const projectRootOf = (
  page: LocalPageNode,
  breadcrumb: readonly LocalNode[]
): LocalPageNode | null => {
  const chain = breadcrumb.some((node) => node.id === page.id)
    ? breadcrumb.map((node) => (node.id === page.id ? page : node))
    : [...breadcrumb, page];
  const index = findProjectRootIndex(
    chain.map((node) => (node.type === 'page' ? node : {}))
  );
  const root = chain[index];
  return root && root.type === 'page' ? root : null;
};

interface ProjectSourceBannerProps {
  page: LocalPageNode;
  canEdit: boolean;
}

export const ProjectSourceBanner = ({
  page,
  canEdit,
}: ProjectSourceBannerProps) => {
  const nodeContext = useContext(NodeContext);
  const [editing, setEditing] = useState(false);
  const root = projectRootOf(page, nodeContext?.breadcrumb ?? []);
  if (!root) {
    return null;
  }
  const isRoot = root.id === page.id;
  const onRegister = Boolean(
    page.projectRole && REGISTER_ROLES.has(page.projectRole)
  );
  if (!isRoot && !onRegister) {
    return null;
  }
  const source = root.projectSource ?? null;
  // Without a reference document, only the project page says so, and only
  // to someone who can change it.
  if (!source && !(isRoot && canEdit)) {
    return null;
  }

  return (
    <>
      {source ? (
        <div
          data-testid="project-source-banner"
          className="my-3 flex items-start gap-2 rounded-md border border-sky-400/70 bg-sky-50 px-3 py-2 text-sm text-sky-950 dark:border-sky-700 dark:bg-sky-950/40 dark:text-sky-100"
        >
          <FileText className="mt-0.5 size-4 shrink-0" />
          <p className="flex-1">
            <span className="font-semibold">
              Reference for {root.projectCode}:{' '}
            </span>
            <a
              href={source.url}
              target="_blank"
              rel="noopener noreferrer"
              className="font-medium underline underline-offset-2"
            >
              {source.label?.trim() || 'the reference document'}
            </a>
            . This wiki is its working support: when the two disagree, the
            document wins. Change the document first, then the register.
          </p>
          {canEdit && (
            <button
              type="button"
              className="shrink-0 text-xs underline underline-offset-2 opacity-80 hover:opacity-100"
              onClick={() => setEditing(true)}
            >
              Change
            </button>
          )}
        </div>
      ) : (
        <div
          data-testid="project-source-none"
          className="my-2 flex items-center gap-1.5 text-xs text-muted-foreground"
        >
          <FileText className="size-3.5" />
          <span>
            Reference: this wiki. If a document is the reference instead (a
            specification or a contract on Drive),
          </span>
          <button
            type="button"
            className="underline underline-offset-2 hover:text-foreground"
            onClick={() => setEditing(true)}
          >
            point to it
          </button>
        </div>
      )}
      <ProjectSourceDialog
        open={editing}
        onOpenChange={setEditing}
        root={root}
      />
    </>
  );
};

interface ProjectSourceDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  root: LocalPageNode;
}

const ProjectSourceDialog = ({
  open,
  onOpenChange,
  root,
}: ProjectSourceDialogProps) => {
  const workspace = useWorkspace();
  const current = root.projectSource ?? null;
  const [url, setUrl] = useState(current?.url ?? '');
  const [label, setLabel] = useState(current?.label ?? '');

  // Each opening starts from what is stored, not from an abandoned edit.
  useEffect(() => {
    if (open) {
      setUrl(current?.url ?? '');
      setLabel(current?.label ?? '');
    }
  }, [open, current?.url, current?.label]);

  const save = (value: { url: string; label: string | null } | null) => {
    const nodes = workspace.collections.nodes;
    if (!nodes.has(root.id)) {
      return;
    }
    nodes.update(root.id, (draft) => {
      if (draft.type !== 'page') {
        return;
      }
      draft.projectSource = value;
    });
    onOpenChange(false);
  };

  const valid = isLink(url);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle>Reference document of {root.projectCode}</DialogTitle>
          <DialogDescription>
            The document where this project&apos;s requirements are decided,
            when it is not the wiki: a specification or a contract on Drive. The
            project page and its registers then say that the wiki is its working
            support.
          </DialogDescription>
        </DialogHeader>
        <div className="flex flex-col gap-4">
          <div className="flex flex-col gap-1.5">
            <label htmlFor="project-source-url" className="text-sm font-medium">
              Link
            </label>
            <Input
              id="project-source-url"
              value={url}
              placeholder="https://drive.google.com/file/d/…"
              onChange={(event) => setUrl(event.target.value)}
            />
            {url.trim().length > 0 && !valid && (
              <span className="text-xs text-red-600 dark:text-red-400">
                A link starting with https://
              </span>
            )}
          </div>
          <div className="flex flex-col gap-1.5">
            <label
              htmlFor="project-source-label"
              className="text-sm font-medium"
            >
              Name (optional)
            </label>
            <Input
              id="project-source-label"
              value={label}
              placeholder="e.g. Technical Requirements Specification v4"
              onChange={(event) => setLabel(event.target.value)}
            />
          </div>
        </div>
        <DialogFooter className="gap-2 sm:justify-between">
          {current ? (
            <Button variant="ghost" onClick={() => save(null)}>
              The wiki is the reference
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              Cancel
            </Button>
            <Button
              disabled={!valid}
              onClick={() =>
                save({ url: url.trim(), label: label.trim() || null })
              }
            >
              Save
            </Button>
          </div>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
