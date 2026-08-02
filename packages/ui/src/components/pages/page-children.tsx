import { eq, inArray, useLiveQuery } from '@tanstack/react-db';

import { Avatar } from '@colanode/ui/components/avatars/avatar';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

interface PageChildrenProps {
  nodeId: string;
}

// "Sub-pages": lists the navigable child nodes (pages, databases, folders,
// whiteboards) of the current page directly inside the page content, so a
// folder-like page whose own document is empty still exposes its children
// (Notion-style). Renders nothing for leaf pages, leaving them unchanged.
export const PageChildren = ({ nodeId }: PageChildrenProps) => {
  const workspace = useWorkspace();

  const childrenQuery = useLiveQuery(
    (q) =>
      q
        .from({ nodes: workspace.collections.nodes })
        .where(({ nodes }) => eq(nodes.parentId, nodeId))
        .where(({ nodes }) =>
          inArray(nodes.type, ['page', 'database', 'folder', 'whiteboard'])
        )
        .orderBy(({ nodes }) => nodes.id, 'asc'),
    [workspace.userId, nodeId]
  );

  const children = childrenQuery.data ?? [];

  if (children.length === 0) {
    return null;
  }

  return (
    <div className="mt-8 border-t pt-2" data-testid="page-children">
      <p className="px-1.5 py-1 text-sm text-muted-foreground">
        Sub-pages ({children.length})
      </p>
      <div className="flex flex-col gap-0.5 pt-1">
        {children.map((child) => {
          const { name, avatar, label } = getMentionNodeDisplay(child);
          return (
            <Link
              key={child.id}
              from="/workspace/$userId"
              to="$nodeId"
              params={{ nodeId: child.id }}
              className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
              data-testid={`page-child-${child.id}`}
            >
              <Avatar size="small" id={child.id} name={name} avatar={avatar} />
              <span className="flex-1 truncate text-sm">{name}</span>
              <span className="text-xs text-muted-foreground">{label}</span>
            </Link>
          );
        })}
      </div>
    </div>
  );
};
