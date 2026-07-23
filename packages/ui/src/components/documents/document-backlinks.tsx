import { ChevronRight } from 'lucide-react';
import { useState } from 'react';

import { Avatar } from '@colanode/ui/components/avatars/avatar';
import {
  Collapsible,
  CollapsibleContent,
  CollapsibleTrigger,
} from '@colanode/ui/components/ui/collapsible';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';
import { getMentionNodeDisplay } from '@colanode/ui/lib/mentions';

interface DocumentBacklinksProps {
  nodeId: string;
}

// "Linked mentions": lists the pages/records whose documents mention the
// current node, computed from the local node_references table (backlinks v1).
export const DocumentBacklinks = ({ nodeId }: DocumentBacklinksProps) => {
  const workspace = useWorkspace();
  const [open, setOpen] = useState(true);

  const backlinksQuery = useLiveQuery({
    type: 'node.backlink.list',
    nodeId,
    userId: workspace.userId,
  });

  const backlinks = backlinksQuery.data ?? [];

  if (backlinksQuery.isPending || backlinks.length === 0) {
    return null;
  }

  return (
    <Collapsible
      open={open}
      onOpenChange={setOpen}
      className="mt-10 border-t pt-2"
      data-testid="document-backlinks"
    >
      <CollapsibleTrigger className="flex w-full cursor-pointer flex-row items-center gap-1 py-1 text-sm text-muted-foreground hover:text-foreground">
        <ChevronRight
          className={`size-4 transition-transform duration-200 ${
            open ? 'rotate-90' : ''
          }`}
        />
        <span>Linked mentions ({backlinks.length})</span>
      </CollapsibleTrigger>
      <CollapsibleContent>
        <div className="flex flex-col gap-0.5 pt-1">
          {backlinks.map((node) => {
            const { name, avatar, label } = getMentionNodeDisplay(node);
            return (
              <Link
                key={node.id}
                from="/workspace/$userId"
                to="$nodeId"
                params={{ nodeId: node.id }}
                className="flex flex-row items-center gap-2 rounded-md p-1.5 hover:bg-accent"
                data-testid={`document-backlink-${node.id}`}
              >
                <Avatar size="small" id={node.id} name={name} avatar={avatar} />
                <span className="flex-1 truncate text-sm">{name}</span>
                <span className="text-xs text-muted-foreground">{label}</span>
              </Link>
            );
          })}
        </div>
      </CollapsibleContent>
    </Collapsible>
  );
};
