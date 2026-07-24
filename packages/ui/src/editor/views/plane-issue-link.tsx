import { type NodeViewProps } from '@tiptap/core';
import { NodeViewWrapper } from '@tiptap/react';
import { ExternalLink } from 'lucide-react';

import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { defaultClasses } from '@colanode/ui/editor/classes';
import { useQuery } from '@colanode/ui/hooks/use-query';

const PlaneIssueStateDot = ({ color }: { color: string }) => (
  <span
    className="inline-block size-2 shrink-0 rounded-full"
    style={{ backgroundColor: color }}
  />
);

const PlaneIssueLinkChip = ({ url }: { url: string }) => {
  const workspace = useWorkspace();

  const { data, isLoading, isError } = useQuery(
    { type: 'plane.issue.get', userId: workspace.userId, url },
    { enabled: url.length > 0, staleTime: 30_000, retry: false }
  );

  if (isLoading) {
    return (
      <span className={defaultClasses.mention}>
        <span className="text-muted-foreground">Loading Plane issue…</span>
      </span>
    );
  }

  // Disabled integration, not-found, or a transient network error all land
  // here — fall back to a plain external link rather than a dead-looking
  // chip, so the user's pasted URL is never worse off than a normal link.
  if (isError || !data) {
    return (
      <a
        href={url}
        target="_blank"
        rel="noreferrer"
        className={defaultClasses.link}
      >
        {url}
      </a>
    );
  }

  return (
    <a
      href={data.url}
      target="_blank"
      rel="noreferrer"
      className={`${defaultClasses.mention} hover:bg-accent`}
      title={data.name}
    >
      <PlaneIssueStateDot color={data.state.color} />
      <span className="font-medium">{data.identifier}</span>
      <span className="max-w-64 truncate text-muted-foreground">
        {data.name}
      </span>
      <ExternalLink className="size-3 shrink-0 text-muted-foreground" />
    </a>
  );
};

export const PlaneIssueLinkNodeView = ({ node }: NodeViewProps) => {
  const url = (node.attrs.url as string | null) ?? '';

  if (!url) {
    return null;
  }

  return (
    <NodeViewWrapper className="inline-flex" data-url={url}>
      <PlaneIssueLinkChip url={url} />
    </NodeViewWrapper>
  );
};
