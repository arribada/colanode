// ABOUTME: A quiet note under a title being typed when another page of the same
// ABOUTME: space already has it. It points at that page and never blocks the name.
import { NodePath } from '@colanode/ui/components/nodes/node-path';
import { Link } from '@colanode/ui/components/ui/link';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useDebouncedValue } from '@colanode/ui/hooks/use-debounced-value';
import { useNodePaths } from '@colanode/ui/hooks/use-node-paths';
import { useQuery } from '@colanode/ui/hooks/use-query';
import { cn } from '@colanode/ui/lib/utils';

interface SameNameHintProps {
  rootId: string;
  name: string;
  excludeId?: string;
  enabled?: boolean;
  onCover?: boolean;
  className?: string;
}

export const SameNameHint = ({
  rootId,
  name,
  excludeId,
  enabled = true,
  onCover = false,
  className,
}: SameNameHintProps) => {
  const workspace = useWorkspace();
  const typed = useDebouncedValue(name, 300).trim();
  const active = enabled && typed.length > 0;

  const query = useQuery(
    {
      type: 'node.name.match',
      userId: workspace.userId,
      rootId,
      name: typed,
      excludeId,
    },
    { enabled: active }
  );

  const matches = active ? (query.data ?? []) : [];
  const pathOf = useNodePaths(
    matches.map((match) => match.id),
    matches.length > 0
  );

  const first = matches[0];
  if (!first) {
    return null;
  }

  return (
    <div
      role="status"
      data-testid="same-name-hint"
      className={cn(
        'mt-1 flex min-w-0 flex-col gap-0.5 text-xs',
        onCover ? 'text-white/85' : 'text-amber-700 dark:text-amber-400',
        className
      )}
    >
      <span>
        {matches.length === 1
          ? 'Another page in this space already has this title. The path is what will tell them apart:'
          : 'Other pages in this space already have this title. The path is what will tell them apart, e.g.:'}
      </span>
      <Link
        from="/workspace/$userId"
        to="$nodeId"
        params={{ nodeId: first.id }}
        className="min-w-0 hover:underline"
      >
        <NodePath
          segments={[
            ...pathOf(first.id),
            { id: first.id, type: first.type, name: first.name, avatar: null },
          ]}
          className={onCover ? 'text-white/85' : undefined}
        />
      </Link>
    </div>
  );
};
