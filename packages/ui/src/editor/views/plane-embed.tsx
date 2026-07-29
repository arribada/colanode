import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink, FolderKanban } from 'lucide-react';

import { PlaneBoardIssue } from '@colanode/core';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useQuery } from '@colanode/ui/hooks/use-query';

const MAX_HEIGHT = 340;

// A read-only external link — a real anchor (works everywhere, opens a new
// tab) plus the Electron hook, mirroring the bookmark block. Nothing here ever
// writes back to Plane.
const openInPlane = (url: string) => window.colanode.openExternalUrl(url);

const priorityColor = (priority: string): string | null => {
  switch (priority) {
    case 'urgent':
      return '#EF4444';
    case 'high':
      return '#F97316';
    case 'medium':
      return '#EAB308';
    case 'low':
      return '#3B82F6';
    default:
      return null;
  }
};

const PlaneIssueLinkRow = ({
  issue,
  color,
}: {
  issue: PlaneBoardIssue;
  color: string;
}) => {
  const pColor = priorityColor(issue.priority);
  return (
    <a
      href={issue.url}
      target="_blank"
      rel="noopener noreferrer"
      onClick={(e) => {
        e.preventDefault();
        openInPlane(issue.url);
      }}
      className="group/row flex items-center gap-2 px-3 py-1.5 text-sm no-underline transition-colors hover:bg-accent"
    >
      <span
        className="size-2 shrink-0 rounded-full"
        style={{ backgroundColor: color }}
      />
      <span className="shrink-0 font-mono text-xs text-muted-foreground">
        {issue.key}
      </span>
      <span className="shrink-0 text-muted-foreground">&middot;</span>
      <span className="min-w-0 flex-1 truncate text-foreground">
        {issue.name}
      </span>
      {issue.priority !== 'none' && pColor ? (
        <span
          className="size-1.5 shrink-0 rounded-full"
          style={{ backgroundColor: pColor }}
          title={issue.priority}
        />
      ) : null}
      <ExternalLink className="size-3 shrink-0 text-muted-foreground opacity-0 transition-opacity group-hover/row:opacity-100" />
    </a>
  );
};

// A compact quick-link pill to one of the project's Plane surfaces.
const PlaneQuickLink = ({ href, label }: { href: string; label: string }) => (
  <a
    href={href}
    target="_blank"
    rel="noopener noreferrer"
    onClick={(e) => {
      e.preventDefault();
      openInPlane(href);
    }}
    className="rounded border border-border/60 bg-background px-2 py-0.5 text-xs text-muted-foreground no-underline transition-colors hover:bg-accent hover:text-foreground"
  >
    {label}
  </a>
);

// Editable empty state — a project picker backed by `plane.projects.list`.
const PlaneEmbedPicker = ({
  updateAttributes,
}: {
  updateAttributes: NodeViewProps['updateAttributes'];
}) => {
  const workspace = useWorkspace();
  const { data, isLoading, isError } = useQuery(
    { type: 'plane.projects.list', userId: workspace.userId },
    { staleTime: 60_000, retry: false }
  );

  return (
    <div
      contentEditable={false}
      className="my-1 select-none rounded-md border border-border/60 bg-muted/30 p-3"
    >
      <div className="mb-2 flex items-center gap-2 text-sm font-medium text-foreground">
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
        Projet Plane
      </div>
      {isLoading ? (
        <p className="text-sm text-muted-foreground">
          Chargement des projets&hellip;
        </p>
      ) : isError || !data ? (
        <p className="text-sm text-muted-foreground">
          Impossible de charger les projets Plane. V&eacute;rifiez que
          l&apos;int&eacute;gration est activ&eacute;e.
        </p>
      ) : data.length === 0 ? (
        <p className="text-sm text-muted-foreground">
          Aucun projet Plane disponible.
        </p>
      ) : (
        <select
          defaultValue=""
          onMouseDown={(e) => e.stopPropagation()}
          onChange={(e) => {
            const projectId = e.target.value;
            if (projectId) {
              updateAttributes({ projectId });
            }
          }}
          className="w-full rounded border border-border/60 bg-background px-2 py-1.5 text-sm text-foreground outline-none"
        >
          <option value="" disabled>
            Choisir un projet&hellip;
          </option>
          {[...data]
            .sort((a, b) => a.name.localeCompare(b.name))
            .map((project) => (
              <option key={project.id} value={project.id}>
                {project.name} ({project.identifier})
              </option>
            ))}
        </select>
      )}
    </div>
  );
};

// The read-only link hub for a chosen project.
const PlaneEmbedHub = ({ projectId }: { projectId: string }) => {
  const workspace = useWorkspace();
  const { data, isLoading, isError } = useQuery(
    { type: 'plane.project.board', userId: workspace.userId, projectId },
    { enabled: projectId.length > 0, staleTime: 30_000, retry: false }
  );

  if (isLoading) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        Chargement du projet Plane&hellip;
      </div>
    );
  }

  if (isError || !data) {
    return (
      <div className="p-3 text-sm text-muted-foreground">
        Impossible de charger le projet Plane. V&eacute;rifiez que
        l&apos;int&eacute;gration est activ&eacute;e.
      </div>
    );
  }

  const board = data;
  const stateColorById = new Map(board.states.map((s) => [s.id, s.color]));
  const projectBase = board.projectUrl.replace(/issues\/?$/, '');

  return (
    <div>
      <div className="flex items-center gap-2 border-b border-border/60 bg-muted/40 px-3 py-2">
        <FolderKanban className="size-4 shrink-0 text-muted-foreground" />
        <a
          href={board.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openInPlane(board.projectUrl);
          }}
          className="flex min-w-0 flex-1 items-center gap-1.5 text-sm font-medium text-foreground no-underline hover:underline"
          title="Ouvrir le projet dans Plane"
        >
          <span className="truncate">{board.project.name}</span>
          <span className="shrink-0 font-mono text-[10px] text-muted-foreground">
            {board.project.identifier}
          </span>
          <ExternalLink className="size-3.5 shrink-0 text-muted-foreground" />
        </a>
      </div>

      <div className="flex flex-wrap items-center gap-1.5 border-b border-border/60 px-3 py-1.5">
        <PlaneQuickLink href={board.projectUrl} label="Tâches" />
        <PlaneQuickLink href={`${projectBase}cycles/`} label="Cycles" />
        <PlaneQuickLink href={`${projectBase}modules/`} label="Modules" />
        <PlaneQuickLink href={`${projectBase}views/`} label="Vues" />
        <PlaneQuickLink href={`${projectBase}pages/`} label="Pages" />
      </div>

      {board.issues.length === 0 ? (
        <div className="p-3 text-sm text-muted-foreground">
          Aucune tâche dans ce projet.
        </div>
      ) : (
        <div
          className="flex flex-col divide-y divide-border/40 overflow-auto"
          style={{ maxHeight: MAX_HEIGHT }}
        >
          {board.issues.map((issue) => (
            <PlaneIssueLinkRow
              key={issue.id}
              issue={issue}
              color={
                (issue.stateId && stateColorById.get(issue.stateId)) ||
                '#94A3B8'
              }
            />
          ))}
        </div>
      )}

      {board.truncated ? (
        <a
          href={board.projectUrl}
          target="_blank"
          rel="noopener noreferrer"
          onClick={(e) => {
            e.preventDefault();
            openInPlane(board.projectUrl);
          }}
          className="block border-t border-border/60 px-3 py-1 text-[11px] text-muted-foreground no-underline hover:text-foreground hover:underline"
        >
          {board.issues.length} t&acirc;ches sur {board.totalIssues} &mdash;
          voir toutes les t&acirc;ches dans Plane
        </a>
      ) : null}
    </div>
  );
};

export const PlaneEmbedNodeView = ({
  node,
  editor,
  updateAttributes,
}: NodeViewProps) => {
  const projectId = (node.attrs.projectId as string | null) ?? '';
  const editable = editor.isEditable;

  if (!projectId) {
    if (!editable) {
      return (
        <NodeViewWrapper data-type="plane-embed">
          <div className="my-1 rounded-md border border-border/60 bg-muted/30 p-3 text-sm text-muted-foreground">
            Aucun projet Plane sélectionné
          </div>
        </NodeViewWrapper>
      );
    }
    return (
      <NodeViewWrapper data-type="plane-embed">
        <PlaneEmbedPicker updateAttributes={updateAttributes} />
      </NodeViewWrapper>
    );
  }

  return (
    <NodeViewWrapper data-type="plane-embed">
      <div
        contentEditable={false}
        className="my-2 select-none overflow-hidden rounded-md border border-border/60 bg-background"
      >
        <PlaneEmbedHub projectId={projectId} />
      </div>
    </NodeViewWrapper>
  );
};
