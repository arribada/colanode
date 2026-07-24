import { JSONContent } from '@tiptap/core';
import { ExternalLink } from 'lucide-react';

import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { defaultClasses } from '@colanode/ui/editor/classes';
import { useQuery } from '@colanode/ui/hooks/use-query';

interface PlaneIssueLinkRendererProps {
  node: JSONContent;
  keyPrefix: string | null;
}

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

// Read-only rendering path (search previews, notifications, backlinks) — see
// `NodeRenderer` in `renderers/node.tsx`. Unlike the interactive
// `PlaneIssueLinkNodeView`, this never mutates the document, only displays
// it, but fetches the same live issue state through the same query.
export const PlaneIssueLinkRenderer = ({
  node,
}: PlaneIssueLinkRendererProps) => {
  const url = (node.attrs?.url as string | null | undefined) ?? '';

  if (!url) {
    return null;
  }

  return <PlaneIssueLinkChip url={url} />;
};
