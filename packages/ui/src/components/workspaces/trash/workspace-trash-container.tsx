import { Container } from '@colanode/ui/components/layouts/containers/container';
import { Separator } from '@colanode/ui/components/ui/separator';
import { WorkspaceTrashBreadcrumb } from '@colanode/ui/components/workspaces/trash/workspace-trash-breadcrumb';
import { WorkspaceTrashItem } from '@colanode/ui/components/workspaces/trash/workspace-trash-item';
import { useWorkspace } from '@colanode/ui/contexts/workspace';
import { useLiveQuery } from '@colanode/ui/hooks/use-live-query';

export const WorkspaceTrashContainer = () => {
  const workspace = useWorkspace();

  const trashQuery = useLiveQuery({
    type: 'node.trash.list',
    userId: workspace.userId,
  });

  const nodes = trashQuery.data ?? [];

  return (
    <Container type="full" breadcrumb={<WorkspaceTrashBreadcrumb />}>
      <div className="overflow-y-auto">
        <div className="max-w-4xl space-y-10">
          <div>
            <h2 className="text-2xl font-semibold tracking-tight">Trash</h2>
            <p className="mt-1 text-sm text-muted-foreground">
              Deleted pages, folders, databases, records, files and whiteboards
              end up here. Restore them or delete them forever. Items deleted
              inside a trashed item are restored together with it.
            </p>
            <Separator className="mt-3" />
          </div>
          {trashQuery.isLoading ? null : nodes.length === 0 ? (
            <p className="text-sm text-muted-foreground">The trash is empty.</p>
          ) : (
            <div className="flex w-full flex-col gap-2">
              {nodes.map((node) => (
                <WorkspaceTrashItem key={node.id} node={node} />
              ))}
            </div>
          )}
        </div>
      </div>
    </Container>
  );
};
